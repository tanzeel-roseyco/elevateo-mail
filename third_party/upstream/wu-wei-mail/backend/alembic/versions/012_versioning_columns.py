"""Add rollout_percentage to workflow_definitions for partial rollout support.

Revision ID: 012_versioning_columns
Revises: 011_reliability_columns
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa

revision = "012_versioning_columns"
down_revision = "011_reliability_columns"
branch_labels = None
depends_on = None


def upgrade():
    # Add rollout_percentage column (default 100 = all leads enter)
    # Using server_default for safety on existing rows
    op.add_column(
        "workflow_definitions",
        sa.Column(
            "rollout_percentage",
            sa.Integer,
            server_default="100",
            nullable=False,
        ),
    )


def downgrade():
    op.drop_column("workflow_definitions", "rollout_percentage")
