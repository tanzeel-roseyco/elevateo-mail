"""Add workspace API tokens.

Revision ID: 016_add_workspace_api_tokens
Revises: 015_sent_email_nullable_campaign
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "016_add_workspace_api_tokens"
down_revision = "015_sent_email_nullable_campaign"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "workspace_api_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("token_prefix", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_ip", sa.String(length=64), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workspace_api_tokens_workspace_id", "workspace_api_tokens", ["workspace_id"])
    op.create_index("ix_workspace_api_tokens_created_by_user_id", "workspace_api_tokens", ["created_by_user_id"])
    op.create_index("ix_workspace_api_tokens_token_prefix", "workspace_api_tokens", ["token_prefix"], unique=True)
    op.create_index("ix_workspace_api_tokens_token_hash", "workspace_api_tokens", ["token_hash"], unique=True)
    op.create_index(
        "ix_workspace_api_tokens_workspace_active",
        "workspace_api_tokens",
        ["workspace_id", "is_active"],
    )


def downgrade():
    op.drop_index("ix_workspace_api_tokens_workspace_active", table_name="workspace_api_tokens")
    op.drop_index("ix_workspace_api_tokens_token_hash", table_name="workspace_api_tokens")
    op.drop_index("ix_workspace_api_tokens_token_prefix", table_name="workspace_api_tokens")
    op.drop_index("ix_workspace_api_tokens_created_by_user_id", table_name="workspace_api_tokens")
    op.drop_index("ix_workspace_api_tokens_workspace_id", table_name="workspace_api_tokens")
    op.drop_table("workspace_api_tokens")
