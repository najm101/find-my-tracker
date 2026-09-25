from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Query

from find_my_tracker.core.deps import ContainerDep, SessionDep
from find_my_tracker.core.errors import DomainError
from find_my_tracker.features.auth.dependencies import AdminDep
from find_my_tracker.features.locations.service import TimeRange
from find_my_tracker.features.routing.schemas import (
    AutoDownloadUpdate,
    CatalogRegion,
    RegionAdd,
    RoutesResponse,
    RoutingStatus,
    RoutingUpdate,
)
from find_my_tracker.features.routing.service import RoutingService

router = APIRouter(prefix="/routing", tags=["routing"])

DEFAULT_SPAN_HOURS = 24


@router.get("")
async def get_status(_: AdminDep, session: SessionDep, container: ContainerDep) -> RoutingStatus:
    return await RoutingService(session, container).status()


@router.put("")
async def update(
    body: RoutingUpdate, _: AdminDep, session: SessionDep, container: ContainerDep
) -> RoutingStatus:
    """Turn predicted routes off, use the built-in engine, or connect to a Valhalla server."""
    return await RoutingService(session, container).update(body)


@router.put("/auto-download")
async def auto_download(
    body: AutoDownloadUpdate, _: AdminDep, session: SessionDep, container: ContainerDep
) -> RoutingStatus:
    return await RoutingService(session, container).set_auto_download(body.enabled)


@router.get("/regions/catalog")
async def catalog(_: AdminDep, session: SessionDep, container: ContainerDep) -> list[CatalogRegion]:
    """Every map region Geofabrik offers."""
    return await RoutingService(session, container).catalog()


@router.post("/regions")
async def add_region(
    body: RegionAdd, _: AdminDep, session: SessionDep, container: ContainerDep
) -> RoutingStatus:
    return await RoutingService(session, container).add_region(body.id)


@router.delete("/regions/{region_id}")
async def remove_region(
    region_id: str, _: AdminDep, session: SessionDep, container: ContainerDep
) -> RoutingStatus:
    return await RoutingService(session, container).remove_region(region_id)


@router.post("/regions/refresh")
async def refresh_regions(
    _: AdminDep, session: SessionDep, container: ContainerDep
) -> RoutingStatus:
    """Download every region again (Geofabrik updates them daily) and rebuild the road data."""
    return await RoutingService(session, container).refresh_regions()


@router.delete("/data")
async def delete_map_data(
    _: AdminDep, session: SessionDep, container: ContainerDep
) -> RoutingStatus:
    """Delete every downloaded region and all road data of the built-in engine."""
    return await RoutingService(session, container).delete_map_data()


@router.get("/routes")
async def routes(
    _: AdminDep,
    session: SessionDep,
    container: ContainerDep,
    beacon_id: Annotated[list[int] | None, Query(description="Omit for all beacons.")] = None,
    start: Annotated[datetime | None, Query(alias="from")] = None,
    end: Annotated[datetime | None, Query(alias="to")] = None,
) -> RoutesResponse:
    """
    History's predicted routes, trip by trip. Trips not matched yet are matched in the background:
    `progress` says how far along that is, and where to ask for the rest.
    """
    end = end or container.clock.now()
    start = start or end - timedelta(hours=DEFAULT_SPAN_HOURS)
    if start > end:
        raise DomainError("`from` must be before `to`.", code="invalid_range")
    return await RoutingService(session, container).routes(TimeRange.of(start, end), beacon_id)


@router.get("/routes/jobs/{job_id}")
async def job_routes(
    job_id: str,
    _: AdminDep,
    session: SessionDep,
    container: ContainerDep,
    after: Annotated[int, Query(ge=0, description="How many of its trips were received.")] = 0,
) -> RoutesResponse:
    """A job's trips matched since the first `after`. Gone (404) once nobody asked for a while."""
    return RoutingService(session, container).job_routes(job_id, after)
