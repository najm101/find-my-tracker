"""Application factory: builds the container, applies migrations, starts the poller."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from starlette.middleware.trustedhost import TrustedHostMiddleware

from find_my_tracker.core.clock import Clock
from find_my_tracker.core.config import Settings, get_settings
from find_my_tracker.core.container import Container
from find_my_tracker.core.crypto import SecretBox
from find_my_tracker.core.database import Database, resolve_database_url
from find_my_tracker.core.errors import install_error_handlers
from find_my_tracker.core.migrate import upgrade_database
from find_my_tracker.core.security import ContentSecurityPolicy, SecurityHeadersMiddleware
from find_my_tracker.core.spa import mount_spa
from find_my_tracker.features.apple_account.identity import DeviceIdentityService
from find_my_tracker.features.apple_account.router import router as apple_router
from find_my_tracker.features.apple_account.wizard import WizardManager
from find_my_tracker.features.auth.router import router as auth_router
from find_my_tracker.features.auth.service import AdminAuth, AuthService, LoginRateLimiter
from find_my_tracker.features.beacons.router import router as beacons_router
from find_my_tracker.features.health.router import router as health_router
from find_my_tracker.features.locations.router import router as locations_router
from find_my_tracker.features.routing.jobs import Matcher, cache_in
from find_my_tracker.features.routing.router import router as routing_router
from find_my_tracker.features.routing.runtime import RoutingRuntime
from find_my_tracker.features.routing.schemas import RoutingMode
from find_my_tracker.features.routing.service import RoutingService
from find_my_tracker.features.settings.router import docs_router
from find_my_tracker.features.settings.router import router as settings_router
from find_my_tracker.features.tracking.poller import STARTUP_DELAY_SECONDS, Poller
from find_my_tracker.features.tracking.router import router as tracking_router
from find_my_tracker.features.tracking.service import PollService
from find_my_tracker.integrations.apple.types import AppleClientFactory
from find_my_tracker.integrations.valhalla.builtin import (
    BuiltinEngine,
    Toolchain,
    ValhallaToolchain,
)
from find_my_tracker.integrations.valhalla.regions import RegionCatalog
from find_my_tracker.integrations.valhalla.types import Valhalla


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
    routing_tools: Toolchain | None = None,
    routing_catalog: RegionCatalog | None = None,
    routing_connect: Callable[[str], Valhalla] | None = None,
) -> Container:
    clock = clock or Clock()
    secret = settings.secret_key.get_secret_value()
    db = Database(resolve_database_url(settings.database_url, settings.database_path))
    secrets = SecretBox(secret)
    apple = apple or _default_apple_factory(settings)
    poll_service = PollService(db, apple, secrets, clock)
    tools = routing_tools or ValhallaToolchain(
        port=settings.routing_builtin_port, threads=settings.routing_build_threads
    )
    routing = RoutingRuntime(
        env_url=settings.routing_url,
        builtin=BuiltinEngine(settings.routing_dir, tools),
        catalog=routing_catalog or RegionCatalog(settings.routing_dir / "geofabrik-index.json"),
        matcher=Matcher(cache_in(db, clock)),
        **({"connect": routing_connect} if routing_connect else {}),
    )
    container = Container(
        settings=settings,
        clock=clock,
        db=db,
        secrets=secrets,
        apple=apple,
        device_identity=DeviceIdentityService(db, secrets, apple),
        auth=AdminAuth(secret_key=secret, secrets=secrets),
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
        routing=routing,
    )

    async def after_poll() -> None:
        async with db.session() as session:
            await RoutingService(session, container).ensure_coverage()

    container.poller.after_poll = after_poll
    return container


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    settings = settings or get_settings()
    container = container or build_container(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(upgrade_database, container.db.url)
        async with container.db.session() as session:
            await AuthService(session, container.auth, container.clock).load(
                settings.admin_password.get_secret_value() if settings.admin_password else None,
                reset=settings.admin_password_reset,
            )
        await container.device_identity.load()
        async with container.db.session() as session:
            routing = RoutingService(session, container)
            if (await routing.config()).mode is RoutingMode.BUILTIN:
                await container.routing.use_builtin(True)
        container.poller.start()
        try:
            yield
        finally:
            await container.poller.stop()
            await container.routing.close()
            await container.wizards.discard()
            await container.db.dispose()

    # The API documentation is only for the signed-in admin, and only while Settings says so:
    # /api/docs (features/settings). A public /docs would be a map of the API for anyone.
    app = FastAPI(
        title="Find My Tracker",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.container = container
    install_error_handlers(app)
    _install_middleware(app, settings)

    api = APIRouter(prefix="/api")
    for router in (
        health_router,
        auth_router,
        apple_router,
        beacons_router,
        locations_router,
        tracking_router,
        settings_router,
        docs_router,
        routing_router,
    ):
        api.include_router(router)
    app.include_router(api)

    if settings.static_dir and (settings.static_dir / "index.html").is_file():
        mount_spa(app, settings.static_dir)

    return app


def _install_middleware(app: FastAPI, settings: Settings) -> None:
    """Outermost first: headers wrap everything, the host check rejects before any work."""
    index = settings.static_dir / "index.html" if settings.static_dir else None
    app.add_middleware(
        SecurityHeadersMiddleware,
        csp=ContentSecurityPolicy(index, extra_sources=settings.csp_extra_sources),
        force_https=settings.force_https,
    )
    if settings.allowed_hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.host_allowlist)
