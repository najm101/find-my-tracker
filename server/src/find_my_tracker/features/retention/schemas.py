from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

#: Well clear of the week of reports Apple hands back with every check: nothing deleted can be
#: fetched again.
MIN_RETENTION_DAYS = 30
MAX_RETENTION_DAYS = 3650


class RetentionRun(BaseModel):
    at: datetime
    cutoff: datetime
    deleted: int


class RetentionStatus(BaseModel):
    days: int | None = Field(description="Sightings older than this are deleted. Null: kept.")
    cutoff: datetime | None = Field(description="Sightings before this go, when `days` is set.")
    oldest: datetime | None = Field(description="The oldest sighting stored.")
    last_run: RetentionRun | None
    running: bool


class RetentionPreview(BaseModel):
    days: int
    cutoff: datetime
    sightings: int = Field(
        description="Sightings that would be deleted now. Each item's newest one is always kept."
    )
    items: int = Field(description="How many items those sightings belong to.")


class RetentionUpdate(BaseModel):
    days: int | None = Field(ge=MIN_RETENTION_DAYS, le=MAX_RETENTION_DAYS)
