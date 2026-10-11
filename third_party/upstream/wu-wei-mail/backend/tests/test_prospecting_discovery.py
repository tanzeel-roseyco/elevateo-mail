"""Tests for Phase 3 — Lead Discovery, Enrichment, and Quality.

Covers:
- PRS-C01: Source Strategy Planner by ICP Type
- PRS-C02: Discovery Worker Flow (service layer)
- PRS-C03: Enrichment Pipeline with Waterfall Fallback
- PRS-C04: Workspace-Level Dedupe Memory
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from app.services.prospecting.source_strategy_service import (
    SourceStrategyPlanner, SourceStrategy, SourceWeight,
    ICPType, SourceName,
)
from app.services.prospecting.lead_discovery_service import (
    LeadDiscoveryService, RunStatus, PartitionStatus,
)
from app.services.prospecting.lead_enrichment_service import (
    LeadEnrichmentService, WaterfallEnrichmentPipeline,
    EnrichmentProvider, EnrichmentResult, ReasonCode,
    EmailFinderProvider, LinkedInEnrichmentProvider, CompanyDomainProvider,
    DEFAULT_PROVIDERS,
)
from app.services.prospecting.dedupe_service import (
    DedupeService, DedupeResult, BatchDedupeResult,
)


# ===========================================================================
# PRS-C01 — Source Strategy Planner
# ===========================================================================

class TestSourceStrategyPlanner:
    """Source strategy planner decision tests across ICP scenarios."""

    def setup_method(self):
        self.planner = SourceStrategyPlanner()

    # --- ICP Classification ---

    def test_classify_healthcare_by_industry(self):
        result = self.planner.classify_icp({"industry": "healthcare"})
        assert result == ICPType.HEALTHCARE

    def test_classify_healthcare_by_keywords(self):
        result = self.planner.classify_icp({"industry": "dental clinics"})
        assert result == ICPType.HEALTHCARE

    def test_classify_healthcare_from_list(self):
        result = self.planner.classify_icp({"industries": ["pharma", "biotech"]})
        assert result == ICPType.HEALTHCARE

    def test_classify_local_smb(self):
        result = self.planner.classify_icp({"industry": "local restaurant"})
        assert result == ICPType.LOCAL_SMB

    def test_classify_local_smb_salon(self):
        result = self.planner.classify_icp({"industry": "salon and spa"})
        assert result == ICPType.LOCAL_SMB

    def test_classify_b2b_role(self):
        result = self.planner.classify_icp({"title": "CTO"})
        assert result == ICPType.B2B_ROLE

    def test_classify_b2b_role_with_role_field(self):
        result = self.planner.classify_icp({"role": "VP of Engineering"})
        assert result == ICPType.B2B_ROLE

    def test_classify_b2b_firmographic(self):
        result = self.planner.classify_icp({"company_size": "50-200", "industry": "SaaS"})
        assert result == ICPType.B2B_FIRMOGRAPHIC

    def test_classify_b2b_firmographic_employee_count(self):
        result = self.planner.classify_icp({"employee_count": "100+"})
        assert result == ICPType.B2B_FIRMOGRAPHIC

    def test_classify_generic_empty(self):
        result = self.planner.classify_icp({})
        assert result == ICPType.GENERIC

    def test_classify_generic_no_match(self):
        result = self.planner.classify_icp({"custom_field": "something random"})
        assert result == ICPType.GENERIC

    def test_classify_none_criteria(self):
        result = self.planner.classify_icp(None)
        assert result == ICPType.GENERIC

    # --- Healthcare beats local_smb ---

    def test_healthcare_priority_over_local(self):
        """Healthcare should win when both healthcare and local signals present."""
        result = self.planner.classify_icp({"industry": "local dental clinic"})
        assert result == ICPType.HEALTHCARE

    # --- Strategy Planning ---

    def test_plan_returns_source_strategy(self):
        strategy = self.planner.plan({"industry": "healthcare"})
        assert isinstance(strategy, SourceStrategy)
        assert strategy.icp_type == ICPType.HEALTHCARE
        assert len(strategy.sources) > 0
        assert strategy.reasoning

    def test_plan_healthcare_has_healthcare_db(self):
        strategy = self.planner.plan({"industry": "healthcare"})
        source_names = [s.source_name for s in strategy.sources]
        assert SourceName.HEALTHCARE_DB in source_names

    def test_plan_local_smb_has_google_maps(self):
        strategy = self.planner.plan({"industry": "local restaurant"})
        source_names = [s.source_name for s in strategy.sources]
        assert SourceName.GOOGLE_MAPS in source_names
        # Google Maps should be highest weight for local
        google = next(s for s in strategy.sources if s.source_name == SourceName.GOOGLE_MAPS)
        assert google.weight >= 0.4

    def test_plan_b2b_role_has_linkedin(self):
        strategy = self.planner.plan({"title": "CTO"})
        source_names = [s.source_name for s in strategy.sources]
        assert SourceName.LINKEDIN_SEARCH in source_names
        linkedin = next(s for s in strategy.sources if s.source_name == SourceName.LINKEDIN_SEARCH)
        assert linkedin.weight >= 0.4

    def test_plan_b2b_firmographic_has_company_db(self):
        strategy = self.planner.plan({"company_size": "50-200"})
        source_names = [s.source_name for s in strategy.sources]
        assert SourceName.COMPANY_DB in source_names

    def test_plan_weights_sum_approximately_one(self):
        strategy = self.planner.plan({"industry": "healthcare"})
        total_weight = sum(s.weight for s in strategy.sources)
        assert 0.95 <= total_weight <= 1.05

    def test_plan_generic_balanced_sources(self):
        strategy = self.planner.plan({})
        assert len(strategy.sources) >= 4

    def test_plan_auditable_metadata(self):
        criteria = {"industry": "healthcare", "geo": "US"}
        strategy = self.planner.plan(criteria)
        assert strategy.metadata["input_criteria"] == criteria
        assert strategy.metadata["classified_icp_type"] == ICPType.HEALTHCARE

    def test_plan_reasoning_includes_context(self):
        strategy = self.planner.plan({"industry": "healthcare", "geo": "US"})
        assert "Geo:" in strategy.reasoning

    def test_plan_to_dict_serializable(self):
        strategy = self.planner.plan({"industry": "SaaS"})
        d = strategy.to_dict()
        assert isinstance(d, dict)
        assert "sources" in d
        assert "icp_type" in d
        assert "reasoning" in d

    def test_all_icp_types_have_strategies(self):
        """Every ICP type should produce a non-empty strategy."""
        test_cases = {
            ICPType.LOCAL_SMB: {"industry": "local plumber"},
            ICPType.HEALTHCARE: {"industry": "healthcare"},
            ICPType.B2B_ROLE: {"title": "CTO"},
            ICPType.B2B_FIRMOGRAPHIC: {"company_size": "100+"},
            ICPType.GENERIC: {},
        }
        for icp_type, criteria in test_cases.items():
            strategy = self.planner.plan(criteria)
            assert strategy.icp_type == icp_type, f"Failed for {icp_type}"
            assert len(strategy.sources) >= 3, f"Not enough sources for {icp_type}"

    def test_source_weight_has_reason(self):
        strategy = self.planner.plan({"industry": "healthcare"})
        for source in strategy.sources:
            assert isinstance(source, SourceWeight)
            assert source.reason
            assert 0.0 <= source.weight <= 1.0


# ===========================================================================
# PRS-C02 — Discovery Worker Flow (service layer)
# ===========================================================================

class TestLeadDiscoveryService:
    """Discovery service tests — run creation, execution, progress."""

    def setup_method(self):
        self.svc = LeadDiscoveryService()

    async def test_create_run_verifies_conversation(self):
        """Creating a run with nonexistent conversation raises ValueError."""
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="not found"):
            await self.svc.create_run(
                db=db,
                workspace_id=uuid.uuid4(),
                conversation_id=uuid.uuid4(),
                icp_criteria={"industry": "tech"},
            )

    async def test_create_run_uses_source_strategy(self):
        """Run creation should invoke the source strategy planner."""
        db = AsyncMock()
        db.add = MagicMock()

        # Mock conversation exists
        mock_conv = MagicMock()
        mock_conv.workspace_id = uuid.uuid4()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_conv
        db.execute.return_value = mock_result

        with patch(
            "app.services.prospecting.lead_discovery_service.source_strategy_planner"
        ) as mock_planner:
            mock_strategy = SourceStrategy(
                sources=[SourceWeight("test_source", 1.0, "test")],
                icp_type="generic",
                reasoning="test",
            )
            mock_planner.plan.return_value = mock_strategy

            await self.svc.create_run(
                db=db,
                workspace_id=mock_conv.workspace_id,
                conversation_id=uuid.uuid4(),
                icp_criteria={"industry": "tech"},
            )

            mock_planner.plan.assert_called_once_with({"industry": "tech"})
            # Verify run was added to DB (at least 2 adds: run + partition)
            assert db.add.call_count >= 2

    async def test_execute_run_not_found(self):
        """Executing a nonexistent run raises ValueError."""
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="not found"):
            await self.svc.execute_run(
                db=db,
                run_id=uuid.uuid4(),
                workspace_id=uuid.uuid4(),
            )

    async def test_execute_run_rejects_completed(self):
        """Cannot execute an already-completed run."""
        db = AsyncMock()
        mock_run = MagicMock()
        mock_run.status = RunStatus.COMPLETED
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_run
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="cannot execute"):
            await self.svc.execute_run(
                db=db,
                run_id=uuid.uuid4(),
                workspace_id=uuid.uuid4(),
            )

    async def test_execute_run_rejects_running(self):
        """Cannot execute an already-running run."""
        db = AsyncMock()
        mock_run = MagicMock()
        mock_run.status = RunStatus.RUNNING
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_run
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="cannot execute"):
            await self.svc.execute_run(
                db=db,
                run_id=uuid.uuid4(),
                workspace_id=uuid.uuid4(),
            )

    async def test_execute_run_allows_retry_from_failed(self):
        """A failed run can be re-executed."""
        db = AsyncMock()

        mock_run = MagicMock()
        mock_run.status = RunStatus.FAILED
        mock_run.id = uuid.uuid4()
        mock_run.workspace_id = uuid.uuid4()

        # First call returns run, second returns empty partition list
        mock_run_result = MagicMock()
        mock_run_result.scalar_one_or_none.return_value = mock_run
        mock_part_scalars = MagicMock()
        mock_part_scalars.all.return_value = []
        mock_part_result = MagicMock()
        mock_part_result.scalars.return_value = mock_part_scalars

        db.execute.side_effect = [mock_run_result, mock_part_result]

        run = await self.svc.execute_run(
            db=db,
            run_id=mock_run.id,
            workspace_id=mock_run.workspace_id,
        )
        # With 0 partitions, 0 errors → should be completed
        assert mock_run.status == RunStatus.COMPLETED

    async def test_get_run_progress_not_found(self):
        """Getting progress for nonexistent run raises ValueError."""
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="not found"):
            await self.svc.get_run_progress(
                db=db,
                run_id=uuid.uuid4(),
                workspace_id=uuid.uuid4(),
            )

    def test_run_status_constants(self):
        assert RunStatus.PENDING == "pending"
        assert RunStatus.RUNNING == "running"
        assert RunStatus.COMPLETED == "completed"
        assert RunStatus.FAILED == "failed"
        assert RunStatus.CANCELLED == "cancelled"

    def test_partition_status_constants(self):
        assert PartitionStatus.PENDING == "pending"
        assert PartitionStatus.RUNNING == "running"
        assert PartitionStatus.COMPLETED == "completed"
        assert PartitionStatus.FAILED == "failed"


# ===========================================================================
# PRS-C03 — Enrichment Pipeline with Waterfall Fallback
# ===========================================================================

class _SuccessProvider(EnrichmentProvider):
    """Test provider that always succeeds."""

    @property
    def name(self) -> str:
        return "success_provider"

    @property
    def priority(self) -> int:
        return 10

    async def enrich(self, lead_data):
        return EnrichmentResult(
            email=f"{lead_data.get('first_name', 'test')}@example.com",
            email_confidence=0.95,
            source=self.name,
            success=True,
            reason_code=ReasonCode.FOUND,
        )


class _FailProvider(EnrichmentProvider):
    """Test provider that always fails."""

    @property
    def name(self) -> str:
        return "fail_provider"

    @property
    def priority(self) -> int:
        return 5  # Higher priority than success

    async def enrich(self, lead_data):
        return EnrichmentResult(
            source=self.name,
            success=False,
            reason_code=ReasonCode.PROVIDER_ERROR,
        )


class _LowConfidenceProvider(EnrichmentProvider):
    """Test provider that returns low confidence result."""

    @property
    def name(self) -> str:
        return "low_confidence_provider"

    @property
    def priority(self) -> int:
        return 15

    async def enrich(self, lead_data):
        return EnrichmentResult(
            email="maybe@example.com",
            email_confidence=0.3,
            source=self.name,
            success=True,
            reason_code=ReasonCode.LOW_CONFIDENCE,
        )


class _CrashProvider(EnrichmentProvider):
    """Test provider that throws an exception."""

    @property
    def name(self) -> str:
        return "crash_provider"

    @property
    def priority(self) -> int:
        return 1  # Highest priority

    async def enrich(self, lead_data):
        raise RuntimeError("Provider crashed!")


class TestEnrichmentPipeline:
    """Enrichment pipeline tests with mocked provider failures."""

    async def test_successful_enrichment(self):
        pipeline = WaterfallEnrichmentPipeline(providers=[_SuccessProvider()])
        result = await pipeline.enrich_lead({"first_name": "john"})
        assert result.success is True
        assert result.email == "john@example.com"
        assert result.email_confidence >= 0.7
        assert result.reason_code == ReasonCode.FOUND

    async def test_waterfall_skips_failed_provider(self):
        """Failed provider should be skipped, success provider used."""
        pipeline = WaterfallEnrichmentPipeline(
            providers=[_FailProvider(), _SuccessProvider()],
        )
        result = await pipeline.enrich_lead({"first_name": "john"})
        assert result.success is True
        assert result.source == "success_provider"

    async def test_waterfall_skips_crashed_provider(self):
        """Crashed provider should be skipped gracefully."""
        pipeline = WaterfallEnrichmentPipeline(
            providers=[_CrashProvider(), _SuccessProvider()],
        )
        result = await pipeline.enrich_lead({"first_name": "john"})
        assert result.success is True
        assert result.source == "success_provider"

    async def test_all_providers_fail(self):
        pipeline = WaterfallEnrichmentPipeline(providers=[_FailProvider()])
        result = await pipeline.enrich_lead({"first_name": "john"})
        assert result.success is False
        assert result.reason_code == ReasonCode.ALL_PROVIDERS_FAILED

    async def test_low_confidence_used_as_fallback(self):
        """Low confidence result used when no high-confidence match found."""
        pipeline = WaterfallEnrichmentPipeline(
            providers=[_FailProvider(), _LowConfidenceProvider()],
        )
        result = await pipeline.enrich_lead({"first_name": "john"})
        assert result.success is True
        assert result.email == "maybe@example.com"
        assert result.reason_code == ReasonCode.LOW_CONFIDENCE

    async def test_high_confidence_preferred_over_low(self):
        """High confidence provider result preferred over low confidence."""
        pipeline = WaterfallEnrichmentPipeline(
            providers=[_LowConfidenceProvider(), _SuccessProvider()],
        )
        result = await pipeline.enrich_lead({"first_name": "john"})
        # Success provider has higher confidence, but comes later in priority
        # Since low conf is tried first (priority 15) and doesn't meet threshold,
        # then success (priority 10 → actually sorted lower = higher priority)
        # Wait, priority 10 < 15, so success comes first in sorted order
        assert result.success is True
        assert result.email_confidence >= 0.7

    async def test_empty_input_returns_no_input_data(self):
        pipeline = WaterfallEnrichmentPipeline(providers=[_SuccessProvider()])
        result = await pipeline.enrich_lead({})
        assert result.success is False
        assert result.reason_code == ReasonCode.NO_INPUT_DATA

    async def test_none_input_returns_no_input_data(self):
        pipeline = WaterfallEnrichmentPipeline(providers=[_SuccessProvider()])
        result = await pipeline.enrich_lead(None)
        assert result.success is False
        assert result.reason_code == ReasonCode.NO_INPUT_DATA

    async def test_batch_enrichment(self):
        pipeline = WaterfallEnrichmentPipeline(providers=[_SuccessProvider()])
        results = await pipeline.enrich_batch([
            {"first_name": "alice"},
            {"first_name": "bob"},
        ])
        assert len(results) == 2
        assert results[0].email == "alice@example.com"
        assert results[1].email == "bob@example.com"

    async def test_providers_sorted_by_priority(self):
        pipeline = WaterfallEnrichmentPipeline(
            providers=[_LowConfidenceProvider(), _SuccessProvider(), _FailProvider()],
        )
        priorities = [p.priority for p in pipeline.providers]
        assert priorities == sorted(priorities)

    def test_default_providers_exist(self):
        assert len(DEFAULT_PROVIDERS) >= 3
        names = [p.name for p in DEFAULT_PROVIDERS]
        assert "email_finder" in names
        assert "linkedin_enrichment" in names
        assert "company_domain" in names

    def test_reason_codes_defined(self):
        assert ReasonCode.FOUND == "FOUND"
        assert ReasonCode.NOT_FOUND == "NOT_FOUND"
        assert ReasonCode.LOW_CONFIDENCE == "LOW_CONFIDENCE"
        assert ReasonCode.PROVIDER_ERROR == "PROVIDER_ERROR"
        assert ReasonCode.NO_INPUT_DATA == "NO_INPUT_DATA"
        assert ReasonCode.ALL_PROVIDERS_FAILED == "ALL_PROVIDERS_FAILED"


class TestLeadEnrichmentService:
    """Enrichment service tests with DB interaction."""

    async def test_enrich_run_not_found(self):
        svc = LeadEnrichmentService()
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="not found"):
            await svc.enrich_run(
                db=db,
                run_id=uuid.uuid4(),
                workspace_id=uuid.uuid4(),
            )

    async def test_enrich_run_empty_leads(self):
        svc = LeadEnrichmentService()
        db = AsyncMock()

        # First call: run exists
        mock_run = MagicMock()
        mock_run_result = MagicMock()
        mock_run_result.scalar_one_or_none.return_value = mock_run

        # Second call: no leads
        mock_leads_scalars = MagicMock()
        mock_leads_scalars.all.return_value = []
        mock_leads_result = MagicMock()
        mock_leads_result.scalars.return_value = mock_leads_scalars

        db.execute.side_effect = [mock_run_result, mock_leads_result]

        results = await svc.enrich_run(
            db=db,
            run_id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
        )
        assert results == []

    async def test_apply_enrichment_updates_lead(self):
        """Successful enrichment should update lead fields."""
        svc = LeadEnrichmentService()
        lead = MagicMock()
        lead.enrichment_data = {}

        result = EnrichmentResult(
            email="found@example.com",
            email_confidence=0.95,
            source="test_provider",
            success=True,
            reason_code=ReasonCode.FOUND,
        )

        svc._apply_enrichment(lead, result)

        assert lead.email == "found@example.com"
        assert lead.email_confidence == 0.95
        assert lead.source_name == "test_provider"
        assert "last_enrichment" in lead.enrichment_data

    async def test_apply_enrichment_failed_preserves_email(self):
        """Failed enrichment should not overwrite existing email."""
        svc = LeadEnrichmentService()
        lead = MagicMock()
        lead.email = "existing@example.com"
        lead.enrichment_data = {}

        result = EnrichmentResult(
            success=False,
            reason_code=ReasonCode.ALL_PROVIDERS_FAILED,
        )

        svc._apply_enrichment(lead, result)

        # Email should not be overwritten
        assert lead.email == "existing@example.com"
        assert "last_enrichment" in lead.enrichment_data


# ===========================================================================
# PRS-C04 — Workspace-Level Dedupe Memory
# ===========================================================================

class TestDedupeService:
    """Cross-run dedupe tests."""

    def setup_method(self):
        self.svc = DedupeService()

    async def test_check_emails_empty(self):
        db = AsyncMock()
        result = await self.svc.check_emails(
            db=db,
            workspace_id=uuid.uuid4(),
            emails=[],
        )
        assert result.total_checked == 0
        assert result.duplicates_found == 0

    async def test_check_emails_no_duplicates(self):
        db = AsyncMock()
        # Both CRM and prospecting checks return empty
        mock_crm_result = MagicMock()
        mock_crm_result.all.return_value = []
        mock_prospect_result = MagicMock()
        mock_prospect_result.all.return_value = []
        db.execute.side_effect = [mock_crm_result, mock_prospect_result]

        result = await self.svc.check_emails(
            db=db,
            workspace_id=uuid.uuid4(),
            emails=["new@example.com"],
        )
        assert result.total_checked == 1
        assert result.duplicates_found == 0
        assert result.unique_count == 1
        assert not result.results["new@example.com"].is_duplicate

    async def test_check_emails_crm_duplicate(self):
        db = AsyncMock()
        crm_lead_id = uuid.uuid4()
        # CRM check returns a match
        mock_crm_result = MagicMock()
        mock_crm_result.all.return_value = [("dupe@example.com", crm_lead_id)]
        db.execute.side_effect = [mock_crm_result]
        # No remaining emails to check against prospecting (all are CRM dupes)

        result = await self.svc.check_emails(
            db=db,
            workspace_id=uuid.uuid4(),
            emails=["dupe@example.com"],
        )
        assert result.duplicates_found == 1
        assert result.results["dupe@example.com"].is_duplicate
        assert result.results["dupe@example.com"].duplicate_source == "crm"
        assert result.results["dupe@example.com"].duplicate_of_id == crm_lead_id

    async def test_check_emails_prospecting_duplicate(self):
        db = AsyncMock()
        prospect_lead_id = uuid.uuid4()
        run_id = uuid.uuid4()
        # CRM check: no match
        mock_crm_result = MagicMock()
        mock_crm_result.all.return_value = []
        # Prospecting check: match found
        mock_prospect_result = MagicMock()
        mock_prospect_result.all.return_value = [
            ("existing@example.com", prospect_lead_id, run_id),
        ]
        db.execute.side_effect = [mock_crm_result, mock_prospect_result]

        result = await self.svc.check_emails(
            db=db,
            workspace_id=uuid.uuid4(),
            emails=["existing@example.com"],
        )
        assert result.duplicates_found == 1
        assert result.results["existing@example.com"].duplicate_source == "prospecting_run"
        assert result.results["existing@example.com"].source_run_id == run_id

    async def test_force_refresh_skips_prospecting_dedupe(self):
        db = AsyncMock()
        # CRM check: no match
        mock_crm_result = MagicMock()
        mock_crm_result.all.return_value = []
        db.execute.side_effect = [mock_crm_result]

        result = await self.svc.check_emails(
            db=db,
            workspace_id=uuid.uuid4(),
            emails=["refresh@example.com"],
            force_refresh=True,
        )
        # Only CRM check should have run (1 db.execute call)
        assert db.execute.call_count == 1
        assert result.duplicates_found == 0

    async def test_force_refresh_still_catches_crm_dupes(self):
        db = AsyncMock()
        crm_id = uuid.uuid4()
        # CRM check: match found
        mock_crm_result = MagicMock()
        mock_crm_result.all.return_value = [("crm@example.com", crm_id)]
        db.execute.side_effect = [mock_crm_result]

        result = await self.svc.check_emails(
            db=db,
            workspace_id=uuid.uuid4(),
            emails=["crm@example.com"],
            force_refresh=True,
        )
        # Even with force_refresh, CRM dupes are caught
        assert result.duplicates_found == 1
        assert result.results["crm@example.com"].duplicate_source == "crm"

    async def test_email_normalization(self):
        db = AsyncMock()
        mock_crm_result = MagicMock()
        mock_crm_result.all.return_value = []
        mock_prospect_result = MagicMock()
        mock_prospect_result.all.return_value = []
        db.execute.side_effect = [mock_crm_result, mock_prospect_result]

        result = await self.svc.check_emails(
            db=db,
            workspace_id=uuid.uuid4(),
            emails=["  Upper@Example.COM  "],
        )
        # Email should be normalized to lowercase
        assert "upper@example.com" in result.results

    async def test_dedupe_run_leads_empty_run(self):
        db = AsyncMock()
        mock_leads_scalars = MagicMock()
        mock_leads_scalars.all.return_value = []
        mock_leads_result = MagicMock()
        mock_leads_result.scalars.return_value = mock_leads_scalars
        db.execute.return_value = mock_leads_result

        result = await self.svc.dedupe_run_leads(
            db=db,
            workspace_id=uuid.uuid4(),
            run_id=uuid.uuid4(),
        )
        assert result.total_checked == 0

    async def test_dedupe_result_dataclass(self):
        result = DedupeResult(
            email="test@example.com",
            is_duplicate=True,
            duplicate_source="crm",
            duplicate_of_id=uuid.uuid4(),
        )
        assert result.is_duplicate
        assert result.duplicate_source == "crm"

    async def test_batch_dedupe_result_dataclass(self):
        result = BatchDedupeResult(
            total_checked=3,
            duplicates_found=1,
            unique_count=2,
            results={},
        )
        assert result.total_checked == 3
        assert result.unique_count == 2

    async def test_mixed_emails_some_dupes(self):
        db = AsyncMock()
        crm_id = uuid.uuid4()
        # CRM check: one match
        mock_crm_result = MagicMock()
        mock_crm_result.all.return_value = [("dupe@example.com", crm_id)]
        # Prospecting check: no match for remaining
        mock_prospect_result = MagicMock()
        mock_prospect_result.all.return_value = []
        db.execute.side_effect = [mock_crm_result, mock_prospect_result]

        result = await self.svc.check_emails(
            db=db,
            workspace_id=uuid.uuid4(),
            emails=["dupe@example.com", "new@example.com"],
        )
        assert result.total_checked == 2
        assert result.duplicates_found == 1
        assert result.unique_count == 1
        assert result.results["dupe@example.com"].is_duplicate
        assert not result.results["new@example.com"].is_duplicate


# ===========================================================================
# Integration — Route registration and existing endpoints
# ===========================================================================

class TestRunRoutes:
    """Test run-related route registration."""

    def test_run_routes_registered(self):
        from app.routers.prospecting import router
        paths = [r.path for r in router.routes]
        assert "/runs" in paths
        assert "/runs/{run_id}/progress" in paths

    async def test_run_approve_not_found(self, client, mock_db):
        """approve_run returns 404 for unknown run."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        fake_id = "00000000-0000-0000-0000-000000000099"
        resp = await client.post(f"/api/prospecting/runs/{fake_id}/approve")
        assert resp.status_code == 404


class TestExistingEndpointsStablePhase3:
    """Confirm Phase 3 changes don't break existing routes."""

    async def test_health_check(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200

    async def test_auth_me(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200

    async def test_conversations_route_still_works(self, client, mock_db):
        """Conversation 404 still works (verifies imports didn't break router)."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        resp = await client.get(f"/api/prospecting/conversations/{uuid.uuid4()}")
        assert resp.status_code == 404
