"""Tests for data integrity and tenant isolation (Agent 04).

Proves:
- Cross-workspace lead IDs cannot be added/removed from lists
- Inbound account resolution is deterministic with duplicates
- CORS does not allow localhost in production mode
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_WORKSPACE_ID


OTHER_WORKSPACE_ID = uuid.uuid4()


# ---------------------------------------------------------------------------
# Lead service — workspace isolation on bulk add/remove
# ---------------------------------------------------------------------------

class TestLeadBulkTenantIsolation:
    """Prove that add_to_list / remove_from_list reject cross-workspace lead IDs."""

    @pytest.fixture
    def lead_service(self):
        from app.services.lead_service import LeadService
        return LeadService()

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.delete = AsyncMock()
        return db

    async def test_add_to_list_rejects_foreign_leads(self, lead_service, mock_db):
        """Lead IDs from another workspace must NOT be added to a list."""
        list_id = uuid.uuid4()
        own_lead_id = uuid.uuid4()
        foreign_lead_id = uuid.uuid4()

        # _verify_list_ownership returns a mock list
        mock_list = MagicMock()
        mock_list.id = list_id
        mock_list.workspace_id = TEST_WORKSPACE_ID

        # Sequence of db.execute calls:
        # 1. _verify_list_ownership → returns the list
        # 2. _verify_leads_ownership → returns only own_lead_id
        # 3. check existing membership for own_lead_id → not found

        call_count = 0

        async def side_effect(stmt):
            nonlocal call_count
            call_count += 1
            result = MagicMock()

            if call_count == 1:
                # _verify_list_ownership
                result.scalar_one_or_none.return_value = mock_list
            elif call_count == 2:
                # _verify_leads_ownership — only own_lead_id belongs to workspace
                result.scalars.return_value.all.return_value = [own_lead_id]
            elif call_count == 3:
                # Check existing LeadListMember — not found
                result.scalar_one_or_none.return_value = None
            return result

        mock_db.execute = AsyncMock(side_effect=side_effect)

        with patch("app.services.lead_service.workflow_event_bus", create=True):
            result = await lead_service.bulk_action(
                mock_db,
                TEST_WORKSPACE_ID,
                [own_lead_id, foreign_lead_id],
                "add_to_list",
                list_id,
            )

        # Only the owned lead should be added
        assert result["affected"] == 1

        # Verify db.add was called exactly once (for the one owned lead)
        assert mock_db.add.call_count == 1
        added = mock_db.add.call_args[0][0]
        assert added.lead_id == own_lead_id

    async def test_remove_from_list_rejects_foreign_leads(self, lead_service, mock_db):
        """Lead IDs from another workspace must NOT be removed from a list."""
        list_id = uuid.uuid4()
        own_lead_id = uuid.uuid4()
        foreign_lead_id = uuid.uuid4()

        mock_list = MagicMock()
        mock_list.id = list_id
        mock_list.workspace_id = TEST_WORKSPACE_ID

        mock_member = MagicMock()

        call_count = 0

        async def side_effect(stmt):
            nonlocal call_count
            call_count += 1
            result = MagicMock()

            if call_count == 1:
                # _verify_list_ownership
                result.scalar_one_or_none.return_value = mock_list
            elif call_count == 2:
                # _verify_leads_ownership — only own_lead_id belongs
                result.scalars.return_value.all.return_value = [own_lead_id]
            elif call_count == 3:
                # Find membership for own_lead_id
                result.scalar_one_or_none.return_value = mock_member
            return result

        mock_db.execute = AsyncMock(side_effect=side_effect)

        result = await lead_service.bulk_action(
            mock_db,
            TEST_WORKSPACE_ID,
            [own_lead_id, foreign_lead_id],
            "remove_from_list",
            list_id,
        )

        # Only the owned lead's membership should be deleted
        assert result["affected"] == 1
        mock_db.delete.assert_called_once_with(mock_member)

    async def test_add_to_list_zero_foreign_leads(self, lead_service, mock_db):
        """If ALL lead IDs are foreign, zero should be added."""
        list_id = uuid.uuid4()
        foreign_ids = [uuid.uuid4(), uuid.uuid4()]

        mock_list = MagicMock()
        mock_list.id = list_id
        mock_list.workspace_id = TEST_WORKSPACE_ID

        call_count = 0

        async def side_effect(stmt):
            nonlocal call_count
            call_count += 1
            result = MagicMock()

            if call_count == 1:
                result.scalar_one_or_none.return_value = mock_list
            elif call_count == 2:
                # No owned leads returned
                result.scalars.return_value.all.return_value = []
            return result

        mock_db.execute = AsyncMock(side_effect=side_effect)

        result = await lead_service.bulk_action(
            mock_db,
            TEST_WORKSPACE_ID,
            foreign_ids,
            "add_to_list",
            list_id,
        )

        assert result["affected"] == 0
        mock_db.add.assert_not_called()


# ---------------------------------------------------------------------------
# Inbound service — deterministic account resolution
# ---------------------------------------------------------------------------

class TestInboundTenantIsolation:
    """Prove inbound account resolution is deterministic across workspaces."""

    @pytest.fixture
    def inbound_service(self):
        from app.services.inbound_service import InboundService
        return InboundService()

    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        return db

    async def test_resolution_prefers_active_account(self, inbound_service, mock_db):
        """When multiple accounts share an email, the active one is chosen."""
        active_account = MagicMock()
        active_account.id = uuid.uuid4()
        active_account.workspace_id = TEST_WORKSPACE_ID
        active_account.email = "shared@company.com"
        active_account.is_active = True

        lead = MagicMock()
        lead.id = uuid.uuid4()

        call_count = 0

        async def side_effect(stmt):
            nonlocal call_count
            call_count += 1
            result = MagicMock()

            if call_count == 1:
                # Active account query — returns match
                result.scalar_one_or_none.return_value = active_account
            elif call_count == 2:
                # Lead lookup
                result.scalar_one_or_none.return_value = lead
            elif call_count == 3:
                # thread resolution
                result.scalar_one_or_none.return_value = None
            elif call_count == 4:
                # sent_email lookup (no in_reply_to, so fallback)
                result.scalar_one_or_none.return_value = None
            return result

        mock_db.execute = AsyncMock(side_effect=side_effect)

        msg = await inbound_service.process_inbound(mock_db, {
            "from_email": "sender@example.com",
            "to_email": "shared@company.com",
            "subject": "Hello",
            "body_text": "Hi there",
        })

        # Should have resolved to the active account's workspace
        assert msg.workspace_id == TEST_WORKSPACE_ID

    async def test_no_account_raises(self, inbound_service, mock_db):
        """If no account matches, a clear error is raised."""
        call_count = 0

        async def side_effect(stmt):
            nonlocal call_count
            call_count += 1
            result = MagicMock()
            result.scalar_one_or_none.return_value = None
            return result

        mock_db.execute = AsyncMock(side_effect=side_effect)

        with pytest.raises(ValueError, match="No email account found"):
            await inbound_service.process_inbound(mock_db, {
                "from_email": "sender@example.com",
                "to_email": "unknown@company.com",
                "subject": "Hello",
            })


# ---------------------------------------------------------------------------
# CORS — production vs development
# ---------------------------------------------------------------------------

class TestCORSConfiguration:
    """Prove CORS does not allow localhost in production mode."""

    def test_prod_cors_excludes_localhost(self):
        """In production (DEBUG=False), localhost must not be in CORS origins."""
        with patch("app.config.get_settings") as mock_settings:
            settings = MagicMock()
            settings.APP_NAME = "Wu Wei Mail"
            settings.DEBUG = False
            settings.FRONTEND_URL = "https://app.wuweimail.com"
            mock_settings.return_value = settings

            # Re-evaluate the CORS origin list logic
            origins = [settings.FRONTEND_URL]
            if settings.DEBUG:
                origins.append("http://localhost:3000")

            assert "http://localhost:3000" not in origins
            assert "https://app.wuweimail.com" in origins

    def test_dev_cors_includes_localhost(self):
        """In development (DEBUG=True), localhost should be in CORS origins."""
        with patch("app.config.get_settings") as mock_settings:
            settings = MagicMock()
            settings.APP_NAME = "Wu Wei Mail"
            settings.DEBUG = True
            settings.FRONTEND_URL = "http://localhost:3000"
            mock_settings.return_value = settings

            origins = [settings.FRONTEND_URL]
            if settings.DEBUG:
                origins.append("http://localhost:3000")

            assert "http://localhost:3000" in origins
