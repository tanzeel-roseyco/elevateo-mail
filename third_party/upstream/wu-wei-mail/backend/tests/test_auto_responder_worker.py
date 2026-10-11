"""Tests for auto-responder worker — full flow, escalation, opt-out, rate limiting, cooldown."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_WORKSPACE_ID


def _make_config(**overrides):
    """Create a mock AutoResponderConfig."""
    config = MagicMock()
    config.id = overrides.get("id", uuid.uuid4())
    config.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    config.is_enabled = overrides.get("is_enabled", True)
    config.ai_model = overrides.get("ai_model", "openai/gpt-4o")
    config.ai_api_key_encrypted = overrides.get("ai_api_key_encrypted", "encrypted-key")
    config.tone = overrides.get("tone", "professional")
    config.brand_description = overrides.get("brand_description", "Test Company")
    config.example_phrases = overrides.get("example_phrases", [])
    config.forbidden_words = overrides.get("forbidden_words", [])
    config.signature_template = overrides.get("signature_template", None)
    config.language = overrides.get("language", "en")
    config.max_response_length = overrides.get("max_response_length", 500)
    config.confidence_threshold = overrides.get("confidence_threshold", 0.7)
    config.escalation_keywords = overrides.get("escalation_keywords", [])
    config.max_responses_per_hour = overrides.get("max_responses_per_hour", 50)
    config.cooldown_minutes = overrides.get("cooldown_minutes", 5)
    return config


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
    lead.industry = overrides.get("industry", "Technology")
    lead.country = overrides.get("country", "US")
    lead.custom_fields = overrides.get("custom_fields", {})
    lead.status = overrides.get("status", "active")
    return lead


def _make_inbox_message(**overrides):
    """Create a mock InboxMessage."""
    msg = MagicMock()
    msg.id = overrides.get("id", uuid.uuid4())
    msg.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    msg.account_id = overrides.get("account_id", uuid.uuid4())
    msg.campaign_id = overrides.get("campaign_id", uuid.uuid4())
    msg.lead_id = overrides.get("lead_id", uuid.uuid4())
    msg.message_id = overrides.get("message_id", f"<{uuid.uuid4()}@example.com>")
    msg.thread_id = overrides.get("thread_id", f"thread-{uuid.uuid4()}")
    msg.from_email = overrides.get("from_email", "lead@example.com")
    msg.to_email = overrides.get("to_email", "me@company.com")
    msg.subject = overrides.get("subject", "Re: Hello")
    msg.body_text = overrides.get("body_text", "I'm interested in your product.")
    msg.body_html = overrides.get("body_html", None)
    msg.direction = overrides.get("direction", "inbound")
    msg.is_read = overrides.get("is_read", False)
    msg.is_auto_reply = overrides.get("is_auto_reply", False)
    msg.responder_status = overrides.get("responder_status", None)
    msg.received_at = overrides.get("received_at", datetime.now(timezone.utc))
    msg.created_at = overrides.get("created_at", datetime.now(timezone.utc))
    return msg


def _make_account(**overrides):
    """Create a mock EmailAccount."""
    account = MagicMock()
    account.id = overrides.get("id", uuid.uuid4())
    account.email = overrides.get("email", "sender@company.com")
    account.is_active = overrides.get("is_active", True)
    return account


# ---------------------------------------------------------------------------
# Full flow: inbound message -> AI response -> email sent -> log created
# ---------------------------------------------------------------------------

class TestAutoResponderFullFlow:

    @patch("app.workers.auto_responder_worker.celery_app")
    async def test_full_flow_success(self, _mock_celery):
        """Inbound message triggers AI response, email is sent, log is created."""
        msg_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        account_id = uuid.uuid4()

        inbound = _make_inbox_message(id=msg_id, lead_id=lead_id, account_id=account_id)
        config = _make_config(is_enabled=True)
        lead = _make_lead(id=lead_id)
        account = _make_account(id=account_id)

        mock_db = AsyncMock()

        # 1. InboxMessage query
        msg_result = MagicMock()
        msg_result.scalar_one_or_none.return_value = inbound

        # 2. Config query (get_or_create_config)
        config_result = MagicMock()
        config_result.scalar_one_or_none.return_value = config

        # 3. Lead query
        lead_result = MagicMock()
        lead_result.scalar_one_or_none.return_value = lead

        # 4. Suppression check (count=0)
        sup_result = MagicMock()
        sup_result.scalar.return_value = 0

        # 5. Rate limit check (count=0, under limit)
        rate_result = MagicMock()
        rate_result.scalar.return_value = 0

        # 6. Cooldown check (count=0, safe)
        cooldown_result = MagicMock()
        cooldown_result.scalar.return_value = 0

        # 7. Region query (no regions)
        region_result = MagicMock()
        region_result.scalars.return_value.all.return_value = []

        # 8. Rules query (no rules)
        rules_result = MagicMock()
        rules_result.scalars.return_value.all.return_value = []

        # 9. Conversation history (thread messages)
        thread_result = MagicMock()
        thread_result.scalars.return_value.all.return_value = []

        # 10. Account query
        account_result = MagicMock()
        account_result.scalar_one_or_none.return_value = account

        mock_db.execute = AsyncMock(side_effect=[
            msg_result,
            config_result,
            lead_result,
            sup_result,
            rate_result,
            cooldown_result,
            region_result,
            rules_result,
            thread_result,
            account_result,
        ])
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        ai_response = {
            "body": "Thank you for your interest! We'd love to schedule a demo.",
            "confidence": 0.92,
            "intent": "interested",
            "prompt_tokens": 150,
            "completion_tokens": 50,
        }

        with patch("app.workers.auto_responder_worker.async_session_factory", mock_session_factory), \
             patch("app.workers.auto_responder_worker.auto_responder_service.get_decrypted_api_key", return_value="test-api-key"), \
             patch("app.workers.auto_responder_worker.auto_responder_service.build_prompt", return_value=("system", "user")), \
             patch("app.workers.auto_responder_worker.auto_responder_service.apply_guardrails", return_value=(True, None)), \
             patch("app.services.ai_provider.generate_response", new_callable=AsyncMock, return_value=ai_response) as mock_ai, \
             patch("app.workers.auto_responder_worker.email_sender.send", new_callable=AsyncMock, return_value="<reply-123@company.com>") as mock_send:

            from app.workers.auto_responder_worker import _process_auto_response_async
            await _process_auto_response_async(str(msg_id))

        # Email was sent
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args
        assert call_kwargs.kwargs.get("to") == "lead@example.com" or call_kwargs[1].get("to") == "lead@example.com"

        # Outbound message and log were added
        assert mock_db.add.call_count >= 2  # outbound InboxMessage + ResponderNote
        mock_db.commit.assert_called_once()

        # Responder status was set to 'responded'
        assert inbound.responder_status == "responded"


# ---------------------------------------------------------------------------
# Escalation flow: low confidence -> message marked as escalated
# ---------------------------------------------------------------------------

class TestAutoResponderEscalation:

    @patch("app.workers.auto_responder_worker.celery_app")
    async def test_low_confidence_escalation(self, _mock_celery):
        """AI response with low confidence triggers escalation."""
        msg_id = uuid.uuid4()
        lead_id = uuid.uuid4()

        inbound = _make_inbox_message(id=msg_id, lead_id=lead_id)
        config = _make_config(is_enabled=True, confidence_threshold=0.7)
        lead = _make_lead(id=lead_id)

        mock_db = AsyncMock()

        msg_result = MagicMock()
        msg_result.scalar_one_or_none.return_value = inbound

        config_result = MagicMock()
        config_result.scalar_one_or_none.return_value = config

        lead_result = MagicMock()
        lead_result.scalar_one_or_none.return_value = lead

        sup_result = MagicMock()
        sup_result.scalar.return_value = 0

        rate_result = MagicMock()
        rate_result.scalar.return_value = 0

        cooldown_result = MagicMock()
        cooldown_result.scalar.return_value = 0

        region_result = MagicMock()
        region_result.scalars.return_value.all.return_value = []

        rules_result = MagicMock()
        rules_result.scalars.return_value.all.return_value = []

        thread_result = MagicMock()
        thread_result.scalars.return_value.all.return_value = []

        mock_db.execute = AsyncMock(side_effect=[
            msg_result,
            config_result,
            lead_result,
            sup_result,
            rate_result,
            cooldown_result,
            region_result,
            rules_result,
            thread_result,
        ])
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        ai_response = {
            "body": "I'm not sure how to respond to this.",
            "confidence": 0.3,
            "intent": "other",
        }

        with patch("app.workers.auto_responder_worker.async_session_factory", mock_session_factory), \
             patch("app.workers.auto_responder_worker.auto_responder_service.get_decrypted_api_key", return_value="test-api-key"), \
             patch("app.workers.auto_responder_worker.auto_responder_service.build_prompt", return_value=("system", "user")), \
             patch("app.workers.auto_responder_worker.auto_responder_service.apply_guardrails", return_value=(False, "Low confidence: 0.30 < 0.70")), \
             patch("app.services.ai_provider.generate_response", new_callable=AsyncMock, return_value=ai_response), \
             patch("app.workers.auto_responder_worker.email_sender.send", new_callable=AsyncMock) as mock_send:

            from app.workers.auto_responder_worker import _process_auto_response_async
            await _process_auto_response_async(str(msg_id))

        # Email should NOT have been sent
        mock_send.assert_not_called()

        # Message should be escalated
        assert inbound.responder_status == "escalated"

        # Commit should have been called to save the escalation
        mock_db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# Opt-out detection: "unsubscribe" -> suppression added, escalated
# ---------------------------------------------------------------------------

class TestAutoResponderOptOut:

    @patch("app.workers.auto_responder_worker.celery_app")
    async def test_opt_out_detected(self, _mock_celery):
        """Message with opt-out keyword adds suppression and marks as escalated."""
        msg_id = uuid.uuid4()
        lead_id = uuid.uuid4()

        inbound = _make_inbox_message(
            id=msg_id,
            lead_id=lead_id,
            body_text="Please unsubscribe me from these emails.",
        )
        config = _make_config(is_enabled=True)
        lead = _make_lead(id=lead_id, email="lead@example.com")

        mock_db = AsyncMock()

        msg_result = MagicMock()
        msg_result.scalar_one_or_none.return_value = inbound

        config_result = MagicMock()
        config_result.scalar_one_or_none.return_value = config

        lead_result = MagicMock()
        lead_result.scalar_one_or_none.return_value = lead

        # Suppression check (not suppressed)
        sup_result = MagicMock()
        sup_result.scalar.return_value = 0

        mock_db.execute = AsyncMock(side_effect=[
            msg_result,
            config_result,
            lead_result,
            sup_result,
        ])
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.auto_responder_worker.async_session_factory", mock_session_factory), \
             patch("app.workers.auto_responder_worker.email_sender.send", new_callable=AsyncMock) as mock_send:

            from app.workers.auto_responder_worker import _process_auto_response_async
            await _process_auto_response_async(str(msg_id))

        # Email should NOT have been sent
        mock_send.assert_not_called()

        # Lead status should be updated
        assert lead.status == "unsubscribed"

        # Message should be escalated
        assert inbound.responder_status == "escalated"

        # Suppression should have been added (via db.add)
        assert mock_db.add.call_count >= 1
        mock_db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# Rate limiting: many recent responses -> message re-queued
# ---------------------------------------------------------------------------

class TestAutoResponderRateLimit:

    @patch("app.workers.auto_responder_worker.celery_app")
    @patch("app.workers.auto_responder_worker.process_auto_response")
    async def test_rate_limit_requeues(self, mock_task, _mock_celery):
        """When rate limit is exceeded, message stays pending and is re-queued."""
        msg_id = uuid.uuid4()
        lead_id = uuid.uuid4()

        inbound = _make_inbox_message(id=msg_id, lead_id=lead_id)
        config = _make_config(is_enabled=True, max_responses_per_hour=50)
        lead = _make_lead(id=lead_id)

        mock_db = AsyncMock()

        msg_result = MagicMock()
        msg_result.scalar_one_or_none.return_value = inbound

        config_result = MagicMock()
        config_result.scalar_one_or_none.return_value = config

        lead_result = MagicMock()
        lead_result.scalar_one_or_none.return_value = lead

        sup_result = MagicMock()
        sup_result.scalar.return_value = 0

        # Rate limit: 50 sent in the last hour (at limit)
        rate_result = MagicMock()
        rate_result.scalar.return_value = 50

        mock_db.execute = AsyncMock(side_effect=[
            msg_result,
            config_result,
            lead_result,
            sup_result,
            rate_result,
        ])
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.auto_responder_worker.async_session_factory", mock_session_factory):

            from app.workers.auto_responder_worker import _process_auto_response_async
            await _process_auto_response_async(str(msg_id))

        # Message should stay as pending
        assert inbound.responder_status == "pending"

        # Task should have been re-queued with delay
        mock_task.apply_async.assert_called_once()
        call_kwargs = mock_task.apply_async.call_args
        assert call_kwargs.kwargs.get("countdown") == 60 or call_kwargs[1].get("countdown") == 60

        mock_db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# Cooldown: recent response to same lead -> skipped
# ---------------------------------------------------------------------------

class TestAutoResponderCooldown:

    @patch("app.workers.auto_responder_worker.celery_app")
    async def test_cooldown_skips(self, _mock_celery):
        """When lead was recently responded to, message is skipped."""
        msg_id = uuid.uuid4()
        lead_id = uuid.uuid4()

        inbound = _make_inbox_message(id=msg_id, lead_id=lead_id)
        config = _make_config(is_enabled=True, cooldown_minutes=5)
        lead = _make_lead(id=lead_id)

        mock_db = AsyncMock()

        msg_result = MagicMock()
        msg_result.scalar_one_or_none.return_value = inbound

        config_result = MagicMock()
        config_result.scalar_one_or_none.return_value = config

        lead_result = MagicMock()
        lead_result.scalar_one_or_none.return_value = lead

        sup_result = MagicMock()
        sup_result.scalar.return_value = 0

        # Rate limit passes
        rate_result = MagicMock()
        rate_result.scalar.return_value = 0

        # Cooldown: 1 response in the last 5 minutes (in cooldown)
        cooldown_result = MagicMock()
        cooldown_result.scalar.return_value = 1

        mock_db.execute = AsyncMock(side_effect=[
            msg_result,
            config_result,
            lead_result,
            sup_result,
            rate_result,
            cooldown_result,
        ])
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.auto_responder_worker.async_session_factory", mock_session_factory):

            from app.workers.auto_responder_worker import _process_auto_response_async
            await _process_auto_response_async(str(msg_id))

        # Message should be skipped
        assert inbound.responder_status == "skipped"
        mock_db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# Disabled config: auto-responder disabled -> message skipped
# ---------------------------------------------------------------------------

class TestAutoResponderDisabled:

    @patch("app.workers.auto_responder_worker.celery_app")
    async def test_disabled_config_skips(self, _mock_celery):
        """When auto-responder is disabled, message is skipped."""
        msg_id = uuid.uuid4()

        inbound = _make_inbox_message(id=msg_id)
        config = _make_config(is_enabled=False)

        mock_db = AsyncMock()

        msg_result = MagicMock()
        msg_result.scalar_one_or_none.return_value = inbound

        config_result = MagicMock()
        config_result.scalar_one_or_none.return_value = config

        mock_db.execute = AsyncMock(side_effect=[
            msg_result,
            config_result,
        ])
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.auto_responder_worker.async_session_factory", mock_session_factory):

            from app.workers.auto_responder_worker import _process_auto_response_async
            await _process_auto_response_async(str(msg_id))

        # Message should be skipped
        assert inbound.responder_status == "skipped"
        mock_db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# No lead: message without lead_id -> skipped
# ---------------------------------------------------------------------------

class TestAutoResponderNoLead:

    @patch("app.workers.auto_responder_worker.celery_app")
    async def test_no_lead_skips(self, _mock_celery):
        """When message has no associated lead, it is skipped."""
        msg_id = uuid.uuid4()

        inbound = _make_inbox_message(id=msg_id, lead_id=None)
        config = _make_config(is_enabled=True)

        mock_db = AsyncMock()

        msg_result = MagicMock()
        msg_result.scalar_one_or_none.return_value = inbound

        config_result = MagicMock()
        config_result.scalar_one_or_none.return_value = config

        mock_db.execute = AsyncMock(side_effect=[
            msg_result,
            config_result,
        ])
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.auto_responder_worker.async_session_factory", mock_session_factory):

            from app.workers.auto_responder_worker import _process_auto_response_async
            await _process_auto_response_async(str(msg_id))

        # Message should be skipped
        assert inbound.responder_status == "skipped"
        mock_db.commit.assert_called_once()

    @patch("app.workers.auto_responder_worker.celery_app")
    async def test_lead_id_set_but_not_found(self, _mock_celery):
        """When lead_id is set but lead is not found in DB, message is skipped."""
        msg_id = uuid.uuid4()
        lead_id = uuid.uuid4()

        inbound = _make_inbox_message(id=msg_id, lead_id=lead_id)
        config = _make_config(is_enabled=True)

        mock_db = AsyncMock()

        msg_result = MagicMock()
        msg_result.scalar_one_or_none.return_value = inbound

        config_result = MagicMock()
        config_result.scalar_one_or_none.return_value = config

        # Lead not found
        lead_result = MagicMock()
        lead_result.scalar_one_or_none.return_value = None

        mock_db.execute = AsyncMock(side_effect=[
            msg_result,
            config_result,
            lead_result,
        ])
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()
        mock_db.commit = AsyncMock()
        mock_db.rollback = AsyncMock()

        mock_session_factory = MagicMock()
        mock_session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_db)
        mock_session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("app.workers.auto_responder_worker.async_session_factory", mock_session_factory):

            from app.workers.auto_responder_worker import _process_auto_response_async
            await _process_auto_response_async(str(msg_id))

        # Message should be skipped
        assert inbound.responder_status == "skipped"
        mock_db.commit.assert_called_once()
