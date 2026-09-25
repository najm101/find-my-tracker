"""
How long location history is kept, and deleting what is older.

History is kept for good unless a period is set. Shortening it deletes what's past the new
period right away (Settings says how much first, like Google's auto-delete); lengthening it
brings nothing back. Each item's newest sighting is always kept, however old: a lost item's last
known position is the one a tracker must not forget. Cached predicted routes of trips that
started before the cutoff go too. Items, places, settings and map data are untouched.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.core.clock import Clock, to_datetime
from find_my_tracker.core.container import Container
from find_my_tracker.features.locations.service import LocationService
from find_my_tracker.features.retention.schemas import (
    RetentionPreview,
    RetentionRun,
    RetentionStatus,
)
from find_my_tracker.features.routing.service import RoutingService
from find_my_tracker.features.settings.service import SettingsService

DAYS_KEY = "retention_days"
LAST_RUN_KEY = "retention_last_run"
#: Deleted this many at a time, committing in between, so SQLite never holds its write lock long.
BATCH = 2_000
DAY_S = 86_400


class RetentionService:
    def __init__(self, session: AsyncSession, container: Container) -> None:
        self._session = session
        self._clock: Clock = container.clock
        self._container = container
        self._settings = SettingsService(session)
        self._locations = LocationService(session)
        self._routing = RoutingService(session, container)

    async def days(self) -> int | None:
        value = await self._settings.value(DAYS_KEY)
        return value if isinstance(value, int) else None

    async def status(self) -> RetentionStatus:
        days = await self.days()
        oldest = await self._locations.oldest()
        last = await self._settings.value(LAST_RUN_KEY)
        return RetentionStatus(
            days=days,
            cutoff=to_datetime(self._cutoff(days)) if days else None,
            oldest=to_datetime(oldest) if oldest is not None else None,
            last_run=_run(last) if isinstance(last, dict) else None,
            running=self._container.retention.running,
        )

    async def preview(self, days: int) -> RetentionPreview:
        """What keeping `days` would delete now."""
        cutoff = self._cutoff(days)
        counts = [
            await self._locations.count_before(beacon_id, min(cutoff, newest))
            for beacon_id, newest in (await self._locations.newest_by_beacon()).items()
        ]
        return RetentionPreview(
            days=days,
            cutoff=to_datetime(cutoff),  # pyright: ignore[reportArgumentType]
            sightings=sum(counts),
            items=sum(1 for n in counts if n),
        )

    async def set_days(self, days: int | None) -> RetentionStatus:
        await self._settings.put_values({DAYS_KEY: days})
        await self._session.commit()
        if days is not None:
            self._container.retention.run_soon()
        return await self.status()

    async def clean(self) -> int | None:
        """Deletes what's past the period. Returns how many sightings went; None when kept."""
        days = await self.days()
        if days is None:
            return None
        cutoff = self._cutoff(days)
        deleted = 0
        for beacon_id, newest in (await self._locations.newest_by_beacon()).items():
            before = min(cutoff, newest)  # the newest one stays, however old
            while n := await self._locations.delete_before(beacon_id, before, BATCH):
                deleted += n
                await self._session.commit()
        await self._routing.forget_before(cutoff)
        run = {"at": self._clock.timestamp(), "cutoff": cutoff, "deleted": deleted}
        await self._settings.put_values({LAST_RUN_KEY: run})
        await self._session.commit()
        return deleted

    def _cutoff(self, days: int) -> int:
        return self._clock.timestamp() - days * DAY_S


def _run(value: dict[str, Any]) -> RetentionRun | None:
    try:
        return RetentionRun(
            at=to_datetime(int(value["at"])),  # pyright: ignore[reportArgumentType]
            cutoff=to_datetime(int(value["cutoff"])),  # pyright: ignore[reportArgumentType]
            deleted=int(value["deleted"]),
        )
    except (KeyError, TypeError, ValueError):
        return None
