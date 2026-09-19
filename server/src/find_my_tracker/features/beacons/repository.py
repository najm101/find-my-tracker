from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.features.beacons.models import Beacon


class BeaconRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list(self, *, enabled_only: bool = False) -> Sequence[Beacon]:
        stmt = select(Beacon).order_by(Beacon.id)
        if enabled_only:
            stmt = stmt.where(Beacon.enabled.is_(True))
        return (await self._session.scalars(stmt)).all()

    async def get(self, beacon_id: int) -> Beacon | None:
        return await self._session.get(Beacon, beacon_id)

    async def by_identifier(self) -> dict[str, Beacon]:
        return {b.apple_identifier: b for b in await self.list()}

    def add(self, beacon: Beacon) -> None:
        self._session.add(beacon)

    async def delete(self, beacon: Beacon) -> None:
        await self._session.delete(beacon)
