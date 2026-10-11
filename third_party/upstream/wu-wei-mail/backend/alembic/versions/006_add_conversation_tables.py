"""Add conversation threads, messages, and notes tables.

Revision ID: 006_conversations
Revises: 005_workflow
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa

revision = "006_conversations"
down_revision = "005_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversation_threads",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("lead_id", sa.Uuid(), sa.ForeignKey("leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("campaign_id", sa.Uuid(), sa.ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True),
        sa.Column("channel", sa.String(50), nullable=False),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("status", sa.String(50), server_default="open", nullable=False),
        sa.Column("is_read", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("provider_thread_id", sa.String(255), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_conversation_threads_workspace_id", "conversation_threads", ["workspace_id"])
    op.create_index("ix_conversation_threads_lead_id", "conversation_threads", ["lead_id"])

    op.create_table(
        "conversation_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("thread_id", sa.Uuid(), sa.ForeignKey("conversation_threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("channel", sa.String(50), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("sender_email", sa.String(320), nullable=True),
        sa.Column("sender_name", sa.String(255), nullable=True),
        sa.Column("provider_message_id", sa.String(255), nullable=True, unique=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_conversation_messages_thread_id", "conversation_messages", ["thread_id"])

    op.create_table(
        "conversation_notes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("thread_id", sa.Uuid(), sa.ForeignKey("conversation_threads.id", ondelete="CASCADE"), nullable=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("lead_id", sa.Uuid(), sa.ForeignKey("leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note_type", sa.String(50), server_default="manual", nullable=False),
        sa.Column("author_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("workflow_id", sa.Uuid(), sa.ForeignKey("workflow_definitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("node_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_conversation_notes_workspace_id", "conversation_notes", ["workspace_id"])
    op.create_index("ix_conversation_notes_thread_id", "conversation_notes", ["thread_id"])
    op.create_index("ix_conversation_notes_lead_id", "conversation_notes", ["lead_id"])


def downgrade() -> None:
    op.drop_table("conversation_notes")
    op.drop_table("conversation_messages")
    op.drop_table("conversation_threads")
