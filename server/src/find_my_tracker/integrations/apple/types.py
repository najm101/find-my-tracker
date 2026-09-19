"""Our own view of Apple's data. Nothing outside `integrations/apple` sees FindMy.py types."""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol


class BeaconKind(StrEnum):
    AIRTAG = "airtag"
    IPHONE = "iphone"
    IPAD = "ipad"
    MAC = "mac"
    WATCH = "watch"
    AIRPODS = "airpods"
    OTHER = "other"

    @property
    def is_personal_device(self) -> bool:
        """A device that follows its owner around. Exporting it is exporting a person."""
        return self in {BeaconKind.IPHONE, BeaconKind.IPAD, BeaconKind.MAC, BeaconKind.WATCH}


def classify_model(model: str | None) -> BeaconKind:
    """
    Best-effort kind from the model string Apple stores on the beacon record.

    Observed: iPhones/Macs carry identifiers (`iPhone15,2`, `Mac16,10`), AirPods carry marketing
    names (`AirPods 4`), and AirTags carry an empty string.
    """
    m = (model or "").strip().lower()
    if not m:
        return BeaconKind.AIRTAG
    for prefix, kind in (
        ("iphone", BeaconKind.IPHONE),
        ("ipad", BeaconKind.IPAD),
        ("watch", BeaconKind.WATCH),
        ("mac", BeaconKind.MAC),
        ("imac", BeaconKind.MAC),
        ("airpods", BeaconKind.AIRPODS),
    ):
        if m.startswith(prefix):
            return kind
    return BeaconKind.OTHER


# Crockford-style alphabet: no I, L, O or U, so a serial read aloud can't be misheard.
_SERIAL_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
SERIAL_PREFIX = "0FMTRK"


@dataclass
class DeviceIdentity:
    """
    Who this installation is to Apple. Created once, then reused for every sign-in.

    Apple lists a new device in the account for each new identity. FindMy.py mints a fresh one
    per sign-in (random device and user ids, and a newly provisioned anisette "machine"), so
    without this every sign-in would add another "MacBook Pro" to the user's device list.

    The serial is deliberately not a real Mac serial (Apple's never start with `0FMTRK`): it
    labels the entry so the user can recognise it, instead of impersonating hardware.
    """

    uid: str
    devid: str
    serial: str
    anisette: dict[str, object] | None = field(default=None)
    """Provisioning state, filled in after the first sign-in. SECRET: stored encrypted."""

    @classmethod
    def generate(cls) -> DeviceIdentity:
        suffix = "".join(secrets.choice(_SERIAL_ALPHABET) for _ in range(6))
        return cls(
            uid=str(uuid.uuid4()),
            devid=str(uuid.uuid4()),
            serial=f"{SERIAL_PREFIX}{suffix}",
        )

    def to_json(self) -> dict[str, object]:
        return {
            "uid": self.uid,
            "devid": self.devid,
            "serial": self.serial,
            "anisette": self.anisette,
        }

    @classmethod
    def from_json(cls, data: dict[str, object]) -> DeviceIdentity:
        anisette = data.get("anisette")
        return cls(
            uid=str(data["uid"]),
            devid=str(data["devid"]),
            serial=str(data["serial"]),
            anisette=anisette if isinstance(anisette, dict) else None,
        )


@dataclass(frozen=True)
class TwoFactorMethod:
    id: int
    kind: str  # "trusted_device" | "sms"
    label: str


@dataclass(frozen=True)
class RecoveryDevice:
    """An Apple device whose screen-lock passcode can unlock the iCloud Keychain."""

    id: str
    name: str
    model: str | None
    serial: str | None
    added_at: datetime | None


@dataclass(frozen=True)
class AccessoryInfo:
    identifier: str
    name: str | None
    model: str | None
    kind: BeaconKind
    paired_at: datetime | None
    key_material: dict[str, Any]  # serialized accessory: SECRET, encrypt before storing


@dataclass(frozen=True)
class Report:
    observed_at: datetime
    latitude: float
    longitude: float
    accuracy_m: int | None
    confidence: int | None
    status: int | None


@dataclass(frozen=True)
class FetchResult:
    reports: dict[str, list[Report]]  # accessory identifier -> reports
    updated_key_material: dict[str, dict[str, Any]]  # key alignment moves forward each poll


class AppleClient(Protocol):
    """One Apple account session: login → 2FA → unlock → accessories, or restore → fetch."""

    @property
    def account_name(self) -> str | None: ...

    async def login(self, apple_id: str, password: str) -> bool:
        """Returns True when a second factor is required."""
        ...

    async def two_factor_methods(self) -> list[TwoFactorMethod]: ...
    async def request_two_factor(self, method_id: int) -> None: ...
    async def submit_two_factor(self, method_id: int, code: str) -> None: ...
    async def recovery_devices(self) -> list[RecoveryDevice]: ...
    async def unlock(self, device_id: str, passcode: str) -> None: ...
    async def accessories(self) -> list[AccessoryInfo]: ...
    def export_keychain(self) -> list[str]:
        """The keychain keys held after `unlock`, serialized. SECRET: encrypt before storing."""
        ...

    async def use_keychain(self, keys: list[str]) -> None:
        """Reuse keys from an earlier `unlock` instead of asking for a passcode."""
        ...

    async def fetch_history(self, key_material: dict[str, dict[str, Any]]) -> FetchResult: ...
    def export_session(self) -> dict[str, Any]: ...
    async def close(self) -> None: ...


class AppleClientFactory(Protocol):
    def set_identity(self, identity: DeviceIdentity) -> None:
        """Every client made by `new()` presents as this installation."""
        ...

    def identity_of(self, session: dict[str, Any]) -> DeviceIdentity | None:
        """The identity an exported session was made under (incl. anisette provisioning)."""
        ...

    def new(self) -> AppleClient: ...
    def restore(self, session: dict[str, Any]) -> AppleClient: ...


# ---- Errors: FindMy.py exceptions are translated to these at the boundary ----


class AppleError(Exception):
    """Apple refused or failed. `message` is safe to show to the user."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class AppleInvalidCredentials(AppleError): ...


class AppleInvalidCode(AppleError): ...


class ApplePasscodeRejected(AppleError): ...


class AppleAuthExpired(AppleError):
    """The saved session no longer works; the user has to sign in again."""


class AppleUnavailable(AppleError):
    """Apple's service is refusing or down. Usually temporary, sometimes needs an update."""
