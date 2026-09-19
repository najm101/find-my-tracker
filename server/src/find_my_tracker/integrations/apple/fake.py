"""
A fake Apple, for tests (DEMO_MODE builds on it in demo.py). Behaves like the real flow, with
known answers:

- password `wrong` is rejected, anything else is accepted
- 2FA code `123456` is accepted
- device passcode `1234` is accepted
- three beacons: two AirTags and an iPhone, reporting positions around Amsterdam
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

from find_my_tracker.integrations.apple.types import (
    AccessoryInfo,
    AppleAuthExpired,
    AppleError,
    AppleInvalidCode,
    AppleInvalidCredentials,
    ApplePasscodeRejected,
    BeaconKind,
    DeviceIdentity,
    FetchResult,
    RecoveryDevice,
    Report,
    TwoFactorMethod,
)

FAKE_ACCESSORIES = [
    ("FAKE-AIRTAG-KEYS", "Keys", "", BeaconKind.AIRTAG, (52.3731, 4.8922)),
    ("FAKE-AIRTAG-BAG", "Backpack", "", BeaconKind.AIRTAG, (52.3600, 4.8852)),
    ("FAKE-IPHONE", "Test iPhone", "iPhone15,2", BeaconKind.IPHONE, (52.3676, 4.9041)),
]


class FakeAppleClient:
    def __init__(
        self,
        *,
        session: dict[str, Any] | None = None,
        now: datetime | None = None,
        identity: DeviceIdentity | None = None,
    ):
        self.identity = identity or (
            DeviceIdentity.from_json(session["identity"])
            if session and "identity" in session
            else None
        )
        self._logged_in = bool(session and session.get("logged_in"))
        self._apple_id: str | None = session.get("apple_id") if session else None
        self._unlocked = False
        self._now = now
        self.extra_accessories = 0
        self.closed = False
        self.expired = bool(session and session.get("expired"))
        self.stale_keychain = bool(session and session.get("stale_keychain"))

    @property
    def account_name(self) -> str | None:
        return self._apple_id

    async def login(self, apple_id: str, password: str) -> bool:
        if password == "wrong":  # noqa: S105
            msg = "Apple rejected the Apple ID or password."
            raise AppleInvalidCredentials(msg)
        self._apple_id = apple_id
        return True

    async def two_factor_methods(self) -> list[TwoFactorMethod]:
        return [
            TwoFactorMethod(0, "trusted_device", "Code on a trusted device"),
            TwoFactorMethod(1, "sms", "Text message to •••• 42"),
        ]

    async def request_two_factor(self, method_id: int) -> None:
        if method_id not in (0, 1):
            msg = "Unknown verification method."
            raise AppleError(msg)

    async def submit_two_factor(self, method_id: int, code: str) -> None:
        if code != "123456":
            msg = "Apple did not accept that code."
            raise AppleInvalidCode(msg)
        self._logged_in = True

    async def recovery_devices(self) -> list[RecoveryDevice]:
        self._require_login()
        return [
            RecoveryDevice("dev-iphone", "Test iPhone", "iPhone15,2", "FAKESERIAL1", None),
            RecoveryDevice("dev-mac", "Test Mac", "Mac16,10", "FAKESERIAL2", None),
        ]

    async def unlock(self, device_id: str, passcode: str) -> None:
        self._require_login()
        if passcode != "1234":
            msg = "The passcode was not accepted."
            raise ApplePasscodeRejected(msg)
        self._unlocked = True

    def export_keychain(self) -> list[str]:
        return ["fake-keychain-key"] if self._unlocked else []

    async def use_keychain(self, keys: list[str]) -> None:
        self._require_login()
        self._unlocked = keys == ["fake-keychain-key"] and not self.stale_keychain

    async def accessories(self) -> list[AccessoryInfo]:
        if not self._unlocked:
            msg = "Keychain is locked."
            raise AppleError(msg)
        return [
            AccessoryInfo(
                identifier=ident,
                name=name,
                model=model,
                kind=kind,
                paired_at=datetime(2025, 1, 1, tzinfo=UTC),
                key_material={"identifier": ident, "polls": 0, "home": list(home)},
            )
            for ident, name, model, kind, home in FAKE_ACCESSORIES
        ] + [
            AccessoryInfo(
                identifier=f"FAKE-NEW-{i}",
                name=f"New AirTag {i}",
                model="",
                kind=BeaconKind.AIRTAG,
                paired_at=datetime(2026, 9, 1, tzinfo=UTC),
                key_material={"identifier": f"FAKE-NEW-{i}", "polls": 0, "home": [52.37, 4.9]},
            )
            for i in range(1, self.extra_accessories + 1)
        ]

    async def fetch_history(self, key_material: dict[str, dict[str, Any]]) -> FetchResult:
        self._require_login()
        if self.expired:
            msg = "The Apple session expired. Sign in again."
            raise AppleAuthExpired(msg)
        now = (self._now or datetime.now(UTC)).replace(second=0, microsecond=0)
        reports: dict[str, list[Report]] = {}
        updated: dict[str, dict[str, Any]] = {}
        for ident, material in key_material.items():
            lat0, lon0 = material.get("home", [52.37, 4.89])
            points = []
            for i in range(12):  # a report every 30 min for the last 6 h, wandering in a circle
                t = now - timedelta(minutes=30 * i)
                angle = (t.timestamp() / 3600) % (2 * math.pi)
                points.append(
                    Report(
                        t, lat0 + 0.003 * math.sin(angle), lon0 + 0.005 * math.cos(angle), 25, 2, 0
                    )
                )
            reports[ident] = points
            updated[ident] = {**material, "polls": material.get("polls", 0) + 1}
        return FetchResult(reports=reports, updated_key_material=updated)

    def export_session(self) -> dict[str, Any]:
        session: dict[str, Any] = {
            "logged_in": self._logged_in,
            "apple_id": self._apple_id,
            "fake": True,
        }
        if self.identity:
            # Like real anisette, the "machine" is provisioned on first use.
            provisioned = DeviceIdentity(**{**self.identity.__dict__})
            provisioned.anisette = provisioned.anisette or {"type": "fake", "prov": "state"}
            session["identity"] = provisioned.to_json()
        return session

    async def close(self) -> None:
        self.closed = True

    def _require_login(self) -> None:
        if not self._logged_in or self.expired:
            msg = "The Apple session expired. Sign in again."
            raise AppleAuthExpired(msg)


class FakeAppleClientFactory:
    def __init__(self) -> None:
        self.identity: DeviceIdentity | None = None
        self.identities_used: list[str] = []  # devid of every client made by new()
        self.expire_sessions = False
        self.stale_keychain = False
        self.extra_accessories = 0  # simulate pairing new AirTags after the first sign-in

    def set_identity(self, identity: DeviceIdentity) -> None:
        self.identity = identity

    def identity_of(self, session: dict[str, Any]) -> DeviceIdentity | None:
        data = session.get("identity")
        return DeviceIdentity.from_json(data) if isinstance(data, dict) else None

    def new(self) -> FakeAppleClient:
        if self.identity:
            self.identities_used.append(self.identity.devid)
        return FakeAppleClient(identity=self.identity)

    def restore(self, session: dict[str, Any]) -> FakeAppleClient:
        client = FakeAppleClient(
            session={
                **session,
                "expired": self.expire_sessions,
                "stale_keychain": self.stale_keychain,
            }
        )
        client.extra_accessories = self.extra_accessories
        return client
