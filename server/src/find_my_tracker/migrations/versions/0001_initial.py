"""Initial schema: account, beacons, locations (+ R*Tree), poll runs, settings.

Revision ID: 0001
Revises:
Create Date: 2026-09-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "apple_account",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("apple_id", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(200)),
        sa.Column("session_blob", sa.LargeBinary(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.Integer(), nullable=False),
    )
    op.create_table(
        "beacons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "apple_account_id",
            sa.Integer(),
            sa.ForeignKey("apple_account.id", ondelete="SET NULL"),
        ),
        sa.Column("apple_identifier", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("display_name", sa.String(200)),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("model", sa.String(100)),
        sa.Column("emoji", sa.String(16)),
        sa.Column("color", sa.String(16)),
        sa.Column("key_blob", sa.LargeBinary(), nullable=False),
        sa.Column("paired_at", sa.Integer()),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.Integer(), nullable=False),
    )
    op.create_table(
        "poll_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("trigger", sa.String(20), nullable=False),
        sa.Column("started_at", sa.Integer(), nullable=False),
        sa.Column("finished_at", sa.Integer()),
        sa.Column("outcome", sa.String(20)),
        sa.Column("beacons_polled", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reports_seen", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("new_locations", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text()),
    )
    op.create_index("ix_poll_runs_started_at", "poll_runs", ["started_at"])
    op.create_table(
        "locations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "beacon_id",
            sa.Integer(),
            sa.ForeignKey("beacons.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("observed_at", sa.Integer(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("accuracy_m", sa.Integer()),
        sa.Column("confidence", sa.Integer()),
        sa.Column("status_byte", sa.Integer()),
        sa.Column("fetched_at", sa.Integer(), nullable=False),
        sa.Column("poll_run_id", sa.Integer(), sa.ForeignKey("poll_runs.id", ondelete="SET NULL")),
        sa.UniqueConstraint("beacon_id", "observed_at"),
    )
    op.create_index("ix_locations_beacon_time", "locations", ["beacon_id", "observed_at"])
    op.create_table(
        "settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
    )

    # Spatial index for map-area and near-a-place queries. SQLite: an R*Tree kept in sync by
    # triggers so no application code can forget it (`id` mirrors locations.id). PostgreSQL
    # (added later; SQLite databases are unaffected): a plain composite index.
    if op.get_bind().dialect.name != "sqlite":
        op.create_index("ix_locations_lat_lon", "locations", ["latitude", "longitude"])
        return
    op.execute(
        "CREATE VIRTUAL TABLE locations_rtree USING rtree(id, min_lat, max_lat, min_lon, max_lon)"
    )
    op.execute(
        """
        CREATE TRIGGER locations_rtree_insert AFTER INSERT ON locations BEGIN
          INSERT INTO locations_rtree VALUES
            (new.id, new.latitude, new.latitude, new.longitude, new.longitude);
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER locations_rtree_delete AFTER DELETE ON locations BEGIN
          DELETE FROM locations_rtree WHERE id = old.id;
        END
        """
    )


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        op.execute("DROP TRIGGER IF EXISTS locations_rtree_delete")
        op.execute("DROP TRIGGER IF EXISTS locations_rtree_insert")
        op.execute("DROP TABLE IF EXISTS locations_rtree")
    else:
        op.drop_index("ix_locations_lat_lon", "locations")
    op.drop_table("settings")
    op.drop_index("ix_locations_beacon_time", "locations")
    op.drop_table("locations")
    op.drop_index("ix_poll_runs_started_at", "poll_runs")
    op.drop_table("poll_runs")
    op.drop_table("beacons")
    op.drop_table("apple_account")
