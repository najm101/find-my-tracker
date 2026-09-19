from __future__ import annotations

import re
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from find_my_tracker.core.config import Settings
from find_my_tracker.integrations.apple.fake import FakeAppleClientFactory
from find_my_tracker.integrations.apple.gateway import FindMyPyClientFactory
from find_my_tracker.integrations.apple.types import DeviceIdentity
from find_my_tracker.main import build_container, create_app
from tests.conftest import ADMIN_PASSWORD, sign_in


def _app(settings: Settings, apple: FakeAppleClientFactory) -> TestClient:
    return TestClient(create_app(settings, build_container(settings, apple=apple)))


def _login(client: TestClient) -> TestClient:
    client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    return client


def test_serial_is_recognisable_and_not_hardware() -> None:
    serial = DeviceIdentity.generate().serial
    assert re.fullmatch(r"0FMTRK[0-9A-HJKMNP-TV-Z]{6}", serial)
    assert DeviceIdentity.generate().serial != serial  # unique per installation


def test_one_device_across_sign_ins_and_sign_out(
    admin: TestClient, apple: FakeAppleClientFactory
) -> None:
    sign_in(admin)
    admin.delete("/api/apple/account")  # sign out
    sign_in(admin)
    admin.post("/api/apple/wizard/start", json={"apple_id": "x@example.com", "password": "wrong"})
    assert len(apple.identities_used) == 3
    assert len(set(apple.identities_used)) == 1, "every sign-in must reuse one device id"

    account = admin.get("/api/apple/account").json()
    assert account["device_serial"] == apple.identity.serial  # type: ignore[union-attr]


def test_provisioning_is_captured_after_first_sign_in(
    admin: TestClient, apple: FakeAppleClientFactory
) -> None:
    assert apple.identity is not None and apple.identity.anisette is None
    sign_in(admin)
    assert apple.identity.anisette == {"type": "fake", "prov": "state"}


def test_identity_survives_restart(settings: Settings) -> None:
    first = FakeAppleClientFactory()
    with _app(settings, first) as client:
        sign_in(_login(client))
    second = FakeAppleClientFactory()
    with _app(settings, second):
        pass
    assert first.identity == second.identity  # same serial, ids and provisioning


def test_upgrade_adopts_the_existing_session_identity(settings: Settings) -> None:
    first = FakeAppleClientFactory()
    with _app(settings, first) as client:
        sign_in(_login(client))
    # Simulate a database from before the installation table was filled.
    db = sqlite3.connect(settings.database_path)
    db.execute("DELETE FROM installation")
    db.commit()
    db.close()

    second = FakeAppleClientFactory()
    with _app(settings, second):
        pass
    assert second.identity is not None and first.identity is not None
    assert second.identity.devid == first.identity.devid


def test_real_client_presents_the_identity(tmp_path: Path) -> None:
    factory = FindMyPyClientFactory(anisette_url=None, anisette_libs_path=tmp_path / "ani.bin")
    identity = DeviceIdentity.generate()
    factory.set_identity(identity)
    client = factory.new()
    account = client._account
    assert account.device_uuid == identity.devid
    assert account.local_user_uuid == identity.uid
    assert account._anisette.serial == identity.serial

    exported = client.export_session()
    seen = factory.identity_of(exported)
    assert seen is not None
    assert (seen.uid, seen.devid, seen.serial) == (identity.uid, identity.devid, identity.serial)
