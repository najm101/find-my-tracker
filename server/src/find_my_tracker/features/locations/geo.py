"""Small, pure geo helpers. No dependencies: the queries here never need more."""

from __future__ import annotations

import math
from dataclasses import dataclass

EARTH_RADIUS_M = 6_371_008.8


@dataclass(frozen=True)
class BBox:
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float

    @classmethod
    def parse(cls, value: str) -> BBox:
        """`min_lon,min_lat,max_lon,max_lat`: the order MapLibre's getBounds().toArray() gives."""
        parts = [float(p) for p in value.split(",")]
        if len(parts) != 4:
            msg = "bbox must be min_lon,min_lat,max_lon,max_lat"
            raise ValueError(msg)
        min_lon, min_lat, max_lon, max_lat = parts
        return cls(min_lat, min_lon, max_lat, max_lon)

    @classmethod
    def around(cls, lat: float, lon: float, radius_m: float) -> BBox:
        """A box that contains every point within `radius_m` of (lat, lon)."""
        dlat = math.degrees(radius_m / EARTH_RADIUS_M)
        cos_lat = max(math.cos(math.radians(lat)), 1e-6)
        dlon = math.degrees(radius_m / (EARTH_RADIUS_M * cos_lat))
        return cls(lat - dlat, lon - dlon, lat + dlat, lon + dlon)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))
