from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from find_my_tracker.core.container import Container
from find_my_tracker.features.tracking.schemas import PollTrigger
from find_my_tracker.integrations.apple.fake import FakeAppleClientFactory
from tests.conftest import sign_in

START = {"apple_id": "me@example.com", "password": "pw"}


def test_full_flow(admin: TestClient) -> None:
    assert admin.get("/api/apple/account").json()["status"] == "none"
    assert admin.get("/api/apple/wizard").json()["step"] == "credentials"

    view = admin.post("/api/apple/wizard/start", json=START).json()
    assert view["step"] == "two_factor_method"
    assert [m["kind"] for m in view["methods"]] == ["trusted_device", "sms"]

    view = admin.post("/api/apple/wizard/2fa/request", json={"method_id": 1}).json()
    assert view["step"] == "two_factor_code"
    assert view["chosen_method_id"] == 1

    view = admin.post("/api/apple/wizard/2fa/submit", json={"code": "123456"}).json()
    assert view["step"] == "device"
    assert {d["id"] for d in view["devices"]} == {"dev-iphone", "dev-mac"}

    view = admin.post(
        "/api/apple/wizard/unlock", json={"device_id": "dev-iphone", "passcode": "1234"}
    ).json()
    assert view["step"] == "beacons"
    personal = {b["name"]: b["personal_device"] for b in view["beacons"]}
    assert personal == {"Keys": False, "Backpack": False, "Test iPhone": True}

    view = admin.post(
        "/api/apple/wizard/import",
        json={"identifiers": ["FAKE-AIRTAG-KEYS"], "poll_interval_minutes": 60},
    ).json()
    assert view["step"] == "done"
    assert view["imported_count"] == 1

    account = admin.get("/api/apple/account").json()
    assert account["status"] == "active"
    assert account["apple_id"] == "me@example.com"
    beacons = admin.get("/api/beacons").json()
    assert [(b["name"], b["kind"]) for b in beacons] == [("Keys", "airtag")]
    assert admin.get("/api/settings").json()["poll_interval_minutes"] == 60
    # the wizard is gone once done
    assert admin.get("/api/apple/wizard").json()["step"] == "credentials"


def test_wrong_password(admin: TestClient) -> None:
    res = admin.post("/api/apple/wizard/start", json={**START, "password": "wrong"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_credentials"


def test_wrong_code_keeps_step(admin: TestClient) -> None:
    admin.post("/api/apple/wizard/start", json=START)
    admin.post("/api/apple/wizard/2fa/request", json={"method_id": 0})
    res = admin.post("/api/apple/wizard/2fa/submit", json={"code": "000000"})
    assert res.json()["error"]["code"] == "invalid_code"
    assert admin.get("/api/apple/wizard").json()["step"] == "two_factor_code"


def test_passcode_attempts_exhaust(admin: TestClient) -> None:
    admin.post("/api/apple/wizard/start", json=START)
    admin.post("/api/apple/wizard/2fa/request", json={"method_id": 0})
    admin.post("/api/apple/wizard/2fa/submit", json={"code": "123456"})
    bad = {"device_id": "dev-iphone", "passcode": "0000"}
    first = admin.post("/api/apple/wizard/unlock", json=bad).json()
    assert first["error"]["code"] == "passcode_rejected"
    assert admin.get("/api/apple/wizard").json()["passcode_attempts_left"] == 2
    admin.post("/api/apple/wizard/unlock", json=bad)
    last = admin.post("/api/apple/wizard/unlock", json=bad).json()
    assert last["error"]["code"] == "attempts_exhausted"
    assert admin.get("/api/apple/wizard").json()["step"] == "credentials"


def test_step_out_of_order(admin: TestClient) -> None:
    admin.post("/api/apple/wizard/start", json=START)
    res = admin.post("/api/apple/wizard/unlock", json={"device_id": "x", "passcode": "1"})
    assert res.status_code == 409


def test_sign_in_again_keeps_beacons(admin: TestClient) -> None:
    sign_in(admin)
    before = {b["id"] for b in admin.get("/api/beacons").json()}
    sign_in(admin)
    assert {b["id"] for b in admin.get("/api/beacons").json()} == before


def test_sign_out(admin: TestClient) -> None:
    sign_in(admin)
    assert admin.delete("/api/apple/account").status_code == 204
    assert admin.get("/api/apple/account").json()["status"] == "none"
    assert len(admin.get("/api/beacons").json()) == 2  # history is kept


# ---- adding beacons later, with the saved session ----


def test_add_items_needs_no_sign_in(admin: TestClient, apple: FakeAppleClientFactory) -> None:
    sign_in(admin)  # Keys + Backpack; keychain keys are saved
    apple.extra_accessories = 1  # a new AirTag was paired since

    view = admin.post("/api/apple/wizard/resume").json()
    assert view["step"] == "beacons" and view["mode"] == "add"
    tracked = {b["name"]: b["already_tracked"] for b in view["beacons"]}
    assert tracked == {"Keys": True, "Backpack": True, "Test iPhone": False, "New AirTag 1": False}

    done = admin.post("/api/apple/wizard/import", json={"identifiers": ["FAKE-NEW-1"]}).json()
    assert done["step"] == "done"
    assert {b["name"] for b in admin.get("/api/beacons").json()} == {
        "Keys",
        "Backpack",
        "New AirTag 1",
    }


def test_add_items_stale_keychain_asks_only_passcode(
    admin: TestClient, apple: FakeAppleClientFactory
) -> None:
    sign_in(admin)
    apple.stale_keychain = True
    view = admin.post("/api/apple/wizard/resume").json()
    assert view["step"] == "device" and view["mode"] == "add"
    view = admin.post(
        "/api/apple/wizard/unlock", json={"device_id": "dev-mac", "passcode": "1234"}
    ).json()
    assert view["step"] == "beacons"

    # Cancel without adding anything: the fresh keys are kept, so next time needs no passcode.
    admin.delete("/api/apple/wizard")
    apple.stale_keychain = False
    assert admin.post("/api/apple/wizard/resume").json()["step"] == "beacons"


def test_add_items_without_account(admin: TestClient) -> None:
    res = admin.post("/api/apple/wizard/resume")
    assert res.status_code == 409 and res.json()["error"]["code"] == "reauth_required"


def test_add_items_expired_session(admin: TestClient, apple: FakeAppleClientFactory) -> None:
    sign_in(admin)
    apple.expire_sessions = True
    res = admin.post("/api/apple/wizard/resume")
    assert res.json()["error"]["code"] == "reauth_required"
    assert admin.get("/api/apple/account").json()["status"] == "needs_reauth"


def test_sign_out_keeps_beacons_and_history(admin: TestClient, container: Container) -> None:
    sign_in(admin)
    asyncio.run(container.poller.service.run(PollTrigger.SCHEDULE))
    before = admin.get("/api/beacons").json()
    assert before and all(b["location_count"] for b in before)

    assert admin.delete("/api/apple/account").status_code == 204

    assert admin.get("/api/apple/account").json()["status"] == "none"
    after = admin.get("/api/beacons").json()
    assert [(b["id"], b["location_count"]) for b in after] == [
        (b["id"], b["location_count"]) for b in before
    ]


def test_sign_out_with_purge_wipes_everything(admin: TestClient, container: Container) -> None:
    sign_in(admin)
    asyncio.run(container.poller.service.run(PollTrigger.SCHEDULE))
    assert admin.get("/api/locations").json()["points"]

    assert admin.delete("/api/apple/account", params={"purge": True}).status_code == 204

    assert admin.get("/api/apple/account").json()["status"] == "none"
    assert admin.get("/api/beacons").json() == []
    assert admin.get("/api/locations").json()["points"] == []
