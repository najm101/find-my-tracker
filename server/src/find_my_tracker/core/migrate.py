"""Apply database migrations on startup, so upgrading the image upgrades the schema."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def alembic_config(url: str) -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    # ConfigParser interpolation would choke on `%` in URL-encoded passwords.
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return cfg


def upgrade_database(url: str) -> None:
    """Run in a worker thread: the migration environment starts its own event loop."""
    command.upgrade(alembic_config(url), "head")
