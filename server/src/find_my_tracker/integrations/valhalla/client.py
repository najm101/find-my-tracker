"""Valhalla's HTTP API: the built-in engine on loopback, or a server elsewhere on the network."""

from __future__ import annotations

import json
from typing import Any

import aiohttp

from find_my_tracker.integrations.valhalla.types import (
    EngineStatus,
    MatchFailed,
    RoutingUnavailable,
)

STATUS_TIMEOUT_S = 5
MATCH_TIMEOUT_S = 60


class ValhallaClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self._session: aiohttp.ClientSession | None = None

    def _http(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def status(self) -> EngineStatus:
        body = await self._call("GET", "/status", None, STATUS_TIMEOUT_S)
        version = body.get("version")
        if not isinstance(version, str):
            msg = "That address answers, but not like a Valhalla server."
            raise RoutingUnavailable(msg)
        modified = body.get("tileset_last_modified")
        return EngineStatus(
            version=version,
            tileset_last_modified=modified if isinstance(modified, int) else None,
        )

    async def trace_attributes(self, request: dict[str, Any]) -> dict[str, Any]:
        return await self._call("POST", "/trace_attributes", request, MATCH_TIMEOUT_S)

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def _call(
        self, method: str, path: str, payload: dict[str, Any] | None, seconds: float
    ) -> dict[str, Any]:
        try:
            async with self._http().request(
                method,
                self.base_url + path,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=seconds),
            ) as res:
                text = await res.text()
        except (aiohttp.ClientError, TimeoutError) as e:
            msg = f"Could not reach the routing server at {self.base_url}."
            raise RoutingUnavailable(msg) from e
        try:
            body = json.loads(text)
        except ValueError as e:
            msg = f"The routing server at {self.base_url} sent something that isn't JSON."
            raise RoutingUnavailable(msg) from e
        if not isinstance(body, dict):
            msg = f"The routing server at {self.base_url} sent an unexpected answer."
            raise RoutingUnavailable(msg)
        if res.status >= 500 and "error_code" not in body:
            msg = f"The routing server at {self.base_url} failed ({res.status})."
            raise RoutingUnavailable(msg)
        if "error_code" in body or res.status >= 400:
            code = body.get("error_code")
            raise MatchFailed(
                str(body.get("error") or f"HTTP {res.status}"),
                code=code if isinstance(code, int) else None,
            )
        return body
