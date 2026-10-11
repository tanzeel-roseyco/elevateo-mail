"""Tests for the pipeline optimizations: batch extraction, retry, deduplication.

Covers:
- Batch LLM extraction (_batch_extract_leads)
- Source-tagged search results (_format_search_results_with_source)
- URL deduplication across sources
- Source attribution in leads
- Retry with exponential backoff (serper_client, openrouter_client)
- _search_source (Serper-only, no LLM)
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from app.services.prospecting.lead_discovery_service import (
    LeadDiscoveryService, RunStatus, PartitionStatus,
    MAX_RESULTS_PER_SOURCE, MAX_TOTAL_RESULTS,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _organic_result(title: str, link: str, snippet: str = "snippet") -> dict:
    return {"title": title, "link": link, "snippet": snippet}


def _tagged_result(title: str, link: str, source: str) -> dict:
    return {"title": title, "link": link, "snippet": "snippet", "_source_name": source}


# ===========================================================================
# 1. _search_source — Serper only, no LLM
# ===========================================================================

class TestSearchSource:
    """Verify _search_source calls Serper but not LLM."""

    def setup_method(self):
        self.svc = LeadDiscoveryService()

    async def test_calls_serper_and_returns_organic(self):
        organic = [_organic_result("Acme", "https://acme.com", "snippet")]
        with patch("app.utils.serper_client.search", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = {"organic": organic}

            result = await self.svc._search_source(
                source_name="web_scraper",
                icp_criteria={"industry": "SaaS"},
            )

        assert result == organic
        mock_search.assert_called_once()

    async def test_returns_empty_on_no_organic(self):
        with patch("app.utils.serper_client.search", new_callable=AsyncMock) as mock_search:
            mock_search.return_value = {"organic": []}

            result = await self.svc._search_source(
                source_name="web_scraper",
                icp_criteria={"industry": "SaaS"},
            )

        assert result == []

    async def test_propagates_serper_exception(self):
        """_search_source should NOT catch exceptions — let execute_run handle them."""
        with patch("app.utils.serper_client.search", new_callable=AsyncMock) as mock_search:
            mock_search.side_effect = RuntimeError("API down")

            with pytest.raises(RuntimeError, match="API down"):
                await self.svc._search_source(
                    source_name="web_scraper",
                    icp_criteria={},
                )


# ===========================================================================
# 2. _format_search_results_with_source
# ===========================================================================

class TestFormatSearchResultsWithSource:

    def setup_method(self):
        self.svc = LeadDiscoveryService()

    def test_includes_source_tag(self):
        results = [_tagged_result("Acme Corp", "https://acme.com", "web_scraper")]
        text = self.svc._format_search_results_with_source(results)
        assert "[source: web_scraper]" in text
        assert "Acme Corp" in text

    def test_multiple_sources_tagged_separately(self):
        results = [
            _tagged_result("Acme", "https://acme.com", "web_scraper"),
            _tagged_result("Globex", "https://globex.com", "linkedin_search"),
        ]
        text = self.svc._format_search_results_with_source(results)
        assert "[source: web_scraper]" in text
        assert "[source: linkedin_search]" in text

    def test_defaults_to_unknown_source(self):
        results = [{"title": "No Source", "link": "https://x.com", "snippet": "s"}]
        text = self.svc._format_search_results_with_source(results)
        assert "[source: unknown]" in text


# ===========================================================================
# 3. _batch_extract_leads
# ===========================================================================

class TestBatchExtractLeads:

    def setup_method(self):
        self.svc = LeadDiscoveryService()

    async def test_calls_extract_json_once(self):
        """Single LLM call regardless of number of results."""
        results = [
            _tagged_result("A", "https://a.com", "web_scraper"),
            _tagged_result("B", "https://b.com", "linkedin_search"),
            _tagged_result("C", "https://c.com", "company_db"),
        ]

        with patch("app.utils.openrouter_client.extract_json", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = json.dumps([
                {"company": "A Corp", "source_name": "web_scraper"},
                {"company": "B Corp", "source_name": "linkedin_search"},
            ])

            leads = await self.svc._batch_extract_leads(results, icp_criteria={"industry": "SaaS"})

        mock_extract.assert_called_once()
        assert len(leads) == 2
        assert leads[0]["company"] == "A Corp"

    async def test_returns_empty_on_llm_failure(self):
        results = [_tagged_result("X", "https://x.com", "web_scraper")]

        with patch("app.utils.openrouter_client.extract_json", new_callable=AsyncMock) as mock_extract:
            mock_extract.side_effect = RuntimeError("LLM timeout")

            leads = await self.svc._batch_extract_leads(results, icp_criteria={})

        assert leads == []


# ===========================================================================
# 4. URL deduplication in execute_run
# ===========================================================================

class TestURLDeduplication:

    def setup_method(self):
        self.svc = LeadDiscoveryService()

    async def test_duplicate_urls_across_sources_removed(self):
        """Same URL from different sources should only appear once."""
        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.workspace_id = uuid.uuid4()
        mock_run.status = RunStatus.PENDING
        mock_run.icp_criteria = {"industry": "SaaS"}

        partition1 = MagicMock()
        partition1.source_name = "web_scraper"
        partition1.partition_key = "generic"
        partition1.status = PartitionStatus.PENDING

        partition2 = MagicMock()
        partition2.source_name = "linkedin_search"
        partition2.partition_key = "generic"
        partition2.status = PartitionStatus.PENDING

        # Both sources return the same URL
        organic_shared = [_organic_result("Acme", "https://acme.com")]
        organic_unique = [_organic_result("Unique", "https://unique.com")]

        db = AsyncMock()
        db.add = MagicMock()

        # DB mocks: run query, then partition query
        run_result = MagicMock()
        run_result.scalar_one_or_none.return_value = mock_run
        part_scalars = MagicMock()
        part_scalars.all.return_value = [partition1, partition2]
        part_result = MagicMock()
        part_result.scalars.return_value = part_scalars

        db.execute = AsyncMock(side_effect=[run_result, part_result])

        with patch.object(
            self.svc, "_search_source", new_callable=AsyncMock,
        ) as mock_search, patch.object(
            self.svc, "_batch_extract_leads", new_callable=AsyncMock,
        ) as mock_extract:
            # Source 1: shared + unique URLs
            # Source 2: same shared URL
            mock_search.side_effect = [
                organic_shared + organic_unique,  # web_scraper
                organic_shared,  # linkedin_search — duplicate!
            ]
            mock_extract.return_value = [
                {"company": "Acme", "source_name": "web_scraper"},
                {"company": "Unique", "source_name": "web_scraper"},
            ]

            await self.svc.execute_run(
                db=db, run_id=mock_run.id, workspace_id=mock_run.workspace_id,
            )

        # Batch extract should receive 2 unique results, not 3
        extract_call = mock_extract.call_args
        organic_passed = extract_call.kwargs.get("organic_results") or extract_call[0][0]
        assert len(organic_passed) == 2


# ===========================================================================
# 5. Source attribution in leads
# ===========================================================================

class TestSourceAttribution:

    def setup_method(self):
        self.svc = LeadDiscoveryService()

    async def test_llm_source_name_used_for_attribution(self):
        """Leads get source_name from LLM output when it matches a partition."""
        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.workspace_id = uuid.uuid4()
        mock_run.status = RunStatus.PENDING
        mock_run.icp_criteria = {}

        partition1 = MagicMock()
        partition1.source_name = "web_scraper"
        partition1.partition_key = "generic"
        partition1.status = PartitionStatus.PENDING

        db = AsyncMock()
        db.add = MagicMock()

        run_result = MagicMock()
        run_result.scalar_one_or_none.return_value = mock_run
        part_scalars = MagicMock()
        part_scalars.all.return_value = [partition1]
        part_result = MagicMock()
        part_result.scalars.return_value = part_scalars
        db.execute = AsyncMock(side_effect=[run_result, part_result])

        with patch.object(
            self.svc, "_search_source", new_callable=AsyncMock,
        ) as mock_search, patch.object(
            self.svc, "_batch_extract_leads", new_callable=AsyncMock,
        ) as mock_extract:
            mock_search.return_value = [_organic_result("A", "https://a.com")]
            mock_extract.return_value = [
                {"company": "A Corp", "email": "a@a.com", "source_name": "web_scraper"},
            ]

            run = await self.svc.execute_run(
                db=db, run_id=mock_run.id, workspace_id=mock_run.workspace_id,
            )

        # Check that the lead was added with correct source
        add_calls = db.add.call_args_list
        lead_calls = [c for c in add_calls if hasattr(c[0][0], 'source_name') and hasattr(c[0][0], 'email')]
        assert len(lead_calls) == 1
        assert lead_calls[0][0][0].source_name == "web_scraper"


# ===========================================================================
# 6. Retry logic — serper_client
# ===========================================================================

class TestSerperRetry:
    """Test retry logic in serper_client.search."""

    async def test_succeeds_on_first_try(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"organic": [{"title": "A", "link": "https://a.com"}]}

        with patch("app.utils.serper_client.get_settings") as mock_settings, \
             patch("httpx.AsyncClient") as MockClient:
            settings = MagicMock()
            settings.SERPER_API_KEY = "test-key"
            mock_settings.return_value = settings

            mock_client = AsyncMock()
            mock_client.post.return_value = mock_response
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            from app.utils.serper_client import search
            result = await search("test query")

        assert len(result["organic"]) == 1
        assert mock_client.post.call_count == 1

    async def test_retries_on_429(self):
        """Should retry on 429 and succeed."""
        fail_response = MagicMock()
        fail_response.status_code = 429

        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.raise_for_status = MagicMock()
        ok_response.json.return_value = {"organic": []}

        with patch("app.utils.serper_client.get_settings") as mock_settings, \
             patch("httpx.AsyncClient") as MockClient, \
             patch("asyncio.sleep", new_callable=AsyncMock):
            settings = MagicMock()
            settings.SERPER_API_KEY = "test-key"
            mock_settings.return_value = settings

            mock_client = AsyncMock()
            mock_client.post.side_effect = [fail_response, ok_response]
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            from app.utils.serper_client import search
            result = await search("test query")

        assert result == {"organic": []}
        assert mock_client.post.call_count == 2

    async def test_retries_on_timeout(self):
        """Should retry on timeout exceptions."""
        import httpx

        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.raise_for_status = MagicMock()
        ok_response.json.return_value = {"organic": []}

        with patch("app.utils.serper_client.get_settings") as mock_settings, \
             patch("httpx.AsyncClient") as MockClient, \
             patch("asyncio.sleep", new_callable=AsyncMock):
            settings = MagicMock()
            settings.SERPER_API_KEY = "test-key"
            mock_settings.return_value = settings

            mock_client = AsyncMock()
            mock_client.post.side_effect = [httpx.TimeoutException("timeout"), ok_response]
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            from app.utils.serper_client import search
            result = await search("test query")

        assert mock_client.post.call_count == 2


# ===========================================================================
# 7. Retry logic — openrouter_client
# ===========================================================================

class TestOpenRouterRetry:
    """Test retry logic in openrouter_client._post_with_retry."""

    async def test_retries_on_502(self):
        """Should retry on 502 and succeed."""
        fail_response = MagicMock()
        fail_response.status_code = 502

        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.raise_for_status = MagicMock()
        ok_response.json.return_value = {
            "choices": [{"message": {"role": "assistant", "content": "Hello"}}]
        }

        with patch("app.utils.openrouter_client.get_settings") as mock_settings, \
             patch("httpx.AsyncClient") as MockClient, \
             patch("asyncio.sleep", new_callable=AsyncMock):
            settings = MagicMock()
            settings.OPENROUTER_API_KEY = "test-key"
            settings.OPENROUTER_MODEL = "test-model"
            settings.OPENROUTER_TEMPERATURE = 0.7
            settings.OPENROUTER_MAX_TOKENS = 2000
            settings.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
            settings.OPENROUTER_APP_URL = "http://localhost"
            settings.OPENROUTER_APP_NAME = "test"
            settings.OPENROUTER_TIMEOUT_SECONDS = 90
            mock_settings.return_value = settings

            mock_client = AsyncMock()
            mock_client.post.side_effect = [fail_response, ok_response]
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            from app.utils.openrouter_client import chat_completion
            result = await chat_completion(
                messages=[{"role": "user", "content": "test"}]
            )

        assert result == "Hello"
        assert mock_client.post.call_count == 2

    async def test_retries_on_timeout(self):
        """Should retry on timeout exceptions."""
        import httpx

        ok_response = MagicMock()
        ok_response.status_code = 200
        ok_response.raise_for_status = MagicMock()
        ok_response.json.return_value = {
            "choices": [{"message": {"role": "assistant", "content": "OK"}}]
        }

        with patch("app.utils.openrouter_client.get_settings") as mock_settings, \
             patch("httpx.AsyncClient") as MockClient, \
             patch("asyncio.sleep", new_callable=AsyncMock):
            settings = MagicMock()
            settings.OPENROUTER_API_KEY = "test-key"
            settings.OPENROUTER_MODEL = "test-model"
            settings.OPENROUTER_TEMPERATURE = 0.7
            settings.OPENROUTER_MAX_TOKENS = 2000
            settings.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
            settings.OPENROUTER_APP_URL = "http://localhost"
            settings.OPENROUTER_APP_NAME = "test"
            settings.OPENROUTER_TIMEOUT_SECONDS = 90
            mock_settings.return_value = settings

            mock_client = AsyncMock()
            mock_client.post.side_effect = [httpx.TimeoutException("timeout"), ok_response]
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            MockClient.return_value = mock_client

            from app.utils.openrouter_client import chat_completion
            result = await chat_completion(
                messages=[{"role": "user", "content": "test"}]
            )

        assert result == "OK"
        assert mock_client.post.call_count == 2


# ===========================================================================
# 8. MAX_RESULTS_PER_SOURCE and MAX_TOTAL_RESULTS caps
# ===========================================================================

class TestResultCaps:

    def test_max_results_per_source_defined(self):
        assert MAX_RESULTS_PER_SOURCE == 15

    def test_max_total_results_defined(self):
        assert MAX_TOTAL_RESULTS == 50

    async def test_caps_applied_in_execute_run(self):
        """Results are capped at MAX_TOTAL_RESULTS before LLM call."""
        svc = LeadDiscoveryService()
        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.workspace_id = uuid.uuid4()
        mock_run.status = RunStatus.PENDING
        mock_run.icp_criteria = {}

        partition = MagicMock()
        partition.source_name = "web_scraper"
        partition.partition_key = "generic"
        partition.status = PartitionStatus.PENDING

        db = AsyncMock()
        db.add = MagicMock()

        run_result = MagicMock()
        run_result.scalar_one_or_none.return_value = mock_run
        part_scalars = MagicMock()
        part_scalars.all.return_value = [partition]
        part_result = MagicMock()
        part_result.scalars.return_value = part_scalars
        db.execute = AsyncMock(side_effect=[run_result, part_result])

        # Return 60 results (above MAX_TOTAL_RESULTS)
        many_results = [_organic_result(f"R{i}", f"https://r{i}.com") for i in range(60)]

        with patch.object(
            svc, "_search_source", new_callable=AsyncMock,
        ) as mock_search, patch.object(
            svc, "_batch_extract_leads", new_callable=AsyncMock,
        ) as mock_extract:
            mock_search.return_value = many_results
            mock_extract.return_value = []

            await svc.execute_run(
                db=db, run_id=mock_run.id, workspace_id=mock_run.workspace_id,
            )

        # Verify batch extract received at most MAX_TOTAL_RESULTS
        extract_call = mock_extract.call_args
        organic_passed = extract_call.kwargs.get("organic_results") or extract_call[0][0]
        assert len(organic_passed) <= MAX_TOTAL_RESULTS


# ===========================================================================
# 9. execute_run: all partitions fail → run status = FAILED
# ===========================================================================

class TestExecuteRunFailureModes:

    async def test_all_partitions_fail_marks_run_failed(self):
        svc = LeadDiscoveryService()
        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.workspace_id = uuid.uuid4()
        mock_run.status = RunStatus.PENDING
        mock_run.icp_criteria = {}

        partition = MagicMock()
        partition.source_name = "web_scraper"
        partition.partition_key = "generic"
        partition.status = PartitionStatus.PENDING

        db = AsyncMock()
        db.add = MagicMock()

        run_result = MagicMock()
        run_result.scalar_one_or_none.return_value = mock_run
        part_scalars = MagicMock()
        part_scalars.all.return_value = [partition]
        part_result = MagicMock()
        part_result.scalars.return_value = part_scalars
        db.execute = AsyncMock(side_effect=[run_result, part_result])

        with patch.object(
            svc, "_search_source", new_callable=AsyncMock,
        ) as mock_search:
            mock_search.side_effect = RuntimeError("API down")

            run = await svc.execute_run(
                db=db, run_id=mock_run.id, workspace_id=mock_run.workspace_id,
            )

        assert mock_run.status == RunStatus.FAILED
        assert "All" in (mock_run.error_detail or "")

    async def test_partial_failure_still_completes(self):
        """If some partitions fail and some succeed, run is COMPLETED."""
        svc = LeadDiscoveryService()
        mock_run = MagicMock()
        mock_run.id = uuid.uuid4()
        mock_run.workspace_id = uuid.uuid4()
        mock_run.status = RunStatus.PENDING
        mock_run.icp_criteria = {}

        p1 = MagicMock()
        p1.source_name = "web_scraper"
        p1.partition_key = "generic"
        p1.status = PartitionStatus.PENDING

        p2 = MagicMock()
        p2.source_name = "linkedin_search"
        p2.partition_key = "generic"
        p2.status = PartitionStatus.PENDING

        db = AsyncMock()
        db.add = MagicMock()

        run_result = MagicMock()
        run_result.scalar_one_or_none.return_value = mock_run
        part_scalars = MagicMock()
        part_scalars.all.return_value = [p1, p2]
        part_result = MagicMock()
        part_result.scalars.return_value = part_scalars
        db.execute = AsyncMock(side_effect=[run_result, part_result])

        with patch.object(
            svc, "_search_source", new_callable=AsyncMock,
        ) as mock_search, patch.object(
            svc, "_batch_extract_leads", new_callable=AsyncMock,
        ) as mock_extract:
            # First partition succeeds, second fails
            mock_search.side_effect = [
                [_organic_result("A", "https://a.com")],
                RuntimeError("Timeout"),
            ]
            mock_extract.return_value = [{"company": "A Corp", "source_name": "web_scraper"}]

            run = await svc.execute_run(
                db=db, run_id=mock_run.id, workspace_id=mock_run.workspace_id,
            )

        assert mock_run.status == RunStatus.COMPLETED
        assert mock_run.progress["errors"] == 1
        assert mock_run.progress["completed"] == 1
