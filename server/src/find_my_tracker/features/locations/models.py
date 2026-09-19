from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from find_my_tracker.core.database import Base


class Location(Base):
    """One decrypted location report. Apple returns ~7 days per poll; dedup on (beacon, time)."""

    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("beacon_id", "observed_at"),
        Index("ix_locations_beacon_time", "beacon_id", "observed_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    beacon_id: Mapped[int] = mapped_column(ForeignKey("beacons.id", ondelete="CASCADE"))
    observed_at: Mapped[int] = mapped_column(Integer)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    accuracy_m: Mapped[int | None] = mapped_column(Integer)
    confidence: Mapped[int | None] = mapped_column(Integer)
    status_byte: Mapped[int | None] = mapped_column(Integer)
    fetched_at: Mapped[int] = mapped_column(Integer)
    poll_run_id: Mapped[int | None] = mapped_column(ForeignKey("poll_runs.id", ondelete="SET NULL"))
