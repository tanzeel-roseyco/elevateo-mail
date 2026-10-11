"""Add reliability columns: retry, idempotency, dead letter queue.

Revision ID: 011_reliability_columns
Revises: 009_compliance
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision = "011_reliability_columns"
down_revision = "009_compliance"
branch_labels = None
depends_on = None


def upgrade():
    # Add retry columns to workflow_lead_states
    op.add_column(
        "workflow_lead_states",
        sa.Column("retry_count", sa.Integer, server_default="0", nullable=False),
    )
    op.add_column(
        "workflow_lead_states",
        sa.Column("last_retry_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Add idempotency_key to workflow_execution_logs
    op.add_column(
        "workflow_execution_logs",
        sa.Column("idempotency_key", sa.String(255), nullable=True),
    )
    op.create_index(
        "ix_execution_log_idempotency",
        "workflow_execution_logs",
        ["idempotency_key"],
        unique=True,
    )

    # Create dead letter queue table
    op.create_table(
        "workflow_dead_letter_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False, index=True),
        sa.Column("workflow_id", UUID(as_uuid=True), sa.ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("lead_id", UUID(as_uuid=True), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("lead_state_id", UUID(as_uuid=True), sa.ForeignKey("workflow_lead_states.id", ondelete="CASCADE"), nullable=False),
        sa.Column("failed_node_id", sa.String(100), nullable=False),
        sa.Column("failure_count", sa.Integer, server_default="0", nullable=False),
        sa.Column("last_error", sa.Text, nullable=True),
        sa.Column("context_snapshot", JSON, nullable=True),
        sa.Column("status", sa.String(50), server_default="pending_review", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table("workflow_dead_letter_entries")
    op.drop_index("ix_execution_log_idempotency", "workflow_execution_logs")
    op.drop_column("workflow_execution_logs", "idempotency_key")
    op.drop_column("workflow_lead_states", "last_retry_at")
    op.drop_column("workflow_lead_states", "retry_count")
