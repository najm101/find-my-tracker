from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.features.apple_account.models import AppleAccount


class AppleAccountRepository:
    """v1 stores a single account; `get` returns it."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self) -> AppleAccount | None:
        return await self._session.scalar(select(AppleAccount).order_by(AppleAccount.id).limit(1))

    def add(self, account: AppleAccount) -> None:
        self._session.add(account)

    async def flush(self) -> None:
        await self._session.flush()

    async def delete_all(self) -> None:
        await self._session.execute(delete(AppleAccount))
