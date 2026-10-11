"""Add refresh_tokens table for rotating session tokens.

Revision ID: 004_refresh_tokens
Revises: 003_email_account_uq
Create Date: 2026-02-09
"""
from alembic import op
import sqlalchemy as sa

revision = "004_refresh_tokens"
down_revision = "003_email_account_uq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), default=False),
        sa.Column("replaced_by", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_refresh_token_hash", "refresh_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_refresh_token_hash", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
