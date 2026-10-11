"""Serper API client for Google Search.

Uses the Serper.dev API to perform Google searches for lead discovery.
Returns structured search results (organic results, knowledge graph, etc.).
Includes retry with exponential backoff for transient errors.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

SERPER_API_URL = "https://google.serper.dev/search"

# Retry config
MAX_RETRIES = 3
RETRY_BASE_DELAY = 1.0  # seconds
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


async def search(
    query: str,
    *,
    num: int = 10,
    gl: str = "us",
    hl: str = "en",
) -> dict[str, Any]:
    """Perform a Google search via Serper API.

    Retries up to MAX_RETRIES times on transient errors (429, 5xx, timeouts)
    with exponential backoff and jitter.

    Args:
        query: Search query string.
        num: Number of results to return (max 100).
        gl: Country code for geolocation.
        hl: Language code.

    Returns:
        Full Serper response dict with organic, peopleAlsoAsk, knowledgeGraph, etc.
    """
    settings = get_settings()

    if not settings.SERPER_API_KEY:
        raise ValueError("SERPER_API_KEY is not configured")

    headers = {
        "X-API-KEY": settings.SERPER_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "q": query,
        "num": num,
        "gl": gl,
        "hl": hl,
    }

    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                logger.debug("Serper search (attempt %d): %s", attempt + 1, query)
                resp = await client.post(SERPER_API_URL, json=payload, headers=headers)

                if resp.status_code in RETRYABLE_STATUS_CODES and attempt < MAX_RETRIES:
                    delay = RETRY_BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.5)
                    logger.warning(
                        "Serper %d for '%s', retrying in %.1fs (attempt %d/%d)",
                        resp.status_code, query, delay, attempt + 1, MAX_RETRIES,
                    )
                    await asyncio.sleep(delay)
                    continue

                resp.raise_for_status()
                data = resp.json()

            organic_count = len(data.get("organic", []))
            logger.debug("Serper returned %d organic results", organic_count)
            return data

        except (httpx.TimeoutException, httpx.ConnectError) as e:
            last_error = e
            if attempt < MAX_RETRIES:
                delay = RETRY_BASE_DELAY * (2 ** attempt) + random.uniform(0, 0.5)
                logger.warning(
                    "Serper timeout/connect for '%s', retrying in %.1fs (attempt %d/%d)",
                    query, delay, attempt + 1, MAX_RETRIES,
                )
                await asyncio.sleep(delay)
            else:
                raise

    # Should not reach here, but just in case
    raise last_error or RuntimeError("Serper search failed after retries")


async def search_for_leads(
    icp_criteria: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build a search query from ICP criteria and return organic results.

    Translates ICP criteria into a Google search query aimed at finding
    companies/people matching the profile.
    """
    query = _build_search_query(icp_criteria)
    data = await search(query, num=20)
    return data.get("organic", [])


def _build_search_query(icp_criteria: dict[str, Any]) -> str:
    """Build a Google search query from ICP criteria dict.

    Combines industry, role, location, and other criteria into an
    effective search query for finding relevant companies/people.
    """
    parts: list[str] = []

    # Industry / vertical
    industry = icp_criteria.get("industry") or icp_criteria.get("vertical", "")
    if industry:
        parts.append(str(industry))

    # Role / title
    role = icp_criteria.get("role") or icp_criteria.get("title", "")
    if role:
        parts.append(str(role))

    # Company type / size
    company_type = icp_criteria.get("company_type") or icp_criteria.get("company_size", "")
    if company_type:
        parts.append(str(company_type))

    # Location / geo
    location = (
        icp_criteria.get("location")
        or icp_criteria.get("geo")
        or icp_criteria.get("city")
        or icp_criteria.get("country", "")
    )
    if location:
        parts.append(str(location))

    # Keywords
    keywords = icp_criteria.get("keywords", "")
    if keywords:
        if isinstance(keywords, list):
            parts.extend(str(k) for k in keywords)
        else:
            parts.append(str(keywords))

    # Fallback for raw query
    raw_query = icp_criteria.get("query", "")
    if raw_query:
        parts.append(str(raw_query))

    if not parts:
        return "business leads company contacts"

    # Add lead-finding context
    query = " ".join(parts)
    # Add email/contact context to find relevant pages
    query += " company contact email"

    return query
