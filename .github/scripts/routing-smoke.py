"""
Inside the built image: the built-in routing engine downloads a map (Monaco, under 1 MB), builds
its road data, serves it, and matches a trace. Proves pyvalhalla's programs run in the image, as
the app's user, on its platform.
"""

import asyncio
import sys
import tempfile
import time
from pathlib import Path

from find_my_tracker.features.routing.matching import Costing, Trip, TripPoint, match_trip
from find_my_tracker.integrations.valhalla.builtin import BuiltinEngine, ValhallaToolchain

MONACO = "https://download.geofabrik.de/europe/monaco-latest.osm.pbf"
TRACE = [
    (43.7312, 7.4178),
    (43.7372, 7.4210),
    (43.7395, 7.4265),
    (43.7448, 7.4330),
    (43.7497, 7.4386),
]


async def main() -> None:
    root = Path(tempfile.mkdtemp(prefix="routing-smoke-"))
    engine = BuiltinEngine(root, ValhallaToolchain(port=8012, threads=2))
    await engine.start()
    engine.add("monaco", "Monaco", MONACO, auto=False)
    deadline = time.monotonic() + 300
    while not engine.status().serving:
        status = engine.status()
        if status.error:
            sys.exit(f"engine error: {status.error}")
        if time.monotonic() > deadline:
            sys.exit(f"timed out: {status}")
        await asyncio.sleep(1)
    assert engine.client is not None
    trip = Trip(1, tuple(TripPoint(1000 + i * 300, a, b, 60) for i, (a, b) in enumerate(TRACE)))
    result = await match_trip(engine.client, trip, Costing.AUTO)
    length = result.points[-1].offset_m
    if result.fallback or length < 3000:
        sys.exit(f"unexpected match: fallback={result.fallback} length={length}")
    print(f"matched {len(result.points)} reports along {length / 1000:.2f} km of road")
    await engine.stop()


asyncio.run(main())
