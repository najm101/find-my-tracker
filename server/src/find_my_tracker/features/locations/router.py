from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import Response

from find_my_tracker.core.deps import ContainerDep, SessionDep
from find_my_tracker.core.errors import DomainError
from find_my_tracker.features.auth.dependencies import AdminDep
from find_my_tracker.features.beacons.service import BeaconService
from find_my_tracker.features.locations.geo import BBox
from find_my_tracker.features.locations.schemas import (
    ExportFormat,
    LocationsResponse,
    VisitsResponse,
)
from find_my_tracker.features.locations.service import (
    LocationService,
    TimeRange,
    to_csv,
    to_geojson,
)

router = APIRouter(prefix="/locations", tags=["locations"])

MAX_POINTS = 50_000
DEFAULT_SPAN = timedelta(hours=24)

BeaconIds = Annotated[
    list[int] | None, Query(description="Only these beacons. Omit for all beacons.")
]
From = Annotated[datetime | None, Query(alias="from", description="Default: 24 h before `to`.")]
To = Annotated[datetime | None, Query(alias="to", description="Default: now.")]
BBoxParam = Annotated[
    str | None, Query(description="min_lon,min_lat,max_lon,max_lat", examples=["4.8,52.3,5.0,52.4"])
]


def _span(container: ContainerDep, start: datetime | None, end: datetime | None) -> TimeRange:
    end = end or container.clock.now()
    start = start or end - DEFAULT_SPAN
    if start > end:
        msg = "`from` must be before `to`."
        raise DomainError(msg, code="invalid_range")
    return TimeRange.of(start, end)


def _bbox(value: str | None) -> BBox | None:
    if value is None:
        return None
    try:
        return BBox.parse(value)
    except ValueError as e:
        raise DomainError(str(e), code="invalid_bbox") from e


@router.get("")
async def history(
    _: AdminDep,
    session: SessionDep,
    container: ContainerDep,
    beacon_id: BeaconIds = None,
    start: From = None,
    end: To = None,
    bbox: BBoxParam = None,
    limit: Annotated[int, Query(ge=1, le=MAX_POINTS)] = 20_000,
) -> LocationsResponse:
    """Location history for all beacons (or `beacon_id`s), ordered by beacon then time."""
    return await LocationService(session).history(
        _span(container, start, end), beacon_ids=beacon_id, bbox=_bbox(bbox), limit=limit
    )


@router.get("/visits")
async def visits(
    _: AdminDep,
    session: SessionDep,
    container: ContainerDep,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
    radius_m: Annotated[float, Query(gt=0, le=50_000)] = 200,
    beacon_id: BeaconIds = None,
    start: From = None,
    end: To = None,
) -> VisitsResponse:
    """When each beacon was near (lat, lon): consecutive sightings grouped into visits."""
    return await LocationService(session).visits(
        _span(container, start, end),
        latitude=lat,
        longitude=lon,
        radius_m=radius_m,
        beacon_ids=beacon_id,
    )


@router.get("/export", response_class=Response)
async def export(
    _: AdminDep,
    session: SessionDep,
    container: ContainerDep,
    format: ExportFormat = ExportFormat.CSV,  # noqa: A002 - public query param name
    beacon_id: BeaconIds = None,
    start: From = None,
    end: To = None,
    bbox: BBoxParam = None,
) -> Response:
    span = _span(container, start, end)
    rows = await LocationService(session).rows_for_export(
        span, beacon_ids=beacon_id, bbox=_bbox(bbox)
    )
    names = await BeaconService(session, container.secrets, container.clock).names()
    day = container.clock.now().strftime("%Y-%m-%d")
    if format is ExportFormat.GEOJSON:
        body, media, ext = to_geojson(rows, names), "application/geo+json", "geojson"
    else:
        body, media, ext = to_csv(rows, names), "text/csv", "csv"
    return Response(
        body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="find-my-tracker-{day}.{ext}"'},
    )
