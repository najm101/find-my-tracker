from __future__ import annotations

from sqlalchemy import Boolean, Index, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from find_my_tracker.core.database import Base


class AdminCredential(Base):
    """The single admin's password, second factor and session generation. Exactly one row."""

    __tablename__ = "admin_credential"

    id: Mapped[int] = mapped_column(primary_key=True)
    password_hash: Mapped[str] = mapped_column(Text)  # argon2id
    totp_secret_blob: Mapped[bytes | None] = mapped_column(LargeBinary)  # encrypted base32 secret
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Highest accepted TOTP step, so a code cannot be replayed inside its own window.
    totp_last_step: Mapped[int | None] = mapped_column(Integer)
    # Bumped to invalidate every issued session cookie at once ("log out everywhere").
    session_epoch: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[int] = mapped_column(Integer)


class RecoveryCode(Base):
    """One single-use code for when the authenticator app is gone.

    Stored as an HMAC keyed from SECRET_KEY, never in the clear: a stolen database alone does
    not hand over a way in.
    """

    __tablename__ = "recovery_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code_digest: Mapped[str] = mapped_column(String(64), unique=True)
    used_at: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[int] = mapped_column(Integer)


class LoginAttempt(Base):
    """Audit trail: every sign-in try, so an owner can spot one they did not make."""

    __tablename__ = "login_attempts"
    __table_args__ = (Index("ix_login_attempts_at", "at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[int] = mapped_column(Integer)
    client_ip: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    outcome: Mapped[str] = mapped_column(String(24))  # LoginOutcome
