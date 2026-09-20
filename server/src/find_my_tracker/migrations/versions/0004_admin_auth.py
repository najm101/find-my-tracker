"""Admin credentials in the database: argon2 password, TOTP, recovery codes, login audit.

Before this, the password lived only in `ADMIN_PASSWORD` and sessions could not be revoked.
The first boot after upgrading seeds `admin_credential` from that variable.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-20
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_credential",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("totp_secret_blob", sa.LargeBinary(), nullable=True),
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("totp_last_step", sa.Integer(), nullable=True),
        sa.Column("session_epoch", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.Integer(), nullable=False),
    )
    op.create_table(
        "recovery_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_digest", sa.String(64), nullable=False, unique=True),
        sa.Column("used_at", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.Integer(), nullable=False),
    )
    op.create_table(
        "login_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("at", sa.Integer(), nullable=False),
        sa.Column("client_ip", sa.String(64), nullable=False),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("outcome", sa.String(24), nullable=False),
    )
    op.create_index("ix_login_attempts_at", "login_attempts", ["at"])


def downgrade() -> None:
    op.drop_index("ix_login_attempts_at", table_name="login_attempts")
    op.drop_table("login_attempts")
    op.drop_table("recovery_codes")
    op.drop_table("admin_credential")
