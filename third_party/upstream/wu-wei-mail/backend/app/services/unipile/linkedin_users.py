"""Unipile LinkedIn user resolution — provider ID lookup from profile URL."""

from __future__ import annotations

import logging
import re
from typing import Any

from app.services.unipile.client import UnipileClient

logger = logging.getLogger(__name__)

# Regex to extract LinkedIn vanity name from URL
_LINKEDIN_URL_RE = re.compile(
    r"(?:https?://)?(?:www\.)?linkedin\.com/in/([a-zA-Z0-9\-_%]+)",
    re.IGNORECASE,
)


class LinkedInUserService:
    """Resolve LinkedIn provider IDs from profile URLs."""

    def __init__(self, client: UnipileClient | None = None):
        self._client = client or UnipileClient()

    async def resolve_provider_id(
        self,
        account_id: str,
        linkedin_url: str,
    ) -> str | None:
        """Resolve a LinkedIn profile URL to a Unipile provider ID.

        Args:
            account_id: Unipile account ID to use for the lookup.
            linkedin_url: Full LinkedIn profile URL.

        Returns:
            Provider ID string, or None if resolution fails.
        """
        vanity = self._extract_vanity(linkedin_url)
        if not vanity:
            logger.warning("Cannot extract vanity from URL: %s", linkedin_url)
            return None

        try:
            result = await self._client.get(
                "/users",
                params={"account_id": account_id, "linkedin_public_id": vanity},
            )
            if isinstance(result, dict) and result.get("items"):
                return result["items"][0].get("provider_id")
            return None
        except Exception:
            logger.exception("Failed to resolve provider ID for %s", linkedin_url)
            return None

    async def get_user_profile(
        self,
        account_id: str,
        provider_id: str,
    ) -> dict[str, Any] | None:
        """Get a user's LinkedIn profile by provider ID."""
        try:
            return await self._client.get(f"/users/{provider_id}", params={"account_id": account_id})
        except Exception:
            logger.exception("Failed to get profile for %s", provider_id)
            return None

    @staticmethod
    def _extract_vanity(linkedin_url: str) -> str | None:
        """Extract LinkedIn vanity name from URL."""
        match = _LINKEDIN_URL_RE.search(linkedin_url)
        if match:
            return match.group(1).rstrip("/")
        return None


linkedin_user_service = LinkedInUserService()
