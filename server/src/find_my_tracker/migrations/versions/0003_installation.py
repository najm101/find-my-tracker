"""Per-installation values that must outlive any account, e.g. the Apple device identity.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "installation",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.LargeBinary(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("installation")
