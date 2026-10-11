"""Add compliance tables.

Revision ID: 009_compliance
Revises: 008_add_execution_logs
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON

revision = "009_compliance"
down_revision = "008_add_execution_logs"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "compliance_policies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False, index=True),
        sa.Column("policy_type", sa.String(50), nullable=False),
        sa.Column("config_json", JSON, nullable=True),
        sa.Column("priority", sa.Integer, default=0),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "contact_touches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False, index=True),
        sa.Column("lead_id", UUID(as_uuid=True), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("channel", sa.String(50), nullable=False),
        sa.Column("touch_type", sa.String(50), nullable=False),
        sa.Column("workflow_id", UUID(as_uuid=True), sa.ForeignKey("workflow_definitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("campaign_id", UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True),
        sa.Column("node_id", sa.String(100), nullable=True),
        sa.Column("touched_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_contact_touch_lead_window", "contact_touches", ["lead_id", "touched_at"])
    op.create_index("ix_contact_touch_workspace_lead", "contact_touches", ["workspace_id", "lead_id"])
    op.create_table(
        "frequency_control_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False, unique=True),
        sa.Column("max_touches_per_7d", sa.Integer, default=5),
        sa.Column("max_touches_per_30d", sa.Integer, default=15),
        sa.Column("min_channel_gap_hours", JSON, nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )


def downgrade():
    op.drop_table("frequency_control_configs")
    op.drop_index("ix_contact_touch_workspace_lead", "contact_touches")
    op.drop_index("ix_contact_touch_lead_window", "contact_touches")
    op.drop_table("contact_touches")
    op.drop_table("compliance_policies")
