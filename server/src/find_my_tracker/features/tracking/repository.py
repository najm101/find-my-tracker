from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.features.tracking.models import PollRun


class PollRunRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def start(self, trigger: str, started_at: int) -> PollRun:
        run = PollRun(trigger=trigger, started_at=started_at)
        self._session.add(run)
        await self._session.flush()
        return run

    async def latest(self) -> PollRun | None:
        return await self._session.scalar(
            select(PollRun).order_by(PollRun.started_at.desc(), PollRun.id.desc()).limit(1)
        )

    async def recent(self, limit: int) -> Sequence[PollRun]:
        stmt = select(PollRun).order_by(PollRun.started_at.desc(), PollRun.id.desc()).limit(limit)
        return (await self._session.scalars(stmt)).all()
