"""
Where the map data comes from: Geofabrik's extracts of OpenStreetMap, per continent, country and
(for some countries) state or province.

Their index (about 4 MB, with each region's boundary) is cached on disk. It answers "which region
is this point in", so the map data an item's history needs can be fetched on its own.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Awaitable, Callable, Set
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

INDEX_URL = "https://download.geofabrik.de/index-v1.json"
#: Geofabrik updates extracts daily; the list of regions barely changes.
REFRESH_AFTER_S = 30 * 24 * 60 * 60

Ring = list[tuple[float, float]]  # (lon, lat)


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    parent: str | None
    pbf_url: str
    #: min_lon, min_lat, max_lon, max_lat
    bbox: tuple[float, float, float, float]
    #: Each polygon: its outer ring, then any holes.
    polygons: tuple[tuple[Ring, ...], ...]

    def contains(self, lat: float, lon: float) -> bool:
        min_lon, min_lat, max_lon, max_lat = self.bbox
        if not (min_lon <= lon <= max_lon and min_lat <= lat <= max_lat):
            return False
        for outer, *holes in self.polygons:
            if _in_ring(outer, lon, lat) and not any(_in_ring(h, lon, lat) for h in holes):
                return True
        return False

    @property
    def area(self) -> float:
        min_lon, min_lat, max_lon, max_lat = self.bbox
        return (max_lon - min_lon) * (max_lat - min_lat)


def _in_ring(ring: Ring, x: float, y: float) -> bool:
    """Ray casting: does a ray east from (x, y) cross the ring an odd number of times?"""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def parse_index(data: dict[str, Any]) -> list[Region]:
    regions: list[Region] = []
    for feature in data.get("features", []):
        props = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        pbf = (props.get("urls") or {}).get("pbf")
        if not props.get("id") or not pbf or not geometry:
            continue
        coords = geometry.get("coordinates") or []
        polys = [coords] if geometry.get("type") == "Polygon" else coords
        polygons = tuple(
            tuple([(float(p[0]), float(p[1])) for p in ring] for ring in poly) for poly in polys
        )
        points = [p for poly in polygons for p in poly[0]]
        if not points:
            continue
        lons = [p[0] for p in points]
        lats = [p[1] for p in points]
        regions.append(
            Region(
                id=str(props["id"]),
                name=str(props.get("name") or props["id"]),
                parent=props.get("parent"),
                pbf_url=str(pbf),
                bbox=(min(lons), min(lats), max(lons), max(lats)),
                polygons=polygons,
            )
        )
    return regions


class RegionCatalog:
    def __init__(
        self,
        cache_path: Path,
        *,
        fetch: Callable[[], Awaitable[bytes]] | None = None,
    ) -> None:
        self._path = cache_path
        self._fetch = fetch or _download_index
        self._regions: dict[str, Region] = {}
        self.error: str | None = None

    @property
    def loaded(self) -> bool:
        return bool(self._regions)

    async def load(self) -> bool:
        """From the cache, refreshed from Geofabrik when missing or a month old."""
        stale = not self._path.is_file() or time.time() - self._path.stat().st_mtime > (
            REFRESH_AFTER_S
        )
        if stale:
            try:
                raw = await self._fetch()
                self._path.parent.mkdir(parents=True, exist_ok=True)
                self._path.write_bytes(raw)
            except (aiohttp.ClientError, TimeoutError, OSError) as e:
                logger.warning("Could not download the Geofabrik region index: %s", e)
                self.error = "Could not download the list of map regions from Geofabrik."
        if self._path.is_file():
            try:
                self._regions = {r.id: r for r in parse_index(json.loads(self._path.read_bytes()))}
                self.error = None
            except ValueError:
                self.error = "The saved list of map regions is damaged; it is fetched again soon."
                self._path.unlink(missing_ok=True)
        return self.loaded

    def get(self, region_id: str) -> Region | None:
        return self._regions.get(region_id)

    def all(self) -> list[Region]:
        return sorted(self._regions.values(), key=lambda r: r.name)

    def depth(self, region: Region) -> int:
        depth, parent = 0, region.parent
        while parent and parent in self._regions and depth < 10:
            depth += 1
            parent = self._regions[parent].parent
        return depth

    def region_for(self, lat: float, lon: float) -> Region | None:
        """The most specific region containing the point: a state before its country."""
        found = [r for r in self._regions.values() if r.contains(lat, lon)]
        if not found:
            return None
        return max(found, key=lambda r: (self.depth(r), -r.area))

    def covered(self, region_ids: Set[str], lat: float, lon: float) -> bool:
        return any(
            (r := self._regions.get(rid)) is not None and r.contains(lat, lon) for rid in region_ids
        )


async def _download_index() -> bytes:
    async with (
        aiohttp.ClientSession() as http,
        http.get(INDEX_URL, timeout=aiohttp.ClientTimeout(total=120)) as res,
    ):
        res.raise_for_status()
        return await res.read()
