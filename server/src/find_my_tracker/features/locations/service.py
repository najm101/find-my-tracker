from __future__ import annotations

import csv
import io
import json
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from itertools import groupby

from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.core.clock import to_datetime
from find_my_tracker.features.locations import denoise
from find_my_tracker.features.locations.geo import BBox, haversine_m
from find_my_tracker.features.locations.models import Location
from find_my_tracker.features.locations.repository import LocationRepository
from find_my_tracker.features.locations.schemas import (
    LocationPoint,
    LocationsResponse,
    Stay,
    Visit,
    VisitsResponse,
)
from find_my_tracker.integrations.apple.types import Report

# Two sightings near a place further apart than this are separate visits.
VISIT_GAP_SECONDS = 2 * 60 * 60


@dataclass(frozen=True)
class TimeRange:
    start: int
    end: int

    @classmethod
    def of(cls, start: datetime, end: datetime) -> TimeRange:
        return cls(int(start.timestamp()), int(end.timestamp()))


class LocationService:
    def __init__(self, session: AsyncSession) -> None:
        self._repo = LocationRepository(session)

    # ---- writes (poller) ----

    async def record(
        self, beacon_id: int, reports: Sequence[Report], *, poll_run_id: int, fetched_at: int
    ) -> int:
        rows = [
            {
                "beacon_id": beacon_id,
                "observed_at": int(r.observed_at.timestamp()),
                "latitude": r.latitude,
                "longitude": r.longitude,
                "accuracy_m": r.accuracy_m,
                "confidence": r.confidence,
                "status_byte": r.status,
                "fetched_at": fetched_at,
                "poll_run_id": poll_run_id,
            }
            for r in reports
        ]
        return await self._repo.insert_new(rows)

    # ---- reads ----

    async def latest_by_beacon(self, beacon_ids: Sequence[int]) -> dict[int, Location]:
        return await self._repo.latest_by_beacon(beacon_ids)

    async def count_by_beacon(self, beacon_ids: Sequence[int]) -> dict[int, int]:
        return await self._repo.count_by_beacon(beacon_ids)

    async def history(
        self,
        span: TimeRange,
        *,
        beacon_ids: Sequence[int] | None,
        bbox: BBox | None,
        limit: int,
    ) -> LocationsResponse:
        rows = await self._repo.query(
            beacon_ids=beacon_ids, start=span.start, end=span.end, bbox=bbox, limit=limit + 1
        )
        points, stays = judge(rows[:limit])
        return LocationsResponse(points=points, stays=stays, truncated=len(rows) > limit)

    async def visits(
        self,
        span: TimeRange,
        *,
        latitude: float,
        longitude: float,
        radius_m: float,
        beacon_ids: Sequence[int] | None,
    ) -> VisitsResponse:
        rows = await self._repo.query(
            beacon_ids=beacon_ids,
            start=span.start,
            end=span.end,
            bbox=BBox.around(latitude, longitude, radius_m),
        )
        near = [
            (r, d)
            for r in rows
            if (d := haversine_m(latitude, longitude, r.latitude, r.longitude)) <= radius_m
        ]
        visits = group_visits(near)
        visits.sort(key=lambda v: v.arrived_at, reverse=True)
        return VisitsResponse(visits=visits)

    async def rows_for_export(
        self, span: TimeRange, *, beacon_ids: Sequence[int] | None, bbox: BBox | None
    ) -> Sequence[Location]:
        return await self._repo.query(
            beacon_ids=beacon_ids, start=span.start, end=span.end, bbox=bbox
        )


def group_visits(near: Iterable[tuple[Location, float]]) -> list[Visit]:
    """Group sightings (ordered by beacon, then time) into visits split by `VISIT_GAP_SECONDS`."""
    visits: list[Visit] = []
    current: list[tuple[Location, float]] = []

    def close() -> None:
        if current:
            first, last = current[0][0], current[-1][0]
            visits.append(
                Visit(
                    beacon_id=first.beacon_id,
                    arrived_at=to_datetime(first.observed_at),  # pyright: ignore[reportArgumentType]
                    left_at=to_datetime(last.observed_at),  # pyright: ignore[reportArgumentType]
                    point_count=len(current),
                    closest_m=round(min(d for _, d in current), 1),
                )
            )
            current.clear()

    for loc, dist in near:
        if current:
            prev = current[-1][0]
            if (
                prev.beacon_id != loc.beacon_id
                or loc.observed_at - prev.observed_at > VISIT_GAP_SECONDS
            ):
                close()
        current.append((loc, dist))
    close()
    return visits


def to_csv(rows: Iterable[Location], names: dict[int, str]) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(
        ["beacon", "observed_at_utc", "latitude", "longitude", "accuracy_m", "confidence"]
    )
    for r in rows:
        observed = to_datetime(r.observed_at)
        writer.writerow(
            [
                names.get(r.beacon_id, str(r.beacon_id)),
                observed.isoformat() if observed else "",
                r.latitude,
                r.longitude,
                r.accuracy_m,
                r.confidence,
            ]
        )
    return out.getvalue()


def to_geojson(rows: Iterable[Location], names: dict[int, str]) -> str:
    """One LineString per beacon (its path) plus one Point per sighting."""
    by_beacon: dict[int, list[Location]] = {}
    features: list[dict[str, object]] = []
    for r in rows:
        by_beacon.setdefault(r.beacon_id, []).append(r)
        observed = to_datetime(r.observed_at)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [r.longitude, r.latitude]},
                "properties": {
                    "beacon": names.get(r.beacon_id, str(r.beacon_id)),
                    "observed_at": observed.isoformat() if observed else None,
                    "accuracy_m": r.accuracy_m,
                },
            }
        )
    paths = [
        {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[p.longitude, p.latitude] for p in points],
            },
            "properties": {"beacon": names.get(beacon_id, str(beacon_id)), "kind": "path"},
        }
        for beacon_id, points in by_beacon.items()
        if len(points) > 1
    ]
    return json.dumps({"type": "FeatureCollection", "features": paths + features})


def judge(rows: Sequence[Location]) -> tuple[list[LocationPoint], list[Stay]]:
    """Flags noisy reports and finds stays, per beacon. `rows` are ordered by beacon, then time."""
    points: list[LocationPoint] = []
    stays: list[Stay] = []
    for beacon_id, group in groupby(rows, key=lambda r: r.beacon_id):
        beacon_rows = list(group)
        samples = [
            denoise.Sample(r.observed_at, r.latitude, r.longitude, r.accuracy_m)
            for r in beacon_rows
        ]
        verdicts = denoise.classify(samples)
        points.extend(_point(r, v) for r, v in zip(beacon_rows, verdicts, strict=True))
        stays.extend(
            Stay(
                beacon_id=beacon_id,
                arrived_at=to_datetime(samples[s.first].observed_at),  # pyright: ignore[reportArgumentType]
                left_at=to_datetime(samples[s.last].observed_at),  # pyright: ignore[reportArgumentType]
                latitude=s.latitude,
                longitude=s.longitude,
                point_count=s.count,
            )
            for s in denoise.stays(samples, verdicts)
        )
    return points, stays


def _point(r: Location, noise: denoise.Noise | None = None) -> LocationPoint:
    return LocationPoint(
        beacon_id=r.beacon_id,
        observed_at=to_datetime(r.observed_at),  # pyright: ignore[reportArgumentType]
        latitude=r.latitude,
        longitude=r.longitude,
        accuracy_m=r.accuracy_m,
        noise=noise,
    )
