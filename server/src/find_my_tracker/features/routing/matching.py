"""
Snapping a beacon's history to roads ("map matching").

Only good reports are used (see `locations.denoise`). History is cut into **trips**: runs of
reports between stays, broken where reports are more than `GAP_S` apart, since nothing says how
such a stretch was travelled. A trip that leaves or reaches a stay does so at the stay's centre,
so a drive goes from parking spot to parking spot.

Valhalla matches each trip as a whole: it looks for the one continuous way along real roads that
best explains all of its reports, rather than routing through each of them. Two kinds of report
still spoil a match, and are dropped before matching again:

- **Unmatched**: no road within reach. It cuts the route in two.
- **A spur**: a report the route drives out to and back from, the same way. A car rarely does
  that for one report; when the route without it is shorter *and still passes within its reach*,
  it was a finder's phone on a nearby road, not the item. Anything else is left to Valhalla, which
  is told how noisy these positions are: a phone on a parallel road costs less as noise there than
  a detour does, so the route stays on the road the neighbouring reports are on.

Dropped reports stay in the answer, marked off-route, placed where the route was at their time.
"""

from __future__ import annotations

import math
import statistics
from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from itertools import pairwise
from typing import Any

from find_my_tracker.features.locations.geo import haversine_m
from find_my_tracker.features.locations.schemas import LocationPoint, Stay
from find_my_tracker.integrations.valhalla import polyline
from find_my_tracker.integrations.valhalla.types import NO_ROADS_CODES, MatchFailed, Valhalla

#: Bump when matching changes, so cached routes are matched again.
ALGORITHM_VERSION = 1

GAP_S = 30 * 60
#: Valhalla refuses traces over 200 km; longer trips are matched in pieces.
MAX_PIECE_M = 150_000
#: Valhalla's default ceiling for both; any Valhalla server accepts them.
SEARCH_RADIUS_M = 100
MAX_GPS_ACCURACY_M = 100
#: Valhalla's default (2 km) treats reports further apart as unconnected, and a car's reports often
#: are (a trip is already cut where they are too far apart in time). Valhalla ignores this in a
#: request unless its config allows it: the built-in engine sets it in its config instead, and an
#: external server needs `meili.default.breakage_distance` raised (see the README).
BREAKAGE_M = 100_000
#: Turns cost a car more than Valhalla's default (200) says: fewer detours down side streets to
#: reach a stray report. Checked on simulated Cairo drives (route on the true road 81% -> 84%).
CAR_TURN_PENALTY = 500
#: Faster than this between reports at least `SPEED_MIN_S` apart: a vehicle, whatever the item is.
VEHICLE_MPS = 25 / 3.6
SPEED_MIN_S = 120
#: A report's reach: the finder's GPS accuracy plus Bluetooth range (the finder is near the item,
#: not on it). It is also the noise Valhalla is told to expect.
BLUETOOTH_M = 50
NEAR_MIN_M = 75
NEAR_MAX_M = 200
#: The route retraces itself around a report when points this far either side of it are this close.
RETRACE_STEPS_M = (20, 40, 80, 150, 300)
RETRACE_M = 20
MAX_CANDIDATES = 8
#: ...and the report is dropped when the route without it is at least this much shorter.
SPUR_M = 50


class Costing(StrEnum):
    AUTO = "auto"
    PEDESTRIAN = "pedestrian"


class Fallback(StrEnum):
    """Why a trip has no road route; it is drawn as reported instead."""

    NO_ROADS = "no_roads"
    ERROR = "error"


@dataclass(frozen=True)
class TripPoint:
    observed_at: int
    latitude: float
    longitude: float
    accuracy_m: int | None
    #: A stay's centre, where the trip leaves or arrives; never dropped.
    anchor: bool = False


@dataclass(frozen=True)
class Trip:
    beacon_id: int
    points: tuple[TripPoint, ...]

    @property
    def start(self) -> int:
        return self.points[0].observed_at

    @property
    def end(self) -> int:
        return self.points[-1].observed_at


@dataclass(frozen=True)
class RoutedPoint:
    observed_at: int
    latitude: float
    longitude: float
    offset_m: float
    off_route: bool


@dataclass(frozen=True)
class TripResult:
    #: (latitude, longitude)
    geometry: list[tuple[float, float]]
    points: list[RoutedPoint]
    #: Indices into `points`: the way from that point to the next is not known.
    broken_after: list[int]
    fallback: Fallback | None = None


# ---- trips ----


def split_trips(points: Sequence[LocationPoint], stays: Sequence[Stay]) -> list[Trip]:
    """Trips from history ordered by beacon, then time. Noisy reports are left out."""
    by_beacon: dict[int, list[LocationPoint]] = {}
    for p in points:
        if p.noise is None:
            by_beacon.setdefault(p.beacon_id, []).append(p)
    stays_by: dict[int, list[Stay]] = {}
    for s in stays:
        stays_by.setdefault(s.beacon_id, []).append(s)

    trips: list[Trip] = []
    for beacon_id, reports in by_beacon.items():
        reports.sort(key=lambda p: p.observed_at)
        own = sorted(stays_by.get(beacon_id, []), key=lambda s: s.arrived_at)
        current: list[TripPoint] = []

        def close(current: list[TripPoint], beacon_id: int = beacon_id) -> None:
            if len(current) >= 2:
                trips.extend(_pieces(Trip(beacon_id, tuple(current))))
            current.clear()

        k = 0
        for p in reports:
            t = _ts(p.observed_at)
            while k < len(own) and _ts(own[k].left_at) < t:
                k += 1
            stay = own[k] if k < len(own) and _ts(own[k].arrived_at) <= t else None
            if stay is not None:
                if current and t - current[-1].observed_at > GAP_S:
                    close(current)
                if t == _ts(stay.arrived_at) and current:
                    current.append(_anchor(stay, t))
                    close(current)
                if t == _ts(stay.left_at):
                    close(current)
                    current.append(_anchor(stay, t))
                continue
            if current and t - current[-1].observed_at > GAP_S:
                close(current)
            current.append(
                TripPoint(
                    observed_at=t,
                    latitude=p.latitude,
                    longitude=p.longitude,
                    accuracy_m=p.accuracy_m,
                )
            )
        close(current)
    return trips


def _anchor(stay: Stay, t: int) -> TripPoint:
    return TripPoint(t, stay.latitude, stay.longitude, None, anchor=True)


def _ts(value: Any) -> int:
    return int(value.timestamp())


def _pieces(trip: Trip) -> list[Trip]:
    """Consecutive pieces of at most `MAX_PIECE_M`, each starting where the last ended."""
    pieces: list[Trip] = []
    start, run = 0, 0.0
    pts = trip.points
    for i in range(1, len(pts)):
        run += _dist(pts[i - 1], pts[i])
        if run > MAX_PIECE_M and i - 1 > start:
            pieces.append(Trip(trip.beacon_id, pts[start:i]))
            start, run = i - 1, _dist(pts[i - 1], pts[i])
    pieces.append(Trip(trip.beacon_id, pts[start:]))
    return pieces


def costing_for(trip: Trip, *, vehicle: bool) -> Costing:
    """A vehicle's item is matched as a car. Anything else too, once it moved like one."""
    if vehicle:
        return Costing.AUTO
    pts = trip.points
    for a, b in pairwise(pts):
        dt = b.observed_at - a.observed_at
        if dt >= SPEED_MIN_S and _dist(a, b) / dt > VEHICLE_MPS:
            return Costing.AUTO
    return Costing.PEDESTRIAN


# ---- talking to Valhalla ----


def request(points: Sequence[TripPoint], costing: Costing) -> dict[str, Any]:
    accuracies = [p.accuracy_m for p in points if p.accuracy_m and not p.anchor]
    gps = (statistics.median(accuracies) if accuracies else NEAR_MIN_M) + BLUETOOTH_M
    return {
        "shape": [{"lat": p.latitude, "lon": p.longitude} for p in points],
        "costing": costing.value,
        "shape_match": "map_snap",
        "trace_options": {
            "search_radius": SEARCH_RADIUS_M,
            "gps_accuracy": max(10, min(gps, MAX_GPS_ACCURACY_M)),
            "breakage_distance": BREAKAGE_M,
            **({"turn_penalty_factor": CAR_TURN_PENALTY} if costing is Costing.AUTO else {}),
        },
        "filters": {
            "attributes": [
                "shape",
                "edge.begin_shape_index",
                "edge.end_shape_index",
                "matched.point",
                "matched.type",
                "matched.edge_index",
                "matched.distance_along_edge",
                "matched.begin_route_discontinuity",
            ],
            "action": "include",
        },
    }


@dataclass
class Match:
    """Valhalla's answer, per point sent: where along the route it landed, if anywhere."""

    geometry: list[tuple[float, float]]
    cumulative: list[float]
    offsets: list[float | None]
    #: Indices i: the route is broken between point i and the next matched point.
    breaks: set[int] = field(default_factory=set[int])

    def point_at(self, offset: float) -> tuple[float, float]:
        if not self.geometry:
            msg = "empty route"
            raise ValueError(msg)
        if offset <= 0 or len(self.geometry) == 1:
            return self.geometry[0]
        i = bisect_right(self.cumulative, offset)
        if i >= len(self.geometry):
            return self.geometry[-1]
        a, b = self.geometry[i - 1], self.geometry[i]
        span = self.cumulative[i] - self.cumulative[i - 1]
        f = (offset - self.cumulative[i - 1]) / span if span else 0.0
        return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)

    @property
    def length(self) -> float:
        return self.cumulative[-1] if self.cumulative else 0.0


def parse(response: dict[str, Any], sent: int) -> Match:
    geometry = polyline.decode(str(response.get("shape") or ""))
    cumulative = [0.0]
    for a, b in pairwise(geometry):
        cumulative.append(cumulative[-1] + haversine_m(a[0], a[1], b[0], b[1]))
    edges = response.get("edges") or []
    matched = response.get("matched_points") or []
    offsets: list[float | None] = []
    breaks: set[int] = set()
    for i in range(sent):
        m = matched[i] if i < len(matched) else {}
        edge_index = m.get("edge_index")
        if m.get("type") == "unmatched" or edge_index is None or edge_index >= len(edges):
            offsets.append(None)
            continue
        edge = edges[edge_index]
        begin = cumulative[min(edge.get("begin_shape_index", 0), len(cumulative) - 1)]
        end = cumulative[min(edge.get("end_shape_index", 0), len(cumulative) - 1)]
        offsets.append(begin + float(m.get("distance_along_edge", 0.0)) * (end - begin))
        if m.get("begin_route_discontinuity"):
            breaks.add(i)
    # Along the route, time only moves forward.
    last = 0.0
    for i, o in enumerate(offsets):
        if o is not None:
            last = max(last, o)
            offsets[i] = last
    return Match(geometry, cumulative, offsets, breaks)


async def match_trip(client: Valhalla, trip: Trip, costing: Costing) -> TripResult:
    """Match, drop what spoils the match, match again. See the module docstring."""
    pts = list(trip.points)
    keep = list(range(len(pts)))
    try:
        match = await _match(client, [pts[i] for i in keep], costing)
        unmatched = {keep[j] for j, o in enumerate(match.offsets) if o is None}
        if unmatched - _anchors(pts) and len(keep) - len(unmatched) >= 2:
            keep = [i for i in keep if i not in unmatched or pts[i].anchor]
            match = await _match(client, [pts[i] for i in keep], costing)

        detours = await _detours(client, pts, keep, match, costing)
        if detours:
            keep = [i for i in keep if i not in detours]
            match = await _match(client, [pts[i] for i in keep], costing)
    except MatchFailed as e:
        return _fallback(trip, Fallback.NO_ROADS if e.code in NO_ROADS_CODES else Fallback.ERROR)
    return _result(pts, keep, match)


async def _match(client: Valhalla, points: list[TripPoint], costing: Costing) -> Match:
    return parse(await client.trace_attributes(request(points, costing)), len(points))


def _anchors(pts: Sequence[TripPoint]) -> set[int]:
    return {i for i, p in enumerate(pts) if p.anchor}


async def _detours(
    client: Valhalla, pts: list[TripPoint], keep: list[int], match: Match, costing: Costing
) -> set[int]:
    """Reports the route drives out to and back from, which a shorter route passes near anyway."""
    candidates: list[tuple[float, int]] = []
    for j in range(1, len(keep) - 1):
        before, here, after = match.offsets[j - 1], match.offsets[j], match.offsets[j + 1]
        if before is None or here is None or after is None or pts[keep[j]].anchor:
            continue
        if _retraces(match, before, here, after):
            candidates.append((after - before, j))

    dropped: set[int] = set()
    for _, j in sorted(candidates, reverse=True)[:MAX_CANDIDATES]:
        before, after = match.offsets[j - 1], match.offsets[j + 1]
        assert before is not None and after is not None
        through = after - before
        report, prev, nxt = pts[keep[j]], pts[keep[j - 1]], pts[keep[j + 1]]
        try:
            without = await _match(client, [prev, nxt], costing)
        except MatchFailed:
            continue
        a, b = without.offsets
        if a is None or b is None:
            continue
        reach = min(max((report.accuracy_m or NEAR_MIN_M) + BLUETOOTH_M, NEAR_MIN_M), NEAR_MAX_M)
        if through - (b - a) > SPUR_M and distance_to_line(report, without.geometry) <= reach:
            dropped.add(keep[j])
    return dropped


def _retraces(match: Match, before: float, here: float, after: float) -> bool:
    for d in RETRACE_STEPS_M:
        if here - d <= before or here + d >= after:
            return False
        if haversine_m(*match.point_at(here - d), *match.point_at(here + d)) < RETRACE_M:
            return True
    return False


def _result(pts: list[TripPoint], keep: list[int], match: Match) -> TripResult:
    offset_of: dict[int, float] = {}
    for j, i in enumerate(keep):
        if (o := match.offsets[j]) is not None:
            offset_of[i] = o
    known = sorted(offset_of)
    if len(known) < 2:
        return _fallback(Trip(0, tuple(pts)), Fallback.NO_ROADS)

    routed: list[RoutedPoint] = []
    for i, p in enumerate(pts):
        if i in offset_of:
            offset, off = offset_of[i], False
        else:
            offset, off = _interpolate(pts, known, offset_of, i), True
        lat, lon = match.point_at(offset)
        routed.append(RoutedPoint(p.observed_at, lat, lon, round(offset, 1), off))

    # A break covers every leg up to the next report the route reaches again.
    broken: set[int] = set()
    for j in match.breaks:
        nxt = next((keep[k] for k in range(j + 1, len(keep)) if match.offsets[k] is not None), None)
        broken.update(range(keep[j], nxt if nxt is not None else len(pts) - 1))
    return TripResult(geometry=match.geometry, points=routed, broken_after=sorted(broken))


def _interpolate(
    pts: list[TripPoint], known: list[int], offset_of: dict[int, float], i: int
) -> float:
    """Where the route was at a dropped report's time, between the matched ones around it."""
    after = bisect_right(known, i)
    if after == 0:
        return offset_of[known[0]]
    if after == len(known):
        return offset_of[known[-1]]
    a, b = known[after - 1], known[after]
    ta, tb, t = pts[a].observed_at, pts[b].observed_at, pts[i].observed_at
    f = (t - ta) / (tb - ta) if tb > ta else 0.0
    return offset_of[a] + (offset_of[b] - offset_of[a]) * f


def _fallback(trip: Trip, reason: Fallback) -> TripResult:
    return TripResult(
        geometry=[],
        points=[
            RoutedPoint(p.observed_at, p.latitude, p.longitude, 0.0, False) for p in trip.points
        ],
        broken_after=[],
        fallback=reason,
    )


# ---- geometry ----


def _dist(a: TripPoint, b: TripPoint) -> float:
    return haversine_m(a.latitude, a.longitude, b.latitude, b.longitude)


def distance_to_line(p: TripPoint, line: Sequence[tuple[float, float]]) -> float:
    """Metres from a point to a polyline of (lat, lon); flat-earth, fine at these distances."""
    if not line:
        return math.inf
    k = math.cos(math.radians(p.latitude))
    m = 111_320.0

    def xy(lat: float, lon: float) -> tuple[float, float]:
        return ((lon - p.longitude) * k * m, (lat - p.latitude) * m)

    best = math.inf
    prev = xy(*line[0])
    if len(line) == 1:
        return math.hypot(*prev)
    for lat, lon in line[1:]:
        cur = xy(lat, lon)
        dx, dy = cur[0] - prev[0], cur[1] - prev[1]
        length2 = dx * dx + dy * dy
        t = 0.0 if length2 == 0 else max(0.0, min(1.0, -(prev[0] * dx + prev[1] * dy) / length2))
        best = min(best, math.hypot(prev[0] + t * dx, prev[1] + t * dy))
        prev = cur
    return best
