from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from find_my_tracker.core.database import Base


class Beacon(Base):
    """Anything locatable on the Find My network: AirTag, iPhone, AirPods, third-party tag..."""

    __tablename__ = "beacons"

    id: Mapped[int] = mapped_column(primary_key=True)
    apple_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("apple_account.id", ondelete="SET NULL")
    )
    apple_identifier: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str | None] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))  # BeaconKind
    model: Mapped[str | None] = mapped_column(String(100))
    emoji: Mapped[str | None] = mapped_column(String(16))
    color: Mapped[str | None] = mapped_column(String(16))
    key_blob: Mapped[bytes] = mapped_column(LargeBinary)  # encrypted FindMyAccessory JSON
    paired_at: Mapped[int | None] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[int] = mapped_column(Integer)
