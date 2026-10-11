"""Tests for Phase 5 — Copywriting Integration.

Covers:
- PRS-D01: Copywriting Specialist Agent Service
- PRS-D02: Copy Draft API
- PRS-D03: Copy Review/Approval Workflow
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from app.services.prospecting.copywriting_service import (
    CopywritingService, CopyDraft, CopyVariant,
    TONE_TEMPLATES, AVAILABLE_VARIABLES,
)


# ===========================================================================
# PRS-D01 — Copywriting Service
# ===========================================================================

class TestCopywritingService:
    """Copy generation contract tests."""

    def setup_method(self):
        self.svc = CopywritingService()

    async def test_generate_draft_verifies_conversation(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="not found"):
            await self.svc.generate_draft(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
            )

    async def test_generate_draft_returns_copy_draft(self):
        db = AsyncMock()

        # Mock conversation exists
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv

        # Mock leads query returns empty
        mock_leads_scalars = MagicMock()
        mock_leads_scalars.all.return_value = []
        mock_leads_result = MagicMock()
        mock_leads_result.scalars.return_value = mock_leads_scalars

        db.execute.side_effect = [mock_conv_result, mock_leads_result]

        conv_id = uuid.uuid4()
        with patch.object(self.svc, "_generate_variants_llm", return_value=[]):
            draft = await self.svc.generate_draft(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=conv_id,
                num_variants=2,
            )

        assert isinstance(draft, CopyDraft)
        assert draft.conversation_id == conv_id
        assert len(draft.variants) == 2
        assert draft.tone == "professional"

    async def test_generate_draft_respects_num_variants(self):
        db = AsyncMock()
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv
        mock_leads_scalars = MagicMock()
        mock_leads_scalars.all.return_value = []
        mock_leads_result = MagicMock()
        mock_leads_result.scalars.return_value = mock_leads_scalars
        db.execute.side_effect = [mock_conv_result, mock_leads_result]

        with patch.object(self.svc, "_generate_variants_llm", return_value=[]):
            draft = await self.svc.generate_draft(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                num_variants=3,
            )
        assert len(draft.variants) == 3

    async def test_generate_draft_includes_personalization_vars(self):
        db = AsyncMock()
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv
        mock_leads_scalars = MagicMock()
        mock_leads_scalars.all.return_value = []
        mock_leads_result = MagicMock()
        mock_leads_result.scalars.return_value = mock_leads_scalars
        db.execute.side_effect = [mock_conv_result, mock_leads_result]

        with patch.object(self.svc, "_generate_variants_llm", return_value=[]):
            draft = await self.svc.generate_draft(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
            )

        # Template variants should contain personalization variables
        for variant in draft.variants:
            assert "{{first_name}}" in variant.subject or "{{company}}" in variant.subject
            assert "{{" in variant.body  # at least one variable

    async def test_generate_draft_with_segment_description(self):
        db = AsyncMock()
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv
        mock_leads_scalars = MagicMock()
        mock_leads_scalars.all.return_value = []
        mock_leads_result = MagicMock()
        mock_leads_result.scalars.return_value = mock_leads_scalars
        db.execute.side_effect = [mock_conv_result, mock_leads_result]

        with patch.object(self.svc, "_generate_variants_llm", return_value=[]):
            draft = await self.svc.generate_draft(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                segment_description="CFOs in fintech",
            )
        assert draft.segment_description == "CFOs in fintech"

    # --- Variant structure ---

    def test_copy_variant_has_required_fields(self):
        variant = CopyVariant(
            subject="Test subject",
            body="Test body",
            variant_label="Test A",
        )
        assert variant.subject
        assert variant.body
        assert variant.variant_label

    def test_copy_draft_has_metadata(self):
        draft = CopyDraft(
            conversation_id=uuid.uuid4(),
            variants=[],
            metadata={"test": True},
        )
        assert draft.metadata["test"] is True

    # --- Tone presets ---

    def test_tone_professional(self):
        assert "professional" in TONE_TEMPLATES
        assert "greeting" in TONE_TEMPLATES["professional"]
        assert "closing" in TONE_TEMPLATES["professional"]

    def test_tone_casual(self):
        assert "casual" in TONE_TEMPLATES
        assert "Hey" in TONE_TEMPLATES["casual"]["greeting"]

    def test_tone_formal(self):
        assert "formal" in TONE_TEMPLATES
        assert "Dear" in TONE_TEMPLATES["formal"]["greeting"]

    def test_tone_bold(self):
        assert "bold" in TONE_TEMPLATES

    def test_all_tones_have_required_fields(self):
        for tone_name, preset in TONE_TEMPLATES.items():
            assert "greeting" in preset, f"{tone_name} missing greeting"
            assert "closing" in preset, f"{tone_name} missing closing"
            assert "style" in preset, f"{tone_name} missing style"

    # --- Personalization variables ---

    def test_available_variables_defined(self):
        assert "{{first_name}}" in AVAILABLE_VARIABLES
        assert "{{company}}" in AVAILABLE_VARIABLES
        assert "{{title}}" in AVAILABLE_VARIABLES
        assert len(AVAILABLE_VARIABLES) >= 5

    # --- Generate variants (unit) ---

    def test_generate_variants_professional_tone(self):
        variants = self.svc._generate_variants_template(
            segment_context={"top_industries": ["SaaS"], "top_titles": ["CTO"]},
            segment_description="CTOs in SaaS",
            tone="professional",
            num_variants=2,
        )
        assert len(variants) == 2
        for v in variants:
            assert "Hi {{first_name}}," in v.body  # professional greeting
            assert v.variant_label

    def test_generate_variants_casual_tone(self):
        variants = self.svc._generate_variants_template(
            segment_context={"top_industries": [], "top_titles": []},
            segment_description=None,
            tone="casual",
            num_variants=1,
        )
        assert len(variants) == 1
        assert "Hey {{first_name}}," in variants[0].body

    def test_generate_variants_each_has_unique_label(self):
        variants = self.svc._generate_variants_template(
            segment_context={"top_industries": [], "top_titles": []},
            segment_description=None,
            tone="professional",
            num_variants=5,
        )
        labels = [v.variant_label for v in variants]
        assert len(set(labels)) == 5  # all unique

    def test_generate_variants_each_has_metadata(self):
        variants = self.svc._generate_variants_template(
            segment_context={"top_industries": [], "top_titles": []},
            segment_description=None,
            tone="professional",
            num_variants=3,
        )
        for v in variants:
            assert "angle" in v.metadata
            assert "tone" in v.metadata

    # --- Segment context ---

    async def test_build_segment_context_empty(self):
        db = AsyncMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        context = await self.svc._build_segment_context(
            db, uuid.uuid4(), uuid.uuid4(),
        )
        assert context["lead_count"] == 0
        assert context["top_industries"] == []

    async def test_build_segment_context_with_leads(self):
        db = AsyncMock()

        lead1 = MagicMock()
        lead1.industry = "SaaS"
        lead1.title = "CTO"
        lead1.company = "Acme Inc"

        lead2 = MagicMock()
        lead2.industry = "SaaS"
        lead2.title = "VP Engineering"
        lead2.company = "Beta Corp"

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [lead1, lead2]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        context = await self.svc._build_segment_context(
            db, uuid.uuid4(), uuid.uuid4(),
        )
        assert context["lead_count"] == 2
        assert "SaaS" in context["top_industries"]

    async def test_generate_variants_llm_uses_workspace_model_and_api_key(self):
        db = AsyncMock()
        workspace_id = uuid.uuid4()
        segment_context = {
            "lead_count": 5,
            "top_industries": ["SaaS"],
            "top_titles": ["CTO"],
        }

        with patch(
            "app.services.prospecting.model_router_service.model_policy_crud.get_effective_config",
            new_callable=AsyncMock,
            return_value={"model_id": "openai/gpt-4o-mini", "source": "policy"},
        ), patch(
            "app.services.prospecting.openrouter_settings_service.openrouter_settings_service.resolve_api_key",
            new_callable=AsyncMock,
            return_value=("sk-workspace", "workspace"),
        ), patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value='[{"subject":"Hi {{first_name}}","body":"Body","variant_label":"A"}]',
        ) as mock_chat:
            variants = await self.svc._generate_variants_llm(
                db=db,
                workspace_id=workspace_id,
                segment_context=segment_context,
                segment_description="CTOs in SaaS",
                tone="professional",
                num_variants=1,
            )

        assert len(variants) == 1
        assert variants[0].subject == "Hi {{first_name}}"
        assert variants[0].variant_label == "A"
        kwargs = mock_chat.call_args.kwargs
        assert kwargs["model"] == "openai/gpt-4o-mini"
        assert kwargs["api_key"] == "sk-workspace"

    async def test_generate_variants_llm_returns_empty_when_api_key_missing(self):
        db = AsyncMock()
        with patch(
            "app.services.prospecting.model_router_service.model_policy_crud.get_effective_config",
            new_callable=AsyncMock,
            return_value={"model_id": "openai/gpt-4o-mini", "source": "policy"},
        ), patch(
            "app.services.prospecting.openrouter_settings_service.openrouter_settings_service.resolve_api_key",
            new_callable=AsyncMock,
            return_value=(None, "none"),
        ):
            variants = await self.svc._generate_variants_llm(
                db=db,
                workspace_id=uuid.uuid4(),
                segment_context={"lead_count": 0, "top_industries": [], "top_titles": []},
                segment_description=None,
                tone="professional",
                num_variants=1,
            )

        assert variants == []


# ===========================================================================
# PRS-D02 — Copy Draft API
# ===========================================================================

class TestCopyDraftRoute:
    """Copy draft API tests."""

    def test_copy_draft_route_registered(self):
        from app.routers.prospecting import router
        paths = [r.path for r in router.routes]
        assert "/copy/draft" in paths


# ===========================================================================
# PRS-D03 — Copy Review/Approval Workflow
# ===========================================================================

class TestCopyApprovalWorkflow:
    """Copy review and approval flow tests."""

    def test_action_gate_supports_copy_approval(self):
        """Action gate should handle campaign_launch (which gates copy → campaign)."""
        from app.services.prospecting.action_gate_service import APPROVAL_REQUIRED_ACTIONS
        # Copy approval is gated through the campaign_launch action
        assert "campaign_launch" in APPROVAL_REQUIRED_ACTIONS

    def test_copywriting_stage_allows_backward_transition(self):
        """Rejected copy should allow going back to SELECTION stage."""
        from app.services.prospecting.journey_state_machine import JourneyStateMachine
        assert JourneyStateMachine.can_transition("COPYWRITING", "SELECTION")

    def test_copywriting_stage_allows_forward_transition(self):
        """Approved copy should allow moving to CAMPAIGN_SETUP."""
        from app.services.prospecting.journey_state_machine import JourneyStateMachine
        assert JourneyStateMachine.can_transition("COPYWRITING", "CAMPAIGN_SETUP")


# ===========================================================================
# Existing endpoints stable
# ===========================================================================

class TestExistingEndpointsStablePhase5:
    """Confirm Phase 5 changes don't break existing routes."""

    async def test_health_check(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200

    async def test_auth_me(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200

    async def test_conversations_route_still_works(self, client, mock_db):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        resp = await client.get(f"/api/prospecting/conversations/{uuid.uuid4()}")
        assert resp.status_code == 404
