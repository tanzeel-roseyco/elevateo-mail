"""Add workflow execution logs table.

Revision ID: 008_add_execution_logs
Revises: 007_workflow_top_level
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa

revision = "008_add_execution_logs"
down_revision = "007_workflow_top_level"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflow_execution_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "workflow_id",
            sa.Uuid(),
            sa.ForeignKey("workflow_definitions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "lead_id",
            sa.Uuid(),
            sa.ForeignKey("leads.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("node_id", sa.String(100), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("input_snapshot", sa.JSON(), nullable=True),
        sa.Column("output_snapshot", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_execution_log_workflow_node",
        "workflow_execution_logs",
        ["workflow_id", "node_id"],
    )
    op.create_index(
        "ix_execution_log_lead",
        "workflow_execution_logs",
        ["lead_id", "started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_execution_log_lead", table_name="workflow_execution_logs")
    op.drop_index("ix_execution_log_workflow_node", table_name="workflow_execution_logs")
    op.drop_table("workflow_execution_logs")
