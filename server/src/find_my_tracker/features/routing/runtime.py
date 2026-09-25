"""
Process-wide routing state: the built-in engine, the region catalog, external servers, and the
trips being matched.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import Callable
from typing import Any

from find_my_tracker.features.routing.jobs import Matcher
from find_my_tracker.integrations.valhalla.builtin import BuiltinEngine
from find_my_tracker.integrations.valhalla.client import ValhallaClient
from find_my_tracker.integrations.valhalla.regions import RegionCatalog
from find_my_tracker.integrations.valhalla.types import EngineStatus, RoutingUnavailable, Valhalla

logger = logging.getLogger(__name__)

STATUS_TTL_S = 30


class RoutingRuntime:
    def __init__(
        self,
        *,
        env_url: str | None,
        builtin: BuiltinEngine,
        catalog: RegionCatalog,
        matcher: Matcher,
        connect: Callable[[str], Valhalla] = ValhallaClient,
    ) -> None:
        #: Set by the operator (ROUTING_URL): fixed, Settings shows it and cannot change it.
        self.env_url = env_url.strip() if env_url and env_url.strip() else None
        self.builtin = builtin
        self.catalog = catalog
        self.matcher = matcher
        self._connect = connect
        self._clients: dict[str, Valhalla] = {}
        self._status: dict[str, tuple[float, EngineStatus | RoutingUnavailable]] = {}
        self._catalog_task: asyncio.Task[bool] | None = None
        #: Missing regions take a pass over two weeks of history; Settings asks every few
        #: seconds while a download runs. Remembered briefly, per set of regions.
        self.missing: tuple[float, frozenset[str], Any] | None = None

    def external(self, url: str) -> Valhalla:
        if url not in self._clients:
            self._clients[url] = self._connect(url)
        return self._clients[url]

    async def engine_status(self, url: str, *, fresh: bool = False) -> EngineStatus:
        """An external server's status, remembered briefly: every history view asks for it."""
        cached = self._status.get(url)
        if cached and not fresh and time.monotonic() - cached[0] < STATUS_TTL_S:
            if isinstance(cached[1], RoutingUnavailable):
                raise cached[1]
            return cached[1]
        try:
            status = await self.external(url).status()
        except RoutingUnavailable as e:
            self._status[url] = (time.monotonic(), e)
            raise
        self._status[url] = (time.monotonic(), status)
        return status

    async def use_builtin(self, on: bool) -> None:
        if on:
            await self.builtin.start()
            self.load_catalog()
        else:
            await self.builtin.stop()

    def load_catalog(self) -> asyncio.Task[bool]:
        """Loads the region list in the background, once; await the task to wait for it."""
        if self._catalog_task is None or (self._catalog_task.done() and not self.catalog.loaded):
            self._catalog_task = asyncio.create_task(self.catalog.load(), name="region-catalog")
        return self._catalog_task

    async def close(self) -> None:
        if self._catalog_task:
            self._catalog_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._catalog_task
        await self.matcher.close()
        await self.builtin.stop()
        for client in self._clients.values():
            await client.close()
        self._clients.clear()
