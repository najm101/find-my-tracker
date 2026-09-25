from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import delete, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.core.database import insert_for
from find_my_tracker.features.routing.models import RouteCache


class RouteCacheRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_many(self, keys: Sequence[tuple[int, int]]) -> dict[tuple[int, int], RouteCache]:
        if not keys:
            return {}
        rows = await self._session.scalars(
            select(RouteCache).where(tuple_(RouteCache.beacon_id, RouteCache.trip_start).in_(keys))
        )
        return {(r.beacon_id, r.trip_start): r for r in rows}

    async def put(self, beacon_id: int, trip_start: int, digest: str, body: str, now: int) -> None:
        stmt = insert_for(self._session, RouteCache).values(
            beacon_id=beacon_id, trip_start=trip_start, digest=digest, body=body, created_at=now
        )
        await self._session.execute(
            stmt.on_conflict_do_update(
                index_elements=["beacon_id", "trip_start"],
                set_={
                    "digest": stmt.excluded.digest,
                    "body": stmt.excluded.body,
                    "created_at": stmt.excluded.created_at,
                },
            )
        )

    async def delete_before(self, trip_start: int) -> None:
        await self._session.execute(delete(RouteCache).where(RouteCache.trip_start < trip_start))

    async def clear(self) -> None:
        await self._session.execute(delete(RouteCache))
