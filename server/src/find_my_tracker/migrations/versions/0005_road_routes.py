"""Road routes: a beacon can be marked as living in a vehicle, and matched trips are cached.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("beacons") as batch:
        batch.add_column(
            sa.Column("vehicle", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    op.create_table(
        "route_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "beacon_id",
            sa.Integer(),
            sa.ForeignKey("beacons.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("trip_start", sa.Integer(), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.UniqueConstraint("beacon_id", "trip_start"),
    )


def downgrade() -> None:
    op.drop_table("route_cache")
    with op.batch_alter_table("beacons") as batch:
        batch.drop_column("vehicle")
