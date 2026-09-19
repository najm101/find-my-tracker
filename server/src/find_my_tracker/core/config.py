"""Runtime configuration, read from environment variables."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR"]


class Settings(BaseSettings):
    """Everything a self-hoster can set. See README for the full list."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: SecretStr = Field(min_length=32)
    admin_password: SecretStr = Field(min_length=8)

    data_dir: Path = Path("/data")
    # postgresql://user:password@host:5432/db. Unset: SQLite at data_dir/tracker.db.
    database_url: str | None = None
    static_dir: Path | None = None
    anisette_url: str | None = None

    host: str = "0.0.0.0"  # noqa: S104 - runs inside a container
    port: int = 8080
    log_level: LogLevel = "INFO"
    demo_mode: bool = False

    @property
    def database_path(self) -> Path:
        return self.data_dir / "tracker.db"

    @property
    def anisette_libs_path(self) -> Path:
        return self.data_dir / "anisette" / "ani_libs.bin"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue] - values come from the environment
