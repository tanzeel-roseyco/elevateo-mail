"""Tests for Phase 6 — Campaign Builder Integration.

Covers:
- PRS-E01: Native Campaign Draft Builder from Conversation Context
- PRS-E02: Launch Approval and Execution Path (Native)
- PRS-E03: Optional Instantly Adapter Behind Feature Flag
- PRS-E04: Unified Campaign Action Contract
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from app.services.prospecting.campaign_builder_service import (
    CampaignBuilderService, CampaignActionResult,
)


# ===========================================================================
# PRS-E01 — Native Campaign Draft Builder
# ===========================================================================

class TestCampaignBuilderService:
    """Campaign builder integration tests."""

    def setup_method(self):
        self.svc = CampaignBuilderService()

    async def test_create_draft_verifies_conversation(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="not found"):
            await self.svc.create_campaign_draft(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                campaign_name="Test Campaign",
                lead_list_id=uuid.uuid4(),
                copy_variants=[{"subject": "Hi", "body": "Body"}],
            )

    async def test_create_native_draft(self):
        db = AsyncMock()
        db.add = MagicMock()  # .add() is sync on AsyncSession

        # Mock conversation exists
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv
        db.execute.return_value = mock_conv_result

        # Mock campaign service
        mock_campaign = MagicMock()
        mock_campaign.id = uuid.uuid4()

        with patch(
            "app.services.campaign_service.campaign_service"
        ) as mock_svc:
            mock_svc.create_campaign = AsyncMock(return_value=mock_campaign)

            conv_id = uuid.uuid4()
            list_id = uuid.uuid4()
            result = await self.svc.create_campaign_draft(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=conv_id,
                campaign_name="Q1 Outreach",
                lead_list_id=list_id,
                copy_variants=[{"subject": "Hi", "body": "Body"}],
                target_type="native",
            )

            assert isinstance(result, CampaignActionResult)
            assert result.target_type == "native"
            assert result.campaign_id == mock_campaign.id
            assert result.conversation_id == conv_id
            assert result.source_list_id == list_id
            assert result.launch_status == "draft"
            mock_svc.create_campaign.assert_called_once()

    async def test_create_draft_with_settings(self):
        db = AsyncMock()
        db.add = MagicMock()  # .add() is sync on AsyncSession
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv
        db.execute.return_value = mock_conv_result

        mock_campaign = MagicMock()
        mock_campaign.id = uuid.uuid4()

        with patch(
            "app.services.campaign_service.campaign_service"
        ) as mock_svc:
            mock_svc.create_campaign = AsyncMock(return_value=mock_campaign)

            result = await self.svc.create_campaign_draft(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                campaign_name="Test",
                lead_list_id=uuid.uuid4(),
                copy_variants=[],
                settings={"daily_limit": 50, "timezone": "America/New_York"},
            )

            # Verify settings were passed to campaign service
            call_args = mock_svc.create_campaign.call_args
            campaign_data = call_args.kwargs["data"]
            assert campaign_data["daily_limit"] == 50
            assert campaign_data["timezone"] == "America/New_York"


# ===========================================================================
# PRS-E02 — Launch Approval and Execution Path
# ===========================================================================

class TestCampaignLaunch:
    """Launch gating tests."""

    def setup_method(self):
        self.svc = CampaignBuilderService()

    async def test_launch_requires_approved_action(self):
        db = AsyncMock()

        # Mock conversation exists
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv

        # Mock no approved action found
        mock_action_result = MagicMock()
        mock_action_result.scalar_one_or_none.return_value = None

        db.execute.side_effect = [mock_conv_result, mock_action_result]

        with pytest.raises(ValueError, match="approved action"):
            await self.svc.launch_campaign(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                campaign_id=uuid.uuid4(),
            )

    async def test_launch_conversation_not_found(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="not found"):
            await self.svc.launch_campaign(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                campaign_id=uuid.uuid4(),
            )

    async def test_launch_with_approved_action(self):
        db = AsyncMock()

        # Mock conversation exists
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv

        # Mock approved action exists
        mock_action = MagicMock()
        mock_action.id = uuid.uuid4()
        mock_action.status = "approved"
        mock_action_result = MagicMock()
        mock_action_result.scalar_one_or_none.return_value = mock_action

        db.execute.side_effect = [mock_conv_result, mock_action_result]

        # Mock campaign service
        mock_campaign = MagicMock()
        mock_campaign.id = uuid.uuid4()

        with patch(
            "app.services.campaign_service.campaign_service"
        ) as mock_svc:
            mock_svc.start_campaign = AsyncMock(return_value=mock_campaign)

            result = await self.svc.launch_campaign(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                campaign_id=uuid.uuid4(),
            )

            assert result.launch_status == "launched"
            assert result.target_type == "native"
            assert mock_action.status == "executed"
            assert mock_action.executed_at is not None
            mock_svc.start_campaign.assert_called_once()


# ===========================================================================
# PRS-E03 — Optional Instantly Adapter Behind Feature Flag
# ===========================================================================

class TestInstantlyAdapter:
    """Feature flag behavior tests for Instantly path."""

    def setup_method(self):
        self.svc = CampaignBuilderService()

    async def test_instantly_blocked_when_flag_disabled(self):
        db = AsyncMock()
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv
        db.execute.return_value = mock_conv_result

        from app.config import Settings

        def disabled_settings():
            return Settings(
                DATABASE_URL="sqlite+aiosqlite:///:memory:",
                JWT_SECRET="test-secret",
                ENCRYPTION_KEY="",
                DEBUG=True,
                PROSPECTING_EXTERNAL_INSTANTLY_ENABLED=False,
            )

        with patch(
            "app.services.prospecting.campaign_builder_service.get_settings",
            disabled_settings,
        ):
            with pytest.raises(ValueError, match="not enabled"):
                await self.svc.create_campaign_draft(
                    db=db,
                    workspace_id=uuid.uuid4(),
                    conversation_id=uuid.uuid4(),
                    campaign_name="Test",
                    lead_list_id=uuid.uuid4(),
                    copy_variants=[],
                    target_type="instantly",
                )

    async def test_instantly_allowed_when_flag_enabled(self):
        db = AsyncMock()
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv
        db.execute.return_value = mock_conv_result

        from app.config import Settings

        def enabled_settings():
            return Settings(
                DATABASE_URL="sqlite+aiosqlite:///:memory:",
                JWT_SECRET="test-secret",
                ENCRYPTION_KEY="",
                DEBUG=True,
                PROSPECTING_EXTERNAL_INSTANTLY_ENABLED=True,
            )

        with patch(
            "app.services.prospecting.campaign_builder_service.get_settings",
            enabled_settings,
        ):
            result = await self.svc.create_campaign_draft(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                campaign_name="Test Instantly",
                lead_list_id=uuid.uuid4(),
                copy_variants=[],
                target_type="instantly",
            )

            assert result.target_type == "instantly"
            assert result.launch_status == "pending_external"

    async def test_instantly_does_not_bypass_conversation_check(self):
        """Instantly path still verifies conversation ownership."""
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="not found"):
            await self.svc.create_campaign_draft(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                campaign_name="Test",
                lead_list_id=uuid.uuid4(),
                copy_variants=[],
                target_type="instantly",
            )


# ===========================================================================
# PRS-E04 — Unified Campaign Action Contract
# ===========================================================================

class TestCampaignActionContract:
    """Contract tests for both native and Instantly targets."""

    def test_native_result_has_required_fields(self):
        result = CampaignActionResult(
            target_type="native",
            campaign_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
            source_list_id=uuid.uuid4(),
            launch_status="draft",
        )
        assert result.target_type == "native"
        assert result.campaign_id is not None
        assert result.conversation_id is not None
        assert result.launch_status == "draft"
        assert result.created_by_agent == "campaign_builder"

    def test_instantly_result_has_required_fields(self):
        result = CampaignActionResult(
            target_type="instantly",
            campaign_id=None,
            conversation_id=uuid.uuid4(),
            launch_status="pending_external",
        )
        assert result.target_type == "instantly"
        assert result.campaign_id is None  # external campaigns don't have local IDs
        assert result.launch_status == "pending_external"

    def test_action_result_normalized_shape(self):
        """Both targets produce same-shaped result."""
        native = CampaignActionResult(target_type="native", launch_status="draft")
        instantly = CampaignActionResult(target_type="instantly", launch_status="pending_external")

        # Same set of fields
        assert set(vars(native).keys()) == set(vars(instantly).keys())

    def test_launch_statuses(self):
        """Verify valid launch status values."""
        valid_statuses = {"draft", "pending_approval", "launched", "pending_external"}
        for status in valid_statuses:
            result = CampaignActionResult(target_type="native", launch_status=status)
            assert result.launch_status == status


# ===========================================================================
# PRS-E05 — API-Level Instantly Gate
# ===========================================================================

class TestInstantlyAPIGate:
    """Verify the router rejects Instantly target when flag is off."""

    async def test_instantly_target_rejected_at_api_level(self, client):
        """POST /api/prospecting/campaigns/create with target_type=instantly
        should return 400 when PROSPECTING_EXTERNAL_INSTANTLY_ENABLED is False."""
        resp = await client.post(
            "/api/prospecting/campaigns/create",
            json={
                "conversation_id": str(uuid.uuid4()),
                "campaign_name": "Test",
                "lead_list_id": str(uuid.uuid4()),
                "copy_variants": [{"subject": "Hi", "body": "Hello"}],
                "target_type": "instantly",
            },
        )
        assert resp.status_code == 400
        assert "not enabled" in resp.json()["detail"].lower()

    async def test_native_target_allowed(self, client, mock_db):
        """POST /api/prospecting/campaigns/create with target_type=native
        should not be blocked by the Instantly gate."""
        # Mock conversation exists
        mock_conv = MagicMock()
        mock_conv_result = MagicMock()
        mock_conv_result.scalar_one_or_none.return_value = mock_conv
        mock_db.execute.return_value = mock_conv_result

        mock_campaign = MagicMock()
        mock_campaign.id = uuid.uuid4()

        with patch(
            "app.services.campaign_service.campaign_service"
        ) as mock_svc:
            mock_svc.create_campaign = AsyncMock(return_value=mock_campaign)
            mock_svc.add_leads = AsyncMock(return_value=0)
            mock_svc.add_accounts = AsyncMock(return_value=0)

            resp = await client.post(
                "/api/prospecting/campaigns/create",
                json={
                    "conversation_id": str(uuid.uuid4()),
                    "campaign_name": "Native Campaign",
                    "lead_list_id": str(uuid.uuid4()),
                    "copy_variants": [{"subject": "Hi", "body": "Hello"}],
                    "target_type": "native",
                },
            )
            # Should NOT be 400 for Instantly gate (may be other errors, but not gate)
            if resp.status_code == 400:
                assert "not enabled" not in resp.json().get("detail", "").lower()


# ===========================================================================
# PRS-E06 — Campaign Creation Requires lead_list_id
# ===========================================================================

class TestCampaignLeadListValidation:
    """Verify lead_list_id is required for campaign creation."""

    async def test_missing_lead_list_id_returns_422(self, client):
        """POST /api/prospecting/campaigns/create without lead_list_id
        should return 422 (Pydantic validation error)."""
        resp = await client.post(
            "/api/prospecting/campaigns/create",
            json={
                "conversation_id": str(uuid.uuid4()),
                "campaign_name": "Test",
                "copy_variants": [{"subject": "Hi", "body": "Hello"}],
                # lead_list_id intentionally omitted
            },
        )
        assert resp.status_code == 422

    async def test_null_lead_list_id_returns_422(self, client):
        """POST /api/prospecting/campaigns/create with null lead_list_id
        should return 422."""
        resp = await client.post(
            "/api/prospecting/campaigns/create",
            json={
                "conversation_id": str(uuid.uuid4()),
                "campaign_name": "Test",
                "lead_list_id": None,
                "copy_variants": [{"subject": "Hi", "body": "Hello"}],
            },
        )
        assert resp.status_code == 422


# ===========================================================================
# Route registration and stability
# ===========================================================================

class TestCampaignRoutes:
    """Test campaign route registration."""

    def test_campaign_routes_registered(self):
        from app.routers.prospecting import router
        paths = [r.path for r in router.routes]
        assert "/campaigns/create" in paths
        assert "/campaigns/launch" in paths


class TestExistingEndpointsStablePhase6:
    """Confirm Phase 6 changes don't break existing routes."""

    async def test_health_check(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200

    async def test_auth_me(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
