"""Predicted routes through the API: choosing an engine, map regions, matched history, vehicles."""

from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from find_my_tracker.core.config import Settings
from find_my_tracker.core.container import Container
from find_my_tracker.features.routing import service
from find_my_tracker.integrations.valhalla.fake import FakeToolchain, FakeValhalla
from find_my_tracker.integrations.valhalla.types import MatchFailed
from find_my_tracker.main import create_app
from tests.conftest import ADMIN_PASSWORD, sign_in
from tests.test_locations import setup_history


def wait_for(admin: TestClient, check: Callable[[dict], bool], timeout: float = 5.0) -> dict:
    deadline = time.monotonic() + timeout
    while True:
        status = admin.get("/api/routing").json()
        if check(status):
            return status
        if time.monotonic() > deadline:
            pytest.fail(f"timed out: {status}")
        time.sleep(0.02)


def test_off_by_default(admin: TestClient) -> None:
    status = admin.get("/api/routing").json()
    assert status["mode"] == "off" and not status["ready"]
    assert not status["configured_by_env"]
    routes = admin.get("/api/routing/routes").json()
    assert routes["state"] == "off" and routes["trips"] == []
    assert "Settings" in routes["message"]


def test_needs_admin(client: TestClient) -> None:
    assert client.get("/api/routing").status_code == 401
    assert client.get("/api/routing/routes").status_code == 401


def test_an_external_server(
    admin: TestClient, container: Container, valhalla: FakeValhalla
) -> None:
    ids = setup_history(admin, container)
    res = admin.put("/api/routing", json={"mode": "external", "url": "http://valhalla:8002/"})
    assert res.status_code == 200, res.text
    status = res.json()
    assert status["ready"] and status["external"]["version"] == "fake"
    assert status["external"]["url"] == "http://valhalla:8002"

    routes = admin.get("/api/routing/routes", params={"beacon_id": ids["Keys"]}).json()
    assert routes["state"] == "ok" and routes["progress"] is None
    (trip,) = routes["trips"]
    assert trip["beacon_id"] == ids["Keys"] and trip["costing"] == "pedestrian"
    assert trip["fallback"] is None and len(trip["geometry"]) >= 2
    assert not any(r["off_route"] for r in trip["reports"])
    offsets = [r["offset_m"] for r in trip["reports"]]
    assert offsets == sorted(offsets) and offsets[-1] > 0

    # Matched once: the second view comes from the cache.
    asked = len(valhalla.requests)
    admin.get("/api/routing/routes", params={"beacon_id": ids["Keys"]})
    assert len(valhalla.requests) == asked


def test_slow_matching_is_followed_up(
    admin: TestClient,
    container: Container,
    valhalla: FakeValhalla,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ids = setup_history(admin, container)
    admin.put("/api/routing", json={"mode": "external", "url": "http://valhalla:8002"})
    monkeypatch.setattr(service, "FIRST_WAIT_S", 0)
    valhalla.delay = 0.2

    first = admin.get("/api/routing/routes", params={"beacon_id": ids["Keys"]}).json()
    assert first["state"] == "ok" and first["trips"] == []
    progress = first["progress"]
    assert progress["done"] == 0 and progress["trips_left"] == 1 and progress["received"] == 0

    # The page asks the job what's new, until it's done.
    trips = []
    deadline = time.monotonic() + 5
    while progress:
        assert time.monotonic() < deadline, progress
        time.sleep(0.05)
        res = admin.get(
            f"/api/routing/routes/jobs/{progress['job']}",
            params={"after": progress["received"]},
        ).json()
        assert res["state"] == "ok"
        trips += res["trips"]
        if res["progress"]:
            assert res["progress"]["done"] >= progress["done"]
        progress = res["progress"]
    (trip,) = trips
    assert trip["beacon_id"] == ids["Keys"] and trip["fallback"] is None

    # It was cached as soon as it was matched.
    again = admin.get("/api/routing/routes", params={"beacon_id": ids["Keys"]}).json()
    assert again["progress"] is None and again["trips"] == [trip]

    gone = admin.get("/api/routing/routes/jobs/nope")
    assert gone.status_code == 404 and gone.json()["error"]["code"] == "routes_job_gone"


def test_a_vehicle_is_matched_as_a_car(
    admin: TestClient, container: Container, valhalla: FakeValhalla
) -> None:
    ids = setup_history(admin, container)
    res = admin.patch(f"/api/beacons/{ids['Keys']}", json={"vehicle": True})
    assert res.json()["vehicle"] is True
    admin.put("/api/routing", json={"mode": "external", "url": "http://valhalla:8002"})
    (trip,) = admin.get("/api/routing/routes", params={"beacon_id": ids["Keys"]}).json()["trips"]
    assert trip["costing"] == "auto"
    assert valhalla.requests[-1]["costing"] == "auto"


def test_no_roads_is_drawn_as_reported(
    admin: TestClient, container: Container, valhalla: FakeValhalla
) -> None:
    ids = setup_history(admin, container)
    admin.put("/api/routing", json={"mode": "external", "url": "http://valhalla:8002"})
    valhalla.fail = MatchFailed("no roads", code=171)
    (trip,) = admin.get("/api/routing/routes", params={"beacon_id": ids["Keys"]}).json()["trips"]
    assert trip["fallback"] == "no_roads" and trip["geometry"] == []


def test_an_unreachable_server_is_refused(admin: TestClient, valhalla: FakeValhalla) -> None:
    valhalla.down = True
    res = admin.put("/api/routing", json={"mode": "external", "url": "http://nowhere:8002"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "routing_unreachable"
    bad = admin.put("/api/routing", json={"mode": "external", "url": "valhalla"})
    assert bad.json()["error"]["code"] == "invalid_url"


def test_a_server_that_goes_away(
    admin: TestClient, container: Container, valhalla: FakeValhalla
) -> None:
    setup_history(admin, container)
    admin.put("/api/routing", json={"mode": "external", "url": "http://valhalla:8002"})
    valhalla.down = True
    container.routing._status.clear()  # forget the cached status
    routes = admin.get("/api/routing/routes").json()
    assert routes["state"] == "unavailable" and "reach" in routes["message"]
    status = admin.get("/api/routing").json()
    assert not status["ready"] and not status["external"]["reachable"]


def test_routing_url_from_the_environment(tmp_path: Path, container: Container) -> None:
    settings = Settings(
        secret_key="x" * 32,  # pyright: ignore[reportArgumentType]
        admin_password=ADMIN_PASSWORD,  # pyright: ignore[reportArgumentType]
        data_dir=tmp_path / "data",
        routing_url="http://user:secret@valhalla:8002",
    )
    container.routing.env_url = settings.routing_url
    with TestClient(create_app(settings, container)) as client:
        client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
        status = client.get("/api/routing").json()
        assert status["mode"] == "external" and status["configured_by_env"]
        assert status["external"]["url"] == "http://valhalla:8002"  # no password shown
        res = client.put("/api/routing", json={"mode": "off"})
        assert res.status_code == 409 and res.json()["error"]["code"] == "routing_fixed"


def test_the_builtin_engine(
    admin: TestClient, container: Container, routing_tools: FakeToolchain
) -> None:
    ids = setup_history(admin, container)
    status = admin.put("/api/routing", json={"mode": "builtin"}).json()
    assert status["mode"] == "builtin" and not status["ready"]
    assert "No map data" in status["message"]
    assert status["builtin"]["auto_download"] is True

    catalog = admin.get("/api/routing/regions/catalog").json()
    assert {"id": "noord-holland", "name": "Noord-Holland", "parent": "Netherlands"} in catalog

    # History is in Noord-Holland: that's the region it needs (a continent is never suggested).
    status = admin.get("/api/routing").json()
    assert [(r["id"], sorted(r["beacons"])) for r in status["missing_regions"]] == [
        ("noord-holland", ["Backpack", "Keys"])
    ]

    admin.post("/api/routing/regions", json={"id": "noord-holland"})
    status = wait_for(admin, lambda s: s["ready"])
    (region,) = status["builtin"]["regions"]
    assert region["id"] == "noord-holland" and region["in_use"] and not region["auto"]
    assert status["missing_regions"] == []
    assert routing_tools.builds == [["noord-holland.osm.pbf"]]

    routes = admin.get("/api/routing/routes", params={"beacon_id": ids["Keys"]}).json()
    assert routes["state"] == "ok" and len(routes["trips"]) == 1

    status = admin.delete("/api/routing/regions/noord-holland").json()
    wait_for(admin, lambda s: not s["ready"])
    assert admin.post("/api/routing/regions", json={"id": "atlantis"}).status_code == 404


def test_automatic_downloads(
    admin: TestClient, container: Container, routing_tools: FakeToolchain
) -> None:
    admin.put("/api/routing", json={"mode": "builtin"})
    admin.put("/api/routing/auto-download", json={"enabled": False})
    setup_history(admin, container)  # history in Noord-Holland
    assert admin.get("/api/routing").json()["builtin"]["regions"] == []

    admin.put("/api/routing/auto-download", json={"enabled": True})  # checks straight away
    status = wait_for(admin, lambda s: s["ready"])
    (region,) = status["builtin"]["regions"]
    assert region["id"] == "noord-holland" and region["auto"]
    assert routing_tools.builds == [["noord-holland.osm.pbf"]]


def test_the_poller_checks_coverage_after_each_poll(
    admin: TestClient, container: Container
) -> None:
    import asyncio

    calls: list[str] = []

    async def hook() -> None:
        calls.append("checked")

    async def scenario() -> None:
        container.poller.after_poll = hook
        await container.poller._tick()  # nothing to poll yet: no check
        assert calls == []
        sign_in(admin)
        container.poller.poll_soon()
        await container.poller._tick()
        assert calls == ["checked"]

    asyncio.run(scenario())


def test_regions_are_only_for_the_builtin_engine(admin: TestClient) -> None:
    res = admin.post("/api/routing/regions", json={"id": "noord-holland"})
    assert res.status_code == 409 and res.json()["error"]["code"] == "routing_not_builtin"
