"""The built-in engine's map data: which region a place is in, and downloading/building/serving."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from pathlib import Path

import pytest

from find_my_tracker.integrations.valhalla.builtin import (
    BuiltinEngine,
    Phase,
    RegionStatus,
    _progress_line,
)
from find_my_tracker.integrations.valhalla.fake import FakeToolchain
from find_my_tracker.integrations.valhalla.regions import RegionCatalog, parse_index


def square(x0: float, y0: float, x1: float, y1: float) -> list[list[float]]:
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]


def feature(rid: str, name: str, parent: str | None, ring: list[list[float]], holes=()) -> dict:
    return {
        "type": "Feature",
        "properties": {
            "id": rid,
            "name": name,
            **({"parent": parent} if parent else {}),
            "urls": {"pbf": f"https://download.example/{rid}.osm.pbf"},
        },
        "geometry": {"type": "Polygon", "coordinates": [ring, *holes]},
    }


INDEX = {
    "type": "FeatureCollection",
    "features": [
        feature("africa", "Africa", None, square(-20, -35, 55, 38)),
        feature(
            "egypt", "Egypt", "africa", square(24, 21, 37, 32), holes=[square(30, 30, 30.1, 30.1)]
        ),
        feature("giza", "Giza", "egypt", square(28, 28, 31.3, 30.2)),
        {"type": "Feature", "properties": {"id": "broken"}, "geometry": None},
    ],
}


def catalog(tmp_path: Path, index: dict | None = None) -> RegionCatalog:
    async def fetch() -> bytes:
        return json.dumps(index or INDEX).encode()

    c = RegionCatalog(tmp_path / "index.json", fetch=fetch)
    assert asyncio.run(c.load())
    return c


def test_the_most_specific_region_wins(tmp_path: Path) -> None:
    c = catalog(tmp_path)

    def region(lat: float, lon: float) -> str | None:
        found = c.region_for(lat, lon)
        return found.id if found else None

    assert region(29.97, 30.93) == "giza"  # 6th of October
    assert region(30.04, 31.5) == "egypt"  # east of Giza
    assert region(0.0, 20.0) == "africa"
    assert region(60.0, 10.0) is None
    assert region(30.05, 30.05) == "giza"  # inside Egypt's hole, but Giza has it


def test_coverage(tmp_path: Path) -> None:
    c = catalog(tmp_path)
    assert c.covered({"egypt"}, 25.0, 33.0)
    assert not c.covered({"giza"}, 25.0, 33.0)
    assert not c.covered({"egypt"}, 30.05, 30.05)  # the hole
    assert [r.id for r in c.all()] == ["africa", "egypt", "giza"]  # the broken entry is skipped


def test_parse_multipolygons() -> None:
    index = {
        "features": [
            {
                "properties": {"id": "x", "name": "X", "urls": {"pbf": "u"}},
                "geometry": {
                    "type": "MultiPolygon",
                    "coordinates": [[square(0, 0, 1, 1)], [square(5, 5, 6, 6)]],
                },
            }
        ]
    }
    (region,) = parse_index(index)
    assert region.contains(5.5, 5.5) and region.contains(0.5, 0.5)
    assert not region.contains(3, 3)
    assert region.bbox == (0, 0, 6, 6)


def test_the_cached_index_is_used_offline(tmp_path: Path) -> None:
    catalog(tmp_path)  # caches it

    async def offline() -> bytes:
        raise OSError("no network")

    again = RegionCatalog(tmp_path / "index.json", fetch=offline)
    assert asyncio.run(again.load())
    assert again.get("giza") is not None


def test_progress_lines() -> None:
    assert _progress_line("2026-09-24 11:11:03.03 \x1b[32;1m[INFO]\x1b[0m Parsing ways...") == (
        "Parsing ways"
    )
    assert _progress_line("x [INFO] Number of nodes with names = 170") is None
    assert _progress_line("x [INFO] Cleaning up temporary *.bin files within /data/x/...") is None
    assert _progress_line("x [WARN] Admin db not found...") is None


# ---- the engine, on the fake toolchain ----


async def until(check: Callable[[], bool], seconds: float = 5.0) -> None:
    deadline = asyncio.get_running_loop().time() + seconds
    while not check():
        if asyncio.get_running_loop().time() > deadline:
            pytest.fail("timed out")
        await asyncio.sleep(0.01)


def test_add_download_build_serve(tmp_path: Path) -> None:
    async def scenario() -> None:
        tools = FakeToolchain()
        engine = BuiltinEngine(tmp_path / "routing", tools)
        await engine.start()
        assert engine.client is None and engine.status().regions == []

        engine.add("egypt", "Egypt", "https://download.example/egypt.osm.pbf", auto=False)
        await until(lambda: engine.status().serving)
        st = engine.status()
        assert st.phase is Phase.IDLE and st.built_at is not None
        assert [(r.id, r.status, r.in_use) for r in st.regions] == [
            ("egypt", RegionStatus.DOWNLOADED, True)
        ]
        assert tools.builds == [["egypt.osm.pbf"]]
        assert engine.client is tools.valhalla
        assert (await tools.valhalla.status()).version == "fake"

        # a second region rebuilds with both
        engine.add("libya", "Libya", "https://download.example/libya.osm.pbf", auto=True)
        await until(lambda: len(tools.builds) == 2)
        assert tools.builds[-1] == ["egypt.osm.pbf", "libya.osm.pbf"]

        # removing both stops serving and drops the road data
        engine.remove("libya")
        engine.remove("egypt")
        await until(lambda: not engine.status().serving and engine.status().built_at is None)
        assert not (tmp_path / "routing" / "maps" / "egypt.osm.pbf").exists()
        await engine.stop()

    asyncio.run(scenario())


def test_big_regions_wait_for_the_user(tmp_path: Path) -> None:
    async def scenario() -> None:
        tools = FakeToolchain()
        tools.sizes["https://download.example/europe.osm.pbf"] = 30_000_000_000
        engine = BuiltinEngine(tmp_path / "routing", tools)
        await engine.start()
        engine.add("europe", "Europe", "https://download.example/europe.osm.pbf", auto=True)
        await until(lambda: engine.status().regions[0].status is RegionStatus.TOO_LARGE)
        assert tools.builds == []
        engine.add("europe", "Europe", "https://download.example/europe.osm.pbf", auto=True)
        assert engine.status().regions[0].status is RegionStatus.TOO_LARGE  # auto won't retry
        await engine.stop()

    asyncio.run(scenario())


def test_a_failed_build_keeps_serving_the_last_one(tmp_path: Path) -> None:
    async def scenario() -> None:
        tools = FakeToolchain()
        engine = BuiltinEngine(tmp_path / "routing", tools)
        await engine.start()
        engine.add("egypt", "Egypt", "https://download.example/egypt.osm.pbf", auto=False)
        await until(lambda: engine.status().serving)
        built = engine.status().built_at

        tools.fail_build = True
        engine.add("libya", "Libya", "https://download.example/libya.osm.pbf", auto=False)
        await until(lambda: engine.status().error is not None)
        st = engine.status()
        assert "out of memory" in (st.error or "")
        assert st.serving and st.built_at == built
        await engine.stop()

    asyncio.run(scenario())


def test_state_survives_a_restart_and_refresh_rebuilds(tmp_path: Path) -> None:
    async def scenario() -> None:
        tools = FakeToolchain()
        engine = BuiltinEngine(tmp_path / "routing", tools)
        await engine.start()
        engine.add("egypt", "Egypt", "https://download.example/egypt.osm.pbf", auto=False)
        await until(lambda: engine.status().serving)
        await engine.stop()

        again = BuiltinEngine(tmp_path / "routing", tools)
        await again.start()
        await until(lambda: again.status().serving)
        assert len(tools.builds) == 1  # nothing changed: no rebuild

        again.refresh()
        await until(lambda: len(tools.builds) == 2)
        await again.purge()
        assert not (tmp_path / "routing").exists()

    asyncio.run(scenario())
