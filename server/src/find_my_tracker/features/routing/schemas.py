from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from find_my_tracker.features.routing.matching import Costing, Fallback
from find_my_tracker.integrations.valhalla.builtin import Phase, RegionStatus


class RoutingMode(StrEnum):
    OFF = "off"
    BUILTIN = "builtin"
    EXTERNAL = "external"


class RegionOut(BaseModel):
    id: str
    name: str
    status: RegionStatus
    auto: bool = Field(description="Added automatically, because history was there.")
    size_bytes: int | None
    error: str | None
    in_use: bool = Field(description="Part of the road data being served.")
    progress: float | None = Field(description="0..1 while downloading.")


class BuiltinOut(BaseModel):
    phase: Phase
    detail: str | None = Field(description="What it is doing, for people.")
    progress: float | None
    serving: bool
    built_at: datetime | None
    regions: list[RegionOut]
    disk_bytes: int
    error: str | None
    auto_download: bool


class ExternalOut(BaseModel):
    url: str
    reachable: bool
    version: str | None
    error: str | None


class RegionSuggestion(BaseModel):
    """A map region history needs but the built-in engine does not have."""

    id: str
    name: str
    beacons: list[str]


class RoutingStatus(BaseModel):
    mode: RoutingMode
    configured_by_env: bool = Field(
        description="ROUTING_URL is set: the server's operator chose it, Settings cannot change it."
    )
    ready: bool = Field(description="Road routes can be shown right now.")
    message: str | None = Field(description="What is missing, when not ready. For people.")
    builtin: BuiltinOut | None
    external: ExternalOut | None
    missing_regions: list[RegionSuggestion]
    catalog_available: bool


class RoutingUpdate(BaseModel):
    mode: RoutingMode
    url: str | None = Field(default=None, max_length=500)


class AutoDownloadUpdate(BaseModel):
    enabled: bool


class RegionAdd(BaseModel):
    id: str = Field(max_length=100)


class CatalogRegion(BaseModel):
    id: str
    name: str
    parent: str | None = Field(description="The name of the region it is part of.")


class RoutedReport(BaseModel):
    observed_at: datetime
    latitude: float
    longitude: float
    offset_m: float = Field(description="Metres along the trip's route.")
    off_route: bool = Field(
        description=(
            "Not on the likely route: probably a finder on a nearby road. Its position here is "
            "where the route was at that time."
        )
    )


class TripRoute(BaseModel):
    beacon_id: int
    costing: Costing
    geometry: list[tuple[float, float]] = Field(description="[longitude, latitude] pairs.")
    reports: list[RoutedReport]
    broken_after: list[int] = Field(
        description="Indices into `reports`: the way from that report to the next is not known."
    )
    fallback: Fallback | None = Field(
        description="Why there is no road route; draw the trip as reported instead."
    )


class RoutesState(StrEnum):
    OK = "ok"
    OFF = "off"
    UNAVAILABLE = "unavailable"


class RoutesResponse(BaseModel):
    state: RoutesState
    message: str | None
    trips: list[TripRoute]
    pending: int = Field(description="Trips still being matched; ask again shortly.")
