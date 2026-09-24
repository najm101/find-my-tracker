"""
The boundary to Valhalla, the routing engine that snaps history to roads.

Two kinds sit behind it: the built-in engine (Valhalla's own `valhalla_service`, run by this app
from the `pyvalhalla` package, on map data it downloads) and any Valhalla server reached over the
network. Both speak Valhalla's HTTP API, so one client serves both. Tests use the fake.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class RoutingUnavailable(Exception):
    """The engine could not be reached, or is not serving (no map data yet, or restarting)."""


class MatchFailed(Exception):
    """Valhalla answered, but could not match these points: no roads near them, usually."""

    def __init__(self, message: str, *, code: int | None = None) -> None:
        super().__init__(message)
        self.code = code


#: Valhalla error codes meaning "no road data around these points".
NO_ROADS_CODES = frozenset({171, 442, 443, 444})


@dataclass(frozen=True)
class EngineStatus:
    version: str
    #: When the road data was built, epoch seconds. Changes whenever it is rebuilt.
    tileset_last_modified: int | None


class Valhalla(Protocol):
    async def status(self) -> EngineStatus: ...

    async def trace_attributes(self, request: dict[str, Any]) -> dict[str, Any]:
        """Raises `MatchFailed` for a trace Valhalla cannot match, `RoutingUnavailable` if down."""
        ...

    async def close(self) -> None: ...
