from __future__ import annotations

import asyncio
import sqlite3

from fastapi.testclient import TestClient

from find_my_tracker.core.container import Container
from find_my_tracker.features.tracking.schemas import PollTrigger
from find_my_tracker.integrations.apple.fake import FakeAppleClientFactory
from tests.conftest import sign_in


def poll(container: Container) -> dict:
    run = asyncio.run(container.poller.service.run(PollTrigger.SCHEDULE))
    assert run is not None
    return {"outcome": run.outcome, "new": run.new_locations, "seen": run.reports_seen}


def test_no_account_nothing_to_poll(admin: TestClient, container: Container) -> None:
    assert asyncio.run(container.poller.service.run(PollTrigger.SCHEDULE)) is None


def test_poll_stores_and_dedups(admin: TestClient, container: Container) -> None:
    sign_in(admin)  # two AirTags
    first = poll(container)
    assert first == {"outcome": "ok", "new": 24, "seen": 24}
    again = poll(container)
    assert again["new"] == 0 and again["seen"] == 24  # Apple repeats the window; we don't

    beacons = admin.get("/api/beacons").json()
    assert all(b["latest"] and b["location_count"] == 12 for b in beacons)
    assert all(b["battery"] == "full" for b in beacons)

    runs = admin.get("/api/tracking/runs").json()
    assert [r["outcome"] for r in runs] == ["ok", "ok"]

    db = sqlite3.connect(container.settings.database_path)
    (rtree,) = db.execute("SELECT count(*) FROM locations_rtree").fetchone()
    (locs,) = db.execute("SELECT count(*) FROM locations").fetchone()
    assert rtree == locs == 24


def test_disabled_beacon_not_polled(admin: TestClient, container: Container) -> None:
    sign_in(admin)
    first_id = admin.get("/api/beacons").json()[0]["id"]
    admin.patch(f"/api/beacons/{first_id}", json={"enabled": False})
    assert poll(container)["new"] == 12


def test_expired_session_pauses(
    admin: TestClient, container: Container, apple: FakeAppleClientFactory
) -> None:
    sign_in(admin)
    apple.expire_sessions = True
    assert poll(container)["outcome"] == "auth_failed"
    account = admin.get("/api/apple/account").json()
    assert account["status"] == "needs_reauth"
    # paused: nothing is polled until the user signs in again
    assert asyncio.run(container.poller.service.run(PollTrigger.SCHEDULE)) is None

    apple.expire_sessions = False
    sign_in(admin)
    assert admin.get("/api/apple/account").json()["status"] == "active"


def test_manual_refresh_cooldown(admin: TestClient, container: Container) -> None:
    sign_in(admin)
    poll(container)
    res = admin.post("/api/tracking/refresh")
    assert res.status_code == 429
    status = admin.get("/api/tracking/status").json()
    assert status["account_status"] == "active"
    assert status["last_run"]["outcome"] == "ok"
    assert status["refresh_available_at"] is not None


def test_beacon_rename_and_delete(admin: TestClient, container: Container) -> None:
    sign_in(admin)
    poll(container)
    bid = admin.get("/api/beacons").json()[0]["id"]
    out = admin.patch(f"/api/beacons/{bid}", json={"display_name": "House keys"}).json()
    assert out["name"] == "House keys" and out["apple_name"] == "Keys"
    out = admin.patch(f"/api/beacons/{bid}", json={"display_name": ""}).json()
    assert out["name"] == "Keys"
    assert admin.delete(f"/api/beacons/{bid}").status_code == 204
    db = sqlite3.connect(container.settings.database_path)
    db.execute("PRAGMA foreign_keys=ON")
    assert db.execute("SELECT count(*) FROM locations WHERE beacon_id=?", (bid,)).fetchone() == (0,)
    (rtree,) = db.execute("SELECT count(*) FROM locations_rtree").fetchone()
    assert rtree == 12
