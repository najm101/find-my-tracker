from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class LocationPoint(BaseModel):
    beacon_id: int
    observed_at: datetime
    latitude: float
    longitude: float
    accuracy_m: int | None


class LocationsResponse(BaseModel):
    points: list[LocationPoint]
    truncated: bool
    """True when more points matched than `limit`; narrow the range or the area."""


class Visit(BaseModel):
    beacon_id: int
    arrived_at: datetime
    left_at: datetime
    point_count: int
    closest_m: float


class VisitsResponse(BaseModel):
    visits: list[Visit]


class ExportFormat(StrEnum):
    CSV = "csv"
    GEOJSON = "geojson"
