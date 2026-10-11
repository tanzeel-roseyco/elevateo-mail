"""Merge migration heads into single lineage.

009_execution_mode branched off 008_add_execution_logs in parallel with
009_compliance.  This migration merges the two surviving heads so that
`alembic heads` returns exactly one revision.

Revision ID: 013_merge_heads
Revises: 009_execution_mode, 012_versioning_columns
Create Date: 2026-02-12
"""
from alembic import op

revision = "013_merge_heads"
down_revision = ("009_execution_mode", "012_versioning_columns")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
