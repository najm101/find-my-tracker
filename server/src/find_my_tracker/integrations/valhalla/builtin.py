"""
The built-in routing engine: Valhalla's own programs, from the `pyvalhalla` package, run by this
app.

It keeps map regions (OpenStreetMap extracts from Geofabrik) under `data_dir/routing`, turns them
into Valhalla's road data (its "tiles"), and serves that with `valhalla_service` on loopback. One
worker does the downloads and builds, one at a time; the service keeps answering from the previous
road data until a new build is ready, then restarts on it.

    routing/state.json              regions and the road data in use
    routing/maps/<region>.osm.pbf   the downloads
    routing/builds/<id>/            road data, its valhalla.json, and the build's log
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
import shutil
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any, Protocol

import aiohttp

from find_my_tracker.integrations.valhalla.client import ValhallaClient
from find_my_tracker.integrations.valhalla.types import RoutingUnavailable, Valhalla

logger = logging.getLogger(__name__)

#: Downloads bigger than this are not started automatically; the dashboard asks first.
MAX_AUTO_BYTES = 1_500_000_000
#: Road data takes about four times the download's size (Egypt: 178 MB became 739 MB).
DISK_HEADROOM = 6
SERVICE_START_TIMEOUT_S = 90
RESTART_BACKOFF_S = 10
CHUNK = 1 << 20


class RegionStatus(StrEnum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    DOWNLOADED = "downloaded"
    FAILED = "failed"
    TOO_LARGE = "too_large"


class Phase(StrEnum):
    IDLE = "idle"
    DOWNLOADING = "downloading"
    BUILDING = "building"
    STARTING = "starting"


@dataclass
class RegionState:
    id: str
    name: str
    url: str
    status: RegionStatus
    auto: bool
    added_at: int
    size: int | None = None
    error: str | None = None
    #: Counts finished downloads, so a build knows which download of each region it used.
    version: int = 0


@dataclass
class Build:
    id: str
    #: Region id -> the download (`RegionState.version`) it was built from.
    sources: dict[str, int]
    built_at: int

    @property
    def regions(self) -> list[str]:
        return sorted(self.sources)


@dataclass
class State:
    regions: dict[str, RegionState] = field(default_factory=dict)
    build: Build | None = None


@dataclass(frozen=True)
class RegionView:
    id: str
    name: str
    status: RegionStatus
    auto: bool
    size: int | None
    error: str | None
    #: Downloaded and part of the road data being served.
    in_use: bool
    #: 0..1 while downloading.
    progress: float | None


@dataclass(frozen=True)
class BuiltinStatus:
    phase: Phase
    detail: str | None
    progress: float | None
    serving: bool
    built_at: int | None
    regions: list[RegionView]
    disk_bytes: int
    error: str | None


class Served(Protocol):
    client: Valhalla

    async def wait(self) -> int:
        """Returns the exit code once the service stops."""
        ...

    async def stop(self) -> None: ...


class Toolchain(Protocol):
    """The outside world the engine uses: HTTP downloads and Valhalla's programs."""

    async def size(self, url: str) -> int | None: ...

    async def download(self, url: str, dest: Path, progress: Callable[[int], None]) -> None: ...

    async def build(self, build_dir: Path, pbfs: list[Path], log: Callable[[str], None]) -> None:
        """Writes `build_dir/valhalla.json` and the road data. Raises `BuildFailed`."""
        ...

    async def serve(self, build_dir: Path) -> Served: ...


class BuildFailed(Exception):
    pass


class BuiltinEngine:
    def __init__(self, root: Path, toolchain: Toolchain) -> None:
        self.root = root
        self._tools = toolchain
        self._state = State()
        self._wake = asyncio.Event()
        self._worker: asyncio.Task[None] | None = None
        self._server: asyncio.Task[None] | None = None
        self._served: Served | None = None
        self._phase = Phase.IDLE
        self._detail: str | None = None
        self._progress: float | None = None
        self._downloading: str | None = None
        self._error: str | None = None
        self._service_error: str | None = None

    # ---- lifecycle ----

    @property
    def running(self) -> bool:
        return self._worker is not None and not self._worker.done()

    async def start(self) -> None:
        if self.running:
            return
        self._load()
        # A download cut short by a restart starts again.
        for region in self._state.regions.values():
            if region.status is RegionStatus.DOWNLOADING:
                region.status = RegionStatus.QUEUED
        self._worker = asyncio.create_task(self._work(), name="routing-worker")
        await self._restart_service()
        self._wake.set()

    async def stop(self) -> None:
        if self._worker:
            self._worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._worker
        self._worker = None
        await self._stop_server()
        self._phase, self._detail, self._progress = Phase.IDLE, None, None

    async def purge(self) -> None:
        """Stop, and delete every download and all road data."""
        await self.stop()
        shutil.rmtree(self.root, ignore_errors=True)
        self._state = State()
        self._error = self._service_error = None

    # ---- what the dashboard asks for ----

    @property
    def client(self) -> Valhalla | None:
        return self._served.client if self._served else None

    @property
    def region_ids(self) -> set[str]:
        """Regions downloaded or on their way: whatever the dashboard should not add again."""
        return {r.id for r in self._state.regions.values() if r.status is not RegionStatus.FAILED}

    def add(self, region_id: str, name: str, url: str, *, auto: bool) -> None:
        existing = self._state.regions.get(region_id)
        if existing and existing.status not in (RegionStatus.FAILED, RegionStatus.TOO_LARGE):
            return
        if existing and auto:
            return  # failed or too big before: only the user retries it
        self._state.regions[region_id] = RegionState(
            id=region_id,
            name=name,
            url=url,
            status=RegionStatus.QUEUED,
            auto=auto,
            added_at=int(time.time()),
        )
        self._save()
        self._wake.set()

    def remove(self, region_id: str) -> None:
        if self._state.regions.pop(region_id, None) is None:
            return
        self._pbf(region_id).unlink(missing_ok=True)
        self._save()
        self._wake.set()

    def refresh(self) -> None:
        """Download every region again (Geofabrik updates them daily) and rebuild."""
        for region in self._state.regions.values():
            if region.status is RegionStatus.DOWNLOADED:
                region.status = RegionStatus.QUEUED
                region.auto = False  # the user asked: the size limit does not apply
        self._save()
        self._wake.set()

    def status(self) -> BuiltinStatus:
        in_build = set(self._state.build.regions) if self._state.build else set()
        return BuiltinStatus(
            phase=self._phase,
            detail=self._detail,
            progress=self._progress,
            serving=self._served is not None,
            built_at=self._state.build.built_at if self._state.build else None,
            regions=[
                RegionView(
                    id=r.id,
                    name=r.name,
                    status=r.status,
                    auto=r.auto,
                    size=r.size,
                    error=r.error,
                    in_use=r.id in in_build and self._served is not None,
                    progress=self._progress if self._downloading == r.id else None,
                )
                for r in sorted(self._state.regions.values(), key=lambda r: r.name)
            ],
            disk_bytes=_disk_usage(self.root),
            error=self._error or self._service_error,
        )

    # ---- worker: downloads, then a build when the set of regions changed ----

    async def _work(self) -> None:
        while True:
            await self._wake.wait()
            self._wake.clear()
            try:
                await self._download_queued()
                await self._build_if_changed()
            except asyncio.CancelledError:
                raise
            except Exception as e:  # never let the worker die; show it instead
                logger.exception("Routing worker failed")
                self._error = f"Something went wrong: {e}"
            finally:
                self._phase, self._detail, self._progress = Phase.IDLE, None, None

    async def _download_queued(self) -> None:
        while queued := [
            r for r in self._state.regions.values() if r.status is RegionStatus.QUEUED
        ]:
            await self._download(queued[0])

    async def _download(self, region: RegionState) -> None:
        self._phase, self._detail, self._progress = Phase.DOWNLOADING, region.name, 0.0
        self._downloading = region.id
        try:
            size = await self._tools.size(region.url)
            region.size = size
            if region.auto and size and size > MAX_AUTO_BYTES:
                region.status = RegionStatus.TOO_LARGE
                return
            self.root.mkdir(parents=True, exist_ok=True)
            free = shutil.disk_usage(self.root).free
            if size and free < size * DISK_HEADROOM:
                region.status = RegionStatus.FAILED
                region.error = (
                    f"Not enough free disk space: it needs about {_gb(size * DISK_HEADROOM)}, "
                    f"{_gb(free)} is free."
                )
                return
            region.status, region.error = RegionStatus.DOWNLOADING, None
            self._save()
            dest = self._pbf(region.id)
            dest.parent.mkdir(parents=True, exist_ok=True)

            def progress(done: int) -> None:
                self._progress = min(done / size, 1.0) if size else None

            await self._tools.download(region.url, dest, progress)
            if region.id not in self._state.regions:  # removed meanwhile
                dest.unlink(missing_ok=True)
                return
            region.status, region.size = RegionStatus.DOWNLOADED, dest.stat().st_size
            region.version += 1
        except (aiohttp.ClientError, TimeoutError, OSError) as e:
            region.status, region.error = RegionStatus.FAILED, f"The download failed: {e}"
        finally:
            self._downloading = None
            self._save()

    async def _build_if_changed(self) -> None:
        sources = {
            r.id: r.version
            for r in self._state.regions.values()
            if r.status is RegionStatus.DOWNLOADED
        }
        ready = sorted(sources)
        if sources == (self._state.build.sources if self._state.build else {}):
            return
        if not ready:
            self._state.build = None
            self._save()
            await self._restart_service()
            self._drop_builds(keep=None)
            return

        build_id = time.strftime("%Y%m%d-%H%M%S")
        build_dir = self.root / "builds" / build_id
        self._phase, self._detail, self._progress = Phase.BUILDING, "Starting", None
        started = time.monotonic()

        def log(line: str) -> None:
            if message := _progress_line(line):
                self._detail = message

        try:
            await self._tools.build(build_dir, [self._pbf(r) for r in ready], log)
        except BuildFailed as e:
            shutil.rmtree(build_dir, ignore_errors=True)
            self._error = f"Building the road data failed: {e}"
            return
        took = time.monotonic() - started
        logger.info("Built road data for %s in %.0f s", ", ".join(ready), took)
        self._state.build = Build(id=build_id, sources=sources, built_at=int(time.time()))
        self._error = None
        self._save()
        self._drop_builds(keep=build_id)
        self._phase, self._detail = Phase.STARTING, None
        await self._restart_service()

    # ---- the service: runs while there is road data, restarts if it dies ----

    async def _restart_service(self) -> None:
        """Stop the service (and wait: the new one needs its port), then serve the current build."""
        await self._stop_server()
        if self._state.build:
            self._server = asyncio.create_task(self._serve(), name="routing-service")

    async def _stop_server(self) -> None:
        if self._server:
            self._server.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._server
        self._server = None
        served, self._served = self._served, None
        if served:
            await served.stop()

    async def _serve(self) -> None:
        build = self._state.build
        if build is None:
            return
        build_dir = self.root / "builds" / build.id
        while True:
            try:
                self._served = await self._tools.serve(build_dir)
                self._service_error = None
                code = await self._served.wait()
                logger.warning("The routing service stopped (exit %s); restarting", code)
            except asyncio.CancelledError:
                served, self._served = self._served, None
                if served:
                    await served.stop()
                raise
            except (RoutingUnavailable, OSError) as e:
                logger.warning("The routing service did not start: %s", e)
                self._service_error = f"The routing engine did not start: {e}"
            self._served = None
            await asyncio.sleep(RESTART_BACKOFF_S)

    # ---- storage ----

    def _pbf(self, region_id: str) -> Path:
        return self.root / "maps" / f"{region_id}.osm.pbf"

    def _drop_builds(self, *, keep: str | None) -> None:
        builds = self.root / "builds"
        if builds.is_dir():
            for path in builds.iterdir():
                if path.name != keep:
                    shutil.rmtree(path, ignore_errors=True)

    def _load(self) -> None:
        path = self.root / "state.json"
        if not path.is_file():
            return
        try:
            raw = json.loads(path.read_text())
            self._state = State(
                regions={
                    r["id"]: RegionState(**{**r, "status": RegionStatus(r["status"])})
                    for r in raw.get("regions", [])
                },
                build=Build(**raw["build"]) if raw.get("build") else None,
            )
        except (ValueError, KeyError, TypeError):
            logger.exception("Unreadable routing state; starting over")
            self._state = State()

    def _save(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        data: dict[str, Any] = {
            "regions": [asdict(r) for r in self._state.regions.values()],
            "build": (
                {k: v for k, v in asdict(self._state.build).items() if k != "regions"}
                if self._state.build
                else None
            ),
        }
        tmp = self.root / "state.json.tmp"
        tmp.write_text(json.dumps(data, indent=1))
        tmp.replace(self.root / "state.json")


# Valhalla's log lines: "2026-09-24 11:11:03.038 [INFO] Parsing files: ..." (with ANSI colours).
_LOG = re.compile(r"\[(INFO|WARN)\]\S*\s+(.*)")
_ANSI = re.compile(r"\x1b\[[0-9;]*m")


def _progress_line(line: str) -> str | None:
    """A step of the tile builder ("Parsing ways..."), or None for its statistics and paths."""
    match = _LOG.search(_ANSI.sub("", line))
    if not match or match.group(1) != "INFO":
        return None
    message = match.group(2).strip()
    if not message.endswith("...") or "/" in message:
        return None
    return message.removesuffix("...")[:80]


def _disk_usage(root: Path) -> int:
    if not root.is_dir():
        return 0
    return sum(p.stat().st_size for p in root.rglob("*") if p.is_file())


def _gb(n: float) -> str:
    return f"{n / 1e9:.1f} GB"


class ValhallaToolchain:
    """The real thing: aiohttp for downloads, `pyvalhalla`'s programs for the rest."""

    def __init__(self, *, port: int, threads: int) -> None:
        self._port = port
        self._threads = threads

    async def size(self, url: str) -> int | None:
        async with (
            aiohttp.ClientSession() as http,
            http.head(url, allow_redirects=True, timeout=aiohttp.ClientTimeout(total=30)) as res,
        ):
            res.raise_for_status()
            return res.content_length

    async def download(self, url: str, dest: Path, progress: Callable[[int], None]) -> None:
        part = dest.with_suffix(dest.suffix + ".part")
        done = 0
        timeout = aiohttp.ClientTimeout(total=None, sock_read=120)
        async with aiohttp.ClientSession() as http, http.get(url, timeout=timeout) as res:
            res.raise_for_status()
            with part.open("wb") as f:
                async for chunk in res.content.iter_chunked(CHUNK):
                    f.write(chunk)
                    done += len(chunk)
                    progress(done)
        part.replace(dest)

    async def build(self, build_dir: Path, pbfs: list[Path], log: Callable[[str], None]) -> None:
        tiles = build_dir / "tiles"
        tiles.mkdir(parents=True, exist_ok=True)
        config = build_dir / "valhalla.json"
        config.write_text(json.dumps(self._config(build_dir)))
        with (build_dir / "build.log").open("w") as out:
            # Low priority, so the dashboard stays responsive while it works.
            nice = [nice_bin, "-n", "10"] if (nice_bin := shutil.which("nice")) else []
            proc = await asyncio.create_subprocess_exec(
                *nice,
                str(_bin("valhalla_build_tiles")),
                "-c",
                str(config),
                *map(str, pbfs),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            assert proc.stdout is not None
            tail: list[str] = []
            async for raw in proc.stdout:
                line = raw.decode(errors="replace").rstrip()
                out.write(line + "\n")
                log(line)
                tail = [*tail[-4:], _ANSI.sub("", line)]
            code = await proc.wait()
        if code != 0:
            raise BuildFailed(f"exit {code}: " + " / ".join(tail)[-300:])

    async def serve(self, build_dir: Path) -> Served:
        config = build_dir / "valhalla.json"
        log = (build_dir / "service.log").open("w")
        proc = await asyncio.create_subprocess_exec(
            str(_bin("valhalla_service")),
            str(config),
            str(self._threads),
            stdout=log,
            stderr=asyncio.subprocess.STDOUT,
        )
        served = _Process(proc, log, ValhallaClient(f"http://127.0.0.1:{self._port}"))
        deadline = time.monotonic() + SERVICE_START_TIMEOUT_S
        while True:
            if proc.returncode is not None:
                msg = f"valhalla_service exited ({proc.returncode}); see {build_dir}/service.log"
                raise RoutingUnavailable(msg)
            try:
                await served.client.status()
                return served
            except RoutingUnavailable:
                if time.monotonic() > deadline:
                    await served.stop()
                    raise
                await asyncio.sleep(0.5)

    def _config(self, build_dir: Path) -> dict[str, Any]:
        from valhalla.config import get_config  # heavy; only when building

        config = get_config(tile_extract="", tile_dir=build_dir / "tiles", verbose=True)
        mjolnir = config["mjolnir"]
        # Administrative areas and time zones matter for turn-by-turn directions, not for
        # snapping a trace to roads; without them a build is faster and smaller.
        mjolnir["admin"] = ""
        mjolnir["timezone"] = ""
        mjolnir["traffic_extract"] = ""
        mjolnir["concurrency"] = self._threads
        mjolnir["max_cache_size"] = 256 * 1024 * 1024
        # Reports further apart than Valhalla's 2 km default would not be connected at all; a
        # car's reports often are (see `features/routing/matching.py`).
        config["meili"]["default"]["breakage_distance"] = 100_000
        run = build_dir / "run"
        run.mkdir(exist_ok=True)
        service = config["httpd"]["service"]
        service["listen"] = f"tcp://127.0.0.1:{self._port}"
        service["loopback"] = f"ipc://{run / 'loopback'}"
        service["interrupt"] = f"ipc://{run / 'interrupt'}"
        return config


class _Process:
    def __init__(self, proc: asyncio.subprocess.Process, log: Any, client: ValhallaClient) -> None:
        self._proc = proc
        self._log = log
        self.client: Valhalla = client

    async def wait(self) -> int:
        code = await self._proc.wait()
        self._log.close()
        return code

    async def stop(self) -> None:
        if self._proc.returncode is None:
            self._proc.terminate()
            try:
                await asyncio.wait_for(self._proc.wait(), timeout=10)
            except TimeoutError:
                self._proc.kill()
                await self._proc.wait()
        self._log.close()
        await self.client.close()


def _bin(name: str) -> Path:
    import valhalla  # loads Valhalla's native library; only when used

    return Path(str(valhalla.__file__)).parent / "bin" / name
