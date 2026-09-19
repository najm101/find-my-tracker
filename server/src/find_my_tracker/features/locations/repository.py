from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import Select, column, func, select, table
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.features.locations.geo import BBox
from find_my_tracker.features.locations.models import Location

# SQLite caps bound parameters per statement; 10 columns x 500 rows stays well under it.
_CHUNK = 500

# The R*Tree virtual table (created in migration 0001, maintained by triggers).
_rtree = table(
    "locations_rtree",
    column("id"),
    column("min_lat"),
    column("max_lat"),
    column("min_lon"),
    column("max_lon"),
)


class LocationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def insert_new(self, rows: Sequence[dict[str, object]]) -> int:
        """Insert rows, skipping (beacon, time) pairs already stored. Returns the new count."""
        inserted = 0
        for start in range(0, len(rows), _CHUNK):
            chunk = rows[start : start + _CHUNK]
            stmt = (
                insert(Location)
                .values(list(chunk))
                .on_conflict_do_nothing(index_elements=["beacon_id", "observed_at"])
                .returning(Location.id)
            )
            inserted += len((await self._session.execute(stmt)).all())
        return inserted

    async def query(
        self,
        *,
        beacon_ids: Sequence[int] | None,
        start: int,
        end: int,
        bbox: BBox | None = None,
        limit: int | None = None,
    ) -> Sequence[Location]:
        """Points in a time range, optionally inside a box; ordered by beacon, then time."""
        stmt: Select[tuple[Location]] = select(Location).where(
            Location.observed_at >= start, Location.observed_at <= end
        )
        if beacon_ids is not None:
            stmt = stmt.where(Location.beacon_id.in_(beacon_ids))
        if bbox is not None:
            in_box = select(_rtree.c.id).where(
                _rtree.c.min_lat >= bbox.min_lat,
                _rtree.c.max_lat <= bbox.max_lat,
                _rtree.c.min_lon >= bbox.min_lon,
                _rtree.c.max_lon <= bbox.max_lon,
            )
            stmt = stmt.where(Location.id.in_(in_box))
        stmt = stmt.order_by(Location.beacon_id, Location.observed_at)
        if limit is not None:
            stmt = stmt.limit(limit)
        return (await self._session.scalars(stmt)).all()

    async def latest_by_beacon(self, beacon_ids: Sequence[int]) -> dict[int, Location]:
        if not beacon_ids:
            return {}
        newest = (
            select(Location.beacon_id, func.max(Location.observed_at).label("observed_at"))
            .where(Location.beacon_id.in_(beacon_ids))
            .group_by(Location.beacon_id)
            .subquery()
        )
        stmt = select(Location).join(
            newest,
            (Location.beacon_id == newest.c.beacon_id)
            & (Location.observed_at == newest.c.observed_at),
        )
        return {loc.beacon_id: loc for loc in await self._session.scalars(stmt)}

    async def count_by_beacon(self, beacon_ids: Sequence[int]) -> dict[int, int]:
        if not beacon_ids:
            return {}
        stmt = (
            select(Location.beacon_id, func.count())
            .where(Location.beacon_id.in_(beacon_ids))
            .group_by(Location.beacon_id)
        )
        return dict((await self._session.execute(stmt)).tuples().all())
