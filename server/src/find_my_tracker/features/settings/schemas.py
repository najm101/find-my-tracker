from __future__ import annotations

from pydantic import BaseModel, Field

MIN_POLL_MINUTES = 15
RECOMMENDED_POLL_MINUTES = 30


class AppSettings(BaseModel):
    """User-editable settings. Defaults apply until changed."""

    poll_interval_minutes: int = Field(
        default=RECOMMENDED_POLL_MINUTES,
        ge=MIN_POLL_MINUTES,
        le=24 * 60,
        description="Minutes between polls. Below 30 raises the risk of an Apple account ban.",
    )


class SettingsUpdate(BaseModel):
    poll_interval_minutes: int | None = Field(default=None, ge=MIN_POLL_MINUTES, le=24 * 60)
