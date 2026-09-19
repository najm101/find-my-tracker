from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel

from find_my_tracker.features.apple_account.schemas import AccountStatus


class PollTrigger(StrEnum):
    SCHEDULE = "schedule"
    MANUAL = "manual"


class PollOutcome(StrEnum):
    OK = "ok"
    AUTH_FAILED = "auth_failed"  # session expired: polling pauses until the user signs in again
    APPLE_ERROR = "apple_error"  # Apple refused or was unavailable: retried next time
    ERROR = "error"  # our bug or an unexpected failure


class PollRunOut(BaseModel):
    id: int
    trigger: PollTrigger
    started_at: datetime
    finished_at: datetime | None
    outcome: PollOutcome | None
    beacons_polled: int
    reports_seen: int
    new_locations: int
    error: str | None


class TrackingStatus(BaseModel):
    account_status: AccountStatus
    running: bool
    interval_minutes: int
    last_run: PollRunOut | None
    next_run_at: datetime | None
    refresh_available_at: datetime | None
