"""Stand-ins for Valhalla and the built-in engine's toolchain: tests never download or run them."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from find_my_tracker.integrations.valhalla import polyline
from find_my_tracker.integrations.valhalla.builtin import BuildFailed, Served
from find_my_tracker.integrations.valhalla.types import (
    EngineStatus,
    MatchFailed,
    RoutingUnavailable,
    Valhalla,
)


class FakeValhalla:
    """Matches every point exactly where it is, along straight lines between them."""

    def __init__(self, *, version: str = "fake", built: int = 1) -> None:
        self.version = version
        self.built = built
        self.down = False
        #: Raise this from every match (e.g. MatchFailed with a no-roads code).
        self.fail: MatchFailed | None = None
        self.requests: list[dict[str, Any]] = []

    async def status(self) -> EngineStatus:
        if self.down:
            msg = "Could not reach the routing server."
            raise RoutingUnavailable(msg)
        return EngineStatus(version=self.version, tileset_last_modified=self.built)

    async def trace_attributes(self, request: dict[str, Any]) -> dict[str, Any]:
        await self.status()
        self.requests.append(request)
        if self.fail:
            raise self.fail
        points = [(p["lat"], p["lon"]) for p in request["shape"]]
        n = len(points)
        edges = [{"begin_shape_index": i, "end_shape_index": i + 1} for i in range(max(n - 1, 1))]
        return {
            "shape": polyline.encode(points),
            "edges": edges,
            "matched_points": [
                {
                    "type": "matched",
                    "lat": lat,
                    "lon": lon,
                    "edge_index": min(i, n - 2) if n > 1 else 0,
                    "distance_along_edge": 1.0 if i == n - 1 and n > 1 else 0.0,
                }
                for i, (lat, lon) in enumerate(points)
            ],
        }

    async def close(self) -> None:
        pass


class _FakeServed:
    def __init__(self, client: Valhalla) -> None:
        self.client = client
        self._stopped = asyncio.Event()

    async def wait(self) -> int:
        await self._stopped.wait()
        return 0

    async def stop(self) -> None:
        self._stopped.set()


class FakeToolchain:
    """Downloads write a few bytes; builds write a config; serving hands out a FakeValhalla."""

    def __init__(self) -> None:
        self.sizes: dict[str, int] = {}
        self.fail_build = False
        self.builds: list[list[str]] = []
        self.valhalla = FakeValhalla()

    async def size(self, url: str) -> int | None:
        return self.sizes.get(url, 1000)

    async def download(self, url: str, dest: Path, progress: Callable[[int], None]) -> None:
        await asyncio.to_thread(dest.write_bytes, b"pbf" * 10)
        progress(30)

    async def build(self, build_dir: Path, pbfs: list[Path], log: Callable[[str], None]) -> None:
        log("2026-01-01 00:00:00.000000 [INFO] Parsing ways...")
        if self.fail_build:
            raise BuildFailed("exit 1: out of memory")
        config = json.dumps({"pbfs": [p.name for p in pbfs]})

        def write() -> None:
            build_dir.mkdir(parents=True, exist_ok=True)
            (build_dir / "valhalla.json").write_text(config)

        await asyncio.to_thread(write)
        self.builds.append(sorted(p.name for p in pbfs))

    async def serve(self, build_dir: Path) -> Served:
        return _FakeServed(self.valhalla)
