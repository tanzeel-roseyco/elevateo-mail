"""Policy engine unit tests — volume computation, guardrails, and graduation."""

from unittest.mock import MagicMock

import pytest

from app.services import warmup_policy_engine, warmup_health_scorer


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_state(current=5, target=50, phase="ramping"):
    s = MagicMock()
    s.current_allowed_volume = current
    s.target_volume = target
    s.phase = phase
    return s


def make_program(increment=3, max_daily=200, bounce_threshold=0.08, complaint_threshold=0.003):
    p = MagicMock()
    p.ramp_increment_per_day = increment
    p.max_daily_warmup = max_daily
    p.auto_pause_on_bounce_rate = bounce_threshold
    p.auto_pause_on_complaint_rate = complaint_threshold
    return p


def make_metrics(days=7, sent=10, delivered=9, opened=5, replied=1, bounced=0, spam=0, inbox=9, spam_placed=0):
    return [
        {
            "sent": sent, "delivered": delivered, "opened": opened,
            "replied": replied, "bounced": bounced, "spam_reported": spam,
            "inbox_placed": inbox, "spam_placed": spam_placed,
        }
        for _ in range(days)
    ]


# ---------------------------------------------------------------------------
# Volume computation
# ---------------------------------------------------------------------------

class TestVolumeComputation:

    def test_initial_volume_is_5_plus_increment(self):
        state = make_state(current=5, target=50)
        program = make_program(increment=3)
        metrics = make_metrics(days=3)
        vol = warmup_policy_engine.compute_daily_volume(state, program, metrics)
        assert vol == 8  # 5 + 3

    def test_ramp_increments(self):
        state = make_state(current=20, target=50)
        program = make_program(increment=5)
        metrics = make_metrics(days=5)
        vol = warmup_policy_engine.compute_daily_volume(state, program, metrics)
        assert vol == 25  # 20 + 5

    def test_caps_at_target(self):
        state = make_state(current=48, target=50)
        program = make_program(increment=5)
        metrics = make_metrics(days=7)
        vol = warmup_policy_engine.compute_daily_volume(state, program, metrics)
        assert vol == 50  # capped at target

    def test_caps_at_max_daily(self):
        state = make_state(current=195, target=300)
        program = make_program(increment=10, max_daily=200)
        metrics = make_metrics(days=7)
        vol = warmup_policy_engine.compute_daily_volume(state, program, metrics)
        assert vol == 200  # capped at max_daily

    def test_reduces_on_low_health(self):
        state = make_state(current=30, target=50)
        program = make_program(increment=3)
        # Poor health: 0% inbox placement → health ≈ 0.4 (below 0.5 threshold)
        metrics = make_metrics(days=7, sent=10, bounced=0, opened=0, delivered=10, inbox=0, replied=0)
        vol = warmup_policy_engine.compute_daily_volume(state, program, metrics)
        # With low health (<0.5), volume is reduced by 30%: max(5, int(30*0.7)) = 21
        assert vol < 30

    def test_returns_0_on_high_bounce(self):
        state = make_state(current=30, target=50)
        program = make_program(increment=3, bounce_threshold=0.08)
        # 20% bounce rate
        metrics = make_metrics(days=7, sent=10, bounced=2)
        vol = warmup_policy_engine.compute_daily_volume(state, program, metrics)
        assert vol == 0


# ---------------------------------------------------------------------------
# Safety guardrails
# ---------------------------------------------------------------------------

class TestGuardrails:

    def test_no_violations_healthy(self):
        state = make_state()
        program = make_program()
        metrics = make_metrics(days=7, sent=10, bounced=0, spam=0, inbox=9)
        violations = warmup_policy_engine.check_safety_guardrails(state, program, metrics)
        assert violations == []

    def test_bounce_rate_violation(self):
        state = make_state()
        program = make_program(bounce_threshold=0.08)
        metrics = make_metrics(days=7, sent=10, bounced=1)  # 10% bounce
        violations = warmup_policy_engine.check_safety_guardrails(state, program, metrics)
        assert any("bounce_rate" in v for v in violations)

    def test_complaint_rate_violation(self):
        state = make_state()
        program = make_program(complaint_threshold=0.003)
        metrics = make_metrics(days=7, sent=100, spam=1)  # 1% complaint
        violations = warmup_policy_engine.check_safety_guardrails(state, program, metrics)
        assert any("complaint_rate" in v for v in violations)

    def test_low_inbox_placement(self):
        state = make_state()
        program = make_program()
        # Only 30% inbox placement
        metrics = make_metrics(days=7, sent=10, delivered=10, inbox=3)
        violations = warmup_policy_engine.check_safety_guardrails(state, program, metrics)
        assert any("low_inbox_placement" in v for v in violations)

    def test_empty_metrics_no_violations(self):
        state = make_state()
        program = make_program()
        violations = warmup_policy_engine.check_safety_guardrails(state, program, [])
        assert violations == []


# ---------------------------------------------------------------------------
# Graduation
# ---------------------------------------------------------------------------

class TestGraduation:

    def test_graduates_after_steady_period(self):
        state = make_state(current=50, target=50, phase="steady")
        # 7 days of perfect metrics at target volume
        metrics = make_metrics(days=7, sent=50, delivered=49, opened=25, replied=5, bounced=0, inbox=49)
        assert warmup_policy_engine.should_graduate(state, metrics) is True

    def test_no_graduate_with_high_bounce(self):
        state = make_state(current=50, target=50, phase="steady")
        # High bounce
        metrics = make_metrics(days=7, sent=50, delivered=45, opened=20, replied=3, bounced=3, inbox=45)
        assert warmup_policy_engine.should_graduate(state, metrics) is False

    def test_no_graduate_with_few_days(self):
        state = make_state(current=50, target=50, phase="steady")
        metrics = make_metrics(days=3, sent=50, delivered=49, opened=25, replied=5, bounced=0, inbox=49)
        assert warmup_policy_engine.should_graduate(state, metrics) is False

    def test_no_graduate_low_inbox_placement(self):
        state = make_state(current=50, target=50, phase="steady")
        # Poor inbox placement
        metrics = make_metrics(days=7, sent=50, delivered=50, opened=25, replied=5, bounced=0, inbox=40)
        assert warmup_policy_engine.should_graduate(state, metrics) is False


# ---------------------------------------------------------------------------
# Effective send limit
# ---------------------------------------------------------------------------

class TestEffectiveLimit:

    def test_warmup_caps_send_limit(self):
        account = MagicMock(daily_limit=50)
        state = make_state(current=15, target=50, phase="ramping")
        limit = warmup_policy_engine.compute_effective_send_limit(account, state)
        assert limit == 15

    def test_graduated_uses_full_limit(self):
        account = MagicMock(daily_limit=50)
        state = make_state(current=50, target=50, phase="graduated")
        limit = warmup_policy_engine.compute_effective_send_limit(account, state)
        assert limit == 50

    def test_paused_returns_0(self):
        account = MagicMock(daily_limit=50)
        state = make_state(current=30, phase="paused")
        limit = warmup_policy_engine.compute_effective_send_limit(account, state)
        assert limit == 0

    def test_not_enrolled_uses_full(self):
        account = MagicMock(daily_limit=50)
        limit = warmup_policy_engine.compute_effective_send_limit(account, None)
        assert limit == 50


# ---------------------------------------------------------------------------
# Health scorer
# ---------------------------------------------------------------------------

class TestHealthScorer:

    def test_perfect_health(self):
        metrics = make_metrics(days=7, sent=10, delivered=10, opened=5, replied=1, bounced=0, inbox=10)
        score = warmup_health_scorer.compute(metrics)
        assert score >= 0.9

    def test_empty_metrics_returns_1(self):
        assert warmup_health_scorer.compute([]) == 1.0

    def test_high_bounce_lowers_score(self):
        metrics = make_metrics(days=7, sent=10, delivered=8, opened=3, replied=0, bounced=5, inbox=8)
        score = warmup_health_scorer.compute(metrics)
        assert score < 0.7

    def test_placement_rate(self):
        metrics = make_metrics(days=3, delivered=10, inbox=8)
        rate = warmup_health_scorer.compute_placement_rate(metrics)
        assert rate == pytest.approx(0.8)

    def test_bounce_rate(self):
        metrics = make_metrics(days=3, sent=10, bounced=2)
        rate = warmup_health_scorer.compute_bounce_rate(metrics)
        assert rate == pytest.approx(0.2)

    def test_reply_rate(self):
        metrics = make_metrics(days=3, sent=10, replied=3)
        rate = warmup_health_scorer.compute_reply_rate(metrics)
        assert rate == pytest.approx(0.3)
