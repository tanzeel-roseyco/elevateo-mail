"""Tests for Phase 4 — Quality Score 2.0, Exclusion Taxonomy, Import Bridge.

Covers:
- PRS-C05: Quality Score 2.0 and Readiness Bands
- PRS-C06: Exclusion Taxonomy and Recovery Suggestions
- PRS-C07: Import Bridge into Existing Leads and Lead Lists
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, AsyncMock

import pytest

from app.services.prospecting.quality_scoring_service import (
    QualityScoringService, QualityComponents, ReadinessBand,
    FREE_EMAIL_DOMAINS, DISPOSABLE_EMAIL_DOMAINS,
)
from app.services.prospecting.exclusion_service import (
    ExclusionService, ExclusionReason, RecoverySuggestion,
    RECOVERY_SUGGESTIONS,
)
from app.services.prospecting.lead_import_service import (
    LeadImportService, LeadImportResult, DEFAULT_IMPORT_BANDS,
)


# ===========================================================================
# PRS-C05 — Quality Score 2.0 and Readiness Bands
# ===========================================================================

class TestQualityComponents:
    """Score component computation tests."""

    def test_compute_total_all_perfect(self):
        comp = QualityComponents(
            domain_quality=1.0,
            email_confidence=1.0,
            role_match=1.0,
            geo_relevance=1.0,
            data_recency=1.0,
            duplicate_penalty=0.0,
        )
        total = comp.compute_total()
        assert 0.95 <= total <= 1.0

    def test_compute_total_all_zero(self):
        comp = QualityComponents(
            domain_quality=0.0,
            email_confidence=0.0,
            role_match=0.0,
            geo_relevance=0.0,
            data_recency=0.0,
            duplicate_penalty=1.0,
        )
        total = comp.compute_total()
        assert total == 0.0

    def test_compute_total_mixed(self):
        comp = QualityComponents(
            domain_quality=0.8,
            email_confidence=0.9,
            role_match=0.5,
            geo_relevance=0.7,
            data_recency=0.6,
            duplicate_penalty=0.0,
        )
        total = comp.compute_total()
        assert 0.5 <= total <= 0.9

    def test_duplicate_penalty_reduces_score(self):
        comp_no_dupe = QualityComponents(
            domain_quality=0.8, email_confidence=0.9,
            role_match=0.7, geo_relevance=0.8,
            data_recency=0.6, duplicate_penalty=0.0,
        )
        comp_dupe = QualityComponents(
            domain_quality=0.8, email_confidence=0.9,
            role_match=0.7, geo_relevance=0.8,
            data_recency=0.6, duplicate_penalty=1.0,
        )
        assert comp_no_dupe.compute_total() > comp_dupe.compute_total()

    def test_to_dict(self):
        comp = QualityComponents(domain_quality=0.5, email_confidence=0.7)
        d = comp.to_dict()
        assert d["domain_quality"] == 0.5
        assert d["email_confidence"] == 0.7
        assert "weights" in d

    def test_weights_sum_to_one(self):
        comp = QualityComponents()
        total_weight = sum(comp.WEIGHTS.values())
        assert abs(total_weight - 1.0) < 0.01


class TestQualityScoringService:
    """Scoring consistency tests with fixed inputs."""

    def setup_method(self):
        self.svc = QualityScoringService()

    # --- Domain scoring ---

    def test_score_domain_business(self):
        score, band, comp = self.svc.score_lead(
            {"email": "john@acme.com", "domain": "acme.com"}
        )
        assert comp.domain_quality >= 0.7

    def test_score_domain_free_email(self):
        score, band, comp = self.svc.score_lead(
            {"email": "john@gmail.com"}
        )
        assert comp.domain_quality <= 0.3

    def test_score_domain_disposable(self):
        score, band, comp = self.svc.score_lead(
            {"email": "test@mailinator.com"}
        )
        assert comp.domain_quality == 0.0

    def test_score_domain_no_email(self):
        score, band, comp = self.svc.score_lead({})
        assert comp.domain_quality <= 0.1

    # --- Email confidence scoring ---

    def test_score_email_high_confidence(self):
        score, band, comp = self.svc.score_lead(
            {"email": "john@acme.com", "email_confidence": 0.95}
        )
        assert comp.email_confidence == 0.95

    def test_score_email_low_confidence(self):
        score, band, comp = self.svc.score_lead(
            {"email": "john@acme.com", "email_confidence": 0.3}
        )
        assert comp.email_confidence == 0.3

    def test_score_email_no_confidence_but_has_email(self):
        score, band, comp = self.svc.score_lead(
            {"email": "john@acme.com"}
        )
        assert comp.email_confidence == 0.5  # moderate default

    def test_score_email_no_email(self):
        score, band, comp = self.svc.score_lead({})
        assert comp.email_confidence == 0.0

    # --- Role match scoring ---

    def test_score_role_exact_match(self):
        score, band, comp = self.svc.score_lead(
            {"title": "CTO"},
            icp_criteria={"title": "CTO"},
        )
        assert comp.role_match == 1.0

    def test_score_role_partial_match(self):
        score, band, comp = self.svc.score_lead(
            {"title": "VP of Engineering"},
            icp_criteria={"title": "VP Engineering"},
        )
        assert comp.role_match >= 0.7

    def test_score_role_no_match(self):
        score, band, comp = self.svc.score_lead(
            {"title": "Receptionist"},
            icp_criteria={"title": "CTO"},
        )
        assert comp.role_match <= 0.4

    def test_score_role_no_criteria(self):
        score, band, comp = self.svc.score_lead(
            {"title": "CTO"},
        )
        assert comp.role_match == 0.6  # moderate default

    # --- Geo scoring ---

    def test_score_geo_match(self):
        score, band, comp = self.svc.score_lead(
            {"country": "US"},
            icp_criteria={"country": "US"},
        )
        assert comp.geo_relevance >= 0.9

    def test_score_geo_no_match(self):
        score, band, comp = self.svc.score_lead(
            {"country": "Germany"},
            icp_criteria={"geo": "US"},
        )
        assert comp.geo_relevance <= 0.5

    def test_score_geo_no_criteria(self):
        score, band, comp = self.svc.score_lead(
            {"country": "US"},
        )
        assert comp.geo_relevance >= 0.5  # moderate default

    # --- Readiness bands ---

    def test_band_high_confidence(self):
        """High-quality lead should get READY_HIGH_CONFIDENCE."""
        score, band, comp = self.svc.score_lead(
            {
                "email": "cto@acme.com",
                "domain": "acme.com",
                "email_confidence": 0.95,
                "title": "CTO",
                "country": "US",
            },
            icp_criteria={"title": "CTO", "country": "US"},
        )
        assert band == ReadinessBand.READY_HIGH_CONFIDENCE
        assert score >= 0.7

    def test_band_review(self):
        """Moderate-quality lead should get READY_REVIEW."""
        score, band, comp = self.svc.score_lead(
            {
                "email": "john@gmail.com",
                "email_confidence": 0.5,
                "title": "Developer",
            },
            icp_criteria={"title": "CTO"},
        )
        assert band == ReadinessBand.READY_REVIEW
        assert 0.4 <= score < 0.7

    def test_band_hold(self):
        """Low-quality lead should get HOLD."""
        score, band, comp = self.svc.score_lead(
            {"email_confidence": 0.1},
            is_duplicate=True,
        )
        assert band == ReadinessBand.HOLD
        assert score < 0.4

    def test_band_thresholds(self):
        assert ReadinessBand.THRESHOLD_HIGH == 0.7
        assert ReadinessBand.THRESHOLD_REVIEW == 0.4

    # --- Scoring determinism ---

    def test_scoring_is_deterministic(self):
        """Same input should always produce same output."""
        lead_data = {
            "email": "jane@acme.com",
            "domain": "acme.com",
            "email_confidence": 0.85,
            "title": "VP Sales",
            "country": "US",
        }
        criteria = {"title": "VP Sales", "country": "US"}

        score1, band1, _ = self.svc.score_lead(lead_data, criteria)
        score2, band2, _ = self.svc.score_lead(lead_data, criteria)
        assert score1 == score2
        assert band1 == band2

    async def test_score_run_not_found_leads(self):
        """score_run with empty lead set returns 0."""
        db = AsyncMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        count = await self.svc.score_run(
            db=db,
            run_id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
        )
        assert count == 0


# ===========================================================================
# PRS-C06 — Exclusion Taxonomy and Recovery Suggestions
# ===========================================================================

class TestExclusionService:
    """Exclusion reason mapping and recovery suggestion tests."""

    def setup_method(self):
        self.svc = ExclusionService()

    def test_all_reasons_have_suggestions(self):
        for reason in ExclusionReason.ALL:
            suggestion = self.svc.get_suggestion(reason)
            assert suggestion is not None, f"Missing suggestion for {reason}"
            assert isinstance(suggestion, RecoverySuggestion)
            assert suggestion.suggestion  # non-empty text

    def test_unknown_reason_returns_none(self):
        assert self.svc.get_suggestion("UNKNOWN_REASON") is None

    def test_get_all_suggestions(self):
        reasons = [ExclusionReason.NO_EMAIL, ExclusionReason.ROLE_MISMATCH]
        suggestions = self.svc.get_all_suggestions(reasons)
        assert len(suggestions) == 2

    def test_classify_no_email(self):
        reasons = self.svc.classify_exclusion({"title": "CTO"})
        assert ExclusionReason.NO_EMAIL in reasons

    def test_classify_disposable_email(self):
        reasons = self.svc.classify_exclusion(
            {"email": "test@mailinator.com"}
        )
        assert ExclusionReason.DISPOSABLE_EMAIL in reasons

    def test_classify_free_email(self):
        reasons = self.svc.classify_exclusion(
            {"email": "test@gmail.com"}
        )
        assert ExclusionReason.FREE_EMAIL in reasons

    def test_classify_low_confidence(self):
        reasons = self.svc.classify_exclusion(
            {"email": "test@acme.com", "email_confidence": 0.3}
        )
        assert ExclusionReason.LOW_CONFIDENCE_EMAIL in reasons

    def test_classify_role_mismatch(self):
        reasons = self.svc.classify_exclusion(
            {"email": "test@acme.com", "title": "Receptionist"},
            icp_criteria={"title": "CTO"},
        )
        assert ExclusionReason.ROLE_MISMATCH in reasons

    def test_classify_geo_mismatch(self):
        reasons = self.svc.classify_exclusion(
            {"email": "test@acme.com", "country": "Germany"},
            icp_criteria={"geo": "US"},
        )
        assert ExclusionReason.GEO_MISMATCH in reasons

    def test_classify_good_lead_no_exclusions(self):
        reasons = self.svc.classify_exclusion(
            {
                "email": "cto@acme.com",
                "title": "CTO",
                "country": "US",
                "email_confidence": 0.9,
            },
            icp_criteria={"title": "CTO", "geo": "US"},
        )
        assert len(reasons) == 0

    def test_classify_no_domain_no_email(self):
        reasons = self.svc.classify_exclusion({})
        assert ExclusionReason.NO_EMAIL in reasons
        assert ExclusionReason.NO_DOMAIN in reasons

    def test_format_exclusion_summary(self):
        summary = self.svc.format_exclusion_summary(
            [ExclusionReason.NO_EMAIL, ExclusionReason.ROLE_MISMATCH]
        )
        assert summary["exclusion_count"] == 2
        assert len(summary["exclusions"]) == 2
        assert summary["has_recoverable"] is True  # NO_EMAIL has re_enrich

    def test_format_exclusion_summary_empty(self):
        summary = self.svc.format_exclusion_summary([])
        assert summary["exclusion_count"] == 0
        assert summary["has_recoverable"] is False

    def test_recovery_suggestion_severity_levels(self):
        """Verify severity levels are set correctly."""
        high_severity = RECOVERY_SUGGESTIONS[ExclusionReason.NO_EMAIL]
        assert high_severity.severity == "high"

        low_severity = RECOVERY_SUGGESTIONS[ExclusionReason.DUPLICATE_EXISTING_CRM]
        assert low_severity.severity == "low"

    def test_recovery_suggestion_action_types(self):
        """Verify action types are set correctly."""
        re_enrich = RECOVERY_SUGGESTIONS[ExclusionReason.NO_EMAIL]
        assert re_enrich.action_type == "re_enrich"

        manual = RECOVERY_SUGGESTIONS[ExclusionReason.ROLE_MISMATCH]
        assert manual.action_type == "manual_review"

        no_action = RECOVERY_SUGGESTIONS[ExclusionReason.DUPLICATE_EXISTING_CRM]
        assert no_action.action_type is None

    def test_exclusion_reason_constants(self):
        assert len(ExclusionReason.ALL) == 12


# ===========================================================================
# PRS-C07 — Import Bridge
# ===========================================================================

class TestLeadImportService:
    """Import behavior and dedupe tests."""

    def setup_method(self):
        self.svc = LeadImportService()

    async def test_import_no_leads_found(self):
        db = AsyncMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        result = await self.svc.import_leads(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_ids=[uuid.uuid4()],
        )
        assert result.imported_count == 0

    async def test_import_skips_excluded_leads(self):
        db = AsyncMock()
        db.add = MagicMock()

        pl = MagicMock()
        pl.is_excluded = True
        pl.email = "excluded@acme.com"

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [pl]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        result = await self.svc.import_leads(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_ids=[uuid.uuid4()],
        )
        assert result.imported_count == 0
        assert result.skipped_count == 1

    async def test_import_skips_no_email(self):
        db = AsyncMock()
        db.add = MagicMock()

        pl = MagicMock()
        pl.is_excluded = False
        pl.email = None
        pl.readiness_band = "READY_HIGH_CONFIDENCE"

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [pl]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        db.execute.return_value = mock_result

        result = await self.svc.import_leads(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_ids=[uuid.uuid4()],
        )
        assert result.imported_count == 0
        assert result.skipped_count == 1

    async def test_import_skips_hold_band(self):
        db = AsyncMock()
        db.add = MagicMock()

        pl = MagicMock()
        pl.is_excluded = False
        pl.email = "hold@acme.com"
        pl.readiness_band = "HOLD"

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [pl]
        mock_leads_result = MagicMock()
        mock_leads_result.scalars.return_value = mock_scalars

        # CRM check returns no existing
        mock_crm_result = MagicMock()
        mock_crm_result.all.return_value = []

        db.execute.side_effect = [mock_leads_result, mock_crm_result]

        result = await self.svc.import_leads(
            db=db,
            workspace_id=uuid.uuid4(),
            lead_ids=[uuid.uuid4()],
        )
        assert result.imported_count == 0
        assert result.skipped_count == 1

    async def test_import_result_dataclass(self):
        result = LeadImportResult()
        assert result.imported_count == 0
        assert result.duplicate_count == 0
        assert result.skipped_count == 0
        assert result.imported_lead_ids == []
        assert result.lead_list_id is None

    async def test_import_result_to_dict(self):
        result = LeadImportResult()
        result.imported_count = 3
        result.lead_list_id = uuid.uuid4()
        d = result.to_dict()
        assert d["imported_count"] == 3
        assert d["lead_list_id"] is not None

    def test_default_import_bands(self):
        assert DEFAULT_IMPORT_BANDS == {"READY_HIGH_CONFIDENCE", "READY_REVIEW"}

    async def test_resolve_lead_list_not_found(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        with pytest.raises(ValueError, match="not found"):
            await self.svc._resolve_lead_list(
                db=db,
                workspace_id=uuid.uuid4(),
                target_list_id=uuid.uuid4(),
                new_list_name=None,
            )

    async def test_resolve_lead_list_create_new(self):
        db = AsyncMock()
        db.add = MagicMock()

        result = await self.svc._resolve_lead_list(
            db=db,
            workspace_id=uuid.uuid4(),
            target_list_id=None,
            new_list_name="My Import List",
        )
        # Should have added a new list
        db.add.assert_called_once()

    async def test_resolve_lead_list_none(self):
        db = AsyncMock()
        result = await self.svc._resolve_lead_list(
            db=db,
            workspace_id=uuid.uuid4(),
            target_list_id=None,
            new_list_name=None,
        )
        assert result is None


# ===========================================================================
# Route registration and stability
# ===========================================================================

class TestImportRoute:
    """Test import route registration."""

    def test_import_route_registered(self):
        from app.routers.prospecting import router
        paths = [r.path for r in router.routes]
        assert "/leads/import" in paths


class TestExistingEndpointsStablePhase4:
    """Confirm Phase 4 changes don't break existing routes."""

    async def test_health_check(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200

    async def test_auth_me(self, client):
        resp = await client.get("/api/auth/me")
        assert resp.status_code == 200

    async def test_run_approve_implemented(self, client, mock_db):
        """approve_run is now implemented — returns 404 for unknown run."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        fake_id = "00000000-0000-0000-0000-000000000099"
        resp = await client.post(f"/api/prospecting/runs/{fake_id}/approve")
        assert resp.status_code == 404
