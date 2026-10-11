"""Lead discovery service — creates and executes discovery runs.

Orchestrates the full discovery flow:
1. Create run with source strategy from SourceStrategyPlanner.
2. Generate partitions from the source strategy.
3. Execute partitions: parallel Serper searches → deduplicate → batch LLM extraction.
4. Collect results into ProspectingLead records.
5. Update run progress throughout.

All operations are workspace-isolated.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.prospecting import (
    ProspectingRun, ProspectingPartition, ProspectingLead, ProspectingConversation,
)
from app.services.prospecting.source_strategy_service import (
    source_strategy_planner, SourceStrategy,
)

logger = logging.getLogger(__name__)

# Maximum organic results per source to avoid LLM context bloat
MAX_RESULTS_PER_SOURCE = 15
# Maximum total results sent to the batch LLM call
MAX_TOTAL_RESULTS = 50


# ---------------------------------------------------------------------------
# Run status constants
# ---------------------------------------------------------------------------

class RunStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PartitionStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# ---------------------------------------------------------------------------
# LLM extraction prompt
# ---------------------------------------------------------------------------

LEAD_EXTRACTION_PROMPT = """You are a lead data extraction assistant. Given Google search results about companies and people, extract structured lead data.

Each search result is tagged with [source: SOURCE_NAME]. Include the source_name field in your output so we can attribute leads back to their source.

For each person/company you can identify from the search results, extract:
- first_name: string
- last_name: string
- company: string (company name)
- title: string (job title if found)
- email: string (if visible in results)
- phone: string (if visible)
- website: string (company website)
- domain: string (company domain, e.g. "acme.com")
- city: string (if found)
- state: string (if found)
- country: string (if found)
- industry: string (if identifiable)
- linkedin_url: string (if found)
- source_name: string (the SOURCE_NAME from the [source: ...] tag)

Return a JSON array of lead objects. Only include fields you can confidently extract.
If a search result is about a company but not a specific person, still extract company info and leave person fields empty.
Extract as many distinct leads as possible. Return ONLY valid JSON array, no other text.

ICP criteria for context: {icp_criteria}"""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class LeadDiscoveryService:
    """Manages prospecting discovery runs end-to-end."""

    async def create_run(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        icp_criteria: dict[str, Any] | None = None,
    ) -> ProspectingRun:
        """Create a new discovery run with source strategy and partitions."""
        # Verify conversation ownership
        result = await db.execute(
            select(ProspectingConversation).where(
                ProspectingConversation.id == conversation_id,
                ProspectingConversation.workspace_id == workspace_id,
            )
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found in workspace")

        # Plan source strategy
        criteria = icp_criteria or {}
        strategy = source_strategy_planner.plan(criteria)

        # Create run
        run = ProspectingRun(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            run_type="discovery",
            status=RunStatus.PENDING,
            icp_criteria=criteria,
            source_strategy=strategy.to_dict(),
            progress={"total": len(strategy.sources), "completed": 0, "errors": 0},
        )
        db.add(run)
        await db.flush()

        # Create partitions — one per source in the strategy
        for source_weight in strategy.sources:
            partition = ProspectingPartition(
                workspace_id=workspace_id,
                run_id=run.id,
                source_name=source_weight.source_name,
                partition_key=strategy.icp_type,
                status=PartitionStatus.PENDING,
            )
            db.add(partition)

        await db.flush()
        return run

    async def execute_run(
        self,
        db: AsyncSession,
        run_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> ProspectingRun:
        """Execute all partitions in a discovery run.

        Optimized pipeline:
        1. Parallel Serper searches (one per partition) — I/O-bound, run concurrently.
        2. Deduplicate organic results by URL across all sources.
        3. Single batch LLM extraction — one call for all results.
        4. Persist leads with source attribution from LLM output.
        """
        # Load run
        result = await db.execute(
            select(ProspectingRun).where(
                ProspectingRun.id == run_id,
                ProspectingRun.workspace_id == workspace_id,
            )
        )
        run = result.scalar_one_or_none()
        if not run:
            raise ValueError(f"Run {run_id} not found in workspace")

        if run.status not in (RunStatus.PENDING, RunStatus.FAILED):
            raise ValueError(f"Run {run_id} is in status {run.status}, cannot execute")

        # Mark running
        run.status = RunStatus.RUNNING
        run.started_at = datetime.now(timezone.utc)
        await db.flush()

        # Load partitions
        part_result = await db.execute(
            select(ProspectingPartition).where(
                ProspectingPartition.run_id == run_id,
            ).order_by(ProspectingPartition.created_at.asc())
        )
        partitions = list(part_result.scalars().all())

        # ── Phase 1: Parallel Serper searches ──
        for p in partitions:
            p.status = PartitionStatus.RUNNING

        search_tasks = [
            self._search_source(
                source_name=p.source_name,
                partition_key=p.partition_key,
                icp_criteria=run.icp_criteria or {},
            )
            for p in partitions
        ]
        search_results = await asyncio.gather(*search_tasks, return_exceptions=True)

        # Collect organic results tagged with source name, track partition status
        all_organic: list[dict[str, Any]] = []
        error_count = 0
        partition_source_counts: dict[str, int] = {}  # source_name → organic count

        for idx, result in enumerate(search_results):
            partition = partitions[idx]
            if isinstance(result, Exception):
                logger.warning("Search failed for %s: %s", partition.source_name, str(result))
                partition.status = PartitionStatus.FAILED
                partition.error_detail = str(result)
                error_count += 1
            else:
                organic = result[:MAX_RESULTS_PER_SOURCE]
                # Tag each result with source for attribution
                for item in organic:
                    item["_source_name"] = partition.source_name
                all_organic.extend(organic)
                partition_source_counts[partition.source_name] = len(organic)

        # ── Phase 2: Deduplicate by URL ──
        seen_urls: set[str] = set()
        unique_organic: list[dict[str, Any]] = []
        for item in all_organic:
            url = item.get("link", "")
            if url and url in seen_urls:
                continue
            if url:
                seen_urls.add(url)
            unique_organic.append(item)

        # Cap total results to avoid LLM context bloat
        unique_organic = unique_organic[:MAX_TOTAL_RESULTS]

        # ── Phase 3: Single batch LLM extraction ──
        total_leads = 0
        if unique_organic:
            raw_leads = await self._batch_extract_leads(
                organic_results=unique_organic,
                icp_criteria=run.icp_criteria or {},
            )

            # ── Phase 3.5: Domain derivation ──
            from app.services.prospecting.domain_utils import derive_domain_from_email, derive_website_from_domain
            for raw in raw_leads:
                if raw.get("email") and not raw.get("domain"):
                    derived = derive_domain_from_email(raw["email"])
                    if derived:
                        raw["domain"] = derived
                        if not raw.get("website"):
                            raw["website"] = derive_website_from_domain(derived)

            # ── Phase 3.6 + 3.7: Website validation ──
            settings = get_settings()
            if settings.PROSPECTING_VALIDATION_ENABLED:
                try:
                    from app.services.prospecting.website_validator import (
                        fetch_websites_batch, validate_leads_batch, apply_validation_to_lead,
                    )

                    # Build website URLs for fetching
                    urls = []
                    for raw in raw_leads:
                        url = raw.get("website") or (f"https://{raw['domain']}" if raw.get("domain") else None)
                        urls.append(url)

                    # Fetch websites in parallel (only non-None URLs)
                    valid_urls = [u or "https://example.invalid" for u in urls]
                    website_texts = await fetch_websites_batch(valid_urls, max_chars=settings.PROSPECTING_VALIDATION_MAX_CHARS)

                    # Null out results for leads without URLs
                    for i, url in enumerate(urls):
                        if url is None:
                            website_texts[i] = None

                    # Batch LLM validation
                    validation_results = await validate_leads_batch(
                        leads=raw_leads,
                        website_texts=website_texts,
                        icp_criteria=run.icp_criteria or {},
                    )

                    # Apply validation to leads
                    for raw, vr in zip(raw_leads, validation_results):
                        apply_validation_to_lead(raw, vr)

                    logger.info(
                        "Validation: %d leads validated",
                        len(validation_results),
                    )
                except Exception as e:
                    logger.warning("Website validation failed, skipping: %s", str(e))

            # ── Phase 4: Persist leads with source attribution ──
            seen_emails: set[str] = set()
            # Build a lookup: which partitions succeeded (for result_count tracking)
            partition_lead_counts: dict[str, int] = {}

            for raw in raw_leads:
                email = raw.get("email")
                if email and email in seen_emails:
                    continue
                if email:
                    seen_emails.add(email)

                # Source attribution: use LLM-provided source_name, fall back to first partition
                source = raw.get("source_name", "")
                if not source or source not in partition_source_counts:
                    # Fallback: attribute to the first successful partition
                    source = next(iter(partition_source_counts), "unknown")

                lead = ProspectingLead(
                    workspace_id=workspace_id,
                    run_id=run_id,
                    email=raw.get("email"),
                    first_name=raw.get("first_name"),
                    last_name=raw.get("last_name"),
                    company=raw.get("company"),
                    title=raw.get("title"),
                    phone=raw.get("phone"),
                    linkedin_url=raw.get("linkedin_url"),
                    website=raw.get("website"),
                    city=raw.get("city"),
                    state=raw.get("state"),
                    country=raw.get("country"),
                    industry=raw.get("industry"),
                    domain=raw.get("domain"),
                    source_name=source,
                    raw_data=raw,
                )
                db.add(lead)
                total_leads += 1
                partition_lead_counts[source] = partition_lead_counts.get(source, 0) + 1

            # Update partition result counts
            for partition in partitions:
                if partition.status != PartitionStatus.FAILED:
                    partition.status = PartitionStatus.COMPLETED
                    partition.result_count = partition_lead_counts.get(partition.source_name, 0)
        else:
            # No organic results at all — mark non-failed partitions as completed with 0
            for partition in partitions:
                if partition.status != PartitionStatus.FAILED:
                    partition.status = PartitionStatus.COMPLETED
                    partition.result_count = 0

        completed_count = sum(1 for p in partitions if p.status == PartitionStatus.COMPLETED)

        # Update run progress
        run.progress = {
            "total": len(partitions),
            "completed": completed_count,
            "errors": error_count,
            "total_leads": total_leads,
        }
        await db.flush()

        # Final status
        if len(partitions) > 0 and error_count == len(partitions):
            run.status = RunStatus.FAILED
            run.error_detail = f"All {error_count} partitions failed"
        else:
            run.status = RunStatus.COMPLETED

        run.completed_at = datetime.now(timezone.utc)
        await db.flush()
        return run

    async def _search_source(
        self,
        source_name: str,
        partition_key: str | None = None,
        icp_criteria: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Run a Serper search for a single source (no LLM). Returns organic results."""
        from app.utils.serper_client import search

        criteria = icp_criteria or {}
        query = self._build_search_query(source_name, criteria)
        logger.info("Discovery search [%s]: %s", source_name, query)

        search_results = await search(query, num=10)
        organic = search_results.get("organic", [])
        logger.info("Search [%s] returned %d organic results", source_name, len(organic))
        return organic

    async def _batch_extract_leads(
        self,
        organic_results: list[dict[str, Any]],
        icp_criteria: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Extract structured leads from all organic results in a single LLM call.

        Tags each result with [source: SOURCE_NAME] so the LLM can include
        source attribution in its output.
        """
        from app.utils.openrouter_client import extract_json

        results_text = self._format_search_results_with_source(organic_results)

        prompt = LEAD_EXTRACTION_PROMPT.format(
            icp_criteria=json.dumps(icp_criteria),
        )

        try:
            response = await extract_json(prompt, results_text)
            leads = self._parse_leads_json(response)
            logger.info(
                "Batch extraction: %d leads from %d results",
                len(leads), len(organic_results),
            )
            return leads
        except Exception as e:
            logger.warning("Batch LLM extraction failed: %s", str(e))
            return []

    def _build_search_query(self, source_name: str, icp_criteria: dict[str, Any]) -> str:
        """Build a search query from ICP criteria + source type."""
        parts: list[str] = []

        # Core ICP fields
        industry = icp_criteria.get("industry", "")
        role = icp_criteria.get("role", "")
        location = icp_criteria.get("location", "")
        company_type = icp_criteria.get("company_type", "")
        company_size = icp_criteria.get("company_size", "")

        # Use the query field if provided by LLM extraction
        raw_query = icp_criteria.get("query", "")

        # Source-specific query building
        if source_name == "google_maps":
            if industry:
                parts.append(str(industry))
            if location:
                parts.append(str(location))
            parts.append("businesses near me contact email")

        elif source_name == "linkedin_search":
            if role:
                parts.append(str(role))
            if industry:
                parts.append(str(industry))
            parts.append("LinkedIn profile email")

        elif source_name == "company_db":
            if industry:
                parts.append(str(industry))
            if company_type:
                parts.append(str(company_type))
            if company_size:
                parts.append(str(company_size))
            parts.append("company directory list")

        elif source_name == "email_finder":
            if role:
                parts.append(str(role))
            if industry:
                parts.append(str(industry))
            parts.append("email contact")

        elif source_name == "healthcare_db":
            if industry:
                parts.append(str(industry))
            else:
                parts.append("healthcare")
            if location:
                parts.append(str(location))
            parts.append("clinic practice provider directory")

        elif source_name == "web_scraper":
            if raw_query:
                parts.append(str(raw_query))
            elif industry:
                parts.append(str(industry))
            if role:
                parts.append(str(role))
            parts.append("company website contact")

        else:
            # Fallback
            if raw_query:
                return str(raw_query)
            if industry:
                parts.append(str(industry))
            if role:
                parts.append(str(role))
            parts.append("business contact email")

        # Add location if not already added
        if location and str(location) not in parts:
            parts.append(str(location))

        # Add keywords
        keywords = icp_criteria.get("keywords", [])
        if isinstance(keywords, list):
            parts.extend(str(k) for k in keywords[:3])

        return " ".join(parts)

    def _format_search_results(self, organic: list[dict[str, Any]]) -> str:
        """Format organic search results into text for LLM extraction."""
        entries = []
        for i, result in enumerate(organic[:15], 1):
            entry = f"Result {i}:\n"
            entry += f"  Title: {result.get('title', 'N/A')}\n"
            entry += f"  URL: {result.get('link', 'N/A')}\n"
            entry += f"  Snippet: {result.get('snippet', 'N/A')}\n"
            if result.get("sitelinks"):
                for link in result["sitelinks"][:2]:
                    entry += f"  Sitelink: {link.get('title', '')} - {link.get('link', '')}\n"
            entries.append(entry)

        return "\n".join(entries)

    def _format_search_results_with_source(self, organic: list[dict[str, Any]]) -> str:
        """Format organic search results with source tags for batch LLM extraction."""
        entries = []
        for i, result in enumerate(organic, 1):
            source = result.get("_source_name", "unknown")
            entry = f"Result {i} [source: {source}]:\n"
            entry += f"  Title: {result.get('title', 'N/A')}\n"
            entry += f"  URL: {result.get('link', 'N/A')}\n"
            entry += f"  Snippet: {result.get('snippet', 'N/A')}\n"
            if result.get("sitelinks"):
                for link in result["sitelinks"][:2]:
                    entry += f"  Sitelink: {link.get('title', '')} - {link.get('link', '')}\n"
            entries.append(entry)

        return "\n".join(entries)

    def _parse_leads_json(self, response: str) -> list[dict[str, Any]]:
        """Parse leads JSON from LLM response, handling various formats.

        Includes repair logic for truncated JSON (e.g. when max_tokens cuts off
        the response mid-array).
        """
        cleaned = response.strip()

        # Strip markdown code block markers
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()

        data = self._try_parse_json(cleaned)
        if data is not None:
            return self._extract_list(data)

        # Attempt to repair truncated JSON array
        repaired = self._repair_truncated_json(cleaned)
        if repaired is not None:
            data = self._try_parse_json(repaired)
            if data is not None:
                logger.info("Recovered %d leads from truncated JSON", len(self._extract_list(data)))
                return self._extract_list(data)

        logger.warning("Failed to parse leads JSON: %.200s", cleaned)
        return []

    def _try_parse_json(self, text: str) -> Any | None:
        """Try to parse JSON, return None on failure."""
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            return None

    def _extract_list(self, data: Any) -> list[dict[str, Any]]:
        """Extract a list of dicts from parsed JSON data."""
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        if isinstance(data, dict):
            for key in ("leads", "results", "data"):
                if key in data and isinstance(data[key], list):
                    return data[key]
            return [data]
        return []

    def _repair_truncated_json(self, text: str) -> str | None:
        """Try to repair JSON that was truncated mid-array by max_tokens.

        Strategy: find the last complete object in the array and close it.
        """
        if not text.startswith("["):
            return None

        # Find the last complete object by looking for '},\n' or '}\n' pattern
        last_brace = text.rfind("}")
        if last_brace == -1:
            return None

        # Take everything up to and including the last closing brace, then close array
        candidate = text[:last_brace + 1].rstrip().rstrip(",") + "\n]"
        return candidate

    async def get_run_progress(
        self,
        db: AsyncSession,
        run_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Get current progress for a run (workspace-isolated)."""
        result = await db.execute(
            select(ProspectingRun).where(
                ProspectingRun.id == run_id,
                ProspectingRun.workspace_id == workspace_id,
            )
        )
        run = result.scalar_one_or_none()
        if not run:
            raise ValueError(f"Run {run_id} not found in workspace")

        # Count leads
        lead_count_result = await db.execute(
            select(func.count()).select_from(ProspectingLead).where(
                ProspectingLead.run_id == run_id,
            )
        )
        lead_count = lead_count_result.scalar() or 0

        return {
            "run_id": str(run.id),
            "status": run.status,
            "progress": run.progress,
            "lead_count": lead_count,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "error_detail": run.error_detail,
        }


lead_discovery_service = LeadDiscoveryService()
