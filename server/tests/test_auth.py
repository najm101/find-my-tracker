from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import ADMIN_PASSWORD


def test_api_requires_login(client: TestClient) -> None:
    res = client.get("/api/beacons")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "not_authenticated"


def test_login_logout(client: TestClient) -> None:
    assert client.post("/api/auth/login", json={"password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"password": ADMIN_PASSWORD}).status_code == 204
    assert client.get("/api/auth/me").json() == {"authenticated": True}
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_login_rate_limited(client: TestClient) -> None:
    for _ in range(5):
        client.post("/api/auth/login", json={"password": "nope"})
    res = client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert res.status_code == 429


def test_forged_cookie_rejected(client: TestClient) -> None:
    client.cookies.set("fmt_session", "forged.token.value")
    assert client.get("/api/auth/me").status_code == 401
