"""Map matching: trips, Valhalla's answers (real ones, captured on Monaco), the second pass."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from find_my_tracker.features.locations.denoise import Noise
from find_my_tracker.features.locations.schemas import LocationPoint, Stay
from find_my_tracker.features.routing import matching as m
from find_my_tracker.integrations.valhalla import polyline
from find_my_tracker.integrations.valhalla.fake import FakeValhalla
from find_my_tracker.integrations.valhalla.types import MatchFailed

FIXTURES = Path(__file__).parent / "fixtures"
T0 = 1_790_000_000

# The trace the fixtures were captured with (Monaco, 2026-09-23 OSM data).
CLEAN = [
    (43.7312, 7.4178),
    (43.7372, 7.4210),
    (43.7395, 7.4265),
    (43.7448, 7.4330),
    (43.7497, 7.4386),
]
FAR = [*CLEAN[:2], (43.7330, 7.4330), *CLEAN[2:]]  # the third point is out at sea


def fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / f"valhalla_{name}.json").read_text())


def point(t: int, lat: float, lon: float, *, beacon: int = 1, noise: Noise | None = None):
    return LocationPoint(
        beacon_id=beacon,
        observed_at=datetime.fromtimestamp(T0 + t, UTC),
        latitude=lat,
        longitude=lon,
        accuracy_m=50,
        noise=noise,
    )


def stay(first: int, last: int, lat: float, lon: float) -> Stay:
    return Stay(
        beacon_id=1,
        arrived_at=datetime.fromtimestamp(T0 + first, UTC),
        left_at=datetime.fromtimestamp(T0 + last, UTC),
        latitude=lat,
        longitude=lon,
        point_count=3,
    )


def trip(coords: list[tuple[float, float]], *, step: int = 300) -> m.Trip:
    return m.Trip(1, tuple(m.TripPoint(T0 + i * step, a, b, 60) for i, (a, b) in enumerate(coords)))


class Replay(FakeValhalla):
    """Answers with captured responses in order; anything more is a failed match."""

    def __init__(self, *answers: dict[str, Any]) -> None:
        super().__init__()
        self.answers = list(answers)

    async def trace_attributes(self, request: dict[str, Any]) -> dict[str, Any]:
        self.requests.append(request)
        if not self.answers:
            raise MatchFailed("no more answers", code=0)
        return self.answers.pop(0)


def test_polyline_round_trip() -> None:
    pts = [(43.7312, 7.4178), (-33.5, 151.25), (0.0, 0.0)]
    assert polyline.decode(polyline.encode(pts)) == pts


def test_parse_a_real_answer() -> None:
    match = m.parse(fixture("clean"), len(CLEAN))
    offsets = [o for o in match.offsets if o is not None]
    assert len(offsets) == 5 and offsets == sorted(offsets)
    assert 3_500 < match.length < 3_800  # Valhalla says 3.63 km
    assert not match.breaks
    lat, lon = match.point_at(offsets[2])
    assert abs(lat - 43.7395) < 0.001 and abs(lon - 7.4265) < 0.001


def test_parse_marks_unmatched_and_breaks() -> None:
    match = m.parse(fixture("far"), len(FAR))
    assert match.offsets[2] is None
    assert match.breaks == {1}  # the route is cut after the report before it


def test_a_report_nowhere_near_a_road_is_dropped_and_the_trip_matched_again() -> None:
    client = Replay(fixture("far"), fixture("clean"))
    heard: list[float] = []
    result = asyncio.run(m.match_trip(client, trip(FAR), m.Costing.AUTO, heard.append))
    assert result.fallback is None
    # After each whole match and each of the two checks, assuming a last match may still come.
    assert heard == [0.25, 0.5, 0.625, 0.75]
    assert [p.off_route for p in result.points] == [False, False, True, False, False, False]
    assert len(client.requests[1]["shape"]) == 5  # matched again without it
    assert result.broken_after == []
    # the dropped report is placed on the route, between its neighbours
    offsets = [p.offset_m for p in result.points]
    assert offsets[1] <= offsets[2] <= offsets[3]


def test_no_roads_falls_back_to_the_reported_trip() -> None:
    client = FakeValhalla()
    client.fail = MatchFailed("map_snap algorithm failed", code=444)
    result = asyncio.run(m.match_trip(client, trip(CLEAN), m.Costing.AUTO))
    assert result.fallback is m.Fallback.NO_ROADS
    assert result.geometry == []
    assert [(p.latitude, p.longitude) for p in result.points] == CLEAN


def test_other_errors_fall_back_as_errors() -> None:
    client = FakeValhalla()
    client.fail = MatchFailed("something else", code=100)
    assert asyncio.run(m.match_trip(client, trip(CLEAN), m.Costing.AUTO)).fallback is (
        m.Fallback.ERROR
    )


def test_request_carries_the_noise_and_the_break_distance() -> None:
    body = m.request(trip(CLEAN).points, m.Costing.AUTO)
    options = body["trace_options"]
    assert options["search_radius"] == 100
    assert options["gps_accuracy"] == 100  # 60 m accuracy + Bluetooth range, capped
    assert options["breakage_distance"] == m.BREAKAGE_M
    assert options["turn_penalty_factor"] == m.CAR_TURN_PENALTY
    walk = m.request(trip(CLEAN).points, m.Costing.PEDESTRIAN)["trace_options"]
    assert "turn_penalty_factor" not in walk


def test_a_spur_to_a_stray_report_is_cut() -> None:
    # Out along a street to a report and back the same way, while the reports either side are
    # on the main road: a finder on the side street, not the item.
    main = [(52.0, 4.0 + i * 0.002) for i in range(6)]  # east along latitude 52
    spur = (52.0006, 4.005)  # ~67 m north of the road
    geometry = [main[0], main[1], main[2], (52.0, 4.005), spur, (52.0, 4.005), main[3], main[4]]

    def answer(points: list[tuple[float, float]], shape: list[tuple[float, float]]):
        at = [
            min(
                range(len(shape)),
                key=lambda k, p=p: abs(shape[k][0] - p[0]) + abs(shape[k][1] - p[1]),
            )
            for p in points
        ]
        return {
            "shape": polyline.encode(shape),
            "edges": [{"begin_shape_index": k, "end_shape_index": k} for k in at],
            "matched_points": [{"type": "matched", "edge_index": j} for j in range(len(points))],
        }

    reports = [main[1], main[2], spur, main[3], main[4]]
    first = answer(reports, geometry)
    without = answer([main[2], main[3]], [main[2], main[3]])
    again = answer([main[1], main[2], main[3], main[4]], main[1:5])
    client = Replay(first, without, again)
    heard: list[float] = []
    result = asyncio.run(m.match_trip(client, trip(reports), m.Costing.AUTO, heard.append))
    assert [p.off_route for p in result.points] == [False, False, True, False, False]
    assert heard == [1 / 3, 2 / 3]  # the first match, then the one check; the last is the end


def test_a_real_side_trip_is_kept() -> None:
    # Same spur, but the report is 400 m up the street: the shorter route doesn't come near it.
    main = [(52.0, 4.0 + i * 0.002) for i in range(6)]
    far = (52.0036, 4.005)
    geometry = [main[0], main[1], main[2], (52.0, 4.005), far, (52.0, 4.005), main[3], main[4]]
    at = {main[1]: 1, main[2]: 2, far: 4, main[3]: 6, main[4]: 7}
    first = {
        "shape": polyline.encode(geometry),
        "edges": [{"begin_shape_index": k, "end_shape_index": k} for k in at.values()],
        "matched_points": [{"type": "matched", "edge_index": j} for j in range(5)],
    }
    without = {
        "shape": polyline.encode([main[2], main[3]]),
        "edges": [
            {"begin_shape_index": 0, "end_shape_index": 0},
            {"begin_shape_index": 1, "end_shape_index": 1},
        ],
        "matched_points": [
            {"type": "matched", "edge_index": 0},
            {"type": "matched", "edge_index": 1},
        ],
    }
    client = Replay(first, without)
    reports = [main[1], main[2], far, main[3], main[4]]
    result = asyncio.run(m.match_trip(client, trip(reports), m.Costing.AUTO))
    assert not any(p.off_route for p in result.points)


def test_trips_run_between_stays_and_break_at_gaps() -> None:
    home, work = (30.00, 31.00), (30.05, 31.05)
    points = [
        point(0, *home),
        point(600, *home),
        point(1200, *home),  # a stay at home: 0..1200
        point(1500, 30.01, 31.01),
        point(1800, 30.02, 31.02, noise=Noise.SPIKE),  # left out
        point(2100, 30.03, 31.03),
        point(2400, *work),
        point(3000, *work),
        point(3600, *work),  # a stay at work: 2400..3600
        point(9000, 30.10, 31.10),  # after a long silence
        point(9300, 30.11, 31.11),
    ]
    stays = [stay(0, 1200, *home), stay(2400, 3600, *work)]
    trips = m.split_trips(points, stays)
    assert len(trips) == 2
    first = trips[0].points
    assert [p.observed_at - T0 for p in first] == [1200, 1500, 2100, 2400]
    assert first[0].anchor and (first[0].latitude, first[0].longitude) == home
    assert first[-1].anchor and (first[-1].latitude, first[-1].longitude) == work
    # leaving work, the gap is too long to join: a new trip starts after it
    assert [p.observed_at - T0 for p in trips[1].points] == [9000, 9300]


def test_long_trips_are_matched_in_pieces() -> None:
    far = [(30.0 + i * 0.3, 31.0) for i in range(8)]  # ~33 km apart, ~230 km in all
    trips = m.split_trips([point(i * 600, *p) for i, p in enumerate(far)], [])
    assert len(trips) == 2
    assert trips[0].points[-1] == trips[1].points[0]  # each piece starts where the last ended


def test_costing() -> None:
    slow = trip([(30.0, 31.0), (30.001, 31.0), (30.002, 31.0)])  # ~110 m per 5 minutes
    fast = trip([(30.0, 31.0), (30.05, 31.0), (30.1, 31.0)])  # ~5.5 km per 5 minutes
    assert m.costing_for(slow, vehicle=False) is m.Costing.PEDESTRIAN
    assert m.costing_for(fast, vehicle=False) is m.Costing.AUTO
    assert m.costing_for(slow, vehicle=True) is m.Costing.AUTO


def test_distance_to_line() -> None:
    p = m.TripPoint(0, 52.0009, 4.0, None)  # ~100 m north
    assert 95 < m.distance_to_line(p, [(52.0, 3.99), (52.0, 4.01)]) < 105
    assert m.distance_to_line(p, []) == float("inf")
