"""Add execution_mode to campaigns.

Revision ID: 009_execution_mode
Revises: 008_add_execution_logs
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa

revision = "009_execution_mode"
down_revision = "008_add_execution_logs"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "campaigns",
        sa.Column("execution_mode", sa.String(20), server_default="sequence", nullable=False),
    )


def downgrade():
    op.drop_column("campaigns", "execution_mode")
