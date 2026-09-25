from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse

from find_my_tracker.core.deps import ContainerDep, SessionDep
from find_my_tracker.core.security import page_csp
from find_my_tracker.features.auth.dependencies import AdminDep
from find_my_tracker.features.settings.schemas import AppSettings, SettingsUpdate
from find_my_tracker.features.settings.service import SettingsService

router = APIRouter(prefix="/settings", tags=["settings"])
docs_router = APIRouter(prefix="/docs", include_in_schema=False)

#: Where the web build puts Swagger UI (web/vite.config.ts).
SWAGGER_UI = "/api-docs"


@router.get("")
async def get_settings(_: AdminDep, session: SessionDep) -> AppSettings:
    return await SettingsService(session).get()


@router.patch("")
async def update_settings(
    body: SettingsUpdate, _: AdminDep, session: SessionDep, container: ContainerDep
) -> AppSettings:
    updated = await SettingsService(session).update(body)
    container.poller.reschedule()  # a new interval takes effect now, not after the old one
    return updated


@docs_router.get("")
async def api_docs(_: AdminDep, session: SessionDep) -> HTMLResponse:
    """Swagger UI for this API, while Settings has it on."""
    await SettingsService(session).require_api_docs()
    page = get_swagger_ui_html(
        openapi_url="/api/docs/openapi.json",
        title="Find My Tracker API",
        swagger_js_url=f"{SWAGGER_UI}/swagger-ui-bundle.js",
        swagger_css_url=f"{SWAGGER_UI}/swagger-ui.css",
        swagger_favicon_url="/icon.svg",
        # Its default checks the schema with validator.swagger.io: nothing leaves this server.
        swagger_ui_parameters={"validatorUrl": None},
    )
    html = bytes(page.body).decode()
    return HTMLResponse(html, headers={"content-security-policy": page_csp(html)})


@docs_router.get("/openapi.json")
async def api_schema(_: AdminDep, session: SessionDep, request: Request) -> dict[str, Any]:
    await SettingsService(session).require_api_docs()
    return request.app.openapi()
