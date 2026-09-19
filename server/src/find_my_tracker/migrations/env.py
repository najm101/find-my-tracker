"""Alembic environment. Runs synchronously against SQLite (pysqlite driver)."""

from __future__ import annotations

from alembic import context
from sqlalchemy import create_engine

from find_my_tracker.core import models  # noqa: F401 - registers every table
from find_my_tracker.core.database import Base

config = context.config
url = config.get_main_option("sqlalchemy.url")


def run() -> None:
    if context.is_offline_mode():
        context.configure(url=url, target_metadata=Base.metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
        return

    engine = create_engine(url)  # pyright: ignore[reportArgumentType]
    with engine.connect() as connection:
        context.configure(
            connection=connection, target_metadata=Base.metadata, render_as_batch=True
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run()
