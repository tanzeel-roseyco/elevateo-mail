"""Warmup policy engine — volume ramp logic, safety guardrails, and graduation checks."""

from __future__ import annotations

from app.services import warmup_health_scorer


# ---------------------------------------------------------------------------
# Volume computation
# ---------------------------------------------------------------------------

def compute_daily_volume(
    state: object,
    program: object,
    recent_metrics: list[dict],
) -> int:
    """Compute the target daily warmup volume for an account.

    Ramp logic:
    - Start at 5 emails/day
    - Increase by program.ramp_increment_per_day each day
    - Cap at state.target_volume and program.max_daily_warmup
    - Reduce if health is low
    """
    health = warmup_health_scorer.compute(recent_metrics)

    # Hard stop on high bounce
    bounce_rate = warmup_health_scorer.compute_bounce_rate(recent_metrics)
    if bounce_rate > getattr(program, "auto_pause_on_bounce_rate", 0.08):
        return 0

    # Base: current allowed + increment
    current = getattr(state, "current_allowed_volume", 5)
    increment = getattr(program, "ramp_increment_per_day", 3)
    target = getattr(state, "target_volume", 50)
    max_daily = getattr(program, "max_daily_warmup", 200)

    new_volume = current + increment

    # Health-based reduction: scale down if health is poor
    if health < 0.5:
        new_volume = max(5, int(current * 0.7))  # reduce by 30%
    elif health < 0.7:
        new_volume = current  # hold steady, don't increase

    # Cap at target and max
    new_volume = min(new_volume, target, max_daily)
    return max(5, new_volume)  # Never go below 5


def compute_effective_send_limit(
    account: object,
    state: object | None,
) -> int:
    """Compute the effective daily send limit for the account.

    Used by the orchestrator to write to EmailAccount.warmup_level.
    """
    if state is None:
        # Not enrolled in warmup — use full daily limit
        return getattr(account, "daily_limit", 50)

    phase = getattr(state, "phase", "graduated")
    if phase == "graduated":
        return getattr(account, "daily_limit", 50)

    if phase in ("paused", "error"):
        return 0

    # Actively warming — use the warmup volume
    return getattr(state, "current_allowed_volume", 5)


# ---------------------------------------------------------------------------
# Safety guardrails
# ---------------------------------------------------------------------------

def check_safety_guardrails(
    state: object,
    program: object,
    recent_metrics: list[dict],
) -> list[str]:
    """Check for safety violations that should trigger auto-pause.

    Returns list of violation flag strings. Empty = all clear.
    """
    violations = []

    if not recent_metrics:
        return violations

    bounce_rate = warmup_health_scorer.compute_bounce_rate(recent_metrics)
    bounce_threshold = getattr(program, "auto_pause_on_bounce_rate", 0.08)
    if bounce_rate > bounce_threshold:
        violations.append(f"bounce_rate_exceeded:{bounce_rate:.3f}>{bounce_threshold}")

    # Complaint rate check
    total_complaints = sum(m.get("spam_reported", 0) for m in recent_metrics)
    total_sent = sum(m.get("sent", 0) for m in recent_metrics)
    if total_sent > 0:
        complaint_rate = total_complaints / total_sent
        complaint_threshold = getattr(program, "auto_pause_on_complaint_rate", 0.003)
        if complaint_rate > complaint_threshold:
            violations.append(f"complaint_rate_exceeded:{complaint_rate:.4f}>{complaint_threshold}")

    # Low inbox placement
    placement = warmup_health_scorer.compute_placement_rate(recent_metrics)
    if placement < 0.5 and total_sent > 10:
        violations.append(f"low_inbox_placement:{placement:.3f}")

    return violations


# ---------------------------------------------------------------------------
# Graduation check
# ---------------------------------------------------------------------------

def should_graduate(
    state: object,
    recent_metrics: list[dict],
) -> bool:
    """Check if an account should graduate from warmup.

    Criteria:
    - 7+ days of metrics at target volume
    - Bounce rate < 2%
    - Inbox placement > 90%
    - Health score > 0.9
    """
    if not recent_metrics or len(recent_metrics) < 7:
        return False

    health = warmup_health_scorer.compute(recent_metrics)
    if health < 0.9:
        return False

    bounce = warmup_health_scorer.compute_bounce_rate(recent_metrics)
    if bounce >= 0.02:
        return False

    placement = warmup_health_scorer.compute_placement_rate(recent_metrics)
    if placement < 0.9:
        return False

    # Check that we've been at target volume for at least 7 days
    target = getattr(state, "target_volume", 50)
    at_target_days = sum(
        1 for m in recent_metrics[-7:]
        if m.get("sent", 0) >= target * 0.8  # Allow 80% of target as "at target"
    )
    return at_target_days >= 7
