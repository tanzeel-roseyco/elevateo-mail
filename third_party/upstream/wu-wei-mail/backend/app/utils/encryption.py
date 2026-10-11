"""Fernet-based encryption for sensitive fields like API keys."""

import logging
from cryptography.fernet import Fernet, InvalidToken
from app.config import get_settings

logger = logging.getLogger(__name__)


def _get_fernet() -> Fernet | None:
    """Get Fernet instance from ENCRYPTION_KEY setting."""
    settings = get_settings()
    key = settings.ENCRYPTION_KEY
    if not key:
        if not settings.DEBUG:
            raise RuntimeError(
                "ENCRYPTION_KEY is required in production. "
                "Cannot store secrets without encryption."
            )
        logger.warning("ENCRYPTION_KEY not set — storing API keys in plain text")
        return None
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(value: str) -> str:
    """Encrypt a string value. Returns plain text if no key configured."""
    f = _get_fernet()
    if f is None:
        return value
    return f.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    """Decrypt a string value. Returns as-is if no key configured or decryption fails."""
    f = _get_fernet()
    if f is None:
        return value
    try:
        return f.decrypt(value.encode()).decode()
    except InvalidToken:
        # Might be stored in plain text before encryption was enabled
        return value
