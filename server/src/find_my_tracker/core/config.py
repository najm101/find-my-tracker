"""Runtime configuration, read from environment variables."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

#: Long enough to survive a password spray against an internet-facing server.
MIN_PASSWORD_LENGTH = 12

#: Always allowed alongside ALLOWED_HOSTS, so the Docker healthcheck is not rejected.
LOOPBACK_HOSTS = ("localhost", "127.0.0.1", "[::1]")

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]
SameSite = Literal["strict", "lax", "none"]


class Settings(BaseSettings):
    """Everything a self-hoster can set. See README for the full list."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: SecretStr = Field(min_length=32)
    # Seeds the admin password on first boot only; afterwards it is changed in Settings and
    # this can be removed from the environment. See `admin_password_reset` to start over.
    # Deliberately has no minimum length: `MIN_PASSWORD_LENGTH` is enforced on passwords set
    # through the dashboard, but refusing to start would lock an upgrading self-hoster out of
    # their own server over a password that already worked. Startup warns instead.
    admin_password: SecretStr | None = None
    admin_password_reset: bool = False

    data_dir: Path = Path("/data")
    # postgresql://user:password@host:5432/db. Unset: SQLite at data_dir/tracker.db.
    database_url: str | None = None
    static_dir: Path | None = None
    anisette_url: str | None = None

    host: str = "0.0.0.0"  # noqa: S104 - runs inside a container
    port: int = 8080
    log_level: LogLevel = "INFO"
    demo_mode: bool = False

    # ---- exposure to the internet (see README: "Putting it on the internet") ----
    # Proxies whose X-Forwarded-For / -Proto we believe. A reverse proxy in another container
    # is not 127.0.0.1, so without this the client IP is the proxy's and every visitor shares
    # one rate-limit bucket. "*" trusts any peer: only safe when nothing else can reach the port.
    trusted_proxies: str | None = None
    # TLS terminates at the proxy, so the app cannot see it. Set this and the session cookie is
    # marked Secure, HSTS is sent, and the dashboard refuses to hand out cookies over plain HTTP.
    force_https: bool = False
    cookie_samesite: SameSite = "strict"
    # Host names this server answers to, comma-separated. Unset: any.
    allowed_hosts: str | None = None
    # Extra origins the browser may load map tiles and fonts from, comma-separated.
    extra_csp_sources: str | None = None
    # Serve /docs, /redoc and /openapi.json. Off by default: it is a map of the API for anyone
    # who finds the address.
    expose_api_docs: bool = False

    # ---- predicted routes (see README: "Predicted routes") ----
    # A Valhalla server to snap history to roads, e.g. http://valhalla:8002 for a container next to
    # this one. Set here, it is fixed: Settings shows it and cannot change it. Unset: chosen in
    # Settings, where the built-in engine is the other option.
    routing_url: str | None = None
    # The built-in engine's service listens on this loopback port...
    routing_builtin_port: int = 8002
    # ...and builds road data with this many threads (more is faster, and uses more memory).
    routing_build_threads: int = 2

    @property
    def database_path(self) -> Path:
        return self.data_dir / "tracker.db"

    @property
    def routing_dir(self) -> Path:
        return self.data_dir / "routing"

    @property
    def anisette_libs_path(self) -> Path:
        return self.data_dir / "anisette" / "ani_libs.bin"

    @property
    def host_allowlist(self) -> list[str]:
        """Host names to answer to. Loopback is always in: the container healthcheck uses it."""
        names = _split(self.allowed_hosts)
        return [*names, *LOOPBACK_HOSTS] if names else ["*"]

    @property
    def csp_extra_sources(self) -> list[str]:
        return _split(self.extra_csp_sources)

    @property
    def forwarded_allow_ips(self) -> str:
        """What uvicorn should believe. Its own default is 127.0.0.1, which is rarely right."""
        return self.trusted_proxies or "127.0.0.1,::1"


def _split(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").split(",") if part.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue] - values come from the environment
