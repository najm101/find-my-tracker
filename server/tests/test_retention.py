"""Keeping history for a period: the preview, deleting in the background, what is always kept."""

from __future__ import annotations

import sqlite3
import time

import pytest
from fastapi.testclient import TestClient

from find_my_tracker.core.container import Container
from tests.test_locations import setup_history

DAY = 86_400


def age(container: Container, ids: dict[str, int], days: int) -> None:
    """All of Keys' sightings and the older half of Backpack's become `days` old."""
    db = sqlite3.connect(container.settings.database_path)
    db.execute(
        "UPDATE locations SET observed_at = observed_at - ? WHERE beacon_id = ?",
        (days * DAY, ids["Keys"]),
    )
    db.execute(
        """UPDATE locations SET observed_at = observed_at - ? WHERE id IN (
             SELECT id FROM locations WHERE beacon_id = ? ORDER BY observed_at LIMIT 6)""",
        (days * DAY, ids["Backpack"]),
    )
    # A cached predicted route from back then.
    db.execute(
        "INSERT INTO route_cache (beacon_id, trip_start, digest, body, created_at)"
        " VALUES (?, ?, 'x', '{}', 0)",
        (ids["Keys"], int(time.time()) - days * DAY),
    )
    db.commit()


def counts(container: Container) -> dict[str, int]:
    db = sqlite3.connect(container.settings.database_path)
    return {
        table: db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
        for table in ("locations", "locations_rtree", "route_cache")
    }


def wait_for_run(admin: TestClient) -> dict:
    deadline = time.monotonic() + 5
    while True:
        status = admin.get("/api/retention").json()
        if status["last_run"] and not status["running"]:
            return status
        if time.monotonic() > deadline:
            pytest.fail(f"no clean-up ran: {status}")
        time.sleep(0.02)


def test_kept_for_good_by_default(admin: TestClient) -> None:
    status = admin.get("/api/retention").json()
    assert status["days"] is None and status["cutoff"] is None and status["last_run"] is None


def test_shortening_previews_then_deletes_but_keeps_each_newest(
    admin: TestClient, container: Container
) -> None:
    ids = setup_history(admin, container)
    age(container, ids, 40)
    assert counts(container) == {"locations": 24, "locations_rtree": 24, "route_cache": 1}

    preview = admin.get("/api/retention/preview", params={"days": 30}).json()
    # Keys keeps its newest, however old; Backpack loses its older half.
    assert preview["sightings"] == 11 + 6 and preview["items"] == 2
    assert admin.get("/api/retention/preview", params={"days": 60}).json()["sightings"] == 0

    status = admin.put("/api/retention", json={"days": 30}).json()
    assert status["days"] == 30 and status["cutoff"]
    status = wait_for_run(admin)
    assert status["last_run"]["deleted"] == 17
    assert counts(container) == {"locations": 7, "locations_rtree": 7, "route_cache": 0}

    keys = next(b for b in admin.get("/api/beacons").json() if b["id"] == ids["Keys"])
    assert keys["latest"] is not None and keys["location_count"] == 1

    # Longer again: nothing comes back, nothing more goes.
    assert admin.put("/api/retention", json={"days": 60}).json()["days"] == 60
    assert counts(container)["locations"] == 7
    assert admin.put("/api/retention", json={"days": None}).json()["days"] is None


def test_the_period_has_limits(admin: TestClient) -> None:
    assert admin.put("/api/retention", json={"days": 7}).status_code == 422
    assert admin.get("/api/retention/preview", params={"days": 7}).status_code == 422
    assert admin.put("/api/retention", json={"days": 30}).status_code == 200
