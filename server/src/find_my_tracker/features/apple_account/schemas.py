from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

from find_my_tracker.features.apple_account.wizard import WizardStep
from find_my_tracker.integrations.apple.types import BeaconKind


class AccountStatus(StrEnum):
    NONE = "none"
    ACTIVE = "active"
    NEEDS_REAUTH = "needs_reauth"


class AccountOut(BaseModel):
    status: AccountStatus
    apple_id: str | None = None
    display_name: str | None = None
    last_error: str | None = None
    connected_at: datetime | None = None
    device_serial: str | None = Field(
        default=None,
        description="How this server appears in the Apple account's device list (as a Mac).",
    )


# ---- wizard ----


class MethodOut(BaseModel):
    id: int
    kind: str
    label: str


class DeviceOut(BaseModel):
    id: str
    name: str
    model: str | None
    serial: str | None
    added_at: datetime | None


class CandidateOut(BaseModel):
    identifier: str
    name: str
    model: str | None
    kind: BeaconKind
    paired_at: datetime | None
    personal_device: bool = Field(
        description="An iPhone/iPad/Mac/Watch: tracking it tracks its owner. Unticked by default."
    )
    already_tracked: bool


class WizardView(BaseModel):
    step: WizardStep
    mode: Literal["sign_in", "add"] = Field(
        default="sign_in",
        description="`add`: resumed from the saved session, so no Apple ID or 2FA steps.",
    )
    apple_id: str | None = None
    methods: list[MethodOut] = []
    chosen_method_id: int | None = None
    devices: list[DeviceOut] = []
    passcode_attempts_left: int | None = None
    beacons: list[CandidateOut] = []
    imported_count: int | None = None


class StartRequest(BaseModel):
    apple_id: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1)


class MethodRequest(BaseModel):
    method_id: int


class CodeRequest(BaseModel):
    code: str = Field(min_length=4, max_length=10)


class UnlockRequest(BaseModel):
    device_id: str
    passcode: str = Field(min_length=1)


class ImportRequest(BaseModel):
    identifiers: list[str] = Field(min_length=1)
    poll_interval_minutes: int | None = Field(default=None, ge=15, le=24 * 60)
