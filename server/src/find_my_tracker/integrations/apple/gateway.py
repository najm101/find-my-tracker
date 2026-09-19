"""
The one module that talks to FindMy.py.

When Apple changes something and the library updates, this is the file that changes with it.
Every library exception is translated into an `AppleError` subclass here, and every library type
is converted to our own dataclasses, so the rest of the app never imports `findmy`.
"""

from __future__ import annotations

import base64
import logging
from pathlib import Path
from typing import Any, cast

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from findmy import (
    AsyncAppleAccount,
    FindMyAccessory,
    LocalAnisetteProvider,
    LoginState,
    RemoteAnisetteProvider,
    SmsSecondFactorMethod,
)
from findmy.errors import (
    AppleServiceUnavailableError,
    InvalidCredentialsError,
    InvalidStateError,
    MobileMeDelegateError,
    UnauthorizedError,
    UnhandledProtocolError,
)
from findmy.icloud import AsyncFindMyClient
from findmy.keychain.bottle import BottleError
from findmy.keychain.escrow import EscrowRecord
from findmy.keychain.recovery import RecoveryError
from findmy.reports.anisette import CLIENT_SERIAL, get_provider_from_mapping

from find_my_tracker.integrations.apple.types import (
    AccessoryInfo,
    AppleAuthExpired,
    AppleError,
    AppleInvalidCode,
    AppleInvalidCredentials,
    ApplePasscodeRejected,
    AppleUnavailable,
    DeviceIdentity,
    FetchResult,
    RecoveryDevice,
    Report,
    TwoFactorMethod,
    classify_model,
)

logger = logging.getLogger(__name__)

_UNAVAILABLE_HINT = (
    "Apple's service refused the request. This is usually temporary; if it keeps happening, "
    "update Find My Tracker to the latest version."
)


def _translate(e: Exception) -> AppleError:
    """Map a FindMy.py exception to ours. Order matters: specific before general."""
    if isinstance(e, AppleError):
        return e
    if isinstance(e, InvalidCredentialsError):
        return AppleInvalidCredentials("Apple rejected the Apple ID or password.")
    if isinstance(e, UnauthorizedError | InvalidStateError):
        return AppleAuthExpired("The Apple session expired. Sign in again.")
    if isinstance(e, AppleServiceUnavailableError):
        return AppleUnavailable(_UNAVAILABLE_HINT)
    if isinstance(e, MobileMeDelegateError):
        said = e.status_message or str(e)
        return AppleError(
            f"Apple signed you in but would not open iCloud for this account: {said}. "
            "Accounts never used on an Apple device often need their details completed at "
            "appleid.apple.com first."
        )
    if isinstance(e, UnhandledProtocolError):
        return AppleError(f"Unexpected response from Apple: {e}")
    return AppleError(f"{type(e).__name__}: {e}")


class FindMyPyClient:
    """`AppleClient` backed by FindMy.py. One instance per sign-in flow or poll run."""

    def __init__(self, account: AsyncAppleAccount) -> None:
        self._account = account
        self._methods: list[Any] = []
        self._findmy: AsyncFindMyClient | None = None
        self._devices: dict[str, EscrowRecord] = {}

    @property
    def account_name(self) -> str | None:
        return self._account.account_name

    # ---- sign-in ----

    async def login(self, apple_id: str, password: str) -> bool:
        try:
            state = await self._account.login(apple_id, password)
        except Exception as e:
            raise _translate(e) from e
        return state == LoginState.REQUIRE_2FA

    async def two_factor_methods(self) -> list[TwoFactorMethod]:
        try:
            self._methods = list(await self._account.get_2fa_methods())
        except Exception as e:
            raise _translate(e) from e
        result = []
        for i, m in enumerate(self._methods):
            if isinstance(m, SmsSecondFactorMethod):
                result.append(TwoFactorMethod(i, "sms", f"Text message to {m.phone_number}"))
            else:
                result.append(TwoFactorMethod(i, "trusted_device", "Code on a trusted device"))
        return result

    async def request_two_factor(self, method_id: int) -> None:
        try:
            await self._method(method_id).request()
        except Exception as e:
            raise _translate(e) from e

    async def submit_two_factor(self, method_id: int, code: str) -> None:
        try:
            state = await self._method(method_id).submit(code)
        except Exception as e:
            err = _translate(e)
            if isinstance(err, AppleInvalidCredentials | AppleAuthExpired):
                raise AppleInvalidCode("Apple did not accept that code.") from e
            raise err from e
        if state != LoginState.LOGGED_IN:
            msg = "Apple did not accept that code."
            raise AppleInvalidCode(msg)

    # ---- keychain ----

    async def recovery_devices(self) -> list[RecoveryDevice]:
        try:
            client = await self._client()
            options = await client.recovery_options(refresh=True)
        except Exception as e:
            raise _translate(e) from e
        self._devices = {r.label: r for r in options.recoverable}
        return [
            RecoveryDevice(
                id=r.label,
                name=r.device_name or "Unnamed device",
                model=r.device_model,
                serial=r.serial,
                added_at=r.escrowed_at,
            )
            for r in options.recoverable
        ]

    async def unlock(self, device_id: str, passcode: str) -> None:
        record = self._devices.get(device_id)
        if record is None:
            msg = "That device is no longer available. Choose a device again."
            raise AppleError(msg)
        try:
            await (await self._client()).unlock(record, passcode)
        except (RecoveryError, BottleError) as e:
            logger.info("Keychain unlock rejected: %s", type(e).__name__)
            msg = (
                "The passcode was not accepted. Use the device's screen-lock passcode, not "
                "your Apple ID password. The check sometimes fails once and then works."
            )
            raise ApplePasscodeRejected(msg) from e
        except Exception as e:
            raise _translate(e) from e

    async def accessories(self) -> list[AccessoryInfo]:
        try:
            found = await (await self._client()).accessories()
        except Exception as e:
            raise _translate(e) from e
        return [
            AccessoryInfo(
                identifier=a.identifier or "",
                name=a.name,
                model=a.model,
                kind=classify_model(a.model),
                paired_at=a.paired_at,
                key_material=cast("dict[str, Any]", a.to_json()),
            )
            for a in found
            if a.identifier
        ]

    def export_keychain(self) -> list[str]:
        if self._findmy is None:
            return []
        return [
            base64.b64encode(
                key.private_bytes(
                    serialization.Encoding.DER,
                    serialization.PrivateFormat.PKCS8,
                    serialization.NoEncryption(),
                )
            ).decode()
            for key in self._findmy.keychain_keys
        ]

    async def use_keychain(self, keys: list[str]) -> None:
        loaded = []
        for encoded in keys:
            key = serialization.load_der_private_key(base64.b64decode(encoded), password=None)
            if not isinstance(key, ec.EllipticCurvePrivateKey):
                msg = "Stored keychain key has an unexpected type."
                raise AppleError(msg)
            loaded.append(key)
        try:
            (await self._client()).use_keys(loaded)
        except Exception as e:
            raise _translate(e) from e

    # ---- polling ----

    async def fetch_history(self, key_material: dict[str, dict[str, Any]]) -> FetchResult:
        accessories = {
            ident: FindMyAccessory.from_json(cast("Any", material))
            for ident, material in key_material.items()
        }
        try:
            history = await self._account.fetch_location_history(list(accessories.values()))
        except Exception as e:
            raise _translate(e) from e

        by_accessory = cast("dict[Any, list[Any]]", history)
        reports = {
            ident: [
                Report(
                    observed_at=r.timestamp,
                    latitude=r.latitude,
                    longitude=r.longitude,
                    accuracy_m=r.horizontal_accuracy,
                    confidence=r.confidence,
                    status=r.status,
                )
                for r in by_accessory.get(acc, [])
            ]
            for ident, acc in accessories.items()
        }
        updated = {
            ident: cast("dict[str, Any]", acc.to_json()) for ident, acc in accessories.items()
        }
        return FetchResult(reports=reports, updated_key_material=updated)

    # ---- lifecycle ----

    def export_session(self) -> dict[str, Any]:
        return cast("dict[str, Any]", self._account.to_json())

    async def close(self) -> None:
        if self._findmy is not None:
            await self._findmy.close()
            self._findmy = None
        await self._account.close()

    def _method(self, method_id: int) -> Any:
        if not 0 <= method_id < len(self._methods):
            msg = "Unknown verification method. Start again."
            raise AppleError(msg)
        return self._methods[method_id]

    async def _client(self) -> AsyncFindMyClient:
        if self._findmy is None:
            self._findmy = await AsyncFindMyClient.open(self._account)
        return self._findmy


class FindMyPyClientFactory:
    """Creates clients that all present as this installation's one `DeviceIdentity`."""

    def __init__(self, *, anisette_url: str | None, anisette_libs_path: Path) -> None:
        self._anisette_url = anisette_url
        self._libs_path = anisette_libs_path
        self._libs_path.parent.mkdir(parents=True, exist_ok=True)
        self._identity: DeviceIdentity | None = None

    def set_identity(self, identity: DeviceIdentity) -> None:
        self._identity = identity

    def identity_of(self, session: dict[str, Any]) -> DeviceIdentity | None:
        ids, anisette = session.get("ids"), session.get("anisette")
        if not isinstance(ids, dict) or not isinstance(anisette, dict):
            return None
        return DeviceIdentity(
            uid=str(ids["uid"]),
            devid=str(ids["devid"]),
            serial=str(anisette.get("serial", CLIENT_SERIAL)),
            anisette=anisette,
        )

    def new(self) -> FindMyPyClient:
        identity = self._identity
        if identity is None:
            msg = "No device identity set; the app must call set_identity() at startup."
            raise RuntimeError(msg)
        if identity.anisette:
            # Same provisioned "machine" as every earlier sign-in.
            provider = get_provider_from_mapping(
                cast("Any", identity.anisette), libs_path=str(self._libs_path)
            )
        elif self._anisette_url:
            provider = RemoteAnisetteProvider(self._anisette_url, serial=identity.serial)
        else:
            provider = LocalAnisetteProvider(libs_path=str(self._libs_path), serial=identity.serial)
        account = AsyncAppleAccount(provider, uid=identity.uid, devid=identity.devid)
        return FindMyPyClient(account)

    def restore(self, session: dict[str, Any]) -> FindMyPyClient:
        try:
            account = AsyncAppleAccount.from_json(
                cast("Any", session), anisette_libs_path=str(self._libs_path)
            )
        except Exception as e:
            msg = "The saved Apple session could not be restored. Sign in again."
            raise AppleAuthExpired(msg) from e
        return FindMyPyClient(account)
