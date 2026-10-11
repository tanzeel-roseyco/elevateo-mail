"""Make workflows top-level entities — nullable campaign_id, add name/description.

Revision ID: 007_workflow_top_level
Revises: 006_conversations
Create Date: 2026-02-11
"""
from alembic import op
import sqlalchemy as sa

revision = "007_workflow_top_level"
down_revision = "006_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add name and description columns
    op.add_column(
        "workflow_definitions",
        sa.Column("name", sa.String(255), nullable=True),
    )
    op.add_column(
        "workflow_definitions",
        sa.Column("description", sa.Text(), nullable=True),
    )

    # 2. Backfill name from canonical_json meta for existing rows
    op.execute(
        """
        UPDATE workflow_definitions
        SET name = COALESCE(canonical_json::json->>'meta', 'Untitled')
        WHERE name IS NULL
        """
    )
    # For PostgreSQL jsonb, try to extract nested name
    op.execute(
        """
        UPDATE workflow_definitions
        SET name = COALESCE(
            canonical_json->'meta'->>'name',
            'Untitled Workflow'
        )
        WHERE name IS NULL OR name = '' OR name LIKE '{%'
        """
    )

    # 3. Make name NOT NULL after backfill
    op.alter_column("workflow_definitions", "name", nullable=False)

    # 4. Make campaign_id nullable
    op.alter_column(
        "workflow_definitions",
        "campaign_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )

    # 5. Drop old unique constraint, add new one
    op.drop_constraint("uq_workflow_campaign_version", "workflow_definitions", type_="unique")
    op.create_unique_constraint(
        "uq_workflow_workspace_name_version",
        "workflow_definitions",
        ["workspace_id", "name", "workflow_version"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_workflow_workspace_name_version", "workflow_definitions", type_="unique")
    op.create_unique_constraint(
        "uq_workflow_campaign_version",
        "workflow_definitions",
        ["campaign_id", "workflow_version"],
    )
    op.alter_column(
        "workflow_definitions",
        "campaign_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
    op.drop_column("workflow_definitions", "description")
    op.drop_column("workflow_definitions", "name")
