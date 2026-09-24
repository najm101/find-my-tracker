from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from find_my_tracker.core.database import Base


class RouteCache(Base):
    """A trip's road route, kept until its reports, the road data or the matching change."""

    __tablename__ = "route_cache"
    __table_args__ = (UniqueConstraint("beacon_id", "trip_start"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    beacon_id: Mapped[int] = mapped_column(ForeignKey("beacons.id", ondelete="CASCADE"))
    trip_start: Mapped[int] = mapped_column(Integer)
    #: Hash of the trip's reports, the engine and its road data, and the algorithm version.
    digest: Mapped[str] = mapped_column(String(64))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[int] = mapped_column(Integer)
