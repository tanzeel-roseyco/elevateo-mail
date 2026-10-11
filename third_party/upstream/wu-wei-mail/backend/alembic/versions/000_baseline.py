"""Baseline migration — all core tables.

Revision ID: 000_baseline
Revises: None
Create Date: 2026-02-07

Core tables:
- workspaces, users, email_accounts
- leads, lead_lists, lead_list_members
- templates, campaigns, campaign_leads, campaign_accounts
- sequences, steps, variants, conditions
- sent_emails, email_events, inbox_messages
- suppression_list, analytics_snapshots
- auto_responder_configs, responder_regions, responder_rules
- responder_notes, responder_logs
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "000_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- workspaces ---
    op.create_table(
        "workspaces",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False, unique=True),
        sa.Column("plan", sa.String(50), nullable=False, server_default="free"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="UTC"),
        sa.Column("unsubscribe_text", sa.Text(), nullable=True, server_default=""),
        sa.Column("gdpr_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("can_spam_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_workspaces_slug", "workspaces", ["slug"])

    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="member"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_workspace_id", "users", ["workspace_id"])
    op.create_index("ix_users_email", "users", ["email"])

    # --- email_accounts ---
    op.create_table(
        "email_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("smtp_host", sa.String(255), nullable=True),
        sa.Column("smtp_port", sa.Integer(), nullable=False, server_default="587"),
        sa.Column("smtp_username", sa.String(255), nullable=True),
        sa.Column("smtp_password", sa.Text(), nullable=True),
        sa.Column("smtp_use_tls", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("imap_host", sa.String(255), nullable=True),
        sa.Column("imap_port", sa.Integer(), nullable=False, server_default="993"),
        sa.Column("imap_username", sa.String(255), nullable=True),
        sa.Column("imap_password", sa.Text(), nullable=True),
        sa.Column("daily_limit", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("sent_today", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("health_score", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("warmup_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("warmup_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("provider", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("oauth_refresh_token", sa.Text(), nullable=True),
        sa.Column("oauth_access_token", sa.Text(), nullable=True),
        sa.Column("oauth_token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_email", sa.String(320), nullable=True),
        sa.Column("spf_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("dkim_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("dmarc_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_email_accounts_workspace_id", "email_accounts", ["workspace_id"])
    op.create_index("ix_email_accounts_email", "email_accounts", ["email"])

    # --- leads ---
    op.create_table(
        "leads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
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
        sa.Column("custom_fields", postgresql.JSON(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("workspace_id", "email", name="uq_lead_workspace_email"),
    )
    op.create_index("ix_leads_workspace_id", "leads", ["workspace_id"])
    op.create_index("ix_leads_email", "leads", ["email"])

    # --- lead_lists ---
    op.create_table(
        "lead_lists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_lead_lists_workspace_id", "lead_lists", ["workspace_id"])

    # --- lead_list_members ---
    op.create_table(
        "lead_list_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("lead_list_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("lead_lists.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("lead_list_id", "lead_id", name="uq_list_lead"),
    )
    op.create_index("ix_lead_list_members_lead_list_id", "lead_list_members", ["lead_list_id"])
    op.create_index("ix_lead_list_members_lead_id", "lead_list_members", ["lead_id"])

    # --- templates ---
    op.create_table(
        "templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_templates_workspace_id", "templates", ["workspace_id"])

    # --- campaigns ---
    op.create_table(
        "campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="draft"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="UTC"),
        sa.Column("send_days", postgresql.JSON(), nullable=True),
        sa.Column("send_start_hour", sa.Integer(), nullable=False, server_default="9"),
        sa.Column("send_end_hour", sa.Integer(), nullable=False, server_default="17"),
        sa.Column("daily_limit", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("stop_on_reply", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("stop_on_auto_reply", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("track_opens", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("track_clicks", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_campaigns_workspace_id", "campaigns", ["workspace_id"])

    # --- sequences ---
    op.create_table(
        "sequences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False, server_default="Main Sequence"),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sequences_campaign_id", "sequences", ["campaign_id"])

    # --- steps ---
    op.create_table(
        "steps",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sequence_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("step_type", sa.String(50), nullable=False, server_default="email"),
        sa.Column("wait_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_steps_sequence_id", "steps", ["sequence_id"])

    # --- variants ---
    op.create_table(
        "variants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("step_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("steps.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False, server_default="A"),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("sent_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("open_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("click_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reply_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bounce_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_variants_step_id", "variants", ["step_id"])

    # --- conditions ---
    op.create_table(
        "conditions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("step_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("steps.id", ondelete="CASCADE"), nullable=False),
        sa.Column("condition_type", sa.String(50), nullable=False),
        sa.Column("target_step_order", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_conditions_step_id", "conditions", ["step_id"])

    # --- campaign_leads ---
    op.create_table(
        "campaign_leads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
        sa.Column("current_step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_send_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("variant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("variants.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("campaign_id", "lead_id", name="uq_campaign_lead"),
    )
    op.create_index("ix_campaign_leads_campaign_id", "campaign_leads", ["campaign_id"])
    op.create_index("ix_campaign_leads_lead_id", "campaign_leads", ["lead_id"])
    op.create_index("ix_campaign_leads_next_send_at", "campaign_leads", ["next_send_at"])

    # --- campaign_accounts ---
    op.create_table(
        "campaign_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("campaign_id", "account_id", name="uq_campaign_account"),
    )
    op.create_index("ix_campaign_accounts_campaign_id", "campaign_accounts", ["campaign_id"])
    op.create_index("ix_campaign_accounts_account_id", "campaign_accounts", ["account_id"])

    # --- sent_emails ---
    op.create_table(
        "sent_emails",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("leads.id"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_accounts.id"), nullable=False),
        sa.Column("step_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("steps.id"), nullable=True),
        sa.Column("variant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("variants.id"), nullable=True),
        sa.Column("message_id", sa.String(500), nullable=True),
        sa.Column("to_email", sa.String(320), nullable=False),
        sa.Column("from_email", sa.String(320), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="sent"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sent_emails_campaign_id", "sent_emails", ["campaign_id"])
    op.create_index("ix_sent_emails_lead_id", "sent_emails", ["lead_id"])
    op.create_index("ix_sent_emails_account_id", "sent_emails", ["account_id"])
    op.create_index("ix_sent_emails_message_id", "sent_emails", ["message_id"])
    op.create_index("ix_sent_emails_sent_at", "sent_emails", ["sent_at"])

    # --- email_events ---
    op.create_table(
        "email_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sent_email_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sent_emails.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("metadata", postgresql.JSON(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_email_events_sent_email_id", "email_events", ["sent_email_id"])
    op.create_index("ix_email_events_event_type", "email_events", ["event_type"])
    op.create_index("ix_email_events_occurred_at", "email_events", ["occurred_at"])
    op.create_index("ix_email_events_processed_at", "email_events", ["processed_at"])

    # --- inbox_messages ---
    op.create_table(
        "inbox_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_accounts.id"), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id"), nullable=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("leads.id"), nullable=True),
        sa.Column("message_id", sa.String(500), nullable=True),
        sa.Column("in_reply_to", sa.String(500), nullable=True),
        sa.Column("thread_id", sa.String(500), nullable=True),
        sa.Column("from_email", sa.String(320), nullable=False),
        sa.Column("to_email", sa.String(320), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("direction", sa.String(10), nullable=False, server_default="inbound"),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_auto_reply", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("responder_status", sa.String(20), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_inbox_messages_workspace_id", "inbox_messages", ["workspace_id"])
    op.create_index("ix_inbox_messages_account_id", "inbox_messages", ["account_id"])
    op.create_index("ix_inbox_messages_campaign_id", "inbox_messages", ["campaign_id"])
    op.create_index("ix_inbox_messages_lead_id", "inbox_messages", ["lead_id"])
    op.create_index("ix_inbox_messages_thread_id", "inbox_messages", ["thread_id"])
    op.create_index("ix_inbox_messages_responder_status", "inbox_messages", ["responder_status"])
    op.create_index("ix_inbox_messages_received_at", "inbox_messages", ["received_at"])

    # --- suppression_list ---
    op.create_table(
        "suppression_list",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("reason", sa.String(50), nullable=False),
        sa.Column("source", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("workspace_id", "email", name="uq_suppression_workspace_email"),
    )
    op.create_index("ix_suppression_list_workspace_id", "suppression_list", ["workspace_id"])
    op.create_index("ix_suppression_list_email", "suppression_list", ["email"])

    # --- analytics_snapshots ---
    op.create_table(
        "analytics_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id"), nullable=True),
        sa.Column("snapshot_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_delivered", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_opens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unique_opens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_replies", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_bounces", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_unsubscribes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("open_rate", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("click_rate", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("reply_rate", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("bounce_rate", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("extra", postgresql.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_analytics_snapshots_workspace_id", "analytics_snapshots", ["workspace_id"])
    op.create_index("ix_analytics_snapshots_campaign_id", "analytics_snapshots", ["campaign_id"])
    op.create_index("ix_analytics_snapshots_snapshot_date", "analytics_snapshots", ["snapshot_date"])

    # --- auto_responder_configs ---
    op.create_table(
        "auto_responder_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("ai_model", sa.String(100), nullable=False, server_default="openai/gpt-4o"),
        sa.Column("ai_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("tone", sa.String(50), nullable=False, server_default="professional"),
        sa.Column("brand_description", sa.Text(), nullable=True),
        sa.Column("example_phrases", postgresql.JSON(), nullable=True),
        sa.Column("forbidden_words", postgresql.JSON(), nullable=True),
        sa.Column("signature_template", sa.Text(), nullable=True),
        sa.Column("language", sa.String(10), nullable=False, server_default="en"),
        sa.Column("max_response_length", sa.Integer(), nullable=False, server_default="500"),
        sa.Column("confidence_threshold", sa.Float(), nullable=False, server_default="0.7"),
        sa.Column("escalation_keywords", postgresql.JSON(), nullable=True),
        sa.Column("max_responses_per_hour", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("cooldown_minutes", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("workspace_id", name="uq_auto_responder_config_workspace"),
    )
    op.create_index("ix_auto_responder_configs_workspace_id", "auto_responder_configs", ["workspace_id"])

    # --- responder_regions ---
    op.create_table(
        "responder_regions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("conditions", postgresql.JSON(), nullable=False),
        sa.Column("tone_override", sa.String(50), nullable=True),
        sa.Column("example_phrases_override", postgresql.JSON(), nullable=True),
        sa.Column("custom_system_prompt", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_responder_regions_workspace_id", "responder_regions", ["workspace_id"])

    # --- responder_rules ---
    op.create_table(
        "responder_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id"), nullable=True),
        sa.Column("region_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("responder_regions.id"), nullable=True),
        sa.Column("action", sa.String(50), nullable=False, server_default="auto_respond"),
        sa.Column("response_template", sa.Text(), nullable=True),
        sa.Column("delay_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_responder_rules_workspace_id", "responder_rules", ["workspace_id"])

    # --- responder_notes ---
    op.create_table(
        "responder_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("inbox_message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inbox_messages.id"), nullable=False),
        sa.Column("author_type", sa.String(20), nullable=False),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("note_type", sa.String(50), nullable=False, server_default="annotation"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_responder_notes_workspace_id", "responder_notes", ["workspace_id"])
    op.create_index("ix_responder_notes_inbox_message_id", "responder_notes", ["inbox_message_id"])

    # --- responder_logs ---
    op.create_table(
        "responder_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("inbox_message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inbox_messages.id"), nullable=False),
        sa.Column("response_message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inbox_messages.id"), nullable=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("leads.id"), nullable=True),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id"), nullable=True),
        sa.Column("region_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("responder_regions.id"), nullable=True),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("responder_rules.id"), nullable=True),
        sa.Column("ai_model", sa.String(100), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("generated_subject", sa.Text(), nullable=True),
        sa.Column("generated_body", sa.Text(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("escalation_reason", sa.Text(), nullable=True),
        sa.Column("processing_time_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_responder_logs_workspace_id", "responder_logs", ["workspace_id"])
    op.create_index("ix_responder_logs_inbox_message_id", "responder_logs", ["inbox_message_id"])


def downgrade() -> None:
    op.drop_table("responder_logs")
    op.drop_table("responder_notes")
    op.drop_table("responder_rules")
    op.drop_table("responder_regions")
    op.drop_table("auto_responder_configs")
    op.drop_table("analytics_snapshots")
    op.drop_table("suppression_list")
    op.drop_table("inbox_messages")
    op.drop_table("email_events")
    op.drop_table("sent_emails")
    op.drop_table("campaign_accounts")
    op.drop_table("campaign_leads")
    op.drop_table("conditions")
    op.drop_table("variants")
    op.drop_table("steps")
    op.drop_table("sequences")
    op.drop_table("campaigns")
    op.drop_table("templates")
    op.drop_table("lead_list_members")
    op.drop_table("lead_lists")
    op.drop_table("leads")
    op.drop_table("email_accounts")
    op.drop_table("users")
    op.drop_table("workspaces")
