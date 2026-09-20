from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from find_my_tracker.core.config import MIN_PASSWORD_LENGTH


class LoginOutcome(StrEnum):
    SUCCESS = "success"
    WRONG_PASSWORD = "wrong_password"  # noqa: S105 - an audit outcome, not a credential
    WRONG_CODE = "wrong_code"
    RECOVERY_USED = "recovery_used"
    RATE_LIMITED = "rate_limited"


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    mfa_required: bool = Field(description="Post the authenticator code to /auth/mfa to finish.")


class MfaRequest(BaseModel):
    code: str = Field(description="A six-digit authenticator code, or one recovery code.")


class MeResponse(BaseModel):
    authenticated: bool


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH)


class PasswordConfirm(BaseModel):
    """Re-entering the password guards changes to the second factor."""

    password: str


class TotpSetup(BaseModel):
    secret: str = Field(description="Type this into the app if the QR code cannot be scanned.")
    uri: str
    qr_data_uri: str = Field(description="The same URI as an SVG QR code, for an <img src>.")


class RecoveryCodes(BaseModel):
    codes: list[str] = Field(description="Shown once. They cannot be retrieved again.")


class LoginAttemptOut(BaseModel):
    at: datetime
    client_ip: str
    user_agent: str | None
    outcome: LoginOutcome


class SecurityStatus(BaseModel):
    totp_enabled: bool
    recovery_codes_remaining: int
    password_changed_at: datetime
    recent_attempts: list[LoginAttemptOut]
