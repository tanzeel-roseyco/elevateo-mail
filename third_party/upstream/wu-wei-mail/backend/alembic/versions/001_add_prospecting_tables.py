"""Add prospecting tables.

Revision ID: 001_prospecting
Revises: 000_baseline
Create Date: 2026-02-06

Tables added:
- prospecting_conversations
- prospecting_runs
- prospecting_partitions
- prospecting_leads
- prospecting_messages
- prospecting_actions
- prospecting_tool_outputs
- agent_model_policies
- workspace_integration_secrets
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001_prospecting"
down_revision = "000_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- prospecting_conversations ---
    op.create_table(
        "prospecting_conversations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("stage", sa.String(50), server_default="DISCOVERY", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_prospecting_conversations_workspace_id", "prospecting_conversations", ["workspace_id"])

    # --- prospecting_runs ---
    op.create_table(
        "prospecting_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), sa.ForeignKey("prospecting_conversations.id"), nullable=False),
        sa.Column("run_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), server_default="pending", nullable=False),
        sa.Column("icp_criteria", sa.JSON(), nullable=True),
        sa.Column("source_strategy", sa.JSON(), nullable=True),
        sa.Column("progress", sa.JSON(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_prospecting_runs_workspace_id", "prospecting_runs", ["workspace_id"])
    op.create_index("ix_prospecting_runs_conversation_id", "prospecting_runs", ["conversation_id"])
    op.create_index("ix_prospecting_runs_status", "prospecting_runs", ["status"])

    # --- prospecting_partitions ---
    op.create_table(
        "prospecting_partitions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("prospecting_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_name", sa.String(100), nullable=False),
        sa.Column("partition_key", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), server_default="pending", nullable=False),
        sa.Column("result_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_prospecting_partitions_workspace_id", "prospecting_partitions", ["workspace_id"])
    op.create_index("ix_prospecting_partitions_run_id", "prospecting_partitions", ["run_id"])
    op.create_index("ix_prospecting_partitions_status", "prospecting_partitions", ["status"])

    # --- prospecting_leads ---
    op.create_table(
        "prospecting_leads",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("prospecting_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("first_name", sa.String(255), nullable=True),
        sa.Column("last_name", sa.String(255), nullable=True),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("linkedin_url", sa.String(500), nullable=True),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column("city", sa.String(255), nullable=True),
        sa.Column("state", sa.String(255), nullable=True),
        sa.Column("country", sa.String(255), nullable=True),
        sa.Column("industry", sa.String(255), nullable=True),
        sa.Column("domain", sa.String(255), nullable=True),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column("quality_components", sa.JSON(), nullable=True),
        sa.Column("readiness_band", sa.String(50), nullable=True),
        sa.Column("email_confidence", sa.Float(), nullable=True),
        sa.Column("source_name", sa.String(100), nullable=True),
        sa.Column("enrichment_data", sa.JSON(), nullable=True),
        sa.Column("is_excluded", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("exclusion_reason", sa.String(100), nullable=True),
        sa.Column("exclusion_detail", sa.Text(), nullable=True),
        sa.Column("is_selected", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("imported_lead_id", sa.Uuid(), sa.ForeignKey("leads.id"), nullable=True),
        sa.Column("raw_data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_prospecting_leads_workspace_id", "prospecting_leads", ["workspace_id"])
    op.create_index("ix_prospecting_leads_run_id", "prospecting_leads", ["run_id"])
    op.create_index("ix_prospecting_leads_email", "prospecting_leads", ["email"])
    op.create_index("ix_prospecting_leads_ws_email", "prospecting_leads", ["workspace_id", "email"])

    # --- prospecting_messages ---
    op.create_table(
        "prospecting_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), sa.ForeignKey("prospecting_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("agent_type", sa.String(50), nullable=True),
        sa.Column("model_used", sa.String(100), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_prospecting_messages_workspace_id", "prospecting_messages", ["workspace_id"])
    op.create_index("ix_prospecting_messages_conversation_id", "prospecting_messages", ["conversation_id"])

    # --- prospecting_actions ---
    op.create_table(
        "prospecting_actions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), sa.ForeignKey("prospecting_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action_type", sa.String(100), nullable=False),
        sa.Column("status", sa.String(50), server_default="pending", nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("approved_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_prospecting_actions_workspace_id", "prospecting_actions", ["workspace_id"])
    op.create_index("ix_prospecting_actions_conversation_id", "prospecting_actions", ["conversation_id"])
    op.create_index("ix_prospecting_actions_status", "prospecting_actions", ["status"])

    # --- prospecting_tool_outputs ---
    op.create_table(
        "prospecting_tool_outputs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("prospecting_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("message_id", sa.Uuid(), sa.ForeignKey("prospecting_messages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tool_name", sa.String(100), nullable=False),
        sa.Column("input_data", sa.JSON(), nullable=True),
        sa.Column("output_data", sa.JSON(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("is_error", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_prospecting_tool_outputs_workspace_id", "prospecting_tool_outputs", ["workspace_id"])
    op.create_index("ix_prospecting_tool_outputs_run_id", "prospecting_tool_outputs", ["run_id"])

    # --- agent_model_policies ---
    op.create_table(
        "agent_model_policies",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("agent_type", sa.String(50), nullable=False),
        sa.Column("provider", sa.String(50), server_default="openrouter", nullable=False),
        sa.Column("model_id", sa.String(200), nullable=False),
        sa.Column("temperature", sa.Float(), server_default=sa.text("0.7"), nullable=False),
        sa.Column("max_tokens", sa.Integer(), server_default=sa.text("4096"), nullable=False),
        sa.Column("fallback_model_id", sa.String(200), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("workspace_id", "agent_type", name="uq_workspace_agent_policy"),
    )
    op.create_index("ix_agent_model_policies_workspace_id", "agent_model_policies", ["workspace_id"])

    # --- workspace_integration_secrets ---
    op.create_table(
        "workspace_integration_secrets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("integration_type", sa.String(100), nullable=False),
        sa.Column("key_name", sa.String(100), nullable=False),
        sa.Column("encrypted_value", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("workspace_id", "integration_type", "key_name", name="uq_workspace_integration_key"),
    )
    op.create_index("ix_workspace_integration_secrets_workspace_id", "workspace_integration_secrets", ["workspace_id"])


def downgrade() -> None:
    op.drop_table("workspace_integration_secrets")
    op.drop_table("agent_model_policies")
    op.drop_table("prospecting_tool_outputs")
    op.drop_table("prospecting_actions")
    op.drop_table("prospecting_messages")
    op.drop_table("prospecting_leads")
    op.drop_table("prospecting_partitions")
    op.drop_table("prospecting_runs")
    op.drop_table("prospecting_conversations")
