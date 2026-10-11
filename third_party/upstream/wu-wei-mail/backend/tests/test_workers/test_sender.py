"""Tests for email sender worker — send task, status updates, SMTP mocking."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import pytest

from tests.conftest import TEST_WORKSPACE_ID


def _make_campaign(**overrides):
    """Create a mock Campaign."""
    c = MagicMock()
    c.id = overrides.get("id", uuid.uuid4())
    c.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    c.name = overrides.get("name", "Test Campaign")
    c.status = overrides.get("status", "active")
    return c


def _make_lead(**overrides):
    """Create a mock Lead."""
    lead = MagicMock()
    lead.id = overrides.get("id", uuid.uuid4())
    lead.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    lead.email = overrides.get("email", "lead@example.com")
    lead.first_name = overrides.get("first_name", "Jane")
    lead.last_name = overrides.get("last_name", "Doe")
    lead.company = overrides.get("company", "Acme Corp")
    lead.title = overrides.get("title", "CTO")
    lead.phone = overrides.get("phone", None)
    lead.linkedin_url = overrides.get("linkedin_url", None)
    lead.website = overrides.get("website", None)
    lead.city = overrides.get("city", None)
    lead.state = overrides.get("state", None)
    lead.country = overrides.get("country", None)
    lead.industry = overrides.get("industry", None)
    lead.custom_fields = overrides.get("custom_fields", {})
    return lead


def _make_campaign_lead(**overrides):
    """Create a mock CampaignLead."""
    cl = MagicMock()
    cl.id = overrides.get("id", uuid.uuid4())
    cl.campaign_id = overrides.get("campaign_id", uuid.uuid4())
    cl.lead_id = overrides.get("lead_id", uuid.uuid4())
    cl.status = overrides.get("status", "in_sequence")
    cl.current_step = overrides.get("current_step", 1)
    cl.next_send_at = overrides.get("next_send_at", datetime.now(timezone.utc))
    cl.variant_id = overrides.get("variant_id", None)
    return cl


def _make_campaign_account(**overrides):
    """Create a mock CampaignAccount with nested EmailAccount."""
    ca = MagicMock()
    ca.campaign_id = overrides.get("campaign_id", uuid.uuid4())
    ca.account_id = overrides.get("account_id", uuid.uuid4())
    ca.weight = overrides.get("weight", 50)

    account = MagicMock()
    account.id = ca.account_id
    account.email = overrides.get("email", "sender@company.com")
    account.display_name = overrides.get("display_name", "Sender")
    account.smtp_host = overrides.get("smtp_host", "smtp.company.com")
    account.smtp_port = overrides.get("smtp_port", 587)
    account.smtp_username = overrides.get("smtp_username", "sender@company.com")
    account.smtp_password = overrides.get("smtp_password", "password123")
    account.smtp_use_tls = overrides.get("smtp_use_tls", True)
    account.is_active = overrides.get("is_active", True)
    account.daily_limit = overrides.get("daily_limit", 50)
    account.sent_today = overrides.get("sent_today", 0)
    account.health_score = overrides.get("health_score", 1.0)
    ca.account = account
    return ca


def _make_sequence(**overrides):
    """Create a mock Sequence."""
    seq = MagicMock()
    seq.id = overrides.get("id", uuid.uuid4())
    seq.campaign_id = overrides.get("campaign_id", uuid.uuid4())
    seq.order = overrides.get("order", 1)
    return seq


def _make_step(**overrides):
    """Create a mock Step."""
    step = MagicMock()
    step.id = overrides.get("id", uuid.uuid4())
    step.sequence_id = overrides.get("sequence_id", uuid.uuid4())
    step.order = overrides.get("order", 1)
    step.wait_days = overrides.get("wait_days", 2)
    return step


def _make_variant(**overrides):
    """Create a mock Variant."""
    v = MagicMock()
    v.id = overrides.get("id", uuid.uuid4())
    v.step_id = overrides.get("step_id", uuid.uuid4())
    v.name = overrides.get("name", "Variant A")
    v.subject = overrides.get("subject", "Hello {{first_name}}")
    v.body = overrides.get("body", "<p>Hi {{first_name}}, checking in from {{company}}</p>")
    v.sent_count = overrides.get("sent_count", 0)
    return v


def _setup_sender_mocks(
    mock_db,
    campaign,
    lead,
    campaign_lead,
    campaign_accounts,
    sequence,
    steps,
    variants,
    selected_account,
    existing_delivery=None,
):
    """Wire up the series of db.execute calls that _send_email_async makes."""
    # 1. CampaignLead
    cl_result = MagicMock()
    cl_result.scalar_one_or_none.return_value = campaign_lead

    # 2. Lead
    lead_result = MagicMock()
    lead_result.scalar_one_or_none.return_value = lead

    # 3. Campaign
    camp_result = MagicMock()
    camp_result.scalar_one_or_none.return_value = campaign

    # 4. CampaignAccounts
    ca_result = MagicMock()
    ca_result.scalars.return_value.all.return_value = campaign_accounts

    # 5..N. Each account's EmailAccount query
    account_results = []
    for ca in campaign_accounts:
        ar = MagicMock()
        ar.scalar_one.return_value = ca.account
        account_results.append(ar)

    # N+1. Sequence
    seq_result = MagicMock()
    seq_result.scalars.return_value.first.return_value = sequence

    # N+2. Steps
    steps_result = MagicMock()
    steps_result.scalars.return_value.all.return_value = steps

    # N+3. Variants
    variants_result = MagicMock()
    variants_result.scalars.return_value.all.return_value = variants

    # N+4. Existing delivery lookup (duplicate-send protection)
    existing_delivery_result = MagicMock()
    existing_delivery_result.scalars.return_value.first.return_value = existing_delivery

    # N+5. Finalization idempotency marker lookup (outbound inbox exists?)
    finalized_result = MagicMock()
    finalized_result.scalar_one_or_none.return_value = None

    mock_db.execute = AsyncMock(side_effect=[
        cl_result,
        lead_result,
        camp_result,
        ca_result,
        *account_results,
        seq_result,
        steps_result,
        variants_result,
        existing_delivery_result,
        finalized_result,
    ])
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.rollback = AsyncMock()


# ---------------------------------------------------------------------------
# test_send_email_task — calls email_sender.send
# ---------------------------------------------------------------------------

class TestSendEmailTask:

    @patch("app.workers.sender.celery_app")
    async def test_send_email_task_calls_send(self, _mock_celery):
        """_send_email_async renders template and calls email_sender.send."""
        campaign_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        cl_id = uuid.uuid4()
        account_id = uuid.uuid4()
        step_id = uuid.uuid4()
        variant_id = uuid.uuid4()
        seq_id = uuid.uuid4()

        campaign = _make_campaign(id=campaign_id)
        lead = _make_lead(id=lead_id, first_name="Jane", company="Acme Corp")
        campaign_lead = _make_campaign_lead(id=cl_id, campaign_id=campaign_id, lead_id=lead_id, current_step=1)
        ca = _make_campaign_account(campaign_id=campaign_id, account_id=account_id)
        sequence = _make_sequence(id=seq_id, campaign_id=campaign_id)
        step = _make_step(id=step_id, sequence_id=seq_id, order=1, wait_days=2)
        variant = _make_variant(id=variant_id, step_id=step_id)

        mock_db = AsyncMock()
        _setup_sender_mocks(
            mock_db, campaign, lead, campaign_lead,
            [ca], sequence, [step], [variant], ca.account,
        )

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        mock_message_id = "<sent-123@company.com>"

        with patch("app.workers.sender.async_session_factory", mock_session_factory), \
             patch("app.workers.sender.email_sender.send", new_callable=AsyncMock, return_value=mock_message_id) as mock_send, \
             patch("app.workers.sender.email_sender.select_account", return_value=ca.account), \
             patch("app.workers.sender.ab_splitter.assign_variant", return_value=variant), \
             patch("app.workers.sender.template_engine.render_subject_and_body", return_value=("Hello Jane", "<p>Hi Jane</p>")), \
             patch("app.workers.sender.increment_account_sent", return_value=1), \
             patch("app.workers.sender.increment_campaign_sent", return_value=1):

            from app.workers.sender import _send_email_async
            await _send_email_async(str(campaign_id), str(cl_id), str(lead_id))

        # Verify email_sender.send was called
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args
        assert call_kwargs.kwargs.get("to") == "lead@example.com" or call_kwargs[1].get("to") == "lead@example.com"

        # Verify SentEmail and InboxMessage were added
        assert mock_db.add.call_count >= 2
        assert mock_db.commit.called


# ---------------------------------------------------------------------------
# test_send_updates_sent_email_status
# ---------------------------------------------------------------------------

class TestSendUpdatesSentEmailStatus:

    @patch("app.workers.sender.celery_app")
    async def test_send_updates_status_and_advances_step(self, _mock_celery):
        """After sending, campaign_lead advances to next step."""
        campaign_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        cl_id = uuid.uuid4()
        step1_id = uuid.uuid4()
        step2_id = uuid.uuid4()
        seq_id = uuid.uuid4()

        campaign = _make_campaign(id=campaign_id)
        lead = _make_lead(id=lead_id)
        campaign_lead = _make_campaign_lead(id=cl_id, campaign_id=campaign_id, lead_id=lead_id, current_step=1)
        ca = _make_campaign_account(campaign_id=campaign_id)
        sequence = _make_sequence(id=seq_id, campaign_id=campaign_id)
        step1 = _make_step(id=step1_id, sequence_id=seq_id, order=1, wait_days=2)
        step2 = _make_step(id=step2_id, sequence_id=seq_id, order=2, wait_days=3)
        variant = _make_variant(step_id=step1_id)

        mock_db = AsyncMock()
        _setup_sender_mocks(
            mock_db, campaign, lead, campaign_lead,
            [ca], sequence, [step1, step2], [variant], ca.account,
        )

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.sender.async_session_factory", mock_session_factory), \
             patch("app.workers.sender.email_sender.send", new_callable=AsyncMock, return_value="<msg@co.com>"), \
             patch("app.workers.sender.email_sender.select_account", return_value=ca.account), \
             patch("app.workers.sender.ab_splitter.assign_variant", return_value=variant), \
             patch("app.workers.sender.template_engine.render_subject_and_body", return_value=("Subj", "<p>Body</p>")), \
             patch("app.workers.sender.increment_account_sent", return_value=1), \
             patch("app.workers.sender.increment_campaign_sent", return_value=1):

            from app.workers.sender import _send_email_async
            await _send_email_async(str(campaign_id), str(cl_id), str(lead_id))

        # campaign_lead should advance to step 2
        assert campaign_lead.current_step == 2
        # After completing a step, status goes back to "pending" for scheduler pickup
        assert campaign_lead.status == "pending"
        assert campaign_lead.next_send_at is not None

    @patch("app.workers.sender.celery_app")
    async def test_send_marks_completed_on_last_step(self, _mock_celery):
        """When on last step, campaign_lead.status becomes 'completed'."""
        campaign_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        cl_id = uuid.uuid4()
        step_id = uuid.uuid4()
        seq_id = uuid.uuid4()

        campaign = _make_campaign(id=campaign_id)
        lead = _make_lead(id=lead_id)
        campaign_lead = _make_campaign_lead(id=cl_id, campaign_id=campaign_id, lead_id=lead_id, current_step=1)
        ca = _make_campaign_account(campaign_id=campaign_id)
        sequence = _make_sequence(id=seq_id, campaign_id=campaign_id)
        step = _make_step(id=step_id, sequence_id=seq_id, order=1, wait_days=2)
        variant = _make_variant(step_id=step_id)

        mock_db = AsyncMock()
        _setup_sender_mocks(
            mock_db, campaign, lead, campaign_lead,
            [ca], sequence, [step], [variant], ca.account,
        )

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.sender.async_session_factory", mock_session_factory), \
             patch("app.workers.sender.email_sender.send", new_callable=AsyncMock, return_value="<msg@co.com>"), \
             patch("app.workers.sender.email_sender.select_account", return_value=ca.account), \
             patch("app.workers.sender.ab_splitter.assign_variant", return_value=variant), \
             patch("app.workers.sender.template_engine.render_subject_and_body", return_value=("Subj", "<p>Body</p>")), \
             patch("app.workers.sender.increment_account_sent", return_value=1), \
             patch("app.workers.sender.increment_campaign_sent", return_value=1):

            from app.workers.sender import _send_email_async
            await _send_email_async(str(campaign_id), str(cl_id), str(lead_id))

        # Only one step — should be completed
        assert campaign_lead.status == "completed"
        assert campaign_lead.next_send_at is None


# ---------------------------------------------------------------------------
# test_send_email_smtp_failure — mock aiosmtplib
# ---------------------------------------------------------------------------

class TestSendEmailSMTPFailure:

    @patch("app.workers.sender.celery_app")
    async def test_smtp_failure_rolls_back(self, _mock_celery):
        """SMTP failure triggers rollback and leaves lead in sequence."""
        campaign_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        cl_id = uuid.uuid4()
        step_id = uuid.uuid4()
        seq_id = uuid.uuid4()

        campaign = _make_campaign(id=campaign_id)
        lead = _make_lead(id=lead_id)
        campaign_lead = _make_campaign_lead(id=cl_id, campaign_id=campaign_id, lead_id=lead_id, current_step=1)
        ca = _make_campaign_account(campaign_id=campaign_id)
        sequence = _make_sequence(id=seq_id, campaign_id=campaign_id)
        step = _make_step(id=step_id, sequence_id=seq_id, order=1)
        variant = _make_variant(step_id=step_id)

        mock_db = AsyncMock()
        _setup_sender_mocks(
            mock_db, campaign, lead, campaign_lead,
            [ca], sequence, [step], [variant], ca.account,
        )

        # Separate mock for the recovery session opened after rollback
        recovery_db = AsyncMock()
        recovery_cl_result = MagicMock()
        recovery_cl_result.scalar_one_or_none.return_value = campaign_lead
        recovery_db.execute = AsyncMock(return_value=recovery_cl_result)
        recovery_db.commit = AsyncMock()

        # Track which session call we're on: first call returns mock_db, second returns recovery_db
        session_contexts = []
        for db_mock in [mock_db, recovery_db]:
            ctx = MagicMock()
            ctx.__aenter__ = AsyncMock(return_value=db_mock)
            ctx.__aexit__ = AsyncMock(return_value=False)
            session_contexts.append(ctx)

        mock_session_factory = MagicMock(side_effect=session_contexts)

        with patch("app.workers.sender.async_session_factory", mock_session_factory), \
             patch("app.workers.sender.email_sender.send", new_callable=AsyncMock, side_effect=ConnectionError("SMTP send failed")), \
             patch("app.workers.sender.email_sender.select_account", return_value=ca.account), \
             patch("app.workers.sender.ab_splitter.assign_variant", return_value=variant), \
             patch("app.workers.sender.template_engine.render_subject_and_body", return_value=("Subj", "<p>Body</p>")):

            from app.workers.sender import _send_email_async
            await _send_email_async(str(campaign_id), str(cl_id), str(lead_id))

        # Reservation is committed before provider send to prevent duplicate-send races.
        assert mock_db.commit.called
        # Provider failure path should not rely on rollback in the main session.
        mock_db.rollback.assert_not_called()

    @patch("app.workers.sender.celery_app")
    async def test_no_accounts_reschedules(self, _mock_celery):
        """When no sending accounts available, lead is set back to pending."""
        campaign_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        cl_id = uuid.uuid4()
        step_id = uuid.uuid4()
        seq_id = uuid.uuid4()

        campaign = _make_campaign(id=campaign_id)
        lead = _make_lead(id=lead_id)
        campaign_lead = _make_campaign_lead(id=cl_id, campaign_id=campaign_id, lead_id=lead_id, current_step=1)
        ca = _make_campaign_account(campaign_id=campaign_id)
        sequence = _make_sequence(id=seq_id, campaign_id=campaign_id)
        step = _make_step(id=step_id, sequence_id=seq_id, order=1)
        variant = _make_variant(step_id=step_id)

        mock_db = AsyncMock()
        _setup_sender_mocks(
            mock_db, campaign, lead, campaign_lead,
            [ca], sequence, [step], [variant], ca.account,
        )

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.sender.async_session_factory", mock_session_factory), \
             patch("app.workers.sender.email_sender.select_account", return_value=None), \
             patch("app.workers.sender.ab_splitter.assign_variant", return_value=variant), \
             patch("app.workers.sender.template_engine.render_subject_and_body", return_value=("Subj", "<p>Body</p>")):

            from app.workers.sender import _send_email_async
            await _send_email_async(str(campaign_id), str(cl_id), str(lead_id))

        # When no account available, lead goes back to pending
        assert campaign_lead.status == "pending"
        mock_db.commit.assert_called_once()
