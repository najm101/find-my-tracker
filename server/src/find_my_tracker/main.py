"""Application factory: builds the container, applies migrations, starts the poller."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from find_my_tracker.core.clock import Clock
from find_my_tracker.core.config import Settings, get_settings
from find_my_tracker.core.container import Container
from find_my_tracker.core.crypto import SecretBox
from find_my_tracker.core.database import Database, resolve_database_url
from find_my_tracker.core.errors import install_error_handlers
from find_my_tracker.core.migrate import upgrade_database
from find_my_tracker.core.spa import mount_spa
from find_my_tracker.features.apple_account.identity import DeviceIdentityService
from find_my_tracker.features.apple_account.router import router as apple_router
from find_my_tracker.features.apple_account.wizard import WizardManager
from find_my_tracker.features.auth.router import router as auth_router
from find_my_tracker.features.auth.service import AdminAuth, LoginRateLimiter
from find_my_tracker.features.beacons.router import router as beacons_router
from find_my_tracker.features.health.router import router as health_router
from find_my_tracker.features.locations.router import router as locations_router
from find_my_tracker.features.settings.router import router as settings_router
from find_my_tracker.features.tracking.poller import STARTUP_DELAY_SECONDS, Poller
from find_my_tracker.features.tracking.router import router as tracking_router
from find_my_tracker.features.tracking.service import PollService
from find_my_tracker.integrations.apple.types import AppleClientFactory


def _default_apple_factory(settings: Settings) -> AppleClientFactory:
    if settings.demo_mode:
        from find_my_tracker.integrations.apple.demo import DemoAppleClientFactory

        return DemoAppleClientFactory()
    from find_my_tracker.integrations.apple.gateway import FindMyPyClientFactory

    return FindMyPyClientFactory(
        anisette_url=settings.anisette_url, anisette_libs_path=settings.anisette_libs_path
    )


def build_container(
    settings: Settings,
    *,
    apple: AppleClientFactory | None = None,
    clock: Clock | None = None,
    poller_startup_delay: float | None = None,
) -> Container:
    clock = clock or Clock()
    secret = settings.secret_key.get_secret_value()
    db = Database(resolve_database_url(settings.database_url, settings.database_path))
    secrets = SecretBox(secret)
    apple = apple or _default_apple_factory(settings)
    poll_service = PollService(db, apple, secrets, clock)
    return Container(
        settings=settings,
        clock=clock,
        db=db,
        secrets=secrets,
        apple=apple,
        device_identity=DeviceIdentityService(db, secrets, apple),
        auth=AdminAuth(password=settings.admin_password.get_secret_value(), secret_key=secret),
        login_limiter=LoginRateLimiter(),
        wizards=WizardManager(),
        poller=Poller(
            poll_service,
            db,
            clock,
            startup_delay=(
                STARTUP_DELAY_SECONDS if poller_startup_delay is None else poller_startup_delay
            ),
        ),
    )


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    container = container or build_container(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(upgrade_database, container.db.url)
        await container.device_identity.load()
        container.poller.start()
        try:
            yield
        finally:
            await container.poller.stop()
            await container.wizards.discard()
            await container.db.dispose()

    app = FastAPI(title="Find My Tracker", lifespan=lifespan)
    app.state.container = container
    install_error_handlers(app)

    api = APIRouter(prefix="/api")
    for router in (
        health_router,
        auth_router,
        apple_router,
        beacons_router,
        locations_router,
        tracking_router,
        settings_router,
    ):
        api.include_router(router)
    app.include_router(api)

    if settings.static_dir and (settings.static_dir / "index.html").is_file():
        mount_spa(app, settings.static_dir)

    return app
