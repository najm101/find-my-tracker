from __future__ import annotations

from fastapi import APIRouter, Query

from find_my_tracker.core.deps import ContainerDep, SessionDep
from find_my_tracker.features.apple_account.service import AppleAccountService
from find_my_tracker.features.auth.dependencies import AdminDep
from find_my_tracker.features.settings.service import SettingsService
from find_my_tracker.features.tracking.schemas import PollRunOut, TrackingStatus
from find_my_tracker.features.tracking.service import to_out

router = APIRouter(prefix="/tracking", tags=["tracking"])


async def _status(session: SessionDep, container: ContainerDep) -> TrackingStatus:
    account = await AppleAccountService(session, container.secrets, container.clock).status()
    settings = await SettingsService(session).get()
    poller = container.poller
    last = await poller.service.latest()
    return TrackingStatus(
        account_status=account.status,
        running=poller.running,
        interval_minutes=settings.poll_interval_minutes,
        last_run=to_out(last) if last else None,
        next_run_at=poller.next_run_at,
        refresh_available_at=await poller.refresh_available_at(),
    )


@router.get("/status")
async def status(_: AdminDep, session: SessionDep, container: ContainerDep) -> TrackingStatus:
    return await _status(session, container)


@router.post("/refresh")
async def refresh(_: AdminDep, session: SessionDep, container: ContainerDep) -> TrackingStatus:
    await container.poller.refresh()
    return await _status(session, container)


@router.get("/runs")
async def runs(
    _: AdminDep, container: ContainerDep, limit: int = Query(default=20, ge=1, le=200)
) -> list[PollRunOut]:
    return await container.poller.service.recent(limit)
