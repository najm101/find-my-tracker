from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from find_my_tracker.features.locations.denoise import Noise


class LocationPoint(BaseModel):
    beacon_id: int
    observed_at: datetime
    latitude: float
    longitude: float
    accuracy_m: int | None
    noise: Noise | None = Field(
        default=None,
        description="Why this report is probably not where the beacon was. Null for good reports.",
    )


class Stay(BaseModel):
    """A stretch where a beacon's good reports stayed in one place."""

    beacon_id: int
    arrived_at: datetime
    left_at: datetime
    latitude: float
    longitude: float
    point_count: int


class LocationsResponse(BaseModel):
    points: list[LocationPoint]
    stays: list[Stay] = []
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
