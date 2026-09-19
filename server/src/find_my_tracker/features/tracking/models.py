from __future__ import annotations

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from find_my_tracker.core.database import Base


class PollRun(Base):
    __tablename__ = "poll_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    trigger: Mapped[str] = mapped_column(String(20))  # schedule | manual
    started_at: Mapped[int] = mapped_column(Integer)
    finished_at: Mapped[int | None] = mapped_column(Integer)
    outcome: Mapped[str | None] = mapped_column(String(20))  # PollOutcome
    beacons_polled: Mapped[int] = mapped_column(Integer, default=0)
    reports_seen: Mapped[int] = mapped_column(Integer, default=0)
    new_locations: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
