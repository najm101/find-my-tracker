"""Liveness endpoint for the Docker healthcheck.

Unauthenticated, so it says as little as possible: the version goes only to a signed-in
admin, because an exact version tells a stranger which advisories to try.
"""

from __future__ import annotations

from importlib.metadata import version

from fastapi import APIRouter, Request

from find_my_tracker.core.deps import ContainerDep
from find_my_tracker.features.auth.service import SESSION_COOKIE
from find_my_tracker.features.health.schemas import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health(request: Request, container: ContainerDep) -> HealthResponse:
    signed_in = container.auth.verify_session(request.cookies.get(SESSION_COOKIE))
    return HealthResponse(version=version("find-my-tracker") if signed_in else None)
