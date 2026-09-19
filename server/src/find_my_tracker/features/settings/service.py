from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.features.settings.repository import SettingsRepository
from find_my_tracker.features.settings.schemas import AppSettings, SettingsUpdate


class SettingsService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = SettingsRepository(session)

    async def get(self) -> AppSettings:
        stored = await self._repo.all()
        known = {k: v for k, v in stored.items() if k in AppSettings.model_fields}
        return AppSettings.model_validate(known)

    async def update(self, patch: SettingsUpdate) -> AppSettings:
        changes = patch.model_dump(exclude_none=True)
        merged = AppSettings.model_validate({**(await self.get()).model_dump(), **changes})
        await self._repo.put(changes)
        await self._session.commit()
        return merged
