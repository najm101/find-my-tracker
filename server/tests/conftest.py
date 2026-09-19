from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from find_my_tracker.core.config import Settings
from find_my_tracker.core.container import Container
from find_my_tracker.integrations.apple.fake import FakeAppleClientFactory
from find_my_tracker.main import build_container, create_app

ADMIN_PASSWORD = "test-password"


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
def container(settings: Settings, apple: FakeAppleClientFactory) -> Container:
    # The background loop stays asleep; tests drive polls explicitly.
    return build_container(settings, apple=apple, poller_startup_delay=3600)


@pytest.fixture
def client(settings: Settings, container: Container) -> Iterator[TestClient]:
    with TestClient(create_app(settings, container)) as c:
        yield c


@pytest.fixture
def admin(client: TestClient) -> TestClient:
    assert client.post("/api/auth/login", json={"password": ADMIN_PASSWORD}).status_code == 204
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
