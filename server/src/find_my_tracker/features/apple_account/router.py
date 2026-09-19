from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import APIRouter, status

from find_my_tracker.core.deps import ContainerDep, SessionDep
from find_my_tracker.core.errors import Conflict
from find_my_tracker.features.apple_account.schemas import (
    AccountOut,
    AccountStatus,
    CodeRequest,
    ImportRequest,
    MethodRequest,
    StartRequest,
    UnlockRequest,
    WizardView,
)
from find_my_tracker.features.apple_account.service import (
    AppleAccountService,
    to_domain_error,
    wizard_view,
)
from find_my_tracker.features.apple_account.wizard import SignInWizard, WizardExhausted
from find_my_tracker.features.auth.dependencies import AdminDep
from find_my_tracker.features.beacons.service import BeaconService
from find_my_tracker.features.settings.schemas import SettingsUpdate
from find_my_tracker.features.settings.service import SettingsService
from find_my_tracker.integrations.apple.types import AppleAuthExpired, AppleError

router = APIRouter(prefix="/apple", tags=["apple"])


def _account(session: SessionDep, container: ContainerDep) -> AppleAccountService:
    return AppleAccountService(session, container.secrets, container.clock)


def _beacons(session: SessionDep, container: ContainerDep) -> BeaconService:
    return BeaconService(session, container.secrets, container.clock)


async def _view(wizard: SignInWizard | None, session: SessionDep, c: ContainerDep) -> WizardView:
    return wizard_view(wizard, await _beacons(session, c).tracked_identifiers())


async def _advance(
    container: ContainerDep,
    session: SessionDep,
    step: Callable[[SignInWizard], Awaitable[None]],
) -> WizardView:
    """Run one wizard step under the wizard lock, translating Apple errors for the UI."""
    async with container.wizards.lock:
        wizard = await container.wizards.current()
        if wizard is None:
            msg = "The sign-in expired. Start again."
            raise Conflict(msg, code="no_wizard")
        try:
            await step(wizard)
        except WizardExhausted as e:
            await container.wizards.discard()
            raise to_domain_error(e) from e
        except AppleError as e:
            raise to_domain_error(e) from e
        return await _view(wizard, session, container)


# ---- account ----


@router.get("/account")
async def get_account(_: AdminDep, session: SessionDep, container: ContainerDep) -> AccountOut:
    account = await _account(session, container).status()
    identity = container.device_identity.identity
    return account.model_copy(update={"device_serial": identity.serial if identity else None})


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def sign_out(_: AdminDep, session: SessionDep, container: ContainerDep) -> None:
    await _account(session, container).sign_out()


# ---- wizard ----


@router.get("/wizard")
async def get_wizard(_: AdminDep, session: SessionDep, container: ContainerDep) -> WizardView:
    return await _view(await container.wizards.current(), session, container)


@router.post("/wizard/start")
async def start_wizard(
    body: StartRequest, _: AdminDep, session: SessionDep, container: ContainerDep
) -> WizardView:
    async with container.wizards.lock:
        wizard = await container.wizards.begin(container.apple.new())
        try:
            await wizard.start(body.apple_id.strip(), body.password)
        except AppleError as e:
            await container.device_identity.capture(wizard.client)
            await container.wizards.discard()
            raise to_domain_error(e) from e
        await container.device_identity.capture(wizard.client)
        return await _view(wizard, session, container)


@router.post("/wizard/resume")
async def resume_wizard(_: AdminDep, session: SessionDep, container: ContainerDep) -> WizardView:
    """Add beacons with the saved Apple session: no Apple ID, 2FA or (usually) passcode."""
    accounts = _account(session, container)
    active = await accounts.active_session()
    if active is None:
        msg = "Sign in to Apple first."
        raise Conflict(msg, code="reauth_required")
    account, stored = active
    keychain = await accounts.saved_keychain()
    async with container.wizards.lock:
        wizard = await container.wizards.begin(container.apple.restore(stored))
        try:
            await wizard.resume(account.apple_id, keychain)
        except AppleAuthExpired as e:
            await container.wizards.discard()
            accounts.mark(account, AccountStatus.NEEDS_REAUTH, e.message)
            await session.commit()
            raise Conflict(e.message, code="reauth_required") from e
        except AppleError as e:
            await container.wizards.discard()
            raise to_domain_error(e) from e
        return await _view(wizard, session, container)


@router.post("/wizard/2fa/request")
async def request_code(
    body: MethodRequest, _: AdminDep, session: SessionDep, container: ContainerDep
) -> WizardView:
    return await _advance(container, session, lambda w: w.request_code(body.method_id))


@router.post("/wizard/2fa/submit")
async def submit_code(
    body: CodeRequest, _: AdminDep, session: SessionDep, container: ContainerDep
) -> WizardView:
    return await _advance(container, session, lambda w: w.submit_code(body.code))


@router.post("/wizard/unlock")
async def unlock(
    body: UnlockRequest, _: AdminDep, session: SessionDep, container: ContainerDep
) -> WizardView:
    view = await _advance(container, session, lambda w: w.unlock(body.device_id, body.passcode))
    wizard = await container.wizards.current()
    if wizard and wizard.resumed:  # connected account: keep the keys even if nothing is added
        await _account(session, container).remember_keychain(wizard.keychain)
    return view


@router.post("/wizard/import")
async def import_beacons(
    body: ImportRequest, _: AdminDep, session: SessionDep, container: ContainerDep
) -> WizardView:
    async with container.wizards.lock:
        wizard = await container.wizards.current()
        if wizard is None:
            msg = "The sign-in expired. Start again."
            raise Conflict(msg, code="no_wizard")
        selected = wizard.selection(body.identifiers)
        count = await _account(session, container).save_sign_in(
            wizard, selected, _beacons(session, container)
        )
        if body.poll_interval_minutes:
            await SettingsService(session).update(
                SettingsUpdate(poll_interval_minutes=body.poll_interval_minutes)
            )
        wizard.complete(count)
        view = await _view(wizard, session, container)
        await container.wizards.discard()

    container.poller.poll_soon()  # first sync right away
    return view


@router.delete("/wizard", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_wizard(_: AdminDep, container: ContainerDep) -> None:
    async with container.wizards.lock:
        await container.wizards.discard()
