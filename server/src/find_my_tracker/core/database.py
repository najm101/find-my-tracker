"""Engine, session factory and the declarative base shared by every feature.

SQLite in the data directory by default; PostgreSQL when `DATABASE_URL` is set.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from sqlalchemy import MetaData, event, make_url
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def sqlite_url(path: Path) -> str:
    return f"sqlite+aiosqlite:///{path}"


def resolve_database_url(database_url: str | None, sqlite_path: Path) -> str:
    """The async SQLAlchemy URL: `DATABASE_URL` if given, else SQLite at `sqlite_path`.

    Accepts the plain `postgres://` / `postgresql://` URLs that hosting panels hand out.
    """
    if not database_url:
        return sqlite_url(sqlite_path)
    url = make_url(database_url)
    if url.get_backend_name() in ("postgres", "postgresql"):
        url = url.set(drivername="postgresql+asyncpg")
    return url.render_as_string(hide_password=False)


def insert_for(session: AsyncSession, entity: type[Base]) -> sqlite.Insert | postgresql.Insert:
    """A dialect-specific INSERT, for `ON CONFLICT` clauses."""
    if session.get_bind().dialect.name == "postgresql":
        return postgresql.insert(entity)
    return sqlite.insert(entity)


def _apply_pragmas(dbapi_connection: Any, _: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


class Database:
    """Owns the engine and hands out sessions. One per process."""

    def __init__(self, url: str) -> None:
        self.url = url
        if make_url(url).get_backend_name() == "sqlite":
            self.engine: AsyncEngine = create_async_engine(url)
            event.listen(self.engine.sync_engine, "connect", _apply_pragmas)
        else:
            self.engine = create_async_engine(url, pool_pre_ping=True)
        self._sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    def session(self) -> AsyncSession:
        return self._sessions()

    async def sessions(self) -> AsyncIterator[AsyncSession]:
        async with self._sessions() as session:
            yield session

    async def dispose(self) -> None:
        await self.engine.dispose()
