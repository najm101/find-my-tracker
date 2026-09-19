"""Apply database migrations on startup, so upgrading the image upgrades the schema."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from find_my_tracker.core.database import sqlite_url

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def alembic_config(db_path: Path) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    cfg.set_main_option("sqlalchemy.url", sqlite_url(db_path, driver="pysqlite"))
    return cfg


def upgrade_database(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    command.upgrade(alembic_config(db_path), "head")
