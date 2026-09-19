"""Keep the iCloud Keychain keys so adding beacons later needs no sign-in or passcode.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("apple_account") as batch:
        batch.add_column(sa.Column("keychain_blob", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("apple_account") as batch:
        batch.drop_column("keychain_blob")
