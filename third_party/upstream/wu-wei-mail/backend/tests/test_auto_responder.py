"""Tests for auto-responder service — region conditions, opt-out detection, guardrails, prompt building."""

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from app.services.auto_responder_service import AutoResponderService

from tests.conftest import TEST_WORKSPACE_ID


def _make_lead(**overrides):
    """Create a mock Lead with sensible defaults."""
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
    lead.state = overrides.get("state", "CA")
    lead.city = overrides.get("city", "San Francisco")
    lead.custom_fields = overrides.get("custom_fields", {})
    return lead


def _make_config(**overrides):
    """Create a mock AutoResponderConfig with sensible defaults."""
    config = MagicMock()
    config.id = overrides.get("id", uuid.uuid4())
    config.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    config.is_enabled = overrides.get("is_enabled", True)
    config.ai_model = overrides.get("ai_model", "openai/gpt-4o")
    config.tone = overrides.get("tone", "professional")
    config.brand_description = overrides.get("brand_description", "Wu Wei Mail, an email platform")
    config.example_phrases = overrides.get("example_phrases", ["Happy to help!", "Let me know if you have questions."])
    config.forbidden_words = overrides.get("forbidden_words", ["guaranteed", "spam"])
    config.signature_template = overrides.get("signature_template", None)
    config.language = overrides.get("language", "en")
    config.max_response_length = overrides.get("max_response_length", 500)
    config.confidence_threshold = overrides.get("confidence_threshold", 0.7)
    config.escalation_keywords = overrides.get("escalation_keywords", ["legal", "lawsuit", "attorney"])
    config.max_responses_per_hour = overrides.get("max_responses_per_hour", 50)
    config.cooldown_minutes = overrides.get("cooldown_minutes", 5)
    return config


def _make_inbox_message(**overrides):
    """Create a mock InboxMessage with sensible defaults."""
    msg = MagicMock()
    msg.id = overrides.get("id", uuid.uuid4())
    msg.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    msg.account_id = overrides.get("account_id", uuid.uuid4())
    msg.campaign_id = overrides.get("campaign_id", None)
    msg.lead_id = overrides.get("lead_id", None)
    msg.message_id = overrides.get("message_id", f"<{uuid.uuid4()}@example.com>")
    msg.thread_id = overrides.get("thread_id", f"thread-{uuid.uuid4()}")
    msg.from_email = overrides.get("from_email", "lead@example.com")
    msg.to_email = overrides.get("to_email", "me@company.com")
    msg.subject = overrides.get("subject", "Re: Hello")
    msg.body_text = overrides.get("body_text", "Thanks for reaching out.")
    msg.body_html = overrides.get("body_html", None)
    msg.direction = overrides.get("direction", "inbound")
    msg.is_read = overrides.get("is_read", False)
    msg.is_auto_reply = overrides.get("is_auto_reply", False)
    msg.received_at = overrides.get("received_at", datetime.now(timezone.utc))
    msg.created_at = overrides.get("created_at", datetime.now(timezone.utc))
    return msg


@pytest.fixture
def service():
    return AutoResponderService()


# ---------------------------------------------------------------------------
# evaluate_region_conditions — various operators
# ---------------------------------------------------------------------------

class TestEvaluateRegionConditions:

    def test_eq_operator_matches(self, service):
        """eq operator should match when field equals target."""
        lead = _make_lead(country="US")
        conditions = {"rules": [{"field": "country", "operator": "eq", "value": "US"}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_eq_operator_case_insensitive(self, service):
        """eq operator should be case-insensitive."""
        lead = _make_lead(country="us")
        conditions = {"rules": [{"field": "country", "operator": "eq", "value": "US"}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_eq_operator_no_match(self, service):
        """eq operator should return False when field does not equal target."""
        lead = _make_lead(country="UK")
        conditions = {"rules": [{"field": "country", "operator": "eq", "value": "US"}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is False

    def test_neq_operator_matches(self, service):
        """neq operator should match when field does not equal target."""
        lead = _make_lead(country="UK")
        conditions = {"rules": [{"field": "country", "operator": "neq", "value": "US"}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_neq_operator_no_match(self, service):
        """neq operator should return False when field equals target."""
        lead = _make_lead(country="US")
        conditions = {"rules": [{"field": "country", "operator": "neq", "value": "US"}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is False

    def test_in_operator_matches(self, service):
        """in operator should match when field value is in target list."""
        lead = _make_lead(country="US")
        conditions = {"rules": [{"field": "country", "operator": "in", "value": ["US", "CA", "UK"]}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_in_operator_no_match(self, service):
        """in operator should return False when field value is not in target list."""
        lead = _make_lead(country="DE")
        conditions = {"rules": [{"field": "country", "operator": "in", "value": ["US", "CA", "UK"]}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is False

    def test_not_in_operator_matches(self, service):
        """not_in operator should match when field value is not in target list."""
        lead = _make_lead(country="DE")
        conditions = {"rules": [{"field": "country", "operator": "not_in", "value": ["US", "CA", "UK"]}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_not_in_operator_no_match(self, service):
        """not_in operator should return False when field value is in target list."""
        lead = _make_lead(country="US")
        conditions = {"rules": [{"field": "country", "operator": "not_in", "value": ["US", "CA", "UK"]}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is False

    def test_contains_operator_matches(self, service):
        """contains operator should match when target is in field value."""
        lead = _make_lead(company="Acme Corporation")
        conditions = {"rules": [{"field": "company", "operator": "contains", "value": "Acme"}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_contains_operator_no_match(self, service):
        """contains operator should return False when target is not in field value."""
        lead = _make_lead(company="Widget Inc")
        conditions = {"rules": [{"field": "company", "operator": "contains", "value": "Acme"}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is False

    def test_starts_with_operator_matches(self, service):
        """starts_with operator should match when field starts with target."""
        lead = _make_lead(email="sales@acme.com")
        conditions = {"rules": [{"field": "email", "operator": "starts_with", "value": "sales@"}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_starts_with_operator_no_match(self, service):
        """starts_with operator should return False when field does not start with target."""
        lead = _make_lead(email="info@acme.com")
        conditions = {"rules": [{"field": "email", "operator": "starts_with", "value": "sales@"}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is False

    def test_empty_rules_matches_all(self, service):
        """Empty rules list should match all leads."""
        lead = _make_lead()
        conditions = {"rules": [], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_no_rules_key_matches_all(self, service):
        """Missing rules key should match all leads."""
        lead = _make_lead()
        conditions = {}
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_custom_field_lookup(self, service):
        """Should fall back to custom_fields when lead attribute is not found."""
        lead = _make_lead(custom_fields={"plan_tier": "enterprise"})
        # Ensure the attribute doesn't exist on the mock for the normal path
        del lead.plan_tier
        lead.plan_tier = None
        lead.custom_fields = {"plan_tier": "enterprise"}
        conditions = {"rules": [{"field": "plan_tier", "operator": "eq", "value": "enterprise"}], "match_all": True}
        assert service.evaluate_region_conditions(lead, conditions) is True


# ---------------------------------------------------------------------------
# evaluate_region_conditions — match_all vs match_any
# ---------------------------------------------------------------------------

class TestEvaluateRegionMatchMode:

    def test_match_all_true_all_pass(self, service):
        """match_all=True with all rules passing should return True."""
        lead = _make_lead(country="US", industry="Technology")
        conditions = {
            "rules": [
                {"field": "country", "operator": "eq", "value": "US"},
                {"field": "industry", "operator": "eq", "value": "Technology"},
            ],
            "match_all": True,
        }
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_match_all_true_one_fails(self, service):
        """match_all=True with one failing rule should return False."""
        lead = _make_lead(country="US", industry="Finance")
        conditions = {
            "rules": [
                {"field": "country", "operator": "eq", "value": "US"},
                {"field": "industry", "operator": "eq", "value": "Technology"},
            ],
            "match_all": True,
        }
        assert service.evaluate_region_conditions(lead, conditions) is False

    def test_match_all_false_one_passes(self, service):
        """match_all=False (any) with one passing rule should return True."""
        lead = _make_lead(country="US", industry="Finance")
        conditions = {
            "rules": [
                {"field": "country", "operator": "eq", "value": "US"},
                {"field": "industry", "operator": "eq", "value": "Technology"},
            ],
            "match_all": False,
        }
        assert service.evaluate_region_conditions(lead, conditions) is True

    def test_match_all_false_none_pass(self, service):
        """match_all=False (any) with no passing rules should return False."""
        lead = _make_lead(country="DE", industry="Finance")
        conditions = {
            "rules": [
                {"field": "country", "operator": "eq", "value": "US"},
                {"field": "industry", "operator": "eq", "value": "Technology"},
            ],
            "match_all": False,
        }
        assert service.evaluate_region_conditions(lead, conditions) is False


# ---------------------------------------------------------------------------
# evaluate_region_conditions — missing fields
# ---------------------------------------------------------------------------

class TestEvaluateRegionMissingFields:

    def test_missing_field_returns_false(self, service):
        """A rule referencing a missing field should evaluate to False."""
        lead = _make_lead()
        # Use a field that doesn't exist on the lead
        lead.nonexistent_field = None
        lead.custom_fields = {}
        conditions = {
            "rules": [{"field": "nonexistent_field", "operator": "eq", "value": "something"}],
            "match_all": True,
        }
        assert service.evaluate_region_conditions(lead, conditions) is False

    def test_missing_field_with_match_any(self, service):
        """Missing field with match_all=False and another passing rule should still pass."""
        lead = _make_lead(country="US")
        lead.nonexistent_field = None
        lead.custom_fields = {}
        conditions = {
            "rules": [
                {"field": "nonexistent_field", "operator": "eq", "value": "something"},
                {"field": "country", "operator": "eq", "value": "US"},
            ],
            "match_all": False,
        }
        assert service.evaluate_region_conditions(lead, conditions) is True


# ---------------------------------------------------------------------------
# detect_opt_out
# ---------------------------------------------------------------------------

class TestDetectOptOut:

    def test_unsubscribe_keyword(self, service):
        """Message containing 'unsubscribe' should be flagged."""
        assert service.detect_opt_out("Please unsubscribe me from this list.") is True

    def test_opt_out_keyword(self, service):
        """Message containing 'opt out' should be flagged."""
        assert service.detect_opt_out("I want to opt out of these emails.") is True

    def test_opt_out_hyphenated(self, service):
        """Message containing 'opt-out' should be flagged."""
        assert service.detect_opt_out("Please opt-out me.") is True

    def test_stop_emailing(self, service):
        """Message containing 'stop emailing' should be flagged."""
        assert service.detect_opt_out("Stop emailing me immediately.") is True

    def test_remove_me(self, service):
        """Message containing 'remove me' should be flagged."""
        assert service.detect_opt_out("Remove me from your list.") is True

    def test_do_not_contact(self, service):
        """Message containing 'do not contact' should be flagged."""
        assert service.detect_opt_out("Please do not contact me again.") is True

    def test_take_me_off(self, service):
        """Message containing 'take me off' should be flagged."""
        assert service.detect_opt_out("Take me off this mailing list.") is True

    def test_no_more_emails(self, service):
        """Message containing 'no more emails' should be flagged."""
        assert service.detect_opt_out("No more emails please.") is True

    def test_clean_message_not_flagged(self, service):
        """Normal message without opt-out keywords should not be flagged."""
        assert service.detect_opt_out("I'm interested in your product. Can we schedule a demo?") is False

    def test_empty_message(self, service):
        """Empty message should not be flagged."""
        assert service.detect_opt_out("") is False

    def test_none_message(self, service):
        """None message should not be flagged."""
        assert service.detect_opt_out(None) is False

    def test_case_insensitive(self, service):
        """Opt-out detection should be case-insensitive."""
        assert service.detect_opt_out("UNSUBSCRIBE ME") is True
        assert service.detect_opt_out("Please OPT OUT") is True


# ---------------------------------------------------------------------------
# apply_guardrails
# ---------------------------------------------------------------------------

class TestApplyGuardrails:

    def test_low_confidence_fails(self, service):
        """Response with confidence below threshold should be escalated."""
        config = _make_config(confidence_threshold=0.7)
        ai_response = {"body": "Sure, I can help!", "confidence": 0.4}
        inbound = _make_inbox_message()

        passed, reason = service.apply_guardrails(config, ai_response, inbound)
        assert passed is False
        assert "Low confidence" in reason
        assert "0.40" in reason

    def test_forbidden_words_detected(self, service):
        """Response containing forbidden words should be escalated."""
        config = _make_config(forbidden_words=["guaranteed", "spam"])
        ai_response = {"body": "This is guaranteed to work!", "confidence": 0.9}
        inbound = _make_inbox_message()

        passed, reason = service.apply_guardrails(config, ai_response, inbound)
        assert passed is False
        assert "Forbidden word" in reason
        assert "guaranteed" in reason

    def test_escalation_keywords_in_inbound(self, service):
        """Inbound message containing escalation keywords should trigger escalation."""
        config = _make_config(escalation_keywords=["legal", "lawsuit", "attorney"])
        ai_response = {"body": "Happy to help!", "confidence": 0.9}
        inbound = _make_inbox_message(body_text="I will contact my attorney about this.")

        passed, reason = service.apply_guardrails(config, ai_response, inbound)
        assert passed is False
        assert "Escalation keyword" in reason
        assert "attorney" in reason

    def test_escalation_keywords_in_subject(self, service):
        """Escalation keywords in subject should also trigger escalation."""
        config = _make_config(escalation_keywords=["legal", "lawsuit"])
        ai_response = {"body": "Happy to help!", "confidence": 0.9}
        inbound = _make_inbox_message(body_text="Please respond.", subject="Potential lawsuit")

        passed, reason = service.apply_guardrails(config, ai_response, inbound)
        assert passed is False
        assert "lawsuit" in reason

    def test_response_too_long(self, service):
        """Response exceeding 2x max_response_length should be escalated."""
        config = _make_config(max_response_length=100)
        long_body = "x" * 201  # Exceeds 100 * 2 = 200
        ai_response = {"body": long_body, "confidence": 0.9}
        inbound = _make_inbox_message()

        passed, reason = service.apply_guardrails(config, ai_response, inbound)
        assert passed is False
        assert "Response too long" in reason

    def test_passing_case(self, service):
        """Response that meets all guardrails should pass."""
        config = _make_config(
            confidence_threshold=0.7,
            forbidden_words=["guaranteed", "spam"],
            escalation_keywords=["legal", "lawsuit"],
            max_response_length=500,
        )
        ai_response = {"body": "Happy to help you with your inquiry!", "confidence": 0.85}
        inbound = _make_inbox_message(body_text="Can you tell me more about your product?")

        passed, reason = service.apply_guardrails(config, ai_response, inbound)
        assert passed is True
        assert reason is None

    def test_no_forbidden_words_configured(self, service):
        """When no forbidden words are configured, check should pass."""
        config = _make_config(forbidden_words=None)
        ai_response = {"body": "Anything goes here!", "confidence": 0.9}
        inbound = _make_inbox_message()

        passed, reason = service.apply_guardrails(config, ai_response, inbound)
        assert passed is True

    def test_no_escalation_keywords_configured(self, service):
        """When no escalation keywords are configured, check should pass."""
        config = _make_config(escalation_keywords=None)
        ai_response = {"body": "Happy to help!", "confidence": 0.9}
        inbound = _make_inbox_message(body_text="I will contact my attorney.")

        passed, reason = service.apply_guardrails(config, ai_response, inbound)
        assert passed is True


# ---------------------------------------------------------------------------
# build_prompt
# ---------------------------------------------------------------------------

class TestBuildPrompt:

    def test_system_prompt_includes_brand_description(self, service):
        """System prompt should include the brand description."""
        config = _make_config(brand_description="Wu Wei Mail, an email automation platform")
        lead = _make_lead()
        inbound = _make_inbox_message()

        system_prompt, user_prompt = service.build_prompt(config, None, lead, [], inbound)
        assert "Wu Wei Mail, an email automation platform" in system_prompt

    def test_system_prompt_includes_tone(self, service):
        """System prompt should include the configured tone."""
        config = _make_config(tone="casual")
        lead = _make_lead()
        inbound = _make_inbox_message()

        system_prompt, _ = service.build_prompt(config, None, lead, [], inbound)
        assert "casual" in system_prompt

    def test_system_prompt_includes_forbidden_words(self, service):
        """System prompt should list forbidden words."""
        config = _make_config(forbidden_words=["guaranteed", "spam", "free"])
        lead = _make_lead()
        inbound = _make_inbox_message()

        system_prompt, _ = service.build_prompt(config, None, lead, [], inbound)
        assert "guaranteed" in system_prompt
        assert "spam" in system_prompt
        assert "free" in system_prompt

    def test_system_prompt_includes_example_phrases(self, service):
        """System prompt should list example phrases."""
        config = _make_config(example_phrases=["Happy to help!", "Let me know!"])
        lead = _make_lead()
        inbound = _make_inbox_message()

        system_prompt, _ = service.build_prompt(config, None, lead, [], inbound)
        assert "Happy to help!" in system_prompt
        assert "Let me know!" in system_prompt

    def test_region_overrides_tone(self, service):
        """Region tone_override should take precedence over config tone."""
        config = _make_config(tone="professional")
        region = MagicMock()
        region.tone_override = "friendly"
        region.example_phrases_override = None
        region.custom_system_prompt = None
        lead = _make_lead()
        inbound = _make_inbox_message()

        system_prompt, _ = service.build_prompt(config, region, lead, [], inbound)
        assert "friendly" in system_prompt

    def test_region_overrides_example_phrases(self, service):
        """Region example_phrases_override should take precedence."""
        config = _make_config(example_phrases=["Default phrase"])
        region = MagicMock()
        region.tone_override = None
        region.example_phrases_override = ["Regional phrase"]
        region.custom_system_prompt = None
        lead = _make_lead()
        inbound = _make_inbox_message()

        system_prompt, _ = service.build_prompt(config, region, lead, [], inbound)
        assert "Regional phrase" in system_prompt

    def test_region_custom_system_prompt(self, service):
        """Region custom_system_prompt should be included in system prompt."""
        config = _make_config()
        region = MagicMock()
        region.tone_override = None
        region.example_phrases_override = None
        region.custom_system_prompt = "Always mention our 30-day trial."
        lead = _make_lead()
        inbound = _make_inbox_message()

        system_prompt, _ = service.build_prompt(config, region, lead, [], inbound)
        assert "Always mention our 30-day trial." in system_prompt

    def test_user_prompt_includes_lead_info(self, service):
        """User prompt should include lead name, company, title, industry."""
        config = _make_config()
        lead = _make_lead(first_name="Alice", last_name="Smith", company="TechCo", title="VP Sales", industry="SaaS")
        inbound = _make_inbox_message()

        _, user_prompt = service.build_prompt(config, None, lead, [], inbound)
        assert "Alice" in user_prompt
        assert "Smith" in user_prompt
        assert "TechCo" in user_prompt
        assert "VP Sales" in user_prompt
        assert "SaaS" in user_prompt

    def test_user_prompt_includes_inbound_message(self, service):
        """User prompt should include the inbound message subject and body."""
        config = _make_config()
        lead = _make_lead()
        inbound = _make_inbox_message(subject="Pricing Question", body_text="How much does the enterprise plan cost?")

        _, user_prompt = service.build_prompt(config, None, lead, [], inbound)
        assert "Pricing Question" in user_prompt
        assert "How much does the enterprise plan cost?" in user_prompt

    def test_user_prompt_includes_conversation_history(self, service):
        """User prompt should include previous messages in the conversation."""
        config = _make_config()
        lead = _make_lead()
        inbound = _make_inbox_message()

        prev_msg = _make_inbox_message(direction="outbound", subject="Hello", body_text="Just reaching out!")
        _, user_prompt = service.build_prompt(config, None, lead, [prev_msg], inbound)
        assert "Just reaching out!" in user_prompt
        assert "SENT" in user_prompt

    def test_system_prompt_includes_max_response_length(self, service):
        """System prompt should include the max response length."""
        config = _make_config(max_response_length=300)
        lead = _make_lead()
        inbound = _make_inbox_message()

        system_prompt, _ = service.build_prompt(config, None, lead, [], inbound)
        assert "300" in system_prompt
