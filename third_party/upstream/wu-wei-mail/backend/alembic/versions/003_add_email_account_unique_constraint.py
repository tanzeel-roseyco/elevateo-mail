"""Add unique constraint on (workspace_id, email) for email_accounts.

Revision ID: 003_email_account_uq
Revises: 002_warmup
Create Date: 2026-02-09

Prevents duplicate email accounts within a workspace, ensuring
deterministic account resolution for inbound processing.
"""
from alembic import op

revision = "003_email_account_uq"
down_revision = "002_warmup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Deduplicate existing collisions: keep oldest per (workspace_id, email)
    op.execute("""
        DELETE FROM email_accounts
        WHERE id NOT IN (
            SELECT DISTINCT ON (workspace_id, email) id
            FROM email_accounts
            ORDER BY workspace_id, email, created_at ASC
        )
    """)
    op.create_unique_constraint(
        "uq_email_account_workspace_email",
        "email_accounts",
        ["workspace_id", "email"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_email_account_workspace_email",
        "email_accounts",
        type_="unique",
    )
