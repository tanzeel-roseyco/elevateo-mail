"""Add workflow and multichannel outreach tables.

Revision ID: 005_workflow
Revises: 004_refresh_tokens
Create Date: 2026-02-11

Tables added:
- outreach_accounts
- workflow_definitions
- workflow_nodes
- workflow_edges
- workflow_lead_states
- campaign_channel_accounts
- outreach_events
"""
from alembic import op
import sqlalchemy as sa

revision = "005_workflow"
down_revision = "004_refresh_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- outreach_accounts ---
    op.create_table(
        "outreach_accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("channel", sa.String(50), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("provider_account_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), server_default="connected", nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("profile_url", sa.String(500), nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("health_score", sa.Float(), server_default="1.0", nullable=False),
        sa.Column("daily_invitation_limit", sa.Integer(), nullable=True),
        sa.Column("daily_message_limit", sa.Integer(), nullable=True),
        sa.Column("meta_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("workspace_id", "provider_account_id", name="uq_outreach_account_provider"),
    )
    op.create_index("ix_outreach_accounts_workspace_id", "outreach_accounts", ["workspace_id"])

    # --- workflow_definitions ---
    op.create_table(
        "workflow_definitions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("campaign_id", sa.Uuid(), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schema_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("workflow_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("status", sa.String(50), server_default="draft", nullable=False),
        sa.Column("canonical_json", sa.JSON(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("campaign_id", "workflow_version", name="uq_workflow_campaign_version"),
    )
    op.create_index("ix_workflow_definitions_workspace_id", "workflow_definitions", ["workspace_id"])
    op.create_index("ix_workflow_definitions_campaign_id", "workflow_definitions", ["campaign_id"])

    # --- workflow_nodes ---
    op.create_table(
        "workflow_nodes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workflow_id", sa.Uuid(), sa.ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_id", sa.String(100), nullable=False),
        sa.Column("node_type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), server_default="", nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=True),
        sa.Column("position_x", sa.Float(), server_default="0", nullable=False),
        sa.Column("position_y", sa.Float(), server_default="0", nullable=False),
        sa.UniqueConstraint("workflow_id", "node_id", name="uq_workflow_node"),
    )
    op.create_index("ix_workflow_nodes_workflow_id", "workflow_nodes", ["workflow_id"])

    # --- workflow_edges ---
    op.create_table(
        "workflow_edges",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workflow_id", sa.Uuid(), sa.ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_node_id", sa.String(100), nullable=False),
        sa.Column("to_node_id", sa.String(100), nullable=False),
        sa.Column("condition", sa.String(50), server_default="always", nullable=False),
        sa.Column("edge_order", sa.Integer(), server_default="1", nullable=False),
        sa.UniqueConstraint("workflow_id", "from_node_id", "to_node_id", "condition", name="uq_workflow_edge"),
    )
    op.create_index("ix_workflow_edges_workflow_id", "workflow_edges", ["workflow_id"])

    # --- workflow_lead_states ---
    op.create_table(
        "workflow_lead_states",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("campaign_id", sa.Uuid(), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lead_id", sa.Uuid(), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workflow_id", sa.Uuid(), sa.ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("current_node_id", sa.String(100), nullable=True),
        sa.Column("status", sa.String(50), server_default="pending", nullable=False),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("execution_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("channel_state_json", sa.JSON(), nullable=True),
        sa.Column("context_json", sa.JSON(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("campaign_id", "lead_id", name="uq_workflow_lead_state"),
    )
    op.create_index("ix_workflow_lead_states_campaign_id", "workflow_lead_states", ["campaign_id"])
    op.create_index("ix_workflow_lead_states_lead_id", "workflow_lead_states", ["lead_id"])
    op.create_index("ix_workflow_lead_states_workflow_id", "workflow_lead_states", ["workflow_id"])
    op.create_index("ix_workflow_lead_state_due", "workflow_lead_states", ["status", "next_run_at"])
    op.create_index("ix_workflow_lead_states_next_run_at", "workflow_lead_states", ["next_run_at"])

    # --- campaign_channel_accounts ---
    op.create_table(
        "campaign_channel_accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("campaign_id", sa.Uuid(), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("outreach_account_id", sa.Uuid(), sa.ForeignKey("outreach_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("weight", sa.Integer(), server_default="1", nullable=False),
        sa.UniqueConstraint("campaign_id", "outreach_account_id", name="uq_campaign_channel_account"),
    )
    op.create_index("ix_campaign_channel_accounts_campaign_id", "campaign_channel_accounts", ["campaign_id"])
    op.create_index("ix_campaign_channel_accounts_outreach_account_id", "campaign_channel_accounts", ["outreach_account_id"])

    # --- outreach_events ---
    op.create_table(
        "outreach_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("campaign_id", sa.Uuid(), sa.ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lead_id", sa.Uuid(), sa.ForeignKey("leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("workflow_id", sa.Uuid(), sa.ForeignKey("workflow_definitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("node_id", sa.String(100), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("channel", sa.String(50), nullable=True),
        sa.Column("provider_event_id", sa.String(255), nullable=True),
        sa.Column("idempotency_key", sa.String(255), nullable=True, unique=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_outreach_events_workspace_id", "outreach_events", ["workspace_id"])
    op.create_index("ix_outreach_events_campaign_id", "outreach_events", ["campaign_id"])
    op.create_index("ix_outreach_events_lead_id", "outreach_events", ["lead_id"])
    op.create_index("ix_outreach_events_type_created", "outreach_events", ["event_type", "created_at"])


def downgrade() -> None:
    op.drop_table("outreach_events")
    op.drop_table("campaign_channel_accounts")
    op.drop_table("workflow_lead_states")
    op.drop_table("workflow_edges")
    op.drop_table("workflow_nodes")
    op.drop_table("workflow_definitions")
    op.drop_table("outreach_accounts")
