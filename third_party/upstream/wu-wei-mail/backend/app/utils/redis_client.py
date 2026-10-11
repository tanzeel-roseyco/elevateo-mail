"""Redis client for atomic counters, caching, and rate limiting."""

import redis
from app.config import get_settings

settings = get_settings()

_redis: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Get a shared Redis connection (synchronous, for use in Celery workers)."""
    global _redis
    if _redis is None:
        _redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


# ── Daily send counters ──────────────────────────────────────────────────

def _account_daily_key(account_id: str) -> str:
    return f"wuweimail:account:{account_id}:sent_today"


def _campaign_daily_key(campaign_id: str) -> str:
    return f"wuweimail:campaign:{campaign_id}:sent_today"


def increment_account_sent(account_id: str) -> int:
    """Atomically increment and return the account's daily send count."""
    r = get_redis()
    key = _account_daily_key(account_id)
    count = r.incr(key)
    # Set expiry to 25 hours (auto-reset with margin for timezone drift)
    if count == 1:
        r.expire(key, 90_000)
    return count


def get_account_sent_today(account_id: str) -> int:
    """Get the current daily send count for an account."""
    r = get_redis()
    val = r.get(_account_daily_key(account_id))
    return int(val) if val else 0


def increment_campaign_sent(campaign_id: str) -> int:
    """Atomically increment and return the campaign's daily send count."""
    r = get_redis()
    key = _campaign_daily_key(campaign_id)
    count = r.incr(key)
    if count == 1:
        r.expire(key, 90_000)
    return count


def get_campaign_sent_today(campaign_id: str) -> int:
    """Get the current daily send count for a campaign."""
    r = get_redis()
    val = r.get(_campaign_daily_key(campaign_id))
    return int(val) if val else 0


def reset_all_daily_counters():
    """Delete all daily counter keys. Called at midnight UTC as a safety net."""
    r = get_redis()
    for pattern in ["wuweimail:account:*:sent_today", "wuweimail:campaign:*:sent_today"]:
        cursor = 0
        while True:
            cursor, keys = r.scan(cursor, match=pattern, count=500)
            if keys:
                r.delete(*keys)
            if cursor == 0:
                break
