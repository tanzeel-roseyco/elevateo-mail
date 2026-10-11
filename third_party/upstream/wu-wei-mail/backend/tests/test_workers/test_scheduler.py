"""Tests for campaign scheduler worker."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_WORKSPACE_ID


def _make_campaign(**overrides):
    """Create a mock Campaign for scheduler tests."""
    c = MagicMock()
    c.id = overrides.get("id", uuid.uuid4())
    c.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    c.name = overrides.get("name", "Test Campaign")
    c.status = overrides.get("status", "active")
    c.send_days = overrides.get("send_days", {
        "mon": True, "tue": True, "wed": True,
        "thu": True, "fri": True, "sat": False, "sun": False,
    })
    c.send_start_hour = overrides.get("send_start_hour", 0)
    c.send_end_hour = overrides.get("send_end_hour", 23)
    c.daily_limit = overrides.get("daily_limit", 100)
    return c


def _make_campaign_lead(**overrides):
    """Create a mock CampaignLead."""
    cl = MagicMock()
    cl.id = overrides.get("id", uuid.uuid4())
    cl.campaign_id = overrides.get("campaign_id", uuid.uuid4())
    cl.lead_id = overrides.get("lead_id", uuid.uuid4())
    cl.status = overrides.get("status", "pending")
    cl.current_step = overrides.get("current_step", 1)
    cl.next_send_at = overrides.get("next_send_at", datetime.now(timezone.utc) - timedelta(minutes=5))
    return cl


# ---------------------------------------------------------------------------
# test_get_due_campaigns — fetches active campaigns
# ---------------------------------------------------------------------------

class TestGetDueCampaigns:

    @patch("app.workers.scheduler.celery_app")
    async def test_get_due_campaigns(self, _mock_celery):
        """_run_scheduler_async finds active campaigns and queries due leads."""
        campaign = _make_campaign(name="Active Campaign")

        # Mock the async session and queries
        mock_db = AsyncMock()

        # Mock campaign query result
        mock_campaign_result = MagicMock()
        mock_campaign_result.scalars.return_value.all.return_value = [campaign]

        # Mock leads query result (no leads due)
        mock_leads_result = MagicMock()
        mock_leads_result.scalars.return_value.all.return_value = []

        # Mock suppression query result
        mock_sup_result = MagicMock()
        mock_sup_result.all.return_value = []

        mock_db.execute = AsyncMock(side_effect=[
            mock_campaign_result,
            mock_leads_result,
            mock_sup_result,
        ])
        mock_db.commit = AsyncMock()

        # Mock the session factory
        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.scheduler.async_session_factory", mock_session_factory), \
             patch("app.workers.scheduler.get_campaign_sent_today", return_value=0):
            from app.workers.scheduler import _run_scheduler_async
            await _run_scheduler_async()

        # Verify campaigns were queried
        assert mock_db.execute.call_count >= 1
        mock_db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# test_schedule_next_send — computes next_send_at
# ---------------------------------------------------------------------------

class TestScheduleNextSend:

    @patch("app.workers.scheduler.celery_app")
    async def test_schedule_next_send(self, _mock_celery):
        """Scheduler enqueues send tasks for due leads and updates status."""
        campaign_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        cl_id = uuid.uuid4()

        campaign = _make_campaign(
            id=campaign_id, name="Due Campaign",
            send_days={"mon": True, "tue": True, "wed": True,
                       "thu": True, "fri": True, "sat": True, "sun": True},
        )
        campaign_lead = _make_campaign_lead(
            id=cl_id,
            campaign_id=campaign_id,
            lead_id=lead_id,
            next_send_at=datetime.now(timezone.utc) - timedelta(minutes=10),
        )

        mock_db = AsyncMock()

        # 1. Campaign query
        mock_campaign_result = MagicMock()
        mock_campaign_result.scalars.return_value.all.return_value = [campaign]

        # 2. Due leads query
        mock_leads_result = MagicMock()
        mock_leads_result.scalars.return_value.all.return_value = [campaign_lead]

        # 3. Suppression query
        mock_sup_result = MagicMock()
        mock_sup_result.all.return_value = []

        # 4. Lead email query
        mock_lead_row = MagicMock()
        mock_lead_row.__getitem__ = MagicMock(return_value="lead@example.com")
        mock_lead_email_result = MagicMock()
        mock_lead_email_result.first.return_value = mock_lead_row

        mock_db.execute = AsyncMock(side_effect=[
            mock_campaign_result,
            mock_leads_result,
            mock_sup_result,
            mock_lead_email_result,
        ])
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_send_task = MagicMock()

        with patch("app.workers.scheduler.async_session_factory", mock_session_factory), \
             patch("app.workers.sender.send_email_task", mock_send_task), \
             patch("app.workers.scheduler.get_campaign_sent_today", return_value=0):
            from app.workers.scheduler import _run_scheduler_async
            await _run_scheduler_async()

        # Verify send task was enqueued
        mock_send_task.delay.assert_called_once_with(
            campaign_id=str(campaign_id),
            campaign_lead_id=str(cl_id),
            lead_id=str(lead_id),
        )
        # Verify campaign_lead status was updated
        assert campaign_lead.status == "in_sequence"

    @patch("app.workers.scheduler.celery_app")
    async def test_skips_suppressed_leads(self, _mock_celery):
        """Scheduler skips leads whose email is on the suppression list."""
        campaign_id = uuid.uuid4()
        lead_id = uuid.uuid4()

        campaign = _make_campaign(id=campaign_id)
        campaign_lead = _make_campaign_lead(
            campaign_id=campaign_id,
            lead_id=lead_id,
        )

        mock_db = AsyncMock()

        # Campaign query
        mock_campaign_result = MagicMock()
        mock_campaign_result.scalars.return_value.all.return_value = [campaign]

        # Due leads
        mock_leads_result = MagicMock()
        mock_leads_result.scalars.return_value.all.return_value = [campaign_lead]

        # Suppression list contains the lead's email
        mock_sup_row = MagicMock()
        mock_sup_row.__getitem__ = MagicMock(return_value="suppressed@example.com")
        mock_sup_result = MagicMock()
        mock_sup_result.all.return_value = [mock_sup_row]

        # Lead email matches suppressed
        mock_lead_row = MagicMock()
        mock_lead_row.__getitem__ = MagicMock(return_value="suppressed@example.com")
        mock_lead_email_result = MagicMock()
        mock_lead_email_result.first.return_value = mock_lead_row

        mock_db.execute = AsyncMock(side_effect=[
            mock_campaign_result,
            mock_leads_result,
            mock_sup_result,
            mock_lead_email_result,
        ])
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_send_task = MagicMock()

        with patch("app.workers.scheduler.async_session_factory", mock_session_factory), \
             patch("app.workers.sender.send_email_task", mock_send_task), \
             patch("app.workers.scheduler.get_campaign_sent_today", return_value=0):
            from app.workers.scheduler import _run_scheduler_async
            await _run_scheduler_async()

        # Send task should NOT have been called for suppressed lead
        mock_send_task.delay.assert_not_called()


# ---------------------------------------------------------------------------
# test_reset_daily_counts — resets sent_today on all accounts
# ---------------------------------------------------------------------------

class TestResetDailyCounts:

    @patch("app.workers.scheduler.celery_app")
    async def test_reset_daily_counts(self, _mock_celery):
        """_reset_daily_counts_async resets sent_today on all accounts."""
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock()
        mock_db.commit = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.scheduler.async_session_factory", mock_session_factory), \
             patch("app.workers.scheduler.reset_all_daily_counters"):
            from app.workers.scheduler import _reset_daily_counts_async
            await _reset_daily_counts_async()

        # Verify the UPDATE was executed and committed
        mock_db.execute.assert_called_once()
        mock_db.commit.assert_called_once()
