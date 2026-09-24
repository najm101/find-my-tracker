from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from find_my_tracker.core.config import Settings
from find_my_tracker.core.container import Container
from find_my_tracker.integrations.apple.fake import FakeAppleClientFactory
from find_my_tracker.integrations.valhalla.fake import FakeToolchain, FakeValhalla
from find_my_tracker.integrations.valhalla.regions import RegionCatalog
from find_my_tracker.main import build_container, create_app

ADMIN_PASSWORD = "test-password-12"


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        secret_key="x" * 32,  # pyright: ignore[reportArgumentType]
        admin_password=ADMIN_PASSWORD,  # pyright: ignore[reportArgumentType]
        data_dir=tmp_path / "data",
    )


@pytest.fixture
def apple() -> FakeAppleClientFactory:
    return FakeAppleClientFactory()


@pytest.fixture
def valhalla() -> FakeValhalla:
    """What every Valhalla URL connects to in tests."""
    return FakeValhalla()


@pytest.fixture
def routing_tools() -> FakeToolchain:
    """The built-in engine's downloads, builds and service, faked."""
    return FakeToolchain()


def _region(rid: str, name: str, parent: str | None, box: tuple[float, ...]) -> dict:
    x0, y0, x1, y1 = box
    return {
        "properties": {
            "id": rid,
            "name": name,
            **({"parent": parent} if parent else {}),
            "urls": {"pbf": f"https://download.example/{rid}.osm.pbf"},
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
        },
    }


#: Map regions around the fake Apple's beacons (Amsterdam).
REGION_INDEX = {
    "features": [
        _region("europe", "Europe", None, (-25, 34, 45, 72)),
        _region("netherlands", "Netherlands", "europe", (3.3, 50.7, 7.3, 53.6)),
        _region("noord-holland", "Noord-Holland", "netherlands", (4.5, 52.2, 5.3, 53.2)),
    ]
}


@pytest.fixture
def container(
    settings: Settings,
    apple: FakeAppleClientFactory,
    valhalla: FakeValhalla,
    routing_tools: FakeToolchain,
) -> Container:
    async def index() -> bytes:
        return json.dumps(REGION_INDEX).encode()

    # The background loop stays asleep; tests drive polls explicitly. Nothing reaches the network.
    return build_container(
        settings,
        apple=apple,
        poller_startup_delay=3600,
        routing_tools=routing_tools,
        routing_catalog=RegionCatalog(settings.routing_dir / "index.json", fetch=index),
        routing_connect=lambda _url: valhalla,
    )


@pytest.fixture
def client(settings: Settings, container: Container) -> Iterator[TestClient]:
    with TestClient(create_app(settings, container)) as c:
        yield c


@pytest.fixture
def admin(client: TestClient) -> TestClient:
    res = client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert res.status_code == 200, res.text
    assert res.json() == {"mfa_required": False}
    return client


def sign_in(client: TestClient, identifiers: list[str] | None = None) -> dict:
    """Walk the whole wizard with the fake Apple's known-good answers."""
    client.post("/api/apple/wizard/start", json={"apple_id": "me@example.com", "password": "pw"})
    client.post("/api/apple/wizard/2fa/request", json={"method_id": 0})
    client.post("/api/apple/wizard/2fa/submit", json={"code": "123456"})
    view = client.post(
        "/api/apple/wizard/unlock", json={"device_id": "dev-iphone", "passcode": "1234"}
    ).json()
    ids = identifiers or [b["identifier"] for b in view["beacons"] if not b["personal_device"]]
    res = client.post("/api/apple/wizard/import", json={"identifiers": ids})
    assert res.status_code == 200, res.text
    return res.json()
