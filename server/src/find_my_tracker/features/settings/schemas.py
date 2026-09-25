from __future__ import annotations

from pydantic import BaseModel, Field

#: Checking more often than this raises the risk of Apple locking the account.
MIN_POLL_MINUTES = 30
RECOMMENDED_POLL_MINUTES = 30
#: Apple keeps about a week of reports, and every check collects all of them: checks further
#: apart would lose history.
MAX_POLL_MINUTES = 7 * 24 * 60


class AppSettings(BaseModel):
    """User-editable settings. Defaults apply until changed."""

    poll_interval_minutes: int = Field(
        default=RECOMMENDED_POLL_MINUTES,
        ge=MIN_POLL_MINUTES,
        le=MAX_POLL_MINUTES,
        description="Minutes between checks: 30 minutes to 7 days.",
    )
    api_docs: bool = Field(
        default=False,
        description="Serve the API documentation at /api/docs, to the signed-in admin only.",
    )


class SettingsUpdate(BaseModel):
    poll_interval_minutes: int | None = Field(
        default=None, ge=MIN_POLL_MINUTES, le=MAX_POLL_MINUTES
    )
    api_docs: bool | None = None
