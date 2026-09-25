from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from find_my_tracker.core.deps import ContainerDep, SessionDep
from find_my_tracker.features.auth.dependencies import AdminDep
from find_my_tracker.features.retention.schemas import (
    MAX_RETENTION_DAYS,
    MIN_RETENTION_DAYS,
    RetentionPreview,
    RetentionStatus,
    RetentionUpdate,
)
from find_my_tracker.features.retention.service import RetentionService

router = APIRouter(prefix="/retention", tags=["retention"])


@router.get("")
async def get_status(_: AdminDep, session: SessionDep, container: ContainerDep) -> RetentionStatus:
    return await RetentionService(session, container).status()


@router.get("/preview")
async def preview(
    _: AdminDep,
    session: SessionDep,
    container: ContainerDep,
    days: Annotated[int, Query(ge=MIN_RETENTION_DAYS, le=MAX_RETENTION_DAYS)],
) -> RetentionPreview:
    """What keeping `days` would delete right now."""
    return await RetentionService(session, container).preview(days)


@router.put("")
async def update(
    body: RetentionUpdate, _: AdminDep, session: SessionDep, container: ContainerDep
) -> RetentionStatus:
    """Keep history for `days`, or for good (null). A shorter period deletes the rest soon after."""
    return await RetentionService(session, container).set_days(body.days)
