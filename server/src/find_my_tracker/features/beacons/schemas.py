from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from find_my_tracker.integrations.apple.types import BeaconKind


class Battery(StrEnum):
    FULL = "full"
    MEDIUM = "medium"
    LOW = "low"
    VERY_LOW = "very_low"

    @classmethod
    def from_status(cls, status: int | None) -> Battery | None:
        """Bits 6-7 of the report status byte. Only meaningful for AirTag-like beacons."""
        if status is None:
            return None
        return (cls.FULL, cls.MEDIUM, cls.LOW, cls.VERY_LOW)[(status >> 6) & 0b11]


class LatestLocation(BaseModel):
    observed_at: datetime
    latitude: float
    longitude: float
    accuracy_m: int | None


class BeaconOut(BaseModel):
    id: int
    name: str = Field(description="Display name: the user's override, else Apple's name.")
    apple_name: str
    kind: BeaconKind
    model: str | None
    emoji: str | None
    color: str | None
    enabled: bool
    vehicle: bool = Field(description="Lives in a vehicle: predicted routes treat it as a car.")
    paired_at: datetime | None
    location_count: int
    latest: LatestLocation | None
    battery: Battery | None


class BeaconUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=200)
    emoji: str | None = Field(default=None, max_length=16)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    enabled: bool | None = None
    vehicle: bool | None = None
