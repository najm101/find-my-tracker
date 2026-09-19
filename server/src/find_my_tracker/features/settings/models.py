from __future__ import annotations

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from find_my_tracker.core.database import Base


class SettingRow(Base):
    """Key/value store; values are JSON, validated by `AppSettings`."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
