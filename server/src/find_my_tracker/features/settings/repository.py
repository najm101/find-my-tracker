from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.features.settings.models import SettingRow


class SettingsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def all(self) -> dict[str, Any]:
        rows = await self._session.scalars(select(SettingRow))
        return {row.key: json.loads(row.value) for row in rows}

    async def put(self, values: dict[str, Any]) -> None:
        for key, value in values.items():
            stmt = insert(SettingRow).values(key=key, value=json.dumps(value))
            await self._session.execute(
                stmt.on_conflict_do_update(
                    index_elements=["key"], set_={"value": stmt.excluded.value}
                )
            )
