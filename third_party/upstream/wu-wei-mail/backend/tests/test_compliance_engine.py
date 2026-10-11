"""Tests for compliance engine — suppression, stop-on-reply, cooldown, pressure."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.workflow.compliance_engine import (
    ComplianceEngine,
    ComplianceVerdict,
    OUTREACH_NODE_TYPES,
    node_type_to_channel,
)
from app.models.compliance import ContactTouch


# ===================================================================
# Helper: configure mock db.execute to return specific scalar values
# ===================================================================

def _mock_scalar(value):
    """Return a mock result object whose .scalar() returns *value*."""
    mock_result = MagicMock()
    mock_result.scalar.return_value = value
    mock_result.scalar_one_or_none.return_value = value
    return mock_result


def _make_db():
    """Create an AsyncMock database session."""
    db = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock()
    return db


# ===================================================================
# node_type_to_channel mapping
# ===================================================================

class TestNodeTypeToChannel:
    def test_email_send(self):
        assert node_type_to_channel("email_send") == "email"

    def test_auto_respond(self):
        assert node_type_to_channel("auto_respond") == "email"

    def test_linkedin_connect(self):
        assert node_type_to_channel("linkedin_connect") == "linkedin"

    def test_linkedin_message(self):
        assert node_type_to_channel("linkedin_message") == "linkedin"

    def test_unknown(self):
        assert node_type_to_channel("wait") == "internal"


# ===================================================================
# Non-outreach nodes bypass compliance
# ===================================================================

class TestNonOutreachBypass:
    @pytest.mark.asyncio
    async def test_wait_node_bypasses(self):
        engine = ComplianceEngine()
        db = _make_db()
        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="test@example.com",
            node_type="wait",
            channel="internal",
        )
        assert verdict.allowed is True
        # db.execute should not have been called
        db.execute.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_end_node_bypasses(self):
        engine = ComplianceEngine()
        db = _make_db()
        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="test@example.com",
            node_type="end",
            channel="internal",
        )
        assert verdict.allowed is True

    @pytest.mark.asyncio
    async def test_if_node_bypasses(self):
        engine = ComplianceEngine()
        db = _make_db()
        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="test@example.com",
            node_type="if",
            channel="internal",
        )
        assert verdict.allowed is True


# ===================================================================
# Suppression list blocks outreach
# ===================================================================

class TestSuppressionBlock:
    @pytest.mark.asyncio
    async def test_suppressed_email_blocked(self):
        engine = ComplianceEngine()
        db = _make_db()
        # First call: suppression check returns count=1
        db.execute = AsyncMock(return_value=_mock_scalar(1))

        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="blocked@example.com",
            node_type="email_send",
            channel="email",
        )
        assert verdict.allowed is False
        assert "suppression" in verdict.reason.lower()
        assert verdict.defer_until is None  # hard block, no defer

    @pytest.mark.asyncio
    async def test_non_suppressed_email_passes_suppression(self):
        engine = ComplianceEngine()
        db = _make_db()
        # All checks pass: suppression=0, reply=0, quiet_hours passes,
        # no FrequencyControlConfig
        call_results = [
            _mock_scalar(0),   # suppression count
            _mock_scalar(0),   # stop-on-reply count
            _mock_scalar(None),  # workspace (no quiet_hours attrs)
            _mock_scalar(None),  # channel cooldown config
            _mock_scalar(None),  # contact pressure config
        ]
        db.execute = AsyncMock(side_effect=call_results)

        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="ok@example.com",
            node_type="email_send",
            channel="email",
        )
        assert verdict.allowed is True


# ===================================================================
# Stop-on-reply blocks outreach
# ===================================================================

class TestStopOnReply:
    @pytest.mark.asyncio
    async def test_lead_with_reply_blocked(self):
        engine = ComplianceEngine()
        db = _make_db()
        # suppression=0, reply=1
        call_results = [
            _mock_scalar(0),  # suppression
            _mock_scalar(1),  # reply event found
        ]
        db.execute = AsyncMock(side_effect=call_results)

        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="test@example.com",
            node_type="email_send",
            channel="email",
        )
        assert verdict.allowed is False
        assert "replied" in verdict.reason.lower()
        assert verdict.defer_until is None  # hard block

    @pytest.mark.asyncio
    async def test_lead_without_reply_passes(self):
        engine = ComplianceEngine()
        db = _make_db()
        call_results = [
            _mock_scalar(0),    # suppression
            _mock_scalar(0),    # no reply
            _mock_scalar(None), # workspace (no quiet hours)
            _mock_scalar(None), # no frequency config
            _mock_scalar(None), # no frequency config (pressure)
        ]
        db.execute = AsyncMock(side_effect=call_results)

        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="test@example.com",
            node_type="linkedin_connect",
            channel="linkedin",
        )
        assert verdict.allowed is True


# ===================================================================
# Channel cooldown defers
# ===================================================================

class TestChannelCooldown:
    @pytest.mark.asyncio
    async def test_cooldown_defers_when_recent_other_channel_touch(self):
        engine = ComplianceEngine()
        db = _make_db()

        # Create a mock FrequencyControlConfig
        freq_config = MagicMock()
        freq_config.min_channel_gap_hours = {"email_to_linkedin": 24, "linkedin_to_email": 24}
        freq_config.max_touches_per_7d = 5
        freq_config.max_touches_per_30d = 15

        call_results = [
            _mock_scalar(0),          # suppression
            _mock_scalar(0),          # stop-on-reply
            _mock_scalar(None),       # workspace (no quiet hours)
            _mock_scalar(freq_config),  # frequency config for cooldown
            _mock_scalar(1),          # recent other-channel touch found
        ]
        db.execute = AsyncMock(side_effect=call_results)

        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="test@example.com",
            node_type="linkedin_connect",
            channel="linkedin",
        )
        assert verdict.allowed is False
        assert "cooldown" in verdict.reason.lower()
        assert verdict.defer_until is not None
        assert verdict.defer_until > datetime.now(timezone.utc)

    @pytest.mark.asyncio
    async def test_no_cooldown_when_no_recent_touch(self):
        engine = ComplianceEngine()
        db = _make_db()

        freq_config = MagicMock()
        freq_config.min_channel_gap_hours = {"email_to_linkedin": 24, "linkedin_to_email": 24}
        freq_config.max_touches_per_7d = 5
        freq_config.max_touches_per_30d = 15

        call_results = [
            _mock_scalar(0),            # suppression
            _mock_scalar(0),            # stop-on-reply
            _mock_scalar(None),         # workspace (no quiet hours)
            _mock_scalar(freq_config),  # frequency config for cooldown
            _mock_scalar(0),            # no recent other-channel touch
            _mock_scalar(freq_config),  # frequency config for pressure (7d)
            _mock_scalar(0),            # 7d touches
            _mock_scalar(0),            # 30d touches
        ]
        db.execute = AsyncMock(side_effect=call_results)

        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="test@example.com",
            node_type="email_send",
            channel="email",
        )
        assert verdict.allowed is True


# ===================================================================
# Contact pressure defers
# ===================================================================

class TestContactPressure:
    @pytest.mark.asyncio
    async def test_7d_pressure_defers(self):
        engine = ComplianceEngine()
        db = _make_db()

        freq_config = MagicMock()
        freq_config.min_channel_gap_hours = {"email_to_linkedin": 24, "linkedin_to_email": 24}
        freq_config.max_touches_per_7d = 5
        freq_config.max_touches_per_30d = 15

        call_results = [
            _mock_scalar(0),            # suppression
            _mock_scalar(0),            # stop-on-reply
            _mock_scalar(None),         # workspace (no quiet hours)
            _mock_scalar(freq_config),  # frequency config for cooldown
            _mock_scalar(0),            # no recent other-channel touch (cooldown passes)
            _mock_scalar(freq_config),  # frequency config for pressure
            _mock_scalar(5),            # 7d touches = 5, at limit
        ]
        db.execute = AsyncMock(side_effect=call_results)

        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="test@example.com",
            node_type="email_send",
            channel="email",
        )
        assert verdict.allowed is False
        assert "7d" in verdict.reason
        assert verdict.defer_until is not None

    @pytest.mark.asyncio
    async def test_30d_pressure_defers(self):
        engine = ComplianceEngine()
        db = _make_db()

        freq_config = MagicMock()
        freq_config.min_channel_gap_hours = {"email_to_linkedin": 24, "linkedin_to_email": 24}
        freq_config.max_touches_per_7d = 5
        freq_config.max_touches_per_30d = 15

        call_results = [
            _mock_scalar(0),            # suppression
            _mock_scalar(0),            # stop-on-reply
            _mock_scalar(None),         # workspace (no quiet hours)
            _mock_scalar(freq_config),  # frequency config for cooldown
            _mock_scalar(0),            # no recent other-channel touch (cooldown passes)
            _mock_scalar(freq_config),  # frequency config for pressure
            _mock_scalar(3),            # 7d touches = 3, under limit
            _mock_scalar(15),           # 30d touches = 15, at limit
        ]
        db.execute = AsyncMock(side_effect=call_results)

        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="test@example.com",
            node_type="linkedin_message",
            channel="linkedin",
        )
        assert verdict.allowed is False
        assert "30d" in verdict.reason
        assert verdict.defer_until is not None

    @pytest.mark.asyncio
    async def test_under_pressure_passes(self):
        engine = ComplianceEngine()
        db = _make_db()

        freq_config = MagicMock()
        freq_config.min_channel_gap_hours = {"email_to_linkedin": 24, "linkedin_to_email": 24}
        freq_config.max_touches_per_7d = 5
        freq_config.max_touches_per_30d = 15

        call_results = [
            _mock_scalar(0),            # suppression
            _mock_scalar(0),            # stop-on-reply
            _mock_scalar(None),         # workspace (no quiet hours)
            _mock_scalar(freq_config),  # frequency config for cooldown
            _mock_scalar(0),            # no recent other-channel touch
            _mock_scalar(freq_config),  # frequency config for pressure
            _mock_scalar(2),            # 7d touches = 2, under limit
            _mock_scalar(8),            # 30d touches = 8, under limit
        ]
        db.execute = AsyncMock(side_effect=call_results)

        verdict = await engine.evaluate(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            lead_email="test@example.com",
            node_type="email_send",
            channel="email",
        )
        assert verdict.allowed is True


# ===================================================================
# Record touch
# ===================================================================

class TestRecordTouch:
    @pytest.mark.asyncio
    async def test_record_touch_creates_contact_touch(self):
        engine = ComplianceEngine()
        db = _make_db()

        workspace_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        workflow_id = uuid.uuid4()

        await engine.record_touch(
            db=db,
            workspace_id=workspace_id,
            lead_id=lead_id,
            channel="email",
            touch_type="email_sent",
            workflow_id=workflow_id,
            campaign_id=None,
            node_id="n_email_1",
        )

        # Verify db.add was called with a ContactTouch instance
        assert db.add.call_count == 1
        touch = db.add.call_args[0][0]
        assert isinstance(touch, ContactTouch)
        assert touch.workspace_id == workspace_id
        assert touch.lead_id == lead_id
        assert touch.channel == "email"
        assert touch.touch_type == "email_sent"
        assert touch.workflow_id == workflow_id
        assert touch.node_id == "n_email_1"

        # Verify flush was called
        db.flush.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_record_touch_linkedin(self):
        engine = ComplianceEngine()
        db = _make_db()

        await engine.record_touch(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_id=uuid.uuid4(),
            channel="linkedin",
            touch_type="invite_sent",
        )

        touch = db.add.call_args[0][0]
        assert touch.channel == "linkedin"
        assert touch.touch_type == "invite_sent"
        assert touch.workflow_id is None
        assert touch.campaign_id is None


# ===================================================================
# OUTREACH_NODE_TYPES coverage
# ===================================================================

class TestOutreachNodeTypes:
    def test_expected_types(self):
        assert "email_send" in OUTREACH_NODE_TYPES
        assert "linkedin_connect" in OUTREACH_NODE_TYPES
        assert "linkedin_message" in OUTREACH_NODE_TYPES
        assert "auto_respond" in OUTREACH_NODE_TYPES

    def test_non_outreach_not_included(self):
        assert "wait" not in OUTREACH_NODE_TYPES
        assert "end" not in OUTREACH_NODE_TYPES
        assert "if" not in OUTREACH_NODE_TYPES
        assert "add_note" not in OUTREACH_NODE_TYPES


# ===================================================================
# ComplianceVerdict dataclass
# ===================================================================

class TestComplianceVerdict:
    def test_allowed_verdict(self):
        v = ComplianceVerdict(allowed=True)
        assert v.allowed is True
        assert v.reason == ""
        assert v.defer_until is None

    def test_blocked_verdict(self):
        v = ComplianceVerdict(allowed=False, reason="test reason")
        assert v.allowed is False
        assert v.reason == "test reason"

    def test_deferred_verdict(self):
        future = datetime.now(timezone.utc) + timedelta(hours=24)
        v = ComplianceVerdict(allowed=False, reason="cooldown", defer_until=future)
        assert v.defer_until == future
