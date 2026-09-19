"""Alembic environment. Runs on the app's async driver (aiosqlite or asyncpg)."""

from __future__ import annotations

import asyncio

from alembic import context
from sqlalchemy import Connection, pool
from sqlalchemy.ext.asyncio import create_async_engine

from find_my_tracker.core import models  # noqa: F401 - registers every table
from find_my_tracker.core.database import Base

config = context.config
url = config.get_main_option("sqlalchemy.url")


def _migrate(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


async def _run_online() -> None:
    engine = create_async_engine(url, poolclass=pool.NullPool)  # pyright: ignore[reportArgumentType]
    async with engine.connect() as connection:
        await connection.run_sync(_migrate)
    await engine.dispose()


def run() -> None:
    if context.is_offline_mode():
        context.configure(url=url, target_metadata=Base.metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
        return
    asyncio.run(_run_online())


run()
