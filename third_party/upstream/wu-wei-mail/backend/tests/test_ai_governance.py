"""Tests for Phase 10: Template & AI Governance.

Covers:
- AiClassifyReplyExecutor: valid label, fallback on low confidence, fallback on error
- AiGenerateMessageExecutor: renders variables, uses fallback_text on error
- AiExtractFieldsExecutor: extracts fields, handles errors
- AiDecisionExecutor: picks valid branch, applies confidence threshold
- lint_template_variables: detects unresolved refs, passes for valid lead fields
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.schemas.workflow import ExecutionContext
from app.services.workflow.node_executors import (
    AiClassifyReplyExecutor,
    AiDecisionExecutor,
    AiExtractFieldsExecutor,
    AiGenerateMessageExecutor,
    NodeResultAction,
)
from app.services.workflow.schema_validator import lint_template_variables


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_context(
    lead: dict | None = None,
    vars_: dict | None = None,
    node_outputs: dict | None = None,
) -> ExecutionContext:
    return ExecutionContext(
        lead=lead or {},
        vars=vars_ or {},
        node_outputs=node_outputs or {},
    )


# ===================================================================
# AiClassifyReplyExecutor
# ===================================================================


class TestAiClassifyReply:
    """Tests for the AiClassifyReplyExecutor."""

    @pytest.mark.asyncio
    async def test_returns_valid_label_from_labels_list(self):
        """When AI returns a valid label, the executor passes it through."""
        ai_response = json.dumps({"label": "interested", "confidence": 0.9})

        ctx = _make_context(
            node_outputs={"prev_node": {"reply_text": "Yes, I'm very interested in your product!"}}
        )

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value=ai_response,
        ):
            executor = AiClassifyReplyExecutor()
            result = await executor.execute(
                config={
                    "labels": ["interested", "not_interested", "other"],
                    "confidence_threshold": 0.5,
                    "fallback_label": "other",
                },
                context=ctx,
            )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["label"] == "interested"
        assert result.output["confidence"] == 0.9
        assert "interested" in result.output["available_labels"]

    @pytest.mark.asyncio
    async def test_falls_back_on_low_confidence(self):
        """When AI confidence is below threshold, executor returns fallback label."""
        ai_response = json.dumps({"label": "interested", "confidence": 0.3})

        ctx = _make_context(
            node_outputs={"prev_node": {"reply_text": "Maybe, I'm not sure yet."}}
        )

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value=ai_response,
        ):
            executor = AiClassifyReplyExecutor()
            result = await executor.execute(
                config={
                    "labels": ["interested", "not_interested", "other"],
                    "confidence_threshold": 0.5,
                    "fallback_label": "other",
                },
                context=ctx,
            )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["label"] == "other"

    @pytest.mark.asyncio
    async def test_falls_back_when_label_not_in_list(self):
        """When AI returns a label not in the allowed list, executor falls back."""
        ai_response = json.dumps({"label": "unknown_label", "confidence": 0.95})

        ctx = _make_context(
            node_outputs={"prev_node": {"reply_text": "Some reply text."}}
        )

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value=ai_response,
        ):
            executor = AiClassifyReplyExecutor()
            result = await executor.execute(
                config={
                    "labels": ["interested", "not_interested", "other"],
                    "confidence_threshold": 0.5,
                    "fallback_label": "other",
                },
                context=ctx,
            )

        assert result.output["label"] == "other"
        assert result.output["confidence"] == 0.0

    @pytest.mark.asyncio
    async def test_returns_fallback_when_no_reply_text(self):
        """When no reply text is found in context, return fallback immediately."""
        ctx = _make_context()

        executor = AiClassifyReplyExecutor()
        result = await executor.execute(
            config={
                "labels": ["interested", "not_interested", "other"],
                "fallback_label": "other",
            },
            context=ctx,
        )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["label"] == "other"
        assert result.output["confidence"] == 0.0
        assert "No reply text found" in result.output.get("reason", "")

    @pytest.mark.asyncio
    async def test_handles_ai_exception_gracefully(self):
        """When AI call raises an exception, return fallback label."""
        ctx = _make_context(
            node_outputs={"prev_node": {"reply_text": "Some reply."}}
        )

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            side_effect=RuntimeError("API timeout"),
        ):
            executor = AiClassifyReplyExecutor()
            result = await executor.execute(
                config={
                    "labels": ["interested", "not_interested", "other"],
                    "fallback_label": "other",
                },
                context=ctx,
            )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["label"] == "other"
        assert "error" in result.output

    @pytest.mark.asyncio
    async def test_reads_reply_text_from_vars(self):
        """When reply_text is in vars rather than node_outputs, it still works."""
        ai_response = json.dumps({"label": "not_interested", "confidence": 0.85})

        ctx = _make_context(vars_={"reply_text": "No thanks, we are not interested."})

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value=ai_response,
        ):
            executor = AiClassifyReplyExecutor()
            result = await executor.execute(
                config={
                    "labels": ["interested", "not_interested", "other"],
                    "confidence_threshold": 0.5,
                    "fallback_label": "other",
                },
                context=ctx,
            )

        assert result.output["label"] == "not_interested"

    @pytest.mark.asyncio
    async def test_emits_ai_classified_event(self):
        """Executor should emit an ai_classified event."""
        ai_response = json.dumps({"label": "interested", "confidence": 0.8})

        ctx = _make_context(
            node_outputs={"prev": {"reply_text": "Yes please!"}}
        )

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value=ai_response,
        ):
            executor = AiClassifyReplyExecutor()
            result = await executor.execute(
                config={
                    "labels": ["interested", "not_interested", "other"],
                    "confidence_threshold": 0.5,
                    "fallback_label": "other",
                },
                context=ctx,
            )

        assert result.event_type == "ai_classified"
        assert result.event_payload["label"] == "interested"


# ===================================================================
# AiGenerateMessageExecutor
# ===================================================================


class TestAiGenerateMessage:
    """Tests for the AiGenerateMessageExecutor."""

    @pytest.mark.asyncio
    async def test_generates_text_successfully(self):
        """When AI returns text, it is passed through in output."""
        ctx = _make_context(
            lead={"first_name": "Alice", "company": "Acme Corp"},
        )

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value="Hi Alice, I noticed Acme Corp is hiring...",
        ):
            executor = AiGenerateMessageExecutor()
            result = await executor.execute(
                config={
                    "prompt_template": "Write an email to {{first_name}} at {{company}}.",
                    "system_prompt": "You are a cold email writer.",
                    "model_ref": "test-model",
                },
                context=ctx,
            )

        assert result.action == NodeResultAction.ADVANCE
        assert "Alice" in result.output["generated_text"]
        assert result.output["model_used"] == "test-model"

    @pytest.mark.asyncio
    async def test_uses_fallback_text_on_error(self):
        """When AI call fails and fallback_text is configured, use it."""
        ctx = _make_context(lead={"first_name": "Bob"})

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            side_effect=RuntimeError("API unavailable"),
        ):
            executor = AiGenerateMessageExecutor()
            result = await executor.execute(
                config={
                    "prompt_template": "Write to {{first_name}}",
                    "fallback_text": "Hello, I wanted to reach out...",
                },
                context=ctx,
            )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["generated_text"] == "Hello, I wanted to reach out..."
        assert result.output["model_used"] == "fallback"

    @pytest.mark.asyncio
    async def test_fails_on_error_without_fallback(self):
        """When AI call fails and no fallback_text, result should FAIL."""
        ctx = _make_context(lead={"first_name": "Bob"})

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            side_effect=RuntimeError("API unavailable"),
        ):
            executor = AiGenerateMessageExecutor()
            result = await executor.execute(
                config={
                    "prompt_template": "Write to {{first_name}}",
                },
                context=ctx,
            )

        assert result.action == NodeResultAction.FAIL
        assert "AI generation failed" in result.error

    @pytest.mark.asyncio
    async def test_renders_lead_variables_in_prompt(self):
        """Verify that {{lead_field}} placeholders are replaced before sending to AI."""
        ctx = _make_context(
            lead={"first_name": "Carol", "company": "TechCo"},
        )

        captured_messages = []

        async def mock_chat(messages, model=None, max_tokens=None):
            captured_messages.extend(messages)
            return "Generated email for Carol at TechCo."

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            side_effect=mock_chat,
        ):
            executor = AiGenerateMessageExecutor()
            await executor.execute(
                config={
                    "prompt_template": "Write to {{first_name}} at {{company}}.",
                },
                context=ctx,
            )

        # The user message should have rendered variables
        user_msg = captured_messages[-1]["content"]
        assert "Carol" in user_msg
        assert "TechCo" in user_msg
        assert "{{first_name}}" not in user_msg

    @pytest.mark.asyncio
    async def test_empty_prompt_returns_fallback(self):
        """When prompt_template is empty, return fallback without calling AI."""
        ctx = _make_context()

        executor = AiGenerateMessageExecutor()
        result = await executor.execute(
            config={
                "prompt_template": "",
                "fallback_text": "Default message",
            },
            context=ctx,
        )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["generated_text"] == "Default message"
        assert result.output["model_used"] == "none"


# ===================================================================
# AiExtractFieldsExecutor
# ===================================================================


class TestAiExtractFields:
    """Tests for the AiExtractFieldsExecutor."""

    @pytest.mark.asyncio
    async def test_extracts_fields_successfully(self):
        """When AI returns valid JSON with requested fields."""
        ctx = _make_context(
            node_outputs={"reply": {"reply_text": "My phone is 555-1234 and I work at Acme."}}
        )
        ai_response = json.dumps({"phone": "555-1234", "company": "Acme"})

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value=ai_response,
        ):
            executor = AiExtractFieldsExecutor()
            result = await executor.execute(
                config={"fields": ["phone", "company"]},
                context=ctx,
            )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["extracted"]["phone"] == "555-1234"
        assert result.output["extracted"]["company"] == "Acme"
        assert result.output["fields_found"] == 2

    @pytest.mark.asyncio
    async def test_handles_missing_source_text(self):
        """When no source text is available, return nulls for all fields."""
        ctx = _make_context()

        executor = AiExtractFieldsExecutor()
        result = await executor.execute(
            config={"fields": ["phone", "email"]},
            context=ctx,
        )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["extracted"]["phone"] is None
        assert result.output["extracted"]["email"] is None

    @pytest.mark.asyncio
    async def test_handles_ai_error(self):
        """When AI call fails, return null values with error."""
        ctx = _make_context(
            node_outputs={"reply": {"body": "Some text here."}}
        )

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            side_effect=RuntimeError("timeout"),
        ):
            executor = AiExtractFieldsExecutor()
            result = await executor.execute(
                config={"fields": ["name"]},
                context=ctx,
            )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["extracted"]["name"] is None
        assert "error" in result.output


# ===================================================================
# AiDecisionExecutor
# ===================================================================


class TestAiDecision:
    """Tests for the AiDecisionExecutor."""

    @pytest.mark.asyncio
    async def test_picks_valid_branch(self):
        """When AI returns a valid branch with high confidence."""
        ai_response = json.dumps({
            "decision": "follow_up",
            "confidence": 0.9,
            "reasoning": "Lead seems engaged",
        })
        ctx = _make_context(
            lead={"first_name": "Dave"},
            vars_={"engagement_score": "high"},
        )

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value=ai_response,
        ):
            executor = AiDecisionExecutor()
            result = await executor.execute(
                config={
                    "prompt_template": "Should we follow up with {{first_name}}?",
                    "branch_labels": ["follow_up", "skip", "archive"],
                    "confidence_threshold": 0.5,
                },
                context=ctx,
            )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["decision_label"] == "follow_up"
        assert result.output["confidence"] == 0.9
        assert result.output["condition_met"] is True

    @pytest.mark.asyncio
    async def test_applies_confidence_threshold(self):
        """When AI confidence is below threshold, condition_met should be False."""
        ai_response = json.dumps({
            "decision": "follow_up",
            "confidence": 0.3,
            "reasoning": "Not very sure",
        })
        ctx = _make_context(lead={"first_name": "Eve"})

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value=ai_response,
        ):
            executor = AiDecisionExecutor()
            result = await executor.execute(
                config={
                    "prompt_template": "Decide for {{first_name}}",
                    "branch_labels": ["follow_up", "skip"],
                    "confidence_threshold": 0.5,
                },
                context=ctx,
            )

        assert result.output["decision_label"] == "follow_up"
        assert result.output["condition_met"] is False

    @pytest.mark.asyncio
    async def test_returns_default_when_no_branches(self):
        """When no branch_labels are configured, return default."""
        ctx = _make_context()

        executor = AiDecisionExecutor()
        result = await executor.execute(
            config={"branch_labels": []},
            context=ctx,
        )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["decision_label"] == "default"

    @pytest.mark.asyncio
    async def test_handles_ai_error(self):
        """When AI fails, fall back to first branch label."""
        ctx = _make_context(lead={"first_name": "Frank"})

        with patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            side_effect=RuntimeError("API error"),
        ):
            executor = AiDecisionExecutor()
            result = await executor.execute(
                config={
                    "prompt_template": "Decide for {{first_name}}",
                    "branch_labels": ["option_a", "option_b"],
                },
                context=ctx,
            )

        assert result.action == NodeResultAction.ADVANCE
        assert result.output["decision_label"] == "option_a"
        assert "error" in result.output


# ===================================================================
# lint_template_variables
# ===================================================================


class TestLintTemplateVariables:
    """Tests for the lint_template_variables function."""

    def test_detects_unresolved_variable_references(self):
        """Variables not in lead fields, variables dict, or node IDs should warn."""
        canonical = {
            "nodes": [
                {
                    "id": "trigger1",
                    "type": "trigger_manual",
                    "config": {},
                },
                {
                    "id": "email1",
                    "type": "email_send",
                    "config": {
                        "subject_override": "Hello {{first_name}}, check out {{unknown_var}}!",
                        "body_override": "We noticed {{nonexistent}} is important to you.",
                    },
                },
                {
                    "id": "end1",
                    "type": "end",
                    "config": {},
                },
            ],
            "variables": {},
        }

        warnings = lint_template_variables(canonical)

        assert len(warnings) == 2
        assert any("unknown_var" in w for w in warnings)
        assert any("nonexistent" in w for w in warnings)

    def test_passes_for_valid_lead_fields(self):
        """Standard lead fields (first_name, company, etc.) should not warn."""
        canonical = {
            "nodes": [
                {
                    "id": "trigger1",
                    "type": "trigger_manual",
                    "config": {},
                },
                {
                    "id": "email1",
                    "type": "email_send",
                    "config": {
                        "subject_override": "Hi {{first_name}} at {{company}}",
                        "body_override": "Your email is {{email}} and title is {{title}}",
                    },
                },
                {
                    "id": "end1",
                    "type": "end",
                    "config": {},
                },
            ],
            "variables": {},
        }

        warnings = lint_template_variables(canonical)
        assert len(warnings) == 0

    def test_passes_for_declared_variables(self):
        """Variables declared in the workflow variables dict should not warn."""
        canonical = {
            "nodes": [
                {
                    "id": "trigger1",
                    "type": "trigger_manual",
                    "config": {},
                },
                {
                    "id": "ai1",
                    "type": "ai_generate_message",
                    "config": {
                        "prompt_template": "Use {{custom_greeting}} for {{first_name}}",
                    },
                },
                {
                    "id": "end1",
                    "type": "end",
                    "config": {},
                },
            ],
            "variables": {"custom_greeting": "Hello there"},
        }

        warnings = lint_template_variables(canonical)
        assert len(warnings) == 0

    def test_passes_for_node_id_references(self):
        """References to other node IDs should not warn."""
        canonical = {
            "nodes": [
                {
                    "id": "trigger1",
                    "type": "trigger_manual",
                    "config": {},
                },
                {
                    "id": "ai_gen",
                    "type": "ai_generate_message",
                    "config": {
                        "prompt_template": "Based on {{ai_gen}} output",
                    },
                },
                {
                    "id": "end1",
                    "type": "end",
                    "config": {},
                },
            ],
            "variables": {},
        }

        warnings = lint_template_variables(canonical)
        assert len(warnings) == 0

    def test_passes_for_special_prefixes(self):
        """References like vars.x, node_outputs.x, trigger.x, lead.first_name should not warn."""
        canonical = {
            "nodes": [
                {
                    "id": "trigger1",
                    "type": "trigger_manual",
                    "config": {},
                },
                {
                    "id": "email1",
                    "type": "email_send",
                    "config": {
                        "subject_override": "{{lead.first_name}} - {{vars.greeting}}",
                        "body_override": "Data: {{node_outputs.ai_gen.text}} from {{trigger.type}}",
                    },
                },
                {
                    "id": "end1",
                    "type": "end",
                    "config": {},
                },
            ],
            "variables": {},
        }

        warnings = lint_template_variables(canonical)
        assert len(warnings) == 0

    def test_lints_ai_decision_prompt_template(self):
        """ai_decision prompt_template should also be checked."""
        canonical = {
            "nodes": [
                {
                    "id": "trigger1",
                    "type": "trigger_manual",
                    "config": {},
                },
                {
                    "id": "decision1",
                    "type": "ai_decision",
                    "config": {
                        "prompt_template": "Decide based on {{missing_field}}",
                    },
                },
                {
                    "id": "end1",
                    "type": "end",
                    "config": {},
                },
            ],
            "variables": {},
        }

        warnings = lint_template_variables(canonical)
        assert len(warnings) == 1
        assert "missing_field" in warnings[0]

    def test_no_warnings_for_empty_templates(self):
        """Nodes with empty templates should produce no warnings."""
        canonical = {
            "nodes": [
                {
                    "id": "trigger1",
                    "type": "trigger_manual",
                    "config": {},
                },
                {
                    "id": "email1",
                    "type": "email_send",
                    "config": {
                        "subject_override": "",
                        "body_override": "",
                    },
                },
                {
                    "id": "end1",
                    "type": "end",
                    "config": {},
                },
            ],
            "variables": {},
        }

        warnings = lint_template_variables(canonical)
        assert len(warnings) == 0

    def test_mixed_resolved_and_unresolved(self):
        """Mix of valid and invalid references should only warn on invalid ones."""
        canonical = {
            "nodes": [
                {
                    "id": "trigger1",
                    "type": "trigger_manual",
                    "config": {},
                },
                {
                    "id": "email1",
                    "type": "email_send",
                    "config": {
                        "subject_override": "Hi {{first_name}}, re: {{bogus_ref}}",
                        "body_override": "{{company}} - {{another_bad}}",
                    },
                },
                {
                    "id": "end1",
                    "type": "end",
                    "config": {},
                },
            ],
            "variables": {},
        }

        warnings = lint_template_variables(canonical)
        assert len(warnings) == 2
        refs_mentioned = " ".join(warnings)
        assert "bogus_ref" in refs_mentioned
        assert "another_bad" in refs_mentioned
        assert "first_name" not in refs_mentioned
        assert "company" not in refs_mentioned
