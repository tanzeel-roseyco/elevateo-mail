"""Warmup health scorer — computes a blended health score from recent metrics."""

from __future__ import annotations


def compute(recent_metrics: list[dict], days: int = 7) -> float:
    """Compute a blended health score (0.0-1.0) from recent daily metrics.

    Weights:
    - Inbox placement rate: 40%
    - (1 - bounce_rate): 30%
    - Reply rate: 20%
    - Volume consistency: 10%
    """
    if not recent_metrics:
        return 1.0  # No data yet, assume healthy

    # Take the last N days
    metrics = recent_metrics[-days:]

    placement = compute_placement_rate(metrics)
    bounce = compute_bounce_rate(metrics)
    reply = compute_reply_rate(metrics)
    consistency = _compute_volume_consistency(metrics)

    score = (
        0.40 * placement
        + 0.30 * (1.0 - bounce)
        + 0.20 * min(reply * 10, 1.0)  # Scale reply rate (10% reply = perfect)
        + 0.10 * consistency
    )
    return round(max(0.0, min(1.0, score)), 4)


def compute_placement_rate(metrics: list[dict]) -> float:
    """Inbox placement rate across all days."""
    total_inbox = sum(m.get("inbox_placed", 0) for m in metrics)
    total_delivered = sum(m.get("delivered", 0) for m in metrics)
    if total_delivered == 0:
        return 1.0
    return total_inbox / total_delivered


def compute_bounce_rate(metrics: list[dict]) -> float:
    """Bounce rate across all days."""
    total_bounced = sum(m.get("bounced", 0) for m in metrics)
    total_sent = sum(m.get("sent", 0) for m in metrics)
    if total_sent == 0:
        return 0.0
    return total_bounced / total_sent


def compute_reply_rate(metrics: list[dict]) -> float:
    """Reply rate across all days."""
    total_replied = sum(m.get("replied", 0) for m in metrics)
    total_sent = sum(m.get("sent", 0) for m in metrics)
    if total_sent == 0:
        return 0.0
    return total_replied / total_sent


def _compute_volume_consistency(metrics: list[dict]) -> float:
    """How consistent daily send volumes are (1.0 = perfectly consistent)."""
    if len(metrics) < 2:
        return 1.0
    volumes = [m.get("sent", 0) for m in metrics]
    avg = sum(volumes) / len(volumes)
    if avg == 0:
        return 1.0
    variance = sum((v - avg) ** 2 for v in volumes) / len(volumes)
    std_dev = variance ** 0.5
    cv = std_dev / avg  # coefficient of variation
    # Map CV to 0-1: CV=0 → 1.0, CV>=1 → 0.0
    return max(0.0, 1.0 - cv)
