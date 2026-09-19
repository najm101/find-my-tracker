"""
DEMO_MODE's Apple: the fake sign-in flow (see fake.py for its known answers), with five beacons
that follow one made-up person's routine around Amsterdam on real roads.

The routine repeats every two weeks: bike commutes, a gym evening, dinner in the Jordaan, a day
trip to Haarlem by train, a ride through the Amsterdamse Bos, and a weekend in Lisbon. Positions
are a pure function of time, so every poll returns the same reports for the same moments, and
each beacon reports like a real one: often while moving through a busy city, rarely while parked.
Routes come from `demo_routes.json` (built by `scripts/build_demo_routes.py`).
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from functools import cache
from itertools import pairwise
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from find_my_tracker.integrations.apple.fake import FakeAppleClient, FakeAppleClientFactory
from find_my_tracker.integrations.apple.types import (
    AccessoryInfo,
    AppleError,
    BeaconKind,
    FetchResult,
    Report,
)

TZ = ZoneInfo("Europe/Amsterdam")
CYCLE_START = date(2026, 1, 5)  # a Monday
CYCLE_DAYS = 14
HISTORY = timedelta(days=14)
SLOT = timedelta(minutes=1)

# identifier, name, model, kind
BEACONS = [
    ("DEMO-KEYS", "Keys", "", BeaconKind.AIRTAG),
    ("DEMO-BACKPACK", "Backpack", "", BeaconKind.AIRTAG),
    ("DEMO-BIKE", "Bike", "", BeaconKind.AIRTAG),
    ("DEMO-SUITCASE", "Suitcase", "", BeaconKind.AIRTAG),
    ("DEMO-AIRPODS", "AirPods Pro", "", BeaconKind.AIRPODS),
]

# Who comes along on a leg. Keys always do; the bike rides on bike routes only.
LIGHT = "light"  # backpack and AirPods stay home
TRIP = "trip"  # the suitcase comes too

# Per cycle day: (departure "HH:MM", route, reversed, tags). A route ending where the next one
# starts is assumed; `flight` is a leg with no reports.
_COMMUTE = [("08:40", "home_office", False, ()), ("17:50", "home_office", True, ())]
PLAN: dict[int, list[tuple[str, str, bool, tuple[str, ...]]]] = {
    0: _COMMUTE,
    1: [
        *_COMMUTE,
        ("18:45", "home_jordaan", False, (LIGHT,)),
        ("22:40", "home_jordaan", True, (LIGHT,)),
    ],
    2: [
        ("08:35", "home_office", False, ()),
        ("17:40", "office_gym", False, ()),
        ("19:20", "gym_home", False, ()),
    ],
    3: _COMMUTE,
    4: [("09:10", "home_office", False, ()), ("16:30", "home_office", True, ())],
    5: [
        ("10:20", "home_market", False, (LIGHT,)),
        ("11:05", "home_market", True, (LIGHT,)),
        ("13:10", "home_centraal", False, ()),
        ("13:40", "centraal_haarlem", False, ()),
        ("14:15", "haarlem_walk", False, ()),
        ("17:30", "haarlem_walk", True, ()),
        ("17:50", "centraal_haarlem", True, ()),
        ("18:25", "home_centraal", True, ()),
    ],
    6: [
        ("11:00", "bos_loop", False, (LIGHT,)),
        ("15:45", "home_vondelpark", False, (LIGHT,)),
        ("17:40", "home_vondelpark", True, (LIGHT,)),
    ],
    7: _COMMUTE,
    8: _COMMUTE,
    9: [
        ("08:35", "home_office", False, ()),
        ("17:40", "office_gym", False, ()),
        ("19:20", "gym_home", False, ()),
    ],
    10: _COMMUTE,
    11: [
        ("06:20", "home_schiphol", False, (TRIP,)),
        ("08:05", "flight", False, (TRIP,)),
        ("11:30", "lisbon_airport_hotel", False, (TRIP,)),
        ("15:10", "lisbon_hotel_belem", False, ()),
        ("18:40", "lisbon_hotel_belem", True, ()),
    ],
    12: [("10:30", "lisbon_hotel_alfama", False, ()), ("14:10", "lisbon_hotel_alfama", True, ())],
    13: [
        ("12:50", "lisbon_airport_hotel", True, (TRIP,)),
        ("15:10", "flight", True, (TRIP,)),
        ("18:45", "home_schiphol", True, (TRIP,)),
    ],
}


@dataclass(frozen=True)
class Route:
    points: list[tuple[float, float]]
    minutes: int
    bike: bool
    cumulative: list[float]  # distance along the route at each point, in degrees-ish

    @property
    def start(self) -> tuple[float, float]:
        return self.points[0]

    @property
    def end(self) -> tuple[float, float]:
        return self.points[-1]

    def at(self, fraction: float) -> tuple[float, float]:
        target = fraction * self.cumulative[-1]
        for i in range(1, len(self.points)):
            if self.cumulative[i] >= target:
                span = self.cumulative[i] - self.cumulative[i - 1] or 1
                f = (target - self.cumulative[i - 1]) / span
                (a_lat, a_lon), (b_lat, b_lon) = self.points[i - 1], self.points[i]
                return a_lat + (b_lat - a_lat) * f, a_lon + (b_lon - a_lon) * f
        return self.end

    def reversed(self) -> Route:
        return _route(list(reversed(self.points)), self.minutes, bike=self.bike)


def _route(points: list[tuple[float, float]], minutes: int, *, bike: bool) -> Route:
    cumulative = [0.0]
    for (a_lat, a_lon), (b_lat, b_lon) in pairwise(points):
        dx = (b_lon - a_lon) * math.cos(math.radians(a_lat))
        cumulative.append(cumulative[-1] + math.hypot(b_lat - a_lat, dx))
    return Route(points, minutes, bike, cumulative)


_BIKE_ROUTES = {
    "home_office",
    "office_gym",
    "gym_home",
    "home_centraal",
    "home_jordaan",
    "bos_loop",
}


@cache
def _routes() -> dict[str, Route]:
    data = json.loads((Path(__file__).parent / "demo_routes.json").read_text())
    routes = {
        name: _route([(p[0], p[1]) for p in r["points"]], r["minutes"], bike=name in _BIKE_ROUTES)
        for name, r in data["routes"].items()
    }
    places = data["places"]
    routes["flight"] = _route(
        [tuple(places["schiphol"]), tuple(places["lisbon_airport"])], 190, bike=False
    )
    return routes


@dataclass(frozen=True)
class Leg:
    start: datetime
    end: datetime
    route: Route
    carries: frozenset[str]
    silent: bool  # in the air: no reports


def _carries(route: Route, tags: tuple[str, ...]) -> frozenset[str]:
    carried = {"DEMO-KEYS"}
    if LIGHT not in tags:
        carried |= {"DEMO-BACKPACK", "DEMO-AIRPODS"}
    if route.bike:
        carried.add("DEMO-BIKE")
    if TRIP in tags:
        carried.add("DEMO-SUITCASE")
    return frozenset(carried)


@cache
def _cycle_legs(cycle: int) -> list[Leg]:
    routes = _routes()
    first_day = CYCLE_START + timedelta(days=cycle * CYCLE_DAYS)
    legs: list[Leg] = []
    for offset, plan in sorted(PLAN.items()):
        day = first_day + timedelta(days=offset)
        for hhmm, name, backwards, tags in plan:
            route = routes[name].reversed() if backwards else routes[name]
            hour, minute = map(int, hhmm.split(":"))
            start = datetime.combine(day, time(hour, minute), TZ).astimezone(UTC)
            legs.append(
                Leg(
                    start,
                    start + timedelta(minutes=route.minutes),
                    route,
                    _carries(route, tags),
                    silent=name == "flight",
                )
            )
    return legs


def _home() -> tuple[float, float]:
    return _routes()["home_office"].start


def _cycle_of(moment: datetime) -> int:
    return (moment.astimezone(TZ).date() - CYCLE_START).days // CYCLE_DAYS


def position(ident: str, moment: datetime) -> tuple[tuple[float, float], bool] | None:
    """Where a beacon is at `moment`, and whether it is moving. None while in the air."""
    here = _home()  # every cycle starts and ends with everything at home
    for leg in _cycle_legs(_cycle_of(moment)):
        if ident not in leg.carries:
            continue
        if moment < leg.start:
            break
        if moment < leg.end:
            if leg.silent:
                return None
            fraction = (moment - leg.start) / (leg.end - leg.start)
            return leg.route.at(fraction), True
        here = leg.route.end
    return here, False


def reports(ident: str, until: datetime, since: datetime) -> list[Report]:
    """Reports on a one-minute grid: most minutes while moving, about one in twenty while parked."""
    out: list[Report] = []
    epoch_slot = int(since.timestamp() // SLOT.total_seconds())
    last_slot = int(until.timestamp() // SLOT.total_seconds())
    for slot in range(epoch_slot, last_slot):
        rng = random.Random(f"{ident}:{slot}")  # noqa: S311 - deterministic demo data
        moment = datetime.fromtimestamp(slot * SLOT.total_seconds(), UTC) + timedelta(
            seconds=rng.randrange(0, 60)
        )
        if moment > until:
            continue
        where = position(ident, moment)
        if where is None:
            continue
        (lat, lon), moving = where
        if rng.random() > (0.75 if moving else 0.045):
            continue
        spread = 0.00006 if moving else 0.00012  # ~7 m / ~13 m
        accuracy = rng.randint(8, 30) if moving else rng.choice([10, 15, 20, 35, 50, 65])
        out.append(
            Report(
                moment.replace(microsecond=0),
                round(lat + rng.gauss(0, spread), 6),
                round(lon + rng.gauss(0, spread * 1.6), 6),
                accuracy,
                rng.choice([1, 2, 3]),
                0,
            )
        )
    return out


class DemoAppleClient(FakeAppleClient):
    async def accessories(self) -> list[AccessoryInfo]:
        if not self.export_keychain():
            msg = "Keychain is locked."
            raise AppleError(msg)
        return [
            AccessoryInfo(
                identifier=ident,
                name=name,
                model=model,
                kind=kind,
                paired_at=datetime(2025, 3, 1 + i * 17 % 28, tzinfo=UTC),
                key_material={"identifier": ident, "polls": 0},
            )
            for i, (ident, name, model, kind) in enumerate(BEACONS)
        ]

    async def fetch_history(self, key_material: dict[str, dict[str, Any]]) -> FetchResult:
        self._require_login()
        now = (self._now or datetime.now(UTC)).replace(microsecond=0)
        return FetchResult(
            reports={ident: reports(ident, now, now - HISTORY) for ident in key_material},
            updated_key_material={
                ident: {**m, "polls": m.get("polls", 0) + 1} for ident, m in key_material.items()
            },
        )


class DemoAppleClientFactory(FakeAppleClientFactory):
    def new(self) -> DemoAppleClient:
        return DemoAppleClient(identity=self.identity)

    def restore(self, session: dict[str, Any]) -> DemoAppleClient:
        return DemoAppleClient(session=session)
