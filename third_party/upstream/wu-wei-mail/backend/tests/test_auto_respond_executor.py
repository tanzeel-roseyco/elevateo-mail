"""Tests for Phase 4: Auto-Respond workflow node executor."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.workflow import ExecutionContext, ExecutionMeta, TriggerMeta
from app.services.workflow.node_executors import (
    AutoRespondExecutor,
    NodeResultAction,
    get_executor,
)


class TestAutoRespondExecutorRegistered:
    """Verify the auto_respond executor is registered."""

    def test_executor_registered(self):
        executor = get_executor("auto_respond")
        assert executor is not None
        assert isinstance(executor, AutoRespondExecutor)


class TestAutoRespondNoReplyText:
    """Test auto_respond when no reply text is found."""

    @pytest.mark.asyncio
    async def test_no_reply_text_escalates(self):
        executor = AutoRespondExecutor()
        config = {"confidence_threshold": 0.7}
        context = ExecutionContext(lead={"email": "test@test.com"})

        result = await executor.execute(config, context)

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["escalated"] is True
        assert result.output["response_sent"] is False
        assert "No reply text" in result.output["escalation_reason"]


class TestAutoRespondOptOut:
    """Test auto_respond detects opt-out keywords."""

    @pytest.mark.asyncio
    async def test_opt_out_detected(self):
        executor = AutoRespondExecutor()
        config = {"confidence_threshold": 0.7}
        context = ExecutionContext(
            lead={"email": "test@test.com", "first_name": "Alice"},
            vars={"reply_text": "Please unsubscribe me from your list"},
        )

        result = await executor.execute(config, context)

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["escalated"] is True
        assert result.output["intent"] == "opt_out"


class TestAutoRespondEscalationKeyword:
    """Test auto_respond detects escalation keywords."""

    @pytest.mark.asyncio
    async def test_escalation_keyword_detected(self):
        executor = AutoRespondExecutor()
        config = {
            "confidence_threshold": 0.7,
            "escalation_keywords": ["legal", "lawsuit"],
        }
        context = ExecutionContext(
            lead={"email": "test@test.com"},
            vars={"reply_text": "I will take legal action if you contact me again"},
        )

        result = await executor.execute(config, context)

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["escalated"] is True
        assert result.output["intent"] == "escalation"
        assert "legal" in result.output["escalation_reason"]


class TestAutoRespondAISuccess:
    """Test auto_respond with successful AI generation (stub mode)."""

    @pytest.mark.asyncio
    async def test_ai_success_stub_mode(self):
        """When AI succeeds and guardrails pass, returns response_sent=True in stub mode."""
        executor = AutoRespondExecutor()
        config = {
            "confidence_threshold": 0.5,
            "tone": "friendly",
            "brand_description": "ACME Corp",
        }
        context = ExecutionContext(
            lead={"email": "test@test.com", "first_name": "Bob", "company": "TestCo"},
            vars={"reply_text": "I'm interested in learning more about your product."},
        )

        ai_response = '{"body": "Thanks for your interest Bob!", "confidence": 0.9, "intent": "interested"}'

        with patch("app.utils.openrouter_client.chat_completion", new_callable=AsyncMock) as mock_ai:
            mock_ai.return_value = ai_response
            result = await executor.execute(config, context, node_meta={})

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["response_sent"] is True
        assert result.output["stub"] is True
        assert result.output["confidence"] == 0.9
        assert result.output["intent"] == "interested"

    @pytest.mark.asyncio
    async def test_ai_low_confidence_escalates(self):
        """When AI confidence is below threshold, escalate."""
        executor = AutoRespondExecutor()
        config = {"confidence_threshold": 0.8}
        context = ExecutionContext(
            lead={"email": "test@test.com"},
            vars={"reply_text": "What's your pricing?"},
        )

        ai_response = '{"body": "Let me check.", "confidence": 0.4, "intent": "question"}'

        with patch("app.utils.openrouter_client.chat_completion", new_callable=AsyncMock) as mock_ai:
            mock_ai.return_value = ai_response
            result = await executor.execute(config, context, node_meta={})

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["escalated"] is True
        assert "Low confidence" in result.output["escalation_reason"]


class TestAutoRespondForbiddenWords:
    """Test auto_respond guardrails — forbidden words."""

    @pytest.mark.asyncio
    async def test_forbidden_word_escalates(self):
        executor = AutoRespondExecutor()
        config = {
            "confidence_threshold": 0.5,
            "forbidden_words": ["guarantee", "free"],
        }
        context = ExecutionContext(
            lead={"email": "test@test.com"},
            vars={"reply_text": "Tell me more about your service"},
        )

        ai_response = '{"body": "We guarantee satisfaction!", "confidence": 0.9, "intent": "interested"}'

        with patch("app.utils.openrouter_client.chat_completion", new_callable=AsyncMock) as mock_ai:
            mock_ai.return_value = ai_response
            result = await executor.execute(config, context, node_meta={})

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["escalated"] is True
        assert "Forbidden word" in result.output["escalation_reason"]


class TestAutoRespondAIFailure:
    """Test auto_respond when AI call fails."""

    @pytest.mark.asyncio
    async def test_ai_failure_escalates(self):
        executor = AutoRespondExecutor()
        config = {"confidence_threshold": 0.5}
        context = ExecutionContext(
            lead={"email": "test@test.com"},
            vars={"reply_text": "I want to know more"},
        )

        with patch("app.utils.openrouter_client.chat_completion", new_callable=AsyncMock) as mock_ai:
            mock_ai.side_effect = Exception("OpenRouter timeout")
            result = await executor.execute(config, context, node_meta={})

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["escalated"] is True
        assert "AI generation failed" in result.output["escalation_reason"]
