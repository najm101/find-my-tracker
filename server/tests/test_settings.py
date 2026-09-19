from __future__ import annotations

from fastapi.testclient import TestClient


def test_defaults_and_update(admin: TestClient) -> None:
    assert admin.get("/api/settings").json() == {"poll_interval_minutes": 30}
    assert admin.patch("/api/settings", json={"poll_interval_minutes": 60}).status_code == 200
    assert admin.get("/api/settings").json()["poll_interval_minutes"] == 60


def test_interval_floor(admin: TestClient) -> None:
    res = admin.patch("/api/settings", json={"poll_interval_minutes": 5})
    assert res.status_code == 422
