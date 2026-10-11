"""Make workflow_lead_states.campaign_id nullable and fix unique constraint.

Standalone workflows don't necessarily have a campaign. The uniqueness
of a lead in a workflow is (workflow_id, lead_id), not (campaign_id, lead_id).

Revision ID: 014_wf_nullable_campaign
Revises: 013_merge_heads
Create Date: 2026-02-13
"""
from alembic import op
import sqlalchemy as sa

revision = "014_wf_nullable_campaign"
down_revision = "013_merge_heads"
branch_labels = None
depends_on = None


def upgrade():
    # Make campaign_id nullable
    op.alter_column(
        "workflow_lead_states",
        "campaign_id",
        existing_type=sa.UUID(),
        nullable=True,
    )

    # Drop old unique constraint and create new one
    op.drop_constraint("uq_workflow_lead_state", "workflow_lead_states", type_="unique")
    op.create_unique_constraint(
        "uq_workflow_lead_state_v2",
        "workflow_lead_states",
        ["workflow_id", "lead_id"],
    )


def downgrade():
    op.drop_constraint("uq_workflow_lead_state_v2", "workflow_lead_states", type_="unique")
    op.create_unique_constraint(
        "uq_workflow_lead_state",
        "workflow_lead_states",
        ["campaign_id", "lead_id"],
    )
    op.alter_column(
        "workflow_lead_states",
        "campaign_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
