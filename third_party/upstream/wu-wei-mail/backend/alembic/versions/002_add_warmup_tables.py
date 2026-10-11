"""Add warmup tables.

Revision ID: 002_warmup
Revises: 001_prospecting
Create Date: 2026-02-07

Tables added:
- warmup_programs
- warmup_account_states
- warmup_provider_links
- warmup_actions
- warmup_daily_metrics
- warmup_seed_identities
"""
from alembic import op
import sqlalchemy as sa

revision = "002_warmup"
down_revision = "001_prospecting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- warmup_programs ---
    op.create_table(
        "warmup_programs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("mode", sa.String(50), server_default="managed", nullable=False),
        sa.Column("default_target_volume", sa.Integer(), server_default=sa.text("50"), nullable=False),
        sa.Column("ramp_increment_per_day", sa.Integer(), server_default=sa.text("3"), nullable=False),
        sa.Column("max_daily_warmup", sa.Integer(), server_default=sa.text("200"), nullable=False),
        sa.Column("dns_required", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("auto_pause_on_bounce_rate", sa.Float(), server_default=sa.text("0.08"), nullable=False),
        sa.Column("auto_pause_on_complaint_rate", sa.Float(), server_default=sa.text("0.003"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("workspace_id", name="uq_warmup_program_workspace"),
    )
    op.create_index("ix_warmup_programs_workspace_id", "warmup_programs", ["workspace_id"])

    # --- warmup_account_states ---
    op.create_table(
        "warmup_account_states",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("account_id", sa.Uuid(), sa.ForeignKey("email_accounts.id"), nullable=False),
        sa.Column("program_id", sa.Uuid(), sa.ForeignKey("warmup_programs.id"), nullable=False),
        sa.Column("phase", sa.String(50), server_default="enrolling", nullable=False),
        sa.Column("target_volume", sa.Integer(), server_default=sa.text("50"), nullable=False),
        sa.Column("current_allowed_volume", sa.Integer(), server_default=sa.text("5"), nullable=False),
        sa.Column("actual_sent_today", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("warmup_health_score", sa.Float(), server_default=sa.text("1.0"), nullable=False),
        sa.Column("inbox_placement_rate", sa.Float(), server_default=sa.text("1.0"), nullable=False),
        sa.Column("phase_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("enrolled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("graduated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pause_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("workspace_id", "account_id", name="uq_warmup_account_state"),
    )
    op.create_index("ix_warmup_account_states_workspace_id", "warmup_account_states", ["workspace_id"])
    op.create_index("ix_warmup_account_states_account_id", "warmup_account_states", ["account_id"])
    op.create_index("ix_warmup_account_states_phase", "warmup_account_states", ["phase"])

    # --- warmup_provider_links ---
    op.create_table(
        "warmup_provider_links",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("account_state_id", sa.Uuid(), sa.ForeignKey("warmup_account_states.id"), nullable=False),
        sa.Column("provider_name", sa.String(50), nullable=False),
        sa.Column("provider_account_id", sa.String(255), nullable=False),
        sa.Column("provider_status", sa.String(50), nullable=True),
        sa.Column("sync_status", sa.String(50), server_default="pending", nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("provider_name", "provider_account_id", name="uq_warmup_provider_link"),
    )
    op.create_index("ix_warmup_provider_links_workspace_id", "warmup_provider_links", ["workspace_id"])
    op.create_index("ix_warmup_provider_links_account_state_id", "warmup_provider_links", ["account_state_id"])

    # --- warmup_actions ---
    op.create_table(
        "warmup_actions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("account_state_id", sa.Uuid(), sa.ForeignKey("warmup_account_states.id"), nullable=False),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), server_default="executed", nullable=False),
        sa.Column("source", sa.String(50), server_default="system", nullable=False),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_warmup_actions_workspace_id", "warmup_actions", ["workspace_id"])
    op.create_index("ix_warmup_actions_account_state_id", "warmup_actions", ["account_state_id"])

    # --- warmup_daily_metrics ---
    op.create_table(
        "warmup_daily_metrics",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("account_state_id", sa.Uuid(), sa.ForeignKey("warmup_account_states.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("sent", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("delivered", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("opened", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("replied", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("bounced", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("spam_reported", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("inbox_placed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("spam_placed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("account_state_id", "date", name="uq_warmup_daily_metric"),
    )
    op.create_index("ix_warmup_daily_metrics_workspace_id", "warmup_daily_metrics", ["workspace_id"])
    op.create_index("ix_warmup_daily_metrics_account_state_id", "warmup_daily_metrics", ["account_state_id"])

    # --- warmup_seed_identities ---
    op.create_table(
        "warmup_seed_identities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("provider", sa.String(50), nullable=True),
        sa.Column("pool_type", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_warmup_seed_identities_workspace_id", "warmup_seed_identities", ["workspace_id"])
    op.create_index("ix_warmup_seed_identities_email", "warmup_seed_identities", ["email"])


def downgrade() -> None:
    op.drop_table("warmup_seed_identities")
    op.drop_table("warmup_daily_metrics")
    op.drop_table("warmup_actions")
    op.drop_table("warmup_provider_links")
    op.drop_table("warmup_account_states")
    op.drop_table("warmup_programs")
