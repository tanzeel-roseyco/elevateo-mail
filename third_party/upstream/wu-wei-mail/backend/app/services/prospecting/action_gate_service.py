"""Action gate service — approval-required actions with replay protection.

Actions that have side effects (bulk imports, campaign launches, external syncs)
must go through the approval gate before execution. Flow:

  pending → approved → executed
  pending → rejected (terminal)
  approved → executed
  approved → failed (on execution error)

Side-effect execution is impossible without an approval record in 'approved' state.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prospecting import ProspectingAction, ProspectingConversation


# Actions that require approval
APPROVAL_REQUIRED_ACTIONS = {"bulk_import", "campaign_launch", "instantly_sync"}

# Valid status transitions
VALID_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"approved", "rejected"},
    "approved": {"executed", "failed"},
    "rejected": set(),  # terminal
    "executed": set(),  # terminal
    "failed": {"pending"},  # can retry
}


class ActionNotFoundError(Exception):
    pass


class ActionNotApprovableError(Exception):
    pass


class ActionNotExecutableError(Exception):
    """Raised when trying to execute an action that is not in 'approved' state."""
    pass


class ActionGateService:
    """Manages approval-gated actions for prospecting operations."""

    async def create_action(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        action_type: str,
        payload: dict[str, Any] | None = None,
    ) -> ProspectingAction:
        """Create a new pending action requiring approval.

        Validates the conversation belongs to the workspace.
        """
        # Verify conversation ownership
        result = await db.execute(
            select(ProspectingConversation).where(
                ProspectingConversation.id == conversation_id,
                ProspectingConversation.workspace_id == workspace_id,
            )
        )
        if not result.scalar_one_or_none():
            raise ValueError(f"Conversation {conversation_id} not found in workspace")

        if action_type not in APPROVAL_REQUIRED_ACTIONS:
            raise ValueError(
                f"Unknown action type '{action_type}'. "
                f"Valid types: {sorted(APPROVAL_REQUIRED_ACTIONS)}"
            )

        action = ProspectingAction(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            action_type=action_type,
            status="pending",
            payload=payload or {},
        )
        db.add(action)
        await db.flush()
        return action

    async def approve_action(
        self,
        db: AsyncSession,
        action_id: uuid.UUID,
        workspace_id: uuid.UUID,
        approved_by: uuid.UUID,
        approved: bool,
    ) -> ProspectingAction:
        """Approve or reject a pending action.

        Args:
            approved: True to approve, False to reject.
        """
        action = await self._get_action(db, action_id, workspace_id)

        if action.status != "pending":
            raise ActionNotApprovableError(
                f"Action {action_id} is '{action.status}', not 'pending'"
            )

        action.status = "approved" if approved else "rejected"
        action.approved_by = approved_by
        action.approved_at = datetime.now(timezone.utc)
        await db.flush()
        return action

    async def mark_executed(
        self,
        db: AsyncSession,
        action_id: uuid.UUID,
        workspace_id: uuid.UUID,
        result: dict[str, Any] | None = None,
    ) -> ProspectingAction:
        """Mark an approved action as executed.

        Only actions in 'approved' state can be executed. This prevents
        replay attacks and ensures the approval gate cannot be bypassed.
        """
        action = await self._get_action(db, action_id, workspace_id)

        if action.status != "approved":
            raise ActionNotExecutableError(
                f"Action {action_id} is '{action.status}', not 'approved'. "
                "Side-effect execution requires approval first."
            )

        action.status = "executed"
        action.executed_at = datetime.now(timezone.utc)
        action.result = result or {}
        await db.flush()
        return action

    async def mark_failed(
        self,
        db: AsyncSession,
        action_id: uuid.UUID,
        workspace_id: uuid.UUID,
        error_detail: str,
    ) -> ProspectingAction:
        """Mark an approved action as failed during execution."""
        action = await self._get_action(db, action_id, workspace_id)

        if action.status != "approved":
            raise ActionNotExecutableError(
                f"Action {action_id} is '{action.status}', cannot mark as failed"
            )

        action.status = "failed"
        action.error_detail = error_detail
        await db.flush()
        return action

    async def get_pending_actions(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID | None = None,
    ) -> list[ProspectingAction]:
        """Get all pending actions for a workspace, optionally filtered by conversation."""
        query = select(ProspectingAction).where(
            ProspectingAction.workspace_id == workspace_id,
            ProspectingAction.status == "pending",
        )
        if conversation_id:
            query = query.where(ProspectingAction.conversation_id == conversation_id)

        result = await db.execute(query)
        return list(result.scalars().all())

    async def get_action(
        self,
        db: AsyncSession,
        action_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> ProspectingAction:
        """Load action with workspace isolation (public API)."""
        return await self._get_action(db, action_id, workspace_id)

    async def _get_action(
        self,
        db: AsyncSession,
        action_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> ProspectingAction:
        """Load action with workspace isolation."""
        result = await db.execute(
            select(ProspectingAction).where(
                ProspectingAction.id == action_id,
                ProspectingAction.workspace_id == workspace_id,
            )
        )
        action = result.scalar_one_or_none()
        if not action:
            raise ActionNotFoundError(
                f"Action {action_id} not found in workspace"
            )
        return action


action_gate_service = ActionGateService()
