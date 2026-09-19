"""Liveness endpoint for the Docker healthcheck. Unauthenticated, reveals nothing."""

from __future__ import annotations

from importlib.metadata import version

from fastapi import APIRouter

from find_my_tracker.features.health.schemas import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health() -> HealthResponse:
    return HealthResponse(version=version("find-my-tracker"))
