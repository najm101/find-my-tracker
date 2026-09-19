"""
Builds `integrations/apple/demo_routes.json`: the road-following routes DEMO_MODE replays.

Run once, when changing the demo story (needs internet; the app never calls a router):

    uv run python scripts/build_demo_routes.py

Routes come from the public OSRM instances at routing.openstreetmap.de (© OpenStreetMap
contributors, ODbL). Every place is a public spot in Amsterdam, Haarlem or Lisbon.
"""

from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

OUT = Path(__file__).parents[1] / "src/find_my_tracker/integrations/apple/demo_routes.json"
ROUTER = "https://routing.openstreetmap.de/routed-{profile}/route/v1/driving/{coords}"

# (lat, lon)
PLACES: dict[str, tuple[float, float]] = {
    "home": (52.35470, 4.89610),  # De Pijp, by Sarphatipark
    "office": (52.33890, 4.87300),  # Zuidas, by Amsterdam Zuid
    "gym": (52.36040, 4.91700),  # Oost, by Oosterpark
    "vondelpark": (52.35800, 4.86860),
    "market": (52.35590, 4.89250),  # Albert Cuypmarkt
    "centraal": (52.37890, 4.90030),
    "jordaan": (52.37520, 4.88300),  # dinner at a friend's
    "bos": (52.32320, 4.84110),  # Amsterdamse Bos, Bosbaan
    "haarlem_station": (52.38750, 4.63830),
    "haarlem_markt": (52.38120, 4.63650),
    "schiphol": (52.30990, 4.76190),
    "lisbon_airport": (38.77420, -9.13420),
    "lisbon_hotel": (38.71150, -9.13900),  # Baixa
    "belem": (38.69160, -9.21600),
    "alfama": (38.71190, -9.12950),
}

# name: (profile, [place, ...]); profiles: bike, foot, car
ROUTES: dict[str, tuple[str, list[str]]] = {
    "home_office": ("bike", ["home", "office"]),
    "office_gym": ("bike", ["office", "gym"]),
    "gym_home": ("bike", ["gym", "home"]),
    "home_vondelpark": ("foot", ["home", "vondelpark"]),
    "home_market": ("foot", ["home", "market"]),
    "home_centraal": ("bike", ["home", "centraal"]),
    "home_jordaan": ("bike", ["home", "jordaan"]),
    "bos_loop": ("bike", ["home", "bos", "vondelpark", "home"]),
    # The train roughly follows the A200/N200 west; close enough at Find My's resolution.
    "centraal_haarlem": ("car", ["centraal", "haarlem_station"]),
    "haarlem_walk": ("foot", ["haarlem_station", "haarlem_markt"]),
    "home_schiphol": ("car", ["home", "schiphol"]),
    "lisbon_airport_hotel": ("car", ["lisbon_airport", "lisbon_hotel"]),
    "lisbon_hotel_belem": ("car", ["lisbon_hotel", "belem"]),
    "lisbon_hotel_alfama": ("foot", ["lisbon_hotel", "alfama"]),
}


def fetch(profile: str, stops: list[str]) -> tuple[list[list[float]], float]:
    coords = ";".join(f"{PLACES[s][1]},{PLACES[s][0]}" for s in stops)
    url = ROUTER.format(profile=profile, coords=coords) + "?overview=full&geometries=geojson"
    req = urllib.request.Request(url, headers={"User-Agent": "find-my-tracker demo builder"})  # noqa: S310
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
        data = json.load(resp)
    route = data["routes"][0]
    points = [[round(lat, 5), round(lon, 5)] for lon, lat in route["geometry"]["coordinates"]]
    return points, route["duration"]


def main() -> None:
    routes = {}
    for name, (profile, stops) in ROUTES.items():
        points, seconds = fetch(profile, stops)
        routes[name] = {"minutes": round(seconds / 60), "points": points}
        print(f"{name:24} {profile:5} {len(points):5} pts  {seconds / 60:5.0f} min")
        time.sleep(1)  # be polite to the public router
    OUT.write_text(json.dumps({"places": PLACES, "routes": routes}, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
