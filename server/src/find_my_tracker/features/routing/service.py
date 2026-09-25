"""
Predicted routes: which engine to use, its map data, and matching history against it.

The engine is off, built in (this app runs Valhalla on map regions it downloads), or external (any
Valhalla server, e.g. another container). ROUTING_URL picks an external one for good; otherwise it
is chosen in Settings.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import json
import time
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import timedelta
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession

from find_my_tracker.core.clock import Clock, to_datetime
from find_my_tracker.core.container import Container
from find_my_tracker.core.errors import Conflict, DomainError, NotFound
from find_my_tracker.features.beacons.service import BeaconService
from find_my_tracker.features.locations.service import LocationService, TimeRange
from find_my_tracker.features.routing.jobs import MatchJob
from find_my_tracker.features.routing.matching import (
    ALGORITHM_VERSION,
    Costing,
    Trip,
    costing_for,
    split_trips,
)
from find_my_tracker.features.routing.repository import RouteCacheRepository
from find_my_tracker.features.routing.runtime import RoutingRuntime
from find_my_tracker.features.routing.schemas import (
    BuiltinOut,
    CatalogRegion,
    ExternalOut,
    RegionOut,
    RegionSuggestion,
    RoutesProgress,
    RoutesResponse,
    RoutesState,
    RoutingMode,
    RoutingStatus,
    RoutingUpdate,
    TripRoute,
)
from find_my_tracker.features.settings.service import SettingsService
from find_my_tracker.integrations.valhalla.builtin import Phase
from find_my_tracker.integrations.valhalla.types import RoutingUnavailable, Valhalla

MODE_KEY = "routing_mode"
URL_KEY = "routing_url"
AUTO_KEY = "routing_auto_download"

#: History this recent decides which map regions are needed.
COVERAGE_DAYS = 14
#: Points closer than this (degrees, ~5 km) are checked once.
COVERAGE_CELL = 0.05
MAX_POINTS = 50_000
#: How long the regions history needs are remembered (unless the regions change).
MISSING_TTL_S = 60
#: A view's first answer waits this long for its trips to be matched; a few quick ones make it.
FIRST_WAIT_S = 1.0


@dataclass(frozen=True)
class RoutingConfig:
    mode: RoutingMode
    url: str | None
    from_env: bool
    auto_download: bool


class RoutingService:
    def __init__(self, session: AsyncSession, container: Container) -> None:
        self._session = session
        self._runtime: RoutingRuntime = container.routing
        self._clock: Clock = container.clock
        self._settings = SettingsService(session)
        self._locations = LocationService(session)
        self._beacons = BeaconService(session, container.secrets, container.clock)
        self._cache = RouteCacheRepository(session)

    # ---- configuration ----

    async def config(self) -> RoutingConfig:
        auto = bool(await self._settings.value(AUTO_KEY, True))
        if self._runtime.env_url:
            return RoutingConfig(RoutingMode.EXTERNAL, self._runtime.env_url, True, auto)
        mode = RoutingMode(await self._settings.value(MODE_KEY, RoutingMode.OFF.value))
        url = await self._settings.value(URL_KEY)
        return RoutingConfig(mode, url if isinstance(url, str) else None, False, auto)

    async def update(self, body: RoutingUpdate) -> RoutingStatus:
        if self._runtime.env_url:
            msg = "This server's routing engine is set by ROUTING_URL, so it can't be changed here."
            raise Conflict(msg, code="routing_fixed")
        url = None
        if body.mode is RoutingMode.EXTERNAL:
            url = _normalise_url(body.url or "")
            try:
                await self._runtime.engine_status(url, fresh=True)
            except RoutingUnavailable as e:
                msg = f"{e} Check the address, and that it is a Valhalla server."
                raise DomainError(msg, code="routing_unreachable") from e
        await self._settings.put_values(
            {MODE_KEY: body.mode.value, **({URL_KEY: url} if url else {})}
        )
        await self._cache.clear()  # another engine, other roads
        await self._session.commit()
        await self._runtime.use_builtin(body.mode is RoutingMode.BUILTIN)
        return await self.status()

    async def set_auto_download(self, enabled: bool) -> RoutingStatus:
        await self._settings.put_values({AUTO_KEY: enabled})
        await self._session.commit()
        if enabled:
            await self.ensure_coverage()
        return await self.status()

    # ---- status ----

    async def status(self) -> RoutingStatus:
        cfg = await self.config()
        builtin = external = None
        ready, message = False, None
        if cfg.mode is RoutingMode.BUILTIN:
            st = self._runtime.builtin.status()
            builtin = BuiltinOut(
                phase=st.phase,
                detail=st.detail,
                progress=st.progress,
                serving=st.serving,
                built_at=to_datetime(st.built_at),
                regions=[RegionOut(**_region(asdict(r))) for r in st.regions],
                disk_bytes=st.disk_bytes,
                error=st.error,
                auto_download=cfg.auto_download,
            )
            ready = st.serving
            if not ready:
                message = _builtin_message(st.phase, st.detail, st.error, bool(st.regions))
        elif cfg.mode is RoutingMode.EXTERNAL and cfg.url:
            try:
                engine = await self._runtime.engine_status(cfg.url)
                external = ExternalOut(
                    url=_display_url(cfg.url), reachable=True, version=engine.version, error=None
                )
                ready = True
            except RoutingUnavailable as e:
                external = ExternalOut(
                    url=_display_url(cfg.url), reachable=False, version=None, error=str(e)
                )
                message = str(e)
        else:
            message = "Predicted routes are off."
        return RoutingStatus(
            mode=cfg.mode,
            configured_by_env=cfg.from_env,
            ready=ready,
            message=message,
            builtin=builtin,
            external=external,
            missing_regions=await self.missing_regions() if builtin else [],
            catalog_available=self._runtime.catalog.loaded,
        )

    # ---- map regions (built-in engine) ----

    async def catalog(self) -> list[CatalogRegion]:
        catalog = self._runtime.catalog
        if not catalog.loaded:
            await self._runtime.load_catalog()
        if not catalog.loaded:
            raise DomainError(catalog.error or "The list of map regions is not available yet.")
        names = {r.id: r.name for r in catalog.all()}
        return [
            CatalogRegion(id=r.id, name=r.name, parent=names.get(r.parent or ""))
            for r in catalog.all()
        ]

    async def add_region(self, region_id: str) -> RoutingStatus:
        await self._require_builtin()
        if not self._runtime.catalog.loaded:
            await self._runtime.load_catalog()
        region = self._runtime.catalog.get(region_id)
        if region is None:
            raise NotFound("There is no map region with that name.")
        self._runtime.builtin.add(region.id, region.name, region.pbf_url, auto=False)
        return await self.status()

    async def remove_region(self, region_id: str) -> RoutingStatus:
        await self._require_builtin()
        self._runtime.builtin.remove(region_id)
        return await self.status()

    async def refresh_regions(self) -> RoutingStatus:
        await self._require_builtin()
        self._runtime.builtin.refresh()
        return await self.status()

    async def delete_map_data(self) -> RoutingStatus:
        cfg = await self.config()
        await self._runtime.builtin.purge()
        if cfg.mode is RoutingMode.BUILTIN:
            await self._runtime.builtin.start()
        await self._cache.clear()
        await self._session.commit()
        return await self.status()

    async def missing_regions(self) -> list[RegionSuggestion]:
        """Regions recent history is in that the built-in engine has not got (or is getting)."""
        catalog = self._runtime.catalog
        if not catalog.loaded:
            return []
        have = frozenset(self._runtime.builtin.region_ids)
        cached = self._runtime.missing
        if cached and cached[1] == have and time.monotonic() - cached[0] < MISSING_TTL_S:
            return cached[2]
        now = self._clock.now()
        history = await self._locations.history(
            TimeRange.of(now - timedelta(days=COVERAGE_DAYS), now),
            beacon_ids=None,
            bbox=None,
            limit=MAX_POINTS,
        )
        names = await self._beacons.names()
        cells: dict[tuple[int, int], set[int]] = {}
        for p in history.points:
            if p.noise is None:
                key = (round(p.latitude / COVERAGE_CELL), round(p.longitude / COVERAGE_CELL))
                cells.setdefault(key, set()).add(p.beacon_id)
        found: dict[str, RegionSuggestion] = {}
        for (y, x), beacon_ids in cells.items():
            lat, lon = y * COVERAGE_CELL, x * COVERAGE_CELL
            if catalog.covered(have, lat, lon):
                continue
            region = catalog.region_for(lat, lon)
            # A whole continent is never a sensible download to start on its own.
            if region is None or region.parent is None:
                continue
            entry = found.setdefault(
                region.id, RegionSuggestion(id=region.id, name=region.name, beacons=[])
            )
            for beacon_id in beacon_ids:
                name = names.get(beacon_id, "An item")
                if name not in entry.beacons:
                    entry.beacons.append(name)
        missing = sorted(found.values(), key=lambda r: r.name)
        self._runtime.missing = (time.monotonic(), have, missing)
        return missing

    async def ensure_coverage(self) -> None:
        """With automatic downloads on: queue every region recent history needs."""
        cfg = await self.config()
        if cfg.mode is not RoutingMode.BUILTIN or not cfg.auto_download:
            return
        await self._runtime.load_catalog()
        self._runtime.missing = None  # new history may have arrived
        for suggestion in await self.missing_regions():
            region = self._runtime.catalog.get(suggestion.id)
            if region:
                self._runtime.builtin.add(region.id, region.name, region.pbf_url, auto=True)

    async def _require_builtin(self) -> None:
        if (await self.config()).mode is not RoutingMode.BUILTIN:
            msg = "Map regions are for the built-in routing engine; it isn't the one in use."
            raise Conflict(msg, code="routing_not_builtin")

    # ---- matching ----

    async def routes(self, span: TimeRange, beacon_ids: Sequence[int] | None) -> RoutesResponse:
        """The trips already matched; the rest are matched in a job whose progress is included."""
        cfg = await self.config()
        if cfg.mode is RoutingMode.OFF:
            return RoutesResponse(
                state=RoutesState.OFF,
                message="Predicted routes are off. Turn them on in Settings.",
                trips=[],
                progress=None,
            )
        engine = await self._engine(cfg)
        if isinstance(engine, str):
            return RoutesResponse(
                state=RoutesState.UNAVAILABLE, message=engine, trips=[], progress=None
            )
        client, engine_key = engine

        history = await self._locations.history(
            span, beacon_ids=beacon_ids, bbox=None, limit=MAX_POINTS
        )
        vehicles = await self._beacons.vehicle_ids()
        trips = split_trips(history.points, history.stays)
        cached = await self._cache.get_many([(t.beacon_id, t.start) for t in trips])

        done: list[TripRoute] = []
        todo: list[tuple[str, Trip, Costing]] = []
        for trip in trips:
            costing = costing_for(trip, vehicle=trip.beacon_id in vehicles)
            digest = _digest(trip, costing, engine_key)
            row = cached.get((trip.beacon_id, trip.start))
            if row and row.digest == digest:
                done.append(TripRoute.model_validate_json(row.body))
            else:
                todo.append((digest, trip, costing))
        if not todo:
            return _answer(done, None)

        job = self._runtime.matcher.start(client, todo)
        with contextlib.suppress(TimeoutError):
            async with asyncio.timeout(FIRST_WAIT_S):
                await job.settled.wait()
        return _answer(done, job)

    def job_routes(self, job_id: str, after: int) -> RoutesResponse:
        """The trips a job has matched since the first `after`, and how far along it is."""
        job = self._runtime.matcher.job(job_id)
        if job is None:
            msg = "That search for predicted routes has stopped. Load the page again."
            raise NotFound(msg, code="routes_job_gone")
        return _answer([], job, after)

    async def _engine(self, cfg: RoutingConfig) -> tuple[Valhalla, str] | str:
        """The engine to match with and a key for its road data, or why there is none."""
        if cfg.mode is RoutingMode.BUILTIN:
            st = self._runtime.builtin.status()
            client = self._runtime.builtin.client
            if client is None or st.built_at is None:
                return _builtin_message(st.phase, st.detail, st.error, bool(st.regions))
            return client, f"builtin:{st.built_at}"
        assert cfg.url is not None
        try:
            engine = await self._runtime.engine_status(cfg.url)
        except RoutingUnavailable as e:
            return str(e)
        return self._runtime.external(cfg.url), f"{cfg.url}:{engine.tileset_last_modified}"


def _answer(done: list[TripRoute], job: MatchJob | None, after: int = 0) -> RoutesResponse:
    if job and job.error:
        return RoutesResponse(
            state=RoutesState.UNAVAILABLE, message=job.error, trips=[], progress=None
        )
    progress = None
    if job and not job.settled.is_set():
        progress = RoutesProgress(
            job=job.id,
            done=round(job.done, 3),
            trips_left=job.trips_left,
            received=len(job.routes),
        )
    return RoutesResponse(
        state=RoutesState.OK,
        message=None,
        trips=[*done, *(job.routes[after:] if job else [])],
        progress=progress,
    )


def _digest(trip: Trip, costing: Costing, engine_key: str) -> str:
    payload = {
        "v": ALGORITHM_VERSION,
        "engine": engine_key,
        "costing": costing.value,
        "points": [asdict(p) for p in trip.points],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _region(view: dict[str, Any]) -> dict[str, Any]:
    view["size_bytes"] = view.pop("size")
    return view


def _builtin_message(phase: Phase, detail: str | None, error: str | None, has_regions: bool) -> str:
    if phase is Phase.DOWNLOADING:
        return f"Downloading map data ({detail})."
    if phase is Phase.BUILDING:
        return "Preparing the road data. This takes a few minutes."
    if phase is Phase.STARTING:
        return "Starting the routing engine."
    if error:
        return error
    if not has_regions:
        return "No map data yet. Add a map region in Settings → Predicted routes."
    return "The routing engine is starting."


def _normalise_url(value: str) -> str:
    url = value.strip().rstrip("/")
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        msg = "Enter the server's full address, like http://valhalla:8002."
        raise DomainError(msg, code="invalid_url")
    return url


def _display_url(url: str) -> str:
    """Without any password in it: the address is shown in the dashboard."""
    parts = urlsplit(url)
    host = parts.hostname or ""
    if parts.port:
        host = f"{host}:{parts.port}"
    return urlunsplit((parts.scheme, host, parts.path, "", ""))
