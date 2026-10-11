"""Make sent_emails.campaign_id nullable for standalone workflow sends.

Workflow email sends (node_executors) may not be tied to a campaign,
so campaign_id must be nullable.

Revision ID: 015_sent_email_nullable_campaign
Revises: 014_wf_nullable_campaign
Create Date: 2026-02-16
"""
from alembic import op
import sqlalchemy as sa

revision = "015_sent_email_nullable_campaign"
down_revision = "014_wf_nullable_campaign"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "sent_emails",
        "campaign_id",
        existing_type=sa.UUID(),
        nullable=True,
    )


def downgrade():
    # Backfill NULLs before making non-nullable (or this will fail if NULLs exist)
    op.execute("DELETE FROM sent_emails WHERE campaign_id IS NULL")
    op.alter_column(
        "sent_emails",
        "campaign_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
