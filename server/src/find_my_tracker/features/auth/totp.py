"""Authenticator-app codes and recovery codes. Pure functions: no database, no clock of its own.

TOTP here is the standard RFC 6238 flavour every authenticator app speaks (SHA-1, 6 digits,
30-second steps), so Google Authenticator, the iOS Passwords app, 1Password and Bitwarden all
work without configuration.
"""

from __future__ import annotations

import base64
import hmac
import io
import re
import secrets

import pyotp
import qrcode
from qrcode.image.svg import SvgPathImage

DIGITS = 6
STEP_SECONDS = 30
#: How many steps either side of now to accept, for clock drift between server and phone.
DRIFT_STEPS = 1

ISSUER = "Find My Tracker"

RECOVERY_CODE_COUNT = 10
_RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no look-alikes: i/l/1, o/0
_RECOVERY_GROUPS = 3
_RECOVERY_GROUP_LEN = 5


def new_secret() -> str:
    """A fresh base32 TOTP secret (160 bits, the RFC 4226 recommendation)."""
    return pyotp.random_base32(length=32)


def provisioning_uri(secret: str, *, account: str) -> str:
    """The `otpauth://` URI an authenticator app reads from the QR code."""
    return pyotp.TOTP(secret, digits=DIGITS, interval=STEP_SECONDS).provisioning_uri(
        name=account, issuer_name=ISSUER
    )


def qr_data_uri(uri: str) -> str:
    """The provisioning URI as an SVG data URI, ready for an `<img src>`.

    SVG keeps it sharp at any size and needs no image library.
    """
    image = qrcode.make(uri, image_factory=SvgPathImage, box_size=10, border=2)
    buffer = io.BytesIO()
    image.save(buffer)
    encoded = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/svg+xml;base64,{encoded}"


def current_step(now: int) -> int:
    return now // STEP_SECONDS


def verify_code(secret: str, code: str, *, now: int, last_step: int | None) -> int | None:
    """The time step this code belongs to, or None when it is wrong or already spent.

    Returning the step lets the caller store it, so the same code cannot be replayed while it
    is still inside its drift window.
    """
    digits = re.sub(r"\D", "", code)
    if len(digits) != DIGITS:
        return None
    totp = pyotp.TOTP(secret, digits=DIGITS, interval=STEP_SECONDS)
    now_step = current_step(now)
    for step in range(now_step - DRIFT_STEPS, now_step + DRIFT_STEPS + 1):
        if last_step is not None and step <= last_step:
            continue  # already used: never accept a code twice
        if hmac.compare_digest(totp.at(step * STEP_SECONDS), digits):
            return step
    return None


def new_recovery_codes(count: int = RECOVERY_CODE_COUNT) -> list[str]:
    """Single-use codes shown once, for when the authenticator app is gone."""
    return [_one_recovery_code() for _ in range(count)]


def _one_recovery_code() -> str:
    groups = [
        "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(_RECOVERY_GROUP_LEN))
        for _ in range(_RECOVERY_GROUPS)
    ]
    return "-".join(groups)


def normalize_recovery_code(code: str) -> str:
    """Compare codes without punishing case, spaces or missing dashes."""
    return re.sub(r"[^a-z0-9]", "", code.strip().lower())
