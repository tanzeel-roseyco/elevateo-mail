"""Tests for Phase 2: Workflow Event Bus — routes external events into workflow state."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.workflow.event_bus import WorkflowEventBus


class TestOnEmailReply:
    """Test on_email_reply — wakes waiting leads and updates channel_state."""

    @pytest.mark.asyncio
    async def test_reply_wakes_waiting_lead(self):
        """A reply should set a waiting lead to pending with next_run_at=now."""
        bus = WorkflowEventBus()
        db = AsyncMock()

        lead_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        # Mock a waiting WorkflowLeadState
        mock_state = MagicMock()
        mock_state.lead_id = lead_id
        mock_state.status = "waiting"
        mock_state.channel_state_json = {}
        mock_state.context_json = {"lead": {"email": "test@test.com"}, "vars": {}}
        mock_state.next_run_at = datetime.now(timezone.utc) + timedelta(days=3)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_state]
        db.execute = AsyncMock(return_value=mock_result)

        updated = await bus.on_email_reply(
            db=db,
            workspace_id=workspace_id,
            lead_id=lead_id,
            event_data={"from_email": "alice@example.com"},
        )

        assert updated == 1
        assert mock_state.status == "pending"
        assert mock_state.channel_state_json["email_replied"] is True
        assert mock_state.context_json["vars"]["email_replied"] is True
        # next_run_at should be approximately now
        assert mock_state.next_run_at <= datetime.now(timezone.utc) + timedelta(seconds=5)

    @pytest.mark.asyncio
    async def test_reply_no_waiting_leads(self):
        """If no leads are waiting, return 0."""
        bus = WorkflowEventBus()
        db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)

        updated = await bus.on_email_reply(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
        )
        assert updated == 0


class TestOnEmailBounce:
    """Test on_email_bounce — updates channel_state with bounce flag."""

    @pytest.mark.asyncio
    async def test_bounce_updates_channel_state(self):
        bus = WorkflowEventBus()
        db = AsyncMock()

        mock_state = MagicMock()
        mock_state.status = "waiting"
        mock_state.channel_state_json = {}
        mock_state.context_json = {"vars": {}}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_state]
        db.execute = AsyncMock(return_value=mock_result)

        updated = await bus.on_email_bounce(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
        )

        assert updated == 1
        assert mock_state.channel_state_json["email_bounced"] is True
        assert mock_state.context_json["vars"]["email_bounced"] is True


class TestOnEmailOpen:
    """Test on_email_open — updates channel_state with open flag."""

    @pytest.mark.asyncio
    async def test_open_updates_channel_state(self):
        bus = WorkflowEventBus()
        db = AsyncMock()

        mock_state = MagicMock()
        mock_state.status = "waiting"
        mock_state.channel_state_json = {}
        mock_state.context_json = {"vars": {}}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_state]
        db.execute = AsyncMock(return_value=mock_result)

        updated = await bus.on_email_open(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
        )

        assert updated == 1
        assert mock_state.channel_state_json["email_opened"] is True
        assert "email_first_open_at" in mock_state.channel_state_json

    @pytest.mark.asyncio
    async def test_open_preserves_first_open_at(self):
        """Second open should not overwrite first_open_at."""
        bus = WorkflowEventBus()
        db = AsyncMock()

        mock_state = MagicMock()
        mock_state.status = "pending"
        mock_state.channel_state_json = {
            "email_opened": True,
            "email_first_open_at": "2026-01-01T00:00:00",
        }
        mock_state.context_json = {"vars": {"email_opened": True}}

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_state]
        db.execute = AsyncMock(return_value=mock_result)

        await bus.on_email_open(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
        )

        # Should preserve the original first_open_at
        assert mock_state.channel_state_json["email_first_open_at"] == "2026-01-01T00:00:00"


class TestOnLeadsImported:
    """Test on_leads_imported — dispatches leads to matching workflows."""

    @pytest.mark.asyncio
    async def test_leads_dispatched_to_matching_workflow(self):
        bus = WorkflowEventBus()
        db = AsyncMock()

        workspace_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        workflow_id = uuid.uuid4()
        lead_id = uuid.uuid4()

        # Mock a published workflow with trigger_new_lead
        mock_wf = MagicMock()
        mock_wf.id = workflow_id
        mock_wf.workspace_id = workspace_id
        mock_wf.campaign_id = campaign_id
        mock_wf.status = "published"

        mock_wf_result = MagicMock()
        mock_wf_result.scalars.return_value.all.return_value = [mock_wf]

        # Mock trigger node
        mock_trigger_node = MagicMock()
        mock_trigger_node.node_id = "n_trigger"
        mock_trigger_node.node_type = "trigger_new_lead"

        mock_trigger_result = MagicMock()
        mock_trigger_result.scalars.return_value.all.return_value = [mock_trigger_node]

        # Execute returns: 1=workflows, 2=trigger_nodes
        db.execute = AsyncMock(side_effect=[mock_wf_result, mock_trigger_result])

        with patch("app.services.workflow.runtime.workflow_runtime") as mock_runtime:
            mock_state = MagicMock()
            mock_runtime.dispatch_event_trigger = AsyncMock(return_value=mock_state)

            total = await bus.on_leads_imported(
                db=db,
                workspace_id=workspace_id,
                lead_ids=[lead_id],
                trigger_data={"source": "csv_import"},
            )

        assert total == 1
        mock_runtime.dispatch_event_trigger.assert_called_once()
        call_kwargs = mock_runtime.dispatch_event_trigger.call_args
        assert call_kwargs.kwargs["workflow_id"] == workflow_id
        assert call_kwargs.kwargs["lead_id"] == lead_id

    @pytest.mark.asyncio
    async def test_no_matching_workflows(self):
        bus = WorkflowEventBus()
        db = AsyncMock()

        # No published workflows
        mock_wf_result = MagicMock()
        mock_wf_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_wf_result)

        total = await bus.on_leads_imported(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_ids=[uuid.uuid4()],
        )
        assert total == 0


class TestOnListMembershipAdded:
    """Test on_list_membership_added — dispatches to list-triggered workflows."""

    @pytest.mark.asyncio
    async def test_list_trigger_fires_for_matching_list(self):
        bus = WorkflowEventBus()
        db = AsyncMock()

        workspace_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        workflow_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        list_id = uuid.uuid4()

        mock_wf = MagicMock()
        mock_wf.id = workflow_id
        mock_wf.workspace_id = workspace_id
        mock_wf.campaign_id = campaign_id
        mock_wf.status = "published"

        mock_wf_result = MagicMock()
        mock_wf_result.scalars.return_value.all.return_value = [mock_wf]

        mock_trigger_node = MagicMock()
        mock_trigger_node.node_id = "n_list_trigger"
        mock_trigger_node.node_type = "trigger_list_membership_added"
        mock_trigger_node.config_json = {"list_ids": [str(list_id)]}  # Matches

        mock_trigger_result = MagicMock()
        mock_trigger_result.scalars.return_value.all.return_value = [mock_trigger_node]

        db.execute = AsyncMock(side_effect=[mock_wf_result, mock_trigger_result])

        with patch("app.services.workflow.runtime.workflow_runtime") as mock_runtime:
            mock_runtime.dispatch_event_trigger = AsyncMock(return_value=MagicMock())

            total = await bus.on_list_membership_added(
                db=db,
                workspace_id=workspace_id,
                lead_ids=[lead_id],
                list_id=list_id,
            )

        assert total == 1

    @pytest.mark.asyncio
    async def test_list_trigger_skips_non_matching_list(self):
        bus = WorkflowEventBus()
        db = AsyncMock()

        workspace_id = uuid.uuid4()

        mock_wf = MagicMock()
        mock_wf.id = uuid.uuid4()
        mock_wf.workspace_id = workspace_id
        mock_wf.campaign_id = uuid.uuid4()

        mock_wf_result = MagicMock()
        mock_wf_result.scalars.return_value.all.return_value = [mock_wf]

        mock_trigger_node = MagicMock()
        mock_trigger_node.node_id = "n_list_trigger"
        mock_trigger_node.node_type = "trigger_list_membership_added"
        mock_trigger_node.config_json = {"list_ids": [str(uuid.uuid4())]}  # Different list

        mock_trigger_result = MagicMock()
        mock_trigger_result.scalars.return_value.all.return_value = [mock_trigger_node]

        db.execute = AsyncMock(side_effect=[mock_wf_result, mock_trigger_result])

        total = await bus.on_list_membership_added(
            db=db,
            workspace_id=workspace_id,
            lead_ids=[uuid.uuid4()],
            list_id=uuid.uuid4(),
        )

        assert total == 0
