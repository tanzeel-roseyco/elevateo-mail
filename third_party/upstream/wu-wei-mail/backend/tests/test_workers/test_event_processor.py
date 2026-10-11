"""Tests for event processor worker — idempotent unsubscribe, poison event handling, shared session."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_WORKSPACE_ID


def _make_sent_email(**overrides):
    """Create a mock SentEmail."""
    se = MagicMock()
    se.id = overrides.get("id", uuid.uuid4())
    se.campaign_id = overrides.get("campaign_id", uuid.uuid4())
    se.lead_id = overrides.get("lead_id", uuid.uuid4())
    se.account_id = overrides.get("account_id", uuid.uuid4())
    se.variant_id = overrides.get("variant_id", uuid.uuid4())
    se.to_email = overrides.get("to_email", "lead@example.com")
    se.from_email = overrides.get("from_email", "sender@company.com")
    se.status = overrides.get("status", "sent")
    return se


def _make_campaign(**overrides):
    """Create a mock Campaign."""
    c = MagicMock()
    c.id = overrides.get("id", uuid.uuid4())
    c.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    c.name = overrides.get("name", "Test Campaign")
    return c


def _make_event(**overrides):
    """Create a mock EmailEvent."""
    ev = MagicMock()
    ev.id = overrides.get("id", uuid.uuid4())
    ev.sent_email_id = overrides.get("sent_email_id", uuid.uuid4())
    ev.event_type = overrides.get("event_type", "unsubscribe")
    ev.occurred_at = overrides.get("occurred_at", datetime.now(timezone.utc))
    ev.processed_at = overrides.get("processed_at", None)
    return ev


# ---------------------------------------------------------------------------
# Idempotent unsubscribe — duplicate should not crash
# ---------------------------------------------------------------------------

class TestIdempotentUnsubscribe:

    async def test_first_unsubscribe_creates_suppression(self):
        """First unsubscribe for an email creates a Suppression record."""
        campaign = _make_campaign()
        sent_email = _make_sent_email(campaign_id=campaign.id, to_email="unsub@example.com")

        mock_db = AsyncMock()

        # Campaign query result
        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign

        # Suppression check — none exists
        sup_check_result = MagicMock()
        sup_check_result.scalar_one_or_none.return_value = None

        # Lead query
        lead = MagicMock()
        lead.status = "active"
        lead_result = MagicMock()
        lead_result.scalar_one_or_none.return_value = lead

        # CampaignLead query
        cl = MagicMock()
        cl.status = "pending"
        cl.next_send_at = datetime.now(timezone.utc)
        cl_result = MagicMock()
        cl_result.scalar_one_or_none.return_value = cl

        mock_db.execute = AsyncMock(side_effect=[
            campaign_result,
            sup_check_result,
            lead_result,
            cl_result,
        ])
        mock_db.add = MagicMock()

        event = _make_event(sent_email_id=sent_email.id)

        from app.workers.event_processor import _handle_unsubscribe
        await _handle_unsubscribe(mock_db, event, sent_email)

        # Suppression should have been added
        mock_db.add.assert_called_once()
        added_obj = mock_db.add.call_args[0][0]
        assert added_obj.email == "unsub@example.com"
        assert added_obj.reason == "unsubscribe"

        # Lead and CampaignLead should be updated
        assert lead.status == "unsubscribed"
        assert cl.status == "unsubscribed"
        assert cl.next_send_at is None

    async def test_duplicate_unsubscribe_is_idempotent(self):
        """Second unsubscribe for same email does NOT create a duplicate Suppression."""
        campaign = _make_campaign()
        sent_email = _make_sent_email(campaign_id=campaign.id, to_email="already@example.com")

        mock_db = AsyncMock()

        # Campaign query
        campaign_result = MagicMock()
        campaign_result.scalar_one_or_none.return_value = campaign

        # Suppression check — already exists
        existing_suppression = MagicMock()
        sup_check_result = MagicMock()
        sup_check_result.scalar_one_or_none.return_value = existing_suppression

        # Lead query
        lead = MagicMock()
        lead_result = MagicMock()
        lead_result.scalar_one_or_none.return_value = lead

        # CampaignLead query
        cl = MagicMock()
        cl_result = MagicMock()
        cl_result.scalar_one_or_none.return_value = cl

        mock_db.execute = AsyncMock(side_effect=[
            campaign_result,
            sup_check_result,
            lead_result,
            cl_result,
        ])
        mock_db.add = MagicMock()

        event = _make_event(sent_email_id=sent_email.id)

        from app.workers.event_processor import _handle_unsubscribe
        await _handle_unsubscribe(mock_db, event, sent_email)

        # db.add should NOT have been called (suppression already exists)
        mock_db.add.assert_not_called()


# ---------------------------------------------------------------------------
# Failed events are marked as processed
# ---------------------------------------------------------------------------

class TestFailedEventMarkedProcessed:

    async def test_exception_in_handler_still_marks_processed(self):
        """If _handle_event raises, the event is still marked with processed_at."""
        event = _make_event(event_type="bounce")
        assert event.processed_at is None

        mock_db = AsyncMock()

        # Query for events returns our single event
        events_result = MagicMock()
        events_result.scalars.return_value.all.return_value = [event]

        mock_db.execute = AsyncMock(return_value=events_result)
        mock_db.commit = AsyncMock()

        mock_session_ctx = MagicMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session_ctx)

        with patch("app.workers.event_processor.async_session_factory", mock_factory), \
             patch("app.workers.event_processor._handle_event", new_callable=AsyncMock, side_effect=Exception("boom")):
            from app.workers.event_processor import _process_events_async
            await _process_events_async()

        # Event should be marked as processed even though handler raised
        assert event.processed_at is not None
        # Commit should still be called to persist the processed_at marker
        mock_db.commit.assert_called_once()

    async def test_successful_event_also_marked_processed(self):
        """Normal processing also sets processed_at."""
        event = _make_event(event_type="open")
        assert event.processed_at is None

        mock_db = AsyncMock()

        events_result = MagicMock()
        events_result.scalars.return_value.all.return_value = [event]

        mock_db.execute = AsyncMock(return_value=events_result)
        mock_db.commit = AsyncMock()

        mock_session_ctx = MagicMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)

        mock_factory = MagicMock(return_value=mock_session_ctx)

        with patch("app.workers.event_processor.async_session_factory", mock_factory), \
             patch("app.workers.event_processor._handle_event", new_callable=AsyncMock):
            from app.workers.event_processor import _process_events_async
            await _process_events_async()

        assert event.processed_at is not None
        mock_db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# Shared session factory — no ad-hoc create_async_engine in workers
# ---------------------------------------------------------------------------

class TestSharedSessionFactory:

    def test_no_create_async_engine_in_workers(self):
        """Worker modules should not import create_async_engine — they use the shared factory."""
        import importlib
        worker_modules = [
            "app.workers.sender",
            "app.workers.scheduler",
            "app.workers.event_processor",
            "app.workers.warmup",
            "app.workers.auto_responder_worker",
            "app.workers.workflow_runner",
        ]
        for mod_name in worker_modules:
            mod = importlib.import_module(mod_name)
            assert not hasattr(mod, "_get_async_session"), (
                f"{mod_name} still has _get_async_session — should use async_session_factory"
            )
            # Check source doesn't contain create_async_engine
            import inspect
            source = inspect.getsource(mod)
            # Allow it in comments but not as an actual import/call
            lines = [
                line for line in source.split("\n")
                if "create_async_engine" in line and not line.strip().startswith("#")
            ]
            assert len(lines) == 0, (
                f"{mod_name} still uses create_async_engine: {lines}"
            )
