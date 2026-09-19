from __future__ import annotations

from sqlalchemy import Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from find_my_tracker.core.database import Base


class AppleAccount(Base):
    """The signed-in Apple account. v1 keeps exactly one row."""

    __tablename__ = "apple_account"

    id: Mapped[int] = mapped_column(primary_key=True)
    apple_id: Mapped[str] = mapped_column(String(320))
    display_name: Mapped[str | None] = mapped_column(String(200))
    session_blob: Mapped[bytes] = mapped_column(LargeBinary)  # encrypted FindMy account state
    # Encrypted iCloud Keychain keys from the last unlock: lets "add items" skip the passcode.
    keychain_blob: Mapped[bytes | None] = mapped_column(LargeBinary)
    status: Mapped[str] = mapped_column(String(20))  # AccountStatus
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[int] = mapped_column(Integer)


class InstallationValue(Base):
    """Encrypted per-installation values. Unlike `apple_account`, never deleted on sign-out."""

    __tablename__ = "installation"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[bytes] = mapped_column(LargeBinary)
