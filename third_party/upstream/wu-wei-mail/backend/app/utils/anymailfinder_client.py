"""AnyMailFinder API client for email discovery.

Uses the AnyMailFinder API to find email addresses given a person's
name and company domain.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

ANYMAILFINDER_API_URL = "https://api.anymailfinder.com/v5.0/search/person.json"


@dataclass
class EmailResult:
    """Result from an email lookup."""
    email: str | None = None
    confidence: float = 0.0  # 0.0-1.0
    success: bool = False
    error: str | None = None
    raw_response: dict[str, Any] | None = None


async def find_email(
    full_name: str,
    domain: str,
    *,
    company_name: str | None = None,
) -> EmailResult:
    """Find an email address for a person at a given domain.

    Args:
        full_name: Person's full name (e.g., "John Smith").
        domain: Company domain (e.g., "acme.com").
        company_name: Optional company name for better matching.

    Returns:
        EmailResult with email, confidence, and success status.
    """
    settings = get_settings()

    if not settings.ANYMAILFINDER_API_KEY:
        return EmailResult(
            success=False,
            error="ANYMAILFINDER_API_KEY is not configured",
        )

    if not full_name or not domain:
        return EmailResult(
            success=False,
            error="full_name and domain are required",
        )

    headers = {
        "Authorization": f"Bearer {settings.ANYMAILFINDER_API_KEY}",
        "Content-Type": "application/json",
    }

    payload: dict[str, Any] = {
        "full_name": full_name,
        "domain": domain,
    }
    if company_name:
        payload["company_name"] = company_name

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            logger.debug("AnyMailFinder: %s @ %s", full_name, domain)
            resp = await client.post(
                ANYMAILFINDER_API_URL,
                json=payload,
                headers=headers,
            )

            if resp.status_code == 200:
                data = resp.json()
                email = data.get("email")
                # AnyMailFinder returns validation status
                validation = data.get("email_class", "unknown")

                # Map validation to confidence
                confidence_map = {
                    "verified": 0.95,
                    "probably": 0.75,
                    "unknown": 0.5,
                    "disposable": 0.2,
                }
                confidence = confidence_map.get(validation, 0.5)

                if email:
                    logger.debug("AnyMailFinder found: %s (confidence: %.2f)", email, confidence)
                    return EmailResult(
                        email=email,
                        confidence=confidence,
                        success=True,
                        raw_response=data,
                    )
                else:
                    return EmailResult(
                        success=False,
                        error="No email found",
                        raw_response=data,
                    )

            elif resp.status_code == 404:
                return EmailResult(
                    success=False,
                    error="Email not found",
                )

            else:
                logger.warning(
                    "AnyMailFinder error: status=%d body=%s",
                    resp.status_code,
                    resp.text[:200],
                )
                return EmailResult(
                    success=False,
                    error=f"API error: {resp.status_code}",
                )

    except httpx.TimeoutException:
        return EmailResult(success=False, error="Request timed out")
    except Exception as e:
        logger.exception("AnyMailFinder unexpected error")
        return EmailResult(success=False, error=str(e))


async def find_emails_batch(
    leads: list[dict[str, str]],
) -> list[EmailResult]:
    """Find emails for a batch of leads.

    Args:
        leads: List of dicts with "full_name" and "domain" keys.

    Returns:
        List of EmailResult in same order as input.
    """
    results = []
    for lead in leads:
        result = await find_email(
            full_name=lead.get("full_name", ""),
            domain=lead.get("domain", ""),
            company_name=lead.get("company_name"),
        )
        results.append(result)
    return results
