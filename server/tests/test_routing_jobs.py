"""Matching in the background: the order trips go in, sharing them, dropping them, failing."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from find_my_tracker.features.routing import jobs
from find_my_tracker.features.routing.jobs import Matcher
from find_my_tracker.features.routing.matching import Costing, Trip, TripPoint
from find_my_tracker.features.routing.schemas import TripRoute
from find_my_tracker.integrations.valhalla.fake import FakeValhalla

T0 = 1_790_000_000


def trip(start: int, beacon: int = 1) -> tuple[str, Trip, Costing]:
    """A short walk starting `start` minutes in; its digest is its name."""
    points = tuple(
        TripPoint(T0 + (start + i) * 60, 52.0 + start / 1000, 4.0 + i / 1000, 30) for i in range(3)
    )
    return f"trip-{beacon}-{start}", Trip(beacon, points), Costing.PEDESTRIAN


class Gated(FakeValhalla):
    """Each match waits until let through, and remembers which trip (by start) asked."""

    def __init__(self) -> None:
        super().__init__()
        self.gate = asyncio.Event()
        self.asked: list[float] = []

    async def trace_attributes(self, request: dict[str, Any]) -> dict[str, Any]:
        self.asked.append(request["shape"][0]["lat"])
        await self.gate.wait()
        return await super().trace_attributes(request)


class Stored:
    def __init__(self) -> None:
        self.digests: list[str] = []

    async def __call__(self, trip: Trip, digest: str, route: TripRoute) -> None:
        self.digests.append(digest)


async def settle(job: jobs.MatchJob) -> None:
    async with asyncio.timeout(2):
        await job.settled.wait()


def test_a_job_is_matched_oldest_first_and_cached() -> None:
    async def scenario() -> None:
        client, stored = FakeValhalla(), Stored()
        matcher = Matcher(stored, parallel=1)
        job = matcher.start(client, [trip(20), trip(0), trip(10)])
        assert job.trips_left == 3 and job.done == 0
        await settle(job)
        assert stored.digests == ["trip-1-0", "trip-1-10", "trip-1-20"]
        assert [r.reports[0].observed_at.timestamp() for r in job.routes] == [
            T0,
            T0 + 600,
            T0 + 1200,
        ]
        assert job.done == 1 and job.trips_left == 0 and job.error is None

    asyncio.run(scenario())


def test_the_newest_view_goes_first_and_shared_trips_are_matched_once() -> None:
    async def scenario() -> None:
        client = Gated()
        matcher = Matcher(Stored(), parallel=1)
        week = matcher.start(client, [trip(0), trip(10), trip(20)])
        await asyncio.sleep(0)  # the oldest trip starts
        day = matcher.start(client, [trip(20), trip(30)])
        client.gate.set()
        await settle(week)
        await settle(day)
        # The week's first trip had started; then the day's, then the rest of the week.
        assert client.asked == [52.0, 52.02, 52.03, 52.01]
        assert len(week.routes) == 3 and len(day.routes) == 2
        # In the order they were matched: trip 20 came second, matched once for both.
        assert week.routes[1] is day.routes[0]

    asyncio.run(scenario())


def test_a_job_nobody_asks_about_is_dropped(monkeypatch: pytest.MonkeyPatch) -> None:
    async def scenario() -> None:
        client = Gated()
        matcher = Matcher(Stored(), parallel=1)
        job = matcher.start(client, [trip(0), trip(10)])
        await asyncio.sleep(0)
        assert matcher.job(job.id) is job  # asking keeps it

        monkeypatch.setattr(jobs, "JOB_TTL_S", -1)
        assert matcher.job(job.id) is None
        client.gate.set()
        await asyncio.sleep(0.05)
        # The trip being matched finished; the one waiting never started.
        assert client.asked == [52.0]

    asyncio.run(scenario())


def test_an_engine_that_goes_away_fails_the_job() -> None:
    async def scenario() -> None:
        client = FakeValhalla()
        client.down = True
        matcher = Matcher(Stored(), parallel=1)
        job = matcher.start(client, [trip(0), trip(10), trip(20)])
        await settle(job)
        assert job.error and "reach" in job.error
        assert job.routes == [] and job.trips_left == 0

    asyncio.run(scenario())


def test_nothing_to_match() -> None:
    async def scenario() -> None:
        job = Matcher(Stored()).start(FakeValhalla(), [])
        assert job.settled.is_set() and job.done == 1

    asyncio.run(scenario())
