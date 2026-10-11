"""Tests for Phase 6: Prospecting Pipeline Integration — leads auto-enter workflows."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestLeadServiceAddToListWorkflowHook:
    """Test that bulk add_to_list notifies event bus."""

    @pytest.mark.asyncio
    async def test_add_to_list_notifies_event_bus(self):
        """Bulk add_to_list should call workflow_event_bus.on_list_membership_added()."""
        from app.services.lead_service import lead_service

        db = AsyncMock()
        workspace_id = uuid.uuid4()
        list_id = uuid.uuid4()
        lead_id = uuid.uuid4()

        # Mock list ownership check
        mock_list = MagicMock()
        mock_list_result = MagicMock()
        mock_list_result.scalar_one_or_none.return_value = mock_list

        # Mock leads ownership check — returns lead_id as owned
        mock_owned = MagicMock()
        mock_owned.scalars.return_value.all.return_value = [lead_id]

        # Mock no existing membership
        mock_no_member = MagicMock()
        mock_no_member.scalar_one_or_none.return_value = None

        db.execute = AsyncMock(side_effect=[mock_list_result, mock_owned, mock_no_member])

        with patch(
            "app.services.workflow.event_bus.workflow_event_bus"
        ) as mock_bus:
            mock_bus.on_list_membership_added = AsyncMock()

            result = await lead_service.bulk_action(
                db, workspace_id, [lead_id], "add_to_list", list_id=list_id,
            )

            assert result["affected"] == 1
            mock_bus.on_list_membership_added.assert_called_once_with(
                db=db,
                workspace_id=workspace_id,
                lead_ids=[lead_id],
                list_id=list_id,
            )


class TestProspectingImportWorkflowHook:
    """Test that prospecting lead_import_service notifies event bus."""

    @pytest.mark.asyncio
    async def test_prospecting_import_calls_event_bus(self):
        """Importing prospecting leads should attempt to call on_leads_imported."""
        from app.services.prospecting.lead_import_service import lead_import_service

        db = AsyncMock()
        workspace_id = uuid.uuid4()
        lead_id = uuid.uuid4()

        # Mock ProspectingLead query
        mock_pl = MagicMock()
        mock_pl.email = "bob@test.com"
        mock_pl.is_excluded = False
        mock_pl.readiness_band = "READY_HIGH_CONFIDENCE"
        mock_pl.first_name = "Bob"
        mock_pl.last_name = "Jones"
        mock_pl.company = "TestCo"
        mock_pl.title = "CEO"
        mock_pl.phone = None
        mock_pl.linkedin_url = None
        mock_pl.website = None
        mock_pl.city = None
        mock_pl.state = None
        mock_pl.country = None
        mock_pl.industry = None
        mock_pl.source_name = "test"
        mock_pl.run_id = uuid.uuid4()
        mock_pl.id = lead_id
        mock_pl.quality_score = 0.9

        mock_pl_result = MagicMock()
        mock_pl_result.scalars.return_value.all.return_value = [mock_pl]

        # Mock no existing emails (empty)
        mock_existing = MagicMock()
        mock_existing.all.return_value = []

        db.execute = AsyncMock(side_effect=[mock_pl_result, mock_existing])

        with patch(
            "app.services.workflow.event_bus.workflow_event_bus"
        ) as mock_bus:
            mock_bus.on_leads_imported = AsyncMock()

            result = await lead_import_service.import_leads(
                db, workspace_id, [lead_id],
            )

            # Should have imported 1 lead
            assert result.imported_count == 1
            assert len(result.imported_lead_ids) == 1

            # Event bus should have been called
            mock_bus.on_leads_imported.assert_called_once()
            call_kwargs = mock_bus.on_leads_imported.call_args.kwargs
            assert call_kwargs["workspace_id"] == workspace_id
            assert call_kwargs["trigger_data"] == {"source": "prospecting_import"}


class TestEventBusLeadDispatch:
    """Test event bus dispatches leads to matching workflows."""

    @pytest.mark.asyncio
    async def test_on_leads_imported_dispatches_to_workflows(self):
        """Imported leads should be dispatched to published workflows with trigger_new_lead."""
        from app.services.workflow.event_bus import WorkflowEventBus

        bus = WorkflowEventBus()
        db = AsyncMock()

        workspace_id = uuid.uuid4()
        workflow_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        lead_id = uuid.uuid4()

        # Mock published workflow
        mock_wf = MagicMock()
        mock_wf.id = workflow_id
        mock_wf.workspace_id = workspace_id
        mock_wf.campaign_id = campaign_id
        mock_wf.status = "published"

        mock_wf_result = MagicMock()
        mock_wf_result.scalars.return_value.all.return_value = [mock_wf]

        # Mock trigger node
        mock_trigger = MagicMock()
        mock_trigger.node_id = "n_trigger"
        mock_trigger.node_type = "trigger_new_lead"

        mock_trigger_result = MagicMock()
        mock_trigger_result.scalars.return_value.all.return_value = [mock_trigger]

        db.execute = AsyncMock(side_effect=[mock_wf_result, mock_trigger_result])

        with patch("app.services.workflow.runtime.workflow_runtime") as mock_runtime:
            mock_runtime.dispatch_event_trigger = AsyncMock(return_value=MagicMock())

            total = await bus.on_leads_imported(
                db=db,
                workspace_id=workspace_id,
                lead_ids=[lead_id],
                trigger_data={"source": "prospecting_import"},
            )

        assert total == 1
        mock_runtime.dispatch_event_trigger.assert_called_once()
        call_kwargs = mock_runtime.dispatch_event_trigger.call_args.kwargs
        assert call_kwargs["workflow_id"] == workflow_id
        assert call_kwargs["lead_id"] == lead_id

    @pytest.mark.asyncio
    async def test_on_list_membership_dispatches_to_matching_list_workflow(self):
        """Adding lead to a list should trigger workflows with list-based trigger."""
        from app.services.workflow.event_bus import WorkflowEventBus

        bus = WorkflowEventBus()
        db = AsyncMock()

        workspace_id = uuid.uuid4()
        workflow_id = uuid.uuid4()
        campaign_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        list_id = uuid.uuid4()

        mock_wf = MagicMock()
        mock_wf.id = workflow_id
        mock_wf.workspace_id = workspace_id
        mock_wf.campaign_id = campaign_id
        mock_wf.status = "published"

        mock_wf_result = MagicMock()
        mock_wf_result.scalars.return_value.all.return_value = [mock_wf]

        mock_trigger = MagicMock()
        mock_trigger.node_id = "n_list_trigger"
        mock_trigger.node_type = "trigger_list_membership_added"
        mock_trigger.config_json = {"list_ids": [str(list_id)]}

        mock_trigger_result = MagicMock()
        mock_trigger_result.scalars.return_value.all.return_value = [mock_trigger]

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
