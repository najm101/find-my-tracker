from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.core.clock import Clock, to_datetime
from find_my_tracker.core.crypto import SecretBox
from find_my_tracker.core.errors import DomainError, UpstreamError
from find_my_tracker.features.apple_account.models import AppleAccount
from find_my_tracker.features.apple_account.repository import AppleAccountRepository
from find_my_tracker.features.apple_account.schemas import (
    AccountOut,
    AccountStatus,
    CandidateOut,
    DeviceOut,
    MethodOut,
    WizardView,
)
from find_my_tracker.features.apple_account.wizard import SignInWizard, WizardExhausted
from find_my_tracker.features.beacons.service import BeaconService
from find_my_tracker.integrations.apple.types import (
    AccessoryInfo,
    AppleError,
    AppleInvalidCode,
    AppleInvalidCredentials,
    ApplePasscodeRejected,
)


def to_domain_error(e: AppleError) -> DomainError:
    """User mistakes are 400s the UI shows inline; Apple failures are 502s."""
    codes = {
        AppleInvalidCredentials: "invalid_credentials",
        AppleInvalidCode: "invalid_code",
        ApplePasscodeRejected: "passcode_rejected",
        WizardExhausted: "attempts_exhausted",
    }
    code = codes.get(type(e))
    return DomainError(e.message, code=code) if code else UpstreamError(e.message)


class AppleAccountService:
    def __init__(self, session: AsyncSession, secrets: SecretBox, clock: Clock) -> None:
        self._session = session
        self._repo = AppleAccountRepository(session)
        self._secrets = secrets
        self._clock = clock

    async def status(self) -> AccountOut:
        account = await self._repo.get()
        if account is None:
            return AccountOut(status=AccountStatus.NONE)
        return AccountOut(
            status=AccountStatus(account.status),
            apple_id=account.apple_id,
            display_name=account.display_name,
            last_error=account.last_error,
            connected_at=to_datetime(account.created_at),
        )

    async def save_sign_in(
        self, wizard: SignInWizard, selected: list[AccessoryInfo], beacons: BeaconService
    ) -> int:
        """Store (or replace) the account session and import the chosen beacons. Commits."""
        now = self._clock.timestamp()
        blob = self._seal(wizard.client.export_session())
        account = await self._repo.get()
        if account is None:
            account = AppleAccount(created_at=now)
            self._repo.add(account)
        account.apple_id = wizard.apple_id or ""
        account.display_name = wizard.client.account_name
        account.session_blob = blob
        account.status = AccountStatus.ACTIVE
        account.last_error = None
        account.updated_at = now
        if wizard.keychain:
            account.keychain_blob = self._secrets.seal(json.dumps(wizard.keychain).encode())
        await self._repo.flush()

        count = await beacons.import_from_apple(account.id, selected)
        await self._session.commit()
        return count

    # ---- used by the poller ----

    async def active_session(self) -> tuple[AppleAccount, dict[str, Any]] | None:
        account = await self._repo.get()
        if account is None or account.status != AccountStatus.ACTIVE:
            return None
        return account, json.loads(self._secrets.open(account.session_blob))

    async def remember_keychain(self, keys: list[str]) -> None:
        """Store freshly unlocked keys right away, even if nothing gets imported. Commits."""
        account = await self._repo.get()
        if account is not None and keys:
            account.keychain_blob = self._secrets.seal(json.dumps(keys).encode())
            await self._session.commit()

    async def saved_keychain(self) -> list[str] | None:
        account = await self._repo.get()
        if account is None or account.keychain_blob is None:
            return None
        return json.loads(self._secrets.open(account.keychain_blob))

    def store_session(self, account: AppleAccount, session: dict[str, Any]) -> None:
        account.session_blob = self._seal(session)
        account.updated_at = self._clock.timestamp()

    def mark(self, account: AppleAccount, status: AccountStatus, error: str | None) -> None:
        account.status = status
        account.last_error = error
        account.updated_at = self._clock.timestamp()

    async def sign_out(self) -> None:
        """Forget the Apple session. Beacons and their history stay."""
        await self._repo.delete_all()
        await self._session.commit()

    def _seal(self, session: dict[str, Any]) -> bytes:
        return self._secrets.seal(json.dumps(session).encode())


def wizard_view(wizard: SignInWizard | None, tracked: set[str]) -> WizardView:
    if wizard is None:
        return WizardView(step="credentials")  # pyright: ignore[reportArgumentType]
    return WizardView(
        step=wizard.step,
        mode="add" if wizard.resumed else "sign_in",
        apple_id=wizard.apple_id,
        methods=[MethodOut(id=m.id, kind=m.kind, label=m.label) for m in wizard.methods],
        chosen_method_id=wizard.chosen_method,
        devices=[
            DeviceOut(id=d.id, name=d.name, model=d.model, serial=d.serial, added_at=d.added_at)
            for d in wizard.devices
        ],
        passcode_attempts_left=wizard.passcode_attempts_left,
        beacons=[
            CandidateOut(
                identifier=a.identifier,
                name=a.name or a.model or "Unnamed beacon",
                model=a.model or None,
                kind=a.kind,
                paired_at=a.paired_at,
                personal_device=a.kind.is_personal_device,
                already_tracked=a.identifier in tracked,
            )
            for a in wizard.accessories
        ],
        imported_count=wizard.imported_count if wizard.step == "done" else None,
    )
