"""Time source, injectable so tests don't sleep or depend on the wall clock."""

from __future__ import annotations

from datetime import UTC, datetime


class Clock:
    def now(self) -> datetime:
        return datetime.now(UTC)

    def timestamp(self) -> int:
        return int(self.now().timestamp())


def to_datetime(epoch: int | None) -> datetime | None:
    return datetime.fromtimestamp(epoch, UTC) if epoch is not None else None
