from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from find_my_tracker.core.container import Container
from find_my_tracker.features.settings.repository import SettingsRepository


def test_defaults_and_update(admin: TestClient) -> None:
    assert admin.get("/api/settings").json() == {"poll_interval_minutes": 30, "api_docs": False}
    assert admin.patch("/api/settings", json={"poll_interval_minutes": 60}).status_code == 200
    assert admin.get("/api/settings").json()["poll_interval_minutes"] == 60


def test_interval_limits(admin: TestClient) -> None:
    for minutes in (5, 15, 7 * 24 * 60 + 1):
        res = admin.patch("/api/settings", json={"poll_interval_minutes": minutes})
        assert res.status_code == 422, minutes
    res = admin.patch("/api/settings", json={"poll_interval_minutes": 7 * 24 * 60})
    assert res.status_code == 200


def test_an_old_15_minute_interval_reads_as_30(admin: TestClient, container: Container) -> None:
    async def store() -> None:
        async with container.db.session() as session:
            await SettingsRepository(session).put({"poll_interval_minutes": 15})
            await session.commit()

    asyncio.run(store())
    assert admin.get("/api/settings").json()["poll_interval_minutes"] == 30


def test_api_docs_are_for_the_admin_once_turned_on(client: TestClient, admin: TestClient) -> None:
    off = admin.get("/api/docs")
    assert off.status_code == 404 and off.json()["error"]["code"] == "api_docs_off"
    assert admin.get("/api/docs/openapi.json").status_code == 404

    assert admin.patch("/api/settings", json={"api_docs": True}).json()["api_docs"] is True
    page = admin.get("/api/docs")
    assert page.status_code == 200 and "/api-docs/swagger-ui-bundle.js" in page.text
    # Its own policy: the inline script that starts Swagger UI, and nothing from elsewhere.
    policy = page.headers["content-security-policy"]
    assert "'sha256-" in policy and "cdn.jsdelivr.net" not in page.text
    schema = admin.get("/api/docs/openapi.json").json()
    assert "/api/settings" in schema["paths"] and "/api/docs" not in schema["paths"]

    admin.post("/api/auth/logout")
    assert client.get("/api/docs").status_code == 401
