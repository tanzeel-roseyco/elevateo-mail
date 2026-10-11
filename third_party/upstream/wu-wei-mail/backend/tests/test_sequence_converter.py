"""Tests for Phase 5: Sequence-to-Workflow Converter.

Tests cover:
- Linear 3-step campaign converts to correct workflow JSON
- Campaign with stop_on_reply creates if-nodes after each wait
- Campaign with no steps raises ValueError
- Workflow JSON has proper node IDs, types, and connections
- Scheduler skips workflow-mode campaigns
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.workflow.sequence_converter import SequenceToWorkflowConverter


# ---------------------------------------------------------------------------
# Helpers to build mock ORM objects
# ---------------------------------------------------------------------------

def _make_campaign(
    *,
    campaign_id=None,
    workspace_id=None,
    name="Test Campaign",
    stop_on_reply=False,
    track_opens=True,
    track_clicks=True,
    timezone_str="UTC",
):
    c = MagicMock()
    c.id = campaign_id or uuid.uuid4()
    c.workspace_id = workspace_id or uuid.uuid4()
    c.name = name
    c.stop_on_reply = stop_on_reply
    c.track_opens = track_opens
    c.track_clicks = track_clicks
    c.timezone = timezone_str
    return c


def _make_sequence(campaign_id, seq_id=None, order=0):
    s = MagicMock()
    s.id = seq_id or uuid.uuid4()
    s.campaign_id = campaign_id
    s.order = order
    return s


def _make_step(sequence_id, step_id=None, order=0, wait_days=1):
    st = MagicMock()
    st.id = step_id or uuid.uuid4()
    st.sequence_id = sequence_id
    st.order = order
    st.wait_days = wait_days
    return st


def _make_variant(step_id, name="A", subject="Subject", body="Body"):
    v = MagicMock()
    v.id = uuid.uuid4()
    v.step_id = step_id
    v.name = name
    v.subject = subject
    v.body = body
    return v


def _mock_scalar_result(obj):
    """Create a mock result where .scalar_one_or_none() returns obj."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = obj
    return result


def _mock_scalars_result(objs):
    """Create a mock result where .scalars().first() returns first obj,
    and .scalars().all() returns all objs."""
    scalars_mock = MagicMock()
    scalars_mock.first.return_value = objs[0] if objs else None
    scalars_mock.all.return_value = objs
    result = MagicMock()
    result.scalars.return_value = scalars_mock
    return result


# ---------------------------------------------------------------------------
# Tests: Converter Logic
# ---------------------------------------------------------------------------


class TestSequenceConverterLinear:
    """Test linear 3-step campaign (stop_on_reply=False)."""

    @pytest.mark.asyncio
    async def test_linear_3_step_campaign(self):
        """3-step linear campaign produces trigger -> email -> wait -> email -> wait -> email -> end."""
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        campaign = _make_campaign(
            campaign_id=campaign_id,
            workspace_id=workspace_id,
            stop_on_reply=False,
        )

        seq = _make_sequence(campaign_id)
        step1 = _make_step(seq.id, order=0, wait_days=2)
        step2 = _make_step(seq.id, order=1, wait_days=3)
        step3 = _make_step(seq.id, order=2, wait_days=1)

        var1 = _make_variant(step1.id, name="A", subject="Hello 1", body="Body 1")
        var2 = _make_variant(step2.id, name="A", subject="Follow-up 2", body="Body 2")
        var3 = _make_variant(step3.id, name="A", subject="Final 3", body="Body 3")

        # Set up mock DB
        db = AsyncMock()

        # Track which queries are made
        call_count = 0
        steps_list = [step1, step2, step3]

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1

            # 1st call: Campaign query
            if call_count == 1:
                return _mock_scalar_result(campaign)
            # 2nd call: Sequence query
            elif call_count == 2:
                return _mock_scalars_result([seq])
            # 3rd call: Steps query
            elif call_count == 3:
                return _mock_scalars_result(steps_list)
            # 4th-6th calls: Variant queries (one per step)
            elif call_count == 4:
                return _mock_scalars_result([var1])
            elif call_count == 5:
                return _mock_scalars_result([var2])
            elif call_count == 6:
                return _mock_scalars_result([var3])
            return _mock_scalars_result([])

        db.execute = AsyncMock(side_effect=mock_execute)

        converter = SequenceToWorkflowConverter()
        result = await converter.convert(db, campaign_id, workspace_id)

        # Validate top-level structure
        assert result["schema_version"] == 1
        assert result["workflow_version"] == 1
        assert result["meta"]["name"] == "Test Campaign (Workflow)"
        assert "converted" in result["meta"]["tags"]

        nodes = result["nodes"]
        connections = result["connections"]

        # Count nodes by type
        node_types = [n["type"] for n in nodes]
        assert node_types.count("trigger_manual") == 1
        assert node_types.count("email_send") == 3
        assert node_types.count("wait") == 2  # No wait after last step (no stop_on_reply)
        assert node_types.count("end") == 1
        assert node_types.count("if") == 0  # No if-nodes without stop_on_reply

        # Verify node IDs
        node_ids = [n["id"] for n in nodes]
        assert "n_trigger" in node_ids
        assert "n_email_1" in node_ids
        assert "n_email_2" in node_ids
        assert "n_email_3" in node_ids
        assert "n_wait_1" in node_ids
        assert "n_wait_2" in node_ids
        assert "n_end" in node_ids

        # Verify connections form a linear chain: trigger -> email1 -> wait1 -> email2 -> wait2 -> email3 -> end
        expected_connections = [
            ("n_trigger", "n_email_1"),
            ("n_email_1", "n_wait_1"),
            ("n_wait_1", "n_email_2"),
            ("n_email_2", "n_wait_2"),
            ("n_wait_2", "n_email_3"),
            ("n_email_3", "n_end"),
        ]
        actual_connections = [(c["from"], c["to"]) for c in connections]
        assert actual_connections == expected_connections

        # Verify email content from variants
        email1 = next(n for n in nodes if n["id"] == "n_email_1")
        assert email1["config"]["subject_override"] == "Hello 1"
        assert email1["config"]["body_override"] == "Body 1"

        email2 = next(n for n in nodes if n["id"] == "n_email_2")
        assert email2["config"]["subject_override"] == "Follow-up 2"

    @pytest.mark.asyncio
    async def test_node_positions_increase(self):
        """Nodes should have increasing y positions for vertical layout."""
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        campaign = _make_campaign(campaign_id=campaign_id, workspace_id=workspace_id, stop_on_reply=False)
        seq = _make_sequence(campaign_id)
        step1 = _make_step(seq.id, order=0, wait_days=2)
        var1 = _make_variant(step1.id)

        db = AsyncMock()
        call_count = 0

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(campaign)
            elif call_count == 2:
                return _mock_scalars_result([seq])
            elif call_count == 3:
                return _mock_scalars_result([step1])
            elif call_count == 4:
                return _mock_scalars_result([var1])
            return _mock_scalars_result([])

        db.execute = AsyncMock(side_effect=mock_execute)

        converter = SequenceToWorkflowConverter()
        result = await converter.convert(db, campaign_id, workspace_id)

        nodes = result["nodes"]
        y_positions = [n["position"]["y"] for n in nodes]
        # Each successive node should have a greater y than the previous
        for i in range(1, len(y_positions)):
            assert y_positions[i] > y_positions[i - 1]


class TestSequenceConverterStopOnReply:
    """Test campaign with stop_on_reply=True creates if-nodes."""

    @pytest.mark.asyncio
    async def test_stop_on_reply_creates_if_nodes(self):
        """Campaign with stop_on_reply inserts if(replied?) checks after each wait."""
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        campaign = _make_campaign(
            campaign_id=campaign_id,
            workspace_id=workspace_id,
            stop_on_reply=True,
        )

        seq = _make_sequence(campaign_id)
        step1 = _make_step(seq.id, order=0, wait_days=2)
        step2 = _make_step(seq.id, order=1, wait_days=3)

        var1 = _make_variant(step1.id, name="A", subject="Hello", body="Body 1")
        var2 = _make_variant(step2.id, name="A", subject="Follow-up", body="Body 2")

        db = AsyncMock()
        call_count = 0

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(campaign)
            elif call_count == 2:
                return _mock_scalars_result([seq])
            elif call_count == 3:
                return _mock_scalars_result([step1, step2])
            elif call_count == 4:
                return _mock_scalars_result([var1])
            elif call_count == 5:
                return _mock_scalars_result([var2])
            return _mock_scalars_result([])

        db.execute = AsyncMock(side_effect=mock_execute)

        converter = SequenceToWorkflowConverter()
        result = await converter.convert(db, campaign_id, workspace_id)

        nodes = result["nodes"]
        connections = result["connections"]

        node_types = [n["type"] for n in nodes]
        node_ids = [n["id"] for n in nodes]

        # Should have if-nodes (one per step with stop_on_reply)
        assert node_types.count("if") == 2
        assert "n_if_replied_1" in node_ids
        assert "n_if_replied_2" in node_ids

        # Should have end-replied nodes
        assert "n_end_replied_1" in node_ids
        assert "n_end_replied_2" in node_ids

        # The final end node
        assert "n_end" in node_ids

        # Check if-node yes branch connects to end_replied
        yes_conn_1 = next(
            c for c in connections
            if c["from"] == "n_if_replied_1" and c["condition"] == "yes"
        )
        assert yes_conn_1["to"] == "n_end_replied_1"

        yes_conn_2 = next(
            c for c in connections
            if c["from"] == "n_if_replied_2" and c["condition"] == "yes"
        )
        assert yes_conn_2["to"] == "n_end_replied_2"

        # The no branch of the last if connects to n_end
        no_conn_last = next(
            c for c in connections
            if c["from"] == "n_if_replied_2" and c["condition"] == "no"
        )
        assert no_conn_last["to"] == "n_end"

    @pytest.mark.asyncio
    async def test_stop_on_reply_if_config(self):
        """If-nodes should have condition='email_replied' in config."""
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()

        campaign = _make_campaign(
            campaign_id=campaign_id,
            workspace_id=workspace_id,
            stop_on_reply=True,
        )

        seq = _make_sequence(campaign_id)
        step1 = _make_step(seq.id, order=0, wait_days=1)
        var1 = _make_variant(step1.id)

        db = AsyncMock()
        call_count = 0

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(campaign)
            elif call_count == 2:
                return _mock_scalars_result([seq])
            elif call_count == 3:
                return _mock_scalars_result([step1])
            elif call_count == 4:
                return _mock_scalars_result([var1])
            return _mock_scalars_result([])

        db.execute = AsyncMock(side_effect=mock_execute)

        converter = SequenceToWorkflowConverter()
        result = await converter.convert(db, campaign_id, workspace_id)

        if_node = next(n for n in result["nodes"] if n["type"] == "if")
        assert if_node["config"]["condition"] == "email_replied"
        assert if_node["name"] == "Replied?"


class TestSequenceConverterErrors:
    """Test error cases."""

    @pytest.mark.asyncio
    async def test_campaign_not_found_raises(self):
        """Converter raises ValueError when campaign is not found."""
        db = AsyncMock()
        db.execute = AsyncMock(return_value=_mock_scalar_result(None))

        converter = SequenceToWorkflowConverter()
        with pytest.raises(ValueError, match="not found"):
            await converter.convert(db, uuid.uuid4(), uuid.uuid4())

    @pytest.mark.asyncio
    async def test_no_sequence_raises(self):
        """Converter raises ValueError when campaign has no sequences."""
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        campaign = _make_campaign(campaign_id=campaign_id, workspace_id=workspace_id)

        db = AsyncMock()
        call_count = 0

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(campaign)
            elif call_count == 2:
                return _mock_scalars_result([])
            return _mock_scalars_result([])

        db.execute = AsyncMock(side_effect=mock_execute)

        converter = SequenceToWorkflowConverter()
        with pytest.raises(ValueError, match="no sequence"):
            await converter.convert(db, campaign_id, workspace_id)

    @pytest.mark.asyncio
    async def test_no_steps_raises(self):
        """Converter raises ValueError when sequence has no steps."""
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        campaign = _make_campaign(campaign_id=campaign_id, workspace_id=workspace_id)
        seq = _make_sequence(campaign_id)

        db = AsyncMock()
        call_count = 0

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(campaign)
            elif call_count == 2:
                return _mock_scalars_result([seq])
            elif call_count == 3:
                return _mock_scalars_result([])
            return _mock_scalars_result([])

        db.execute = AsyncMock(side_effect=mock_execute)

        converter = SequenceToWorkflowConverter()
        with pytest.raises(ValueError, match="no steps"):
            await converter.convert(db, campaign_id, workspace_id)


class TestSequenceConverterNodeDetails:
    """Test detailed node properties."""

    @pytest.mark.asyncio
    async def test_email_node_tracks_opens_and_clicks(self):
        """Email nodes inherit track_opens and track_clicks from campaign."""
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        campaign = _make_campaign(
            campaign_id=campaign_id,
            workspace_id=workspace_id,
            track_opens=False,
            track_clicks=False,
            stop_on_reply=False,
        )
        seq = _make_sequence(campaign_id)
        step1 = _make_step(seq.id, order=0, wait_days=1)
        var1 = _make_variant(step1.id, name="A", subject="Test", body="Test body")

        db = AsyncMock()
        call_count = 0

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(campaign)
            elif call_count == 2:
                return _mock_scalars_result([seq])
            elif call_count == 3:
                return _mock_scalars_result([step1])
            elif call_count == 4:
                return _mock_scalars_result([var1])
            return _mock_scalars_result([])

        db.execute = AsyncMock(side_effect=mock_execute)

        converter = SequenceToWorkflowConverter()
        result = await converter.convert(db, campaign_id, workspace_id)

        email_node = next(n for n in result["nodes"] if n["type"] == "email_send")
        assert email_node["config"]["track_opens"] is False
        assert email_node["config"]["track_clicks"] is False

    @pytest.mark.asyncio
    async def test_step_without_variant_uses_fallback(self):
        """Steps without variants use fallback subject and empty body."""
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        campaign = _make_campaign(
            campaign_id=campaign_id,
            workspace_id=workspace_id,
            stop_on_reply=False,
        )
        seq = _make_sequence(campaign_id)
        step1 = _make_step(seq.id, order=0, wait_days=1)

        db = AsyncMock()
        call_count = 0

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(campaign)
            elif call_count == 2:
                return _mock_scalars_result([seq])
            elif call_count == 3:
                return _mock_scalars_result([step1])
            elif call_count == 4:
                return _mock_scalars_result([])  # No variants
            return _mock_scalars_result([])

        db.execute = AsyncMock(side_effect=mock_execute)

        converter = SequenceToWorkflowConverter()
        result = await converter.convert(db, campaign_id, workspace_id)

        email_node = next(n for n in result["nodes"] if n["type"] == "email_send")
        assert email_node["config"]["subject_override"] == "Step 1"
        assert email_node["config"]["body_override"] == ""
        assert email_node["name"] == "Email Step 1"

    @pytest.mark.asyncio
    async def test_wait_node_uses_step_wait_days(self):
        """Wait nodes use the step's wait_days value."""
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        campaign = _make_campaign(
            campaign_id=campaign_id,
            workspace_id=workspace_id,
            stop_on_reply=False,
        )
        seq = _make_sequence(campaign_id)
        step1 = _make_step(seq.id, order=0, wait_days=5)
        step2 = _make_step(seq.id, order=1, wait_days=7)
        var1 = _make_variant(step1.id)
        var2 = _make_variant(step2.id)

        db = AsyncMock()
        call_count = 0

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(campaign)
            elif call_count == 2:
                return _mock_scalars_result([seq])
            elif call_count == 3:
                return _mock_scalars_result([step1, step2])
            elif call_count == 4:
                return _mock_scalars_result([var1])
            elif call_count == 5:
                return _mock_scalars_result([var2])
            return _mock_scalars_result([])

        db.execute = AsyncMock(side_effect=mock_execute)

        converter = SequenceToWorkflowConverter()
        result = await converter.convert(db, campaign_id, workspace_id)

        wait_node = next(n for n in result["nodes"] if n["id"] == "n_wait_1")
        assert wait_node["config"]["days"] == 5
        assert wait_node["name"] == "Wait 5d"

    @pytest.mark.asyncio
    async def test_settings_use_campaign_timezone(self):
        """Workflow settings should use the campaign's timezone."""
        campaign_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        campaign = _make_campaign(
            campaign_id=campaign_id,
            workspace_id=workspace_id,
            timezone_str="Europe/Copenhagen",
            stop_on_reply=False,
        )
        seq = _make_sequence(campaign_id)
        step1 = _make_step(seq.id, order=0, wait_days=1)
        var1 = _make_variant(step1.id)

        db = AsyncMock()
        call_count = 0

        async def mock_execute(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return _mock_scalar_result(campaign)
            elif call_count == 2:
                return _mock_scalars_result([seq])
            elif call_count == 3:
                return _mock_scalars_result([step1])
            elif call_count == 4:
                return _mock_scalars_result([var1])
            return _mock_scalars_result([])

        db.execute = AsyncMock(side_effect=mock_execute)

        converter = SequenceToWorkflowConverter()
        result = await converter.convert(db, campaign_id, workspace_id)

        assert result["settings"]["timezone"] == "Europe/Copenhagen"


class TestSchedulerSkipsWorkflowMode:
    """Test that the scheduler query excludes workflow-mode campaigns."""

    def test_scheduler_query_filters_execution_mode(self):
        """Verify the scheduler query includes execution_mode != 'workflow' filter."""
        # This is a static code analysis test - we verify the query was changed
        import inspect
        from app.workers.scheduler import _run_scheduler_async

        source = inspect.getsource(_run_scheduler_async)
        assert "execution_mode" in source
        assert "workflow" in source

    def test_campaign_model_has_execution_mode_field(self):
        """Verify Campaign model has the execution_mode column."""
        from app.models.campaign import Campaign
        assert hasattr(Campaign, "execution_mode")
