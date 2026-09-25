"""
Matching trips in the background, so a history view can show how far along it is and draw each
trip as soon as it is matched.

A history view with trips to match starts a **job**: those trips, oldest first. The page asks the
job every so often for the trips matched since it last asked. Trips are matched a few at a time
for the whole server, the newest job's first: that is the view someone is looking at now. A trip
two jobs need is matched once, and cached as soon as it is.

A job nobody has asked about for `JOB_TTL_S` is dropped (the page closed, or moved to another
view), and with it the trips only it needed that haven't started. Trips already being matched
finish and are cached, so they are ready when the view is opened again.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field

from find_my_tracker.core.clock import Clock, to_datetime
from find_my_tracker.core.database import Database
from find_my_tracker.features.routing.matching import (
    Costing,
    Fallback,
    RoutedPoint,
    Trip,
    TripResult,
    match_trip,
)
from find_my_tracker.features.routing.repository import RouteCacheRepository
from find_my_tracker.features.routing.schemas import RoutedReport, TripRoute
from find_my_tracker.integrations.valhalla.types import RoutingUnavailable, Valhalla

logger = logging.getLogger(__name__)

#: Trips matched at once, for the whole server.
PARALLEL_MATCHES = 4
#: A job the page has stopped asking about for this long is dropped.
JOB_TTL_S = 30

#: Keeps a matched trip: (trip, its digest, its route).
Store = Callable[[Trip, str, TripRoute], Awaitable[None]]


@dataclass(eq=False)
class TripWork:
    """One trip to match, for every job that needs it."""

    digest: str
    trip: Trip
    costing: Costing
    client: Valhalla
    #: The newest job that needs it: the highest goes first.
    rank: int
    jobs: set[str] = field(default_factory=set[str])
    started: bool = False
    progress: float = 0.0
    route: TripRoute | None = None
    error: str | None = None

    @property
    def weight(self) -> int:
        """The time a trip takes grows with its reports, so progress is counted in them."""
        return len(self.trip.points)

    @property
    def over(self) -> bool:
        return self.route is not None or self.error is not None


@dataclass(eq=False)
class MatchJob:
    """The trips one history view is waiting for."""

    id: str
    works: list[TripWork]
    seen: float
    #: Matched so far, in the order they were matched.
    routes: list[TripRoute] = field(default_factory=list[TripRoute])
    error: str | None = None
    settled: asyncio.Event = field(default_factory=asyncio.Event)

    @property
    def done(self) -> float:
        """0..1, counted in reports."""
        total = sum(w.weight for w in self.works)
        if not total:
            return 1.0
        return sum(w.weight * (1.0 if w.over else w.progress) for w in self.works) / total

    @property
    def trips_left(self) -> int:
        return sum(1 for w in self.works if not w.over)

    def heard(self, work: TripWork) -> None:
        """One of its trips is matched, or failed."""
        if work.route is not None:
            self.routes.append(work.route)
        if work.error and not self.error:
            self.error = work.error
        if all(w.over for w in self.works):
            self.settled.set()


class Matcher:
    def __init__(self, store: Store, *, parallel: int = PARALLEL_MATCHES) -> None:
        self._store = store
        self._parallel = parallel
        #: Waiting or being matched, by digest.
        self._works: dict[str, TripWork] = {}
        self._jobs: dict[str, MatchJob] = {}
        self._tasks: set[asyncio.Task[None]] = set()
        self._active = 0
        self._rank = 0
        self._closed = False

    def start(self, client: Valhalla, todo: Sequence[tuple[str, Trip, Costing]]) -> MatchJob:
        """A job for these trips (digest, trip, costing), matched oldest first."""
        self._sweep()
        self._rank += 1
        job = MatchJob(id=secrets.token_urlsafe(9), works=[], seen=time.monotonic())
        for digest, trip, costing in sorted(todo, key=lambda t: t[1].start):
            work = self._works.get(digest)
            if work is None:
                work = TripWork(digest, trip, costing, client, self._rank)
                self._works[digest] = work
            work.rank = self._rank
            work.jobs.add(job.id)
            job.works.append(work)
        self._jobs[job.id] = job
        if not job.works:
            job.settled.set()
        self._pump()
        return job

    def job(self, job_id: str) -> MatchJob | None:
        """A job still going (or recently done); asking keeps it alive."""
        self._sweep()
        job = self._jobs.get(job_id)
        if job:
            job.seen = time.monotonic()
        return job

    async def close(self) -> None:
        self._closed = True
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    def _pump(self) -> None:
        while not self._closed and self._active < self._parallel:
            waiting = [w for w in self._works.values() if not w.started]
            if not waiting:
                return
            work = min(waiting, key=lambda w: (-w.rank, w.trip.start))
            work.started = True
            self._active += 1
            task = asyncio.create_task(self._match(work), name=f"match-{work.digest[:8]}")
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)

    async def _match(self, work: TripWork) -> None:
        def progress(value: float) -> None:
            work.progress = value

        try:
            result = await match_trip(work.client, work.trip, work.costing, progress)
            route = to_route(work.trip, work.costing, result)
            if route.fallback is not Fallback.ERROR:  # a passing error is worth retrying
                try:
                    await self._store(work.trip, work.digest, route)
                except Exception:
                    logger.exception("Could not cache a predicted route")
            work.route = route
        except RoutingUnavailable as e:
            work.error = str(e)
            self._fail_waiting(work.client, str(e))
        except Exception:
            logger.exception("Matching a trip failed")
            work.error = "Something went wrong while finding the predicted route."
        finally:
            self._active -= 1
            self._works.pop(work.digest, None)
            self._tell(work)
            self._pump()

    def _fail_waiting(self, client: Valhalla, message: str) -> None:
        """The engine is gone: the trips waiting for it won't get anywhere either."""
        for work in [w for w in self._works.values() if w.client is client and not w.started]:
            work.error = message
            del self._works[work.digest]
            self._tell(work)

    def _tell(self, work: TripWork) -> None:
        for job_id in work.jobs:
            if job := self._jobs.get(job_id):
                job.heard(work)

    def _sweep(self) -> None:
        now = time.monotonic()
        for job in [j for j in self._jobs.values() if now - j.seen > JOB_TTL_S]:
            del self._jobs[job.id]
            for work in job.works:
                work.jobs.discard(job.id)
                if not work.jobs and not work.started:
                    self._works.pop(work.digest, None)


def cache_in(db: Database, clock: Clock) -> Store:
    """Matched trips go to the route cache, each in its own transaction."""

    async def store(trip: Trip, digest: str, route: TripRoute) -> None:
        async with db.session() as session:
            await RouteCacheRepository(session).put(
                trip.beacon_id, trip.start, digest, route.model_dump_json(), clock.timestamp()
            )
            await session.commit()

    return store


def to_route(trip: Trip, costing: Costing, result: TripResult) -> TripRoute:
    return TripRoute(
        beacon_id=trip.beacon_id,
        costing=costing,
        geometry=[(round(lon, 6), round(lat, 6)) for lat, lon in result.geometry],
        reports=[_report(p) for p in result.points],
        broken_after=result.broken_after,
        fallback=result.fallback,
    )


def _report(p: RoutedPoint) -> RoutedReport:
    return RoutedReport(
        observed_at=to_datetime(p.observed_at),  # pyright: ignore[reportArgumentType]
        latitude=round(p.latitude, 6),
        longitude=round(p.longitude, 6),
        offset_m=p.offset_m,
        off_route=p.off_route,
    )
