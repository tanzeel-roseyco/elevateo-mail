"""Website validation pipeline — fetch website text and validate leads against ICP."""

from __future__ import annotations

import asyncio
import logging
import re
from html.parser import HTMLParser
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTML text extractor
# ---------------------------------------------------------------------------

class _TextExtractor(HTMLParser):
    """Extract visible text from HTML, ignoring scripts/styles."""

    SKIP_TAGS = {"script", "style", "noscript", "head", "meta", "link"}

    def __init__(self):
        super().__init__()
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag.lower() in self.SKIP_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self.SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            text = data.strip()
            if text:
                self._parts.append(text)

    def get_text(self) -> str:
        return " ".join(self._parts)


def _extract_text_from_html(html: str, max_chars: int = 3000) -> str:
    """Extract visible text from HTML content."""
    # Extract title
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    title = title_match.group(1).strip() if title_match else ""

    # Extract meta description
    desc_match = re.search(
        r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']*)["\']',
        html, re.IGNORECASE,
    )
    description = desc_match.group(1).strip() if desc_match else ""

    # Extract body text
    extractor = _TextExtractor()
    try:
        extractor.feed(html)
    except Exception:
        pass
    body_text = extractor.get_text()

    parts = []
    if title:
        parts.append(f"Title: {title}")
    if description:
        parts.append(f"Description: {description}")
    if body_text:
        parts.append(body_text)

    combined = "\n".join(parts)
    return combined[:max_chars]


# ---------------------------------------------------------------------------
# Website fetching
# ---------------------------------------------------------------------------

async def _fetch_httpx(url: str, max_chars: int = 3000) -> str | None:
    """Fetch website text via httpx (fast path)."""
    settings = get_settings()
    timeout = settings.PROSPECTING_VALIDATION_HTTPX_TIMEOUT if hasattr(settings, 'PROSPECTING_VALIDATION_HTTPX_TIMEOUT') else 5

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(float(timeout), connect=5.0),
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; WuWeiMail/1.0)"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            text = _extract_text_from_html(resp.text, max_chars)
            return text if text else None
    except Exception as e:
        logger.debug("httpx fetch failed for %s: %s", url, str(e))
        return None


async def _fetch_playwright(browser: Any, url: str, semaphore: asyncio.Semaphore, max_chars: int = 3000) -> str | None:
    """Fetch website text via Playwright (JS-rendered fallback)."""
    settings = get_settings()
    pw_timeout = settings.PROSPECTING_VALIDATION_PLAYWRIGHT_TIMEOUT if hasattr(settings, 'PROSPECTING_VALIDATION_PLAYWRIGHT_TIMEOUT') else 10

    async with semaphore:
        page = None
        try:
            page = await browser.new_page()
            await page.goto(url, timeout=pw_timeout * 1000)
            html = await page.content()
            text = _extract_text_from_html(html, max_chars)
            return text if text else None
        except Exception as e:
            logger.debug("Playwright fetch failed for %s: %s", url, str(e))
            return None
        finally:
            if page:
                try:
                    await page.close()
                except Exception:
                    pass


async def fetch_website_text(url: str, max_chars: int = 3000) -> str | None:
    """Fetch website content. httpx first, Playwright fallback for JS-heavy sites.

    Returns plain text (title + description + body), or None on failure.
    """
    text = await _fetch_httpx(url, max_chars)
    if text and len(text) >= 200:
        return text

    # Try Playwright fallback for JS-heavy sites
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            semaphore = asyncio.Semaphore(1)
            result = await _fetch_playwright(browser, url, semaphore, max_chars)
            await browser.close()
            return result or text  # return httpx result if playwright also fails
    except ImportError:
        logger.info("Playwright not installed — using httpx-only mode")
        return text
    except Exception as e:
        logger.debug("Playwright fallback failed: %s", str(e))
        return text


async def fetch_websites_batch(urls: list[str], max_chars: int = 3000) -> list[str | None]:
    """Fetch websites in parallel. Launches one Playwright browser for the batch."""
    settings = get_settings()
    concurrency = settings.PROSPECTING_VALIDATION_PLAYWRIGHT_CONCURRENCY if hasattr(settings, 'PROSPECTING_VALIDATION_PLAYWRIGHT_CONCURRENCY') else 5

    # First pass: httpx in parallel
    httpx_results = await asyncio.gather(
        *[_fetch_httpx(url, max_chars) for url in urls],
        return_exceptions=True,
    )
    # Normalize exceptions to None
    httpx_results = [r if not isinstance(r, Exception) else None for r in httpx_results]

    # Identify which need Playwright fallback (got text but too short)
    needs_playwright = [
        i for i, r in enumerate(httpx_results)
        if r is not None and len(r) < 200
    ]

    if needs_playwright:
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                semaphore = asyncio.Semaphore(concurrency)
                pw_tasks = [
                    _fetch_playwright(browser, urls[i], semaphore, max_chars)
                    for i in needs_playwright
                ]
                pw_results = await asyncio.gather(*pw_tasks, return_exceptions=True)
                await browser.close()

                for idx, result in zip(needs_playwright, pw_results):
                    if not isinstance(result, Exception) and result:
                        httpx_results[idx] = result
        except ImportError:
            logger.info("Playwright not installed — skipping JS fallback for batch")
        except Exception as e:
            logger.debug("Playwright batch fallback failed: %s", str(e))

    return httpx_results


# ---------------------------------------------------------------------------
# LLM validation
# ---------------------------------------------------------------------------

VALIDATION_PROMPT = """You are a lead qualification validator. For each lead below, determine if their website/company matches the target ICP criteria.

ICP Criteria: {icp_criteria}

For each lead, respond with:
- "MATCH" if the website clearly matches the ICP (right industry, right type of company)
- "LIKELY" if it's plausible but not certain
- "MISMATCH" if the website is clearly unrelated to the ICP
- "UNKNOWN" if the website couldn't be fetched or has no useful content

Return a JSON array of objects: [{{"lead_index": 0, "verdict": "MATCH", "reason": "SaaS company matching target industry"}}, ...]
Return ONLY valid JSON array, no other text."""


from dataclasses import dataclass


@dataclass
class ValidationResult:
    """Result of validating a single lead against ICP."""
    lead_index: int
    verdict: str  # MATCH, LIKELY, MISMATCH, UNKNOWN
    reason: str = ""


async def validate_leads_batch(
    leads: list[dict],
    website_texts: list[str | None],
    icp_criteria: dict,
) -> list[ValidationResult]:
    """Validate leads against ICP using cheap LLM. Returns verdict per lead."""
    import json

    settings = get_settings()
    model = settings.PROSPECTING_VALIDATION_MODEL if hasattr(settings, 'PROSPECTING_VALIDATION_MODEL') else "openai/gpt-4o-mini"

    # Build context for LLM
    lead_descriptions = []
    for i, (lead, text) in enumerate(zip(leads, website_texts)):
        name = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip() or "Unknown"
        company = lead.get("company", "Unknown")
        website = lead.get("website") or lead.get("domain", "N/A")

        desc = f"Lead {i}: {name} at {company} (website: {website})"
        if text:
            # Truncate website text to ~500 chars per lead
            desc += f"\nWebsite content: {text[:500]}"
        else:
            desc += "\nWebsite content: [could not fetch]"
        lead_descriptions.append(desc)

    prompt = VALIDATION_PROMPT.format(icp_criteria=json.dumps(icp_criteria))
    user_content = "\n\n".join(lead_descriptions)

    try:
        from app.utils.openrouter_client import chat_completion

        response = await chat_completion(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": user_content},
            ],
            model=model,
            temperature=0.1,
            max_tokens=2000,
        )

        return _parse_validation_response(response, len(leads))
    except Exception as e:
        logger.warning("Validation LLM call failed: %s", str(e))
        # Default to UNKNOWN for all leads on failure
        return [
            ValidationResult(lead_index=i, verdict="UNKNOWN", reason="validation_failed")
            for i in range(len(leads))
        ]


def _parse_validation_response(response: str, expected_count: int) -> list[ValidationResult]:
    """Parse validation JSON from LLM response."""
    import json

    cleaned = response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned.rsplit("```", 1)[0]
    cleaned = cleaned.strip()
    if cleaned.startswith("json"):
        cleaned = cleaned[4:].strip()

    try:
        data = json.loads(cleaned)
        if not isinstance(data, list):
            data = [data]
    except json.JSONDecodeError:
        logger.warning("Failed to parse validation response: %.200s", cleaned)
        return [
            ValidationResult(lead_index=i, verdict="UNKNOWN", reason="parse_failed")
            for i in range(expected_count)
        ]

    results = []
    seen_indices = set()
    for item in data:
        if isinstance(item, dict):
            idx = item.get("lead_index", len(results))
            results.append(ValidationResult(
                lead_index=idx,
                verdict=item.get("verdict", "UNKNOWN").upper(),
                reason=item.get("reason", ""),
            ))
            seen_indices.add(idx)

    # Fill in missing indices with UNKNOWN
    for i in range(expected_count):
        if i not in seen_indices:
            results.append(ValidationResult(
                lead_index=i, verdict="UNKNOWN", reason="not_in_response",
            ))

    return sorted(results, key=lambda r: r.lead_index)


def apply_validation_to_lead(lead_data: dict, result: ValidationResult) -> dict:
    """Apply validation result to a lead's quality scoring."""
    existing_score = lead_data.get("quality_score") or 0.5
    enrichment_data = lead_data.get("enrichment_data") or {}

    if result.verdict == "MATCH":
        lead_data["quality_score"] = min(1.0, existing_score + 0.1)
    elif result.verdict == "MISMATCH":
        lead_data["quality_score"] = max(0.0, existing_score - 0.4)
        lead_data["readiness_band"] = "HOLD"
    # LIKELY and UNKNOWN: keep existing score

    enrichment_data["validation"] = {
        "verdict": result.verdict,
        "reason": result.reason,
    }
    lead_data["enrichment_data"] = enrichment_data

    return lead_data
