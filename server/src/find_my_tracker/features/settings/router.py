from __future__ import annotations

from fastapi import APIRouter

from find_my_tracker.core.deps import ContainerDep, SessionDep
from find_my_tracker.features.auth.dependencies import AdminDep
from find_my_tracker.features.settings.schemas import AppSettings, SettingsUpdate
from find_my_tracker.features.settings.service import SettingsService

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
async def get_settings(_: AdminDep, session: SessionDep) -> AppSettings:
    return await SettingsService(session).get()


@router.patch("")
async def update_settings(
    body: SettingsUpdate, _: AdminDep, session: SessionDep, container: ContainerDep
) -> AppSettings:
    updated = await SettingsService(session).update(body)
    container.poller.reschedule()  # a new interval takes effect now, not after the old one
    return updated
