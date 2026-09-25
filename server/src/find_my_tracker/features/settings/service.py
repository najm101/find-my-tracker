from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.core.errors import NotFound
from find_my_tracker.features.settings.repository import SettingsRepository
from find_my_tracker.features.settings.schemas import (
    MAX_POLL_MINUTES,
    MIN_POLL_MINUTES,
    AppSettings,
    SettingsUpdate,
)


class SettingsService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repo = SettingsRepository(session)

    async def get(self) -> AppSettings:
        stored = await self._repo.all()
        known = {k: v for k, v in stored.items() if k in AppSettings.model_fields}
        if isinstance(interval := known.get("poll_interval_minutes"), int):
            # Earlier versions allowed checks every 15 minutes.
            known["poll_interval_minutes"] = min(max(interval, MIN_POLL_MINUTES), MAX_POLL_MINUTES)
        return AppSettings.model_validate(known)

    async def value(self, key: str, default: Any = None) -> Any:
        """A value kept by another feature under its own key (not part of `AppSettings`)."""
        return (await self._repo.all()).get(key, default)

    async def put_values(self, values: dict[str, Any]) -> None:
        """Stores another feature's values. Does not commit."""
        await self._repo.put(values)

    async def require_api_docs(self) -> None:
        if not (await self.get()).api_docs:
            msg = "The API documentation is off. Turn it on in Settings → API."
            raise NotFound(msg, code="api_docs_off")

    async def update(self, patch: SettingsUpdate) -> AppSettings:
        changes = patch.model_dump(exclude_none=True)
        merged = AppSettings.model_validate({**(await self.get()).model_dump(), **changes})
        await self._repo.put(changes)
        await self._session.commit()
        return merged
