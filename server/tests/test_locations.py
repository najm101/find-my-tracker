from __future__ import annotations

import asyncio
import csv
import io
import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from find_my_tracker.core.container import Container
from find_my_tracker.features.locations.geo import BBox, haversine_m
from find_my_tracker.features.tracking.schemas import PollTrigger
from tests.conftest import sign_in

# The fake Apple reports 12 points per beacon over the last 6 hours around these homes.
KEYS_HOME = (52.3731, 4.8922)


def setup_history(admin: TestClient, container: Container) -> dict[str, int]:
    sign_in(admin)  # Keys + Backpack
    asyncio.run(container.poller.service.run(PollTrigger.SCHEDULE))
    return {b["name"]: b["id"] for b in admin.get("/api/beacons").json()}


def test_haversine_and_bbox() -> None:
    assert round(haversine_m(52.0, 4.0, 52.0, 4.0)) == 0
    assert 110_000 < haversine_m(52.0, 4.0, 53.0, 4.0) < 112_000
    box = BBox.around(52.0, 4.0, 1000)
    assert box.min_lat < 52.0 < box.max_lat and box.min_lon < 4.0 < box.max_lon
    assert BBox.parse("4.8,52.3,5.0,52.4") == BBox(52.3, 4.8, 52.4, 5.0)


def test_history_all_beacons(admin: TestClient, container: Container) -> None:
    ids = setup_history(admin, container)
    res = admin.get("/api/locations").json()
    assert not res["truncated"]
    assert len(res["points"]) == 24
    assert {p["beacon_id"] for p in res["points"]} == set(ids.values())
    # ordered by beacon, then time
    keys = [p["observed_at"] for p in res["points"] if p["beacon_id"] == ids["Keys"]]
    assert keys == sorted(keys)


def test_history_filters(admin: TestClient, container: Container) -> None:
    ids = setup_history(admin, container)
    one = admin.get("/api/locations", params={"beacon_id": ids["Keys"]}).json()["points"]
    assert len(one) == 12 and {p["beacon_id"] for p in one} == {ids["Keys"]}

    lat, lon = KEYS_HOME
    box = f"{lon - 0.01},{lat - 0.01},{lon + 0.01},{lat + 0.01}"  # only around Keys' home
    boxed = admin.get("/api/locations", params={"bbox": box}).json()["points"]
    assert {p["beacon_id"] for p in boxed} == {ids["Keys"]}

    now = datetime.now(UTC)
    recent = admin.get(
        "/api/locations",
        params={"from": (now - timedelta(hours=2)).isoformat(), "to": now.isoformat()},
    ).json()["points"]
    assert 0 < len(recent) < 24

    capped = admin.get("/api/locations", params={"limit": 5}).json()
    assert capped["truncated"] and len(capped["points"]) == 5


def test_bad_params(admin: TestClient) -> None:
    assert admin.get("/api/locations", params={"bbox": "1,2,3"}).status_code == 400
    now = datetime.now(UTC)
    res = admin.get(
        "/api/locations", params={"from": now.isoformat(), "to": (now - timedelta(1)).isoformat()}
    )
    assert res.json()["error"]["code"] == "invalid_range"


def test_visits(admin: TestClient, container: Container) -> None:
    ids = setup_history(admin, container)
    lat, lon = KEYS_HOME
    visits = admin.get(
        "/api/locations/visits", params={"lat": lat, "lon": lon, "radius_m": 1000}
    ).json()["visits"]
    assert visits, "Keys circles within ~600 m of its home"
    assert {v["beacon_id"] for v in visits} == {ids["Keys"]}
    assert sum(v["point_count"] for v in visits) == 12
    assert all(v["closest_m"] <= 1000 for v in visits)

    none = admin.get("/api/locations/visits", params={"lat": 0, "lon": 0, "radius_m": 100}).json()[
        "visits"
    ]
    assert none == []


def test_export(admin: TestClient, container: Container) -> None:
    setup_history(admin, container)
    res = admin.get("/api/locations/export", params={"format": "csv"})
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(res.text)))
    assert len(rows) == 24 and {r["beacon"] for r in rows} == {"Keys", "Backpack"}

    geo = json.loads(admin.get("/api/locations/export", params={"format": "geojson"}).text)
    kinds = [f["geometry"]["type"] for f in geo["features"]]
    assert kinds.count("LineString") == 2 and kinds.count("Point") == 24
