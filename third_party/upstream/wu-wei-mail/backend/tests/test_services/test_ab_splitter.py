"""Tests for the A/B splitter — variant assignment and statistical significance."""

import uuid
from unittest.mock import MagicMock

import pytest

from app.services.ab_splitter import ABSplitter


@pytest.fixture
def splitter():
    return ABSplitter()


def _make_variant(name: str, weight: int = 50):
    """Create a mock Variant with name and weight."""
    v = MagicMock()
    v.name = name
    v.weight = weight
    return v


# ---------------------------------------------------------------------------
# Variant assignment
# ---------------------------------------------------------------------------

class TestAssignVariant:

    def test_single_variant(self, splitter):
        """With only one variant, always returns it."""
        v = _make_variant("A")
        result = splitter.assign_variant("lead1", "camp1", [v])
        assert result == v

    def test_deterministic_assignment(self, splitter):
        """Same lead + campaign → same variant every time."""
        variants = [_make_variant("A", 50), _make_variant("B", 50)]
        r1 = splitter.assign_variant("lead-x", "camp-y", variants)
        r2 = splitter.assign_variant("lead-x", "camp-y", variants)
        assert r1.name == r2.name

    def test_different_leads_can_get_different_variants(self, splitter):
        """Different leads should distribute across variants."""
        variants = [_make_variant("A", 50), _make_variant("B", 50)]
        results = set()
        for i in range(100):
            v = splitter.assign_variant(f"lead-{i}", "camp-1", variants)
            results.add(v.name)
        # With 100 leads and 50/50 weights, we should see both variants
        assert len(results) == 2

    def test_weighted_distribution(self, splitter):
        """Variant with higher weight should be selected more often."""
        variants = [_make_variant("A", 90), _make_variant("B", 10)]
        counts = {"A": 0, "B": 0}
        for i in range(1000):
            v = splitter.assign_variant(str(uuid.uuid4()), "camp-1", variants)
            counts[v.name] += 1
        # A should get roughly 90% (with some tolerance)
        assert counts["A"] > counts["B"]
        assert counts["A"] > 700  # At least 70% went to A

    def test_no_variants_raises(self, splitter):
        """Empty variant list → ValueError."""
        with pytest.raises(ValueError, match="No variants"):
            splitter.assign_variant("lead", "camp", [])

    def test_equal_weights(self, splitter):
        """Equal weights should roughly split 50/50."""
        variants = [_make_variant("A", 50), _make_variant("B", 50)]
        counts = {"A": 0, "B": 0}
        for i in range(1000):
            v = splitter.assign_variant(str(uuid.uuid4()), "camp-1", variants)
            counts[v.name] += 1
        # Each should be between 30% and 70% (very generous tolerance)
        assert 300 < counts["A"] < 700
        assert 300 < counts["B"] < 700

    def test_three_variants(self, splitter):
        """Works with more than 2 variants."""
        variants = [_make_variant("A", 33), _make_variant("B", 34), _make_variant("C", 33)]
        results = set()
        for i in range(500):
            v = splitter.assign_variant(str(uuid.uuid4()), "camp-1", variants)
            results.add(v.name)
        assert len(results) == 3


# ---------------------------------------------------------------------------
# Statistical significance
# ---------------------------------------------------------------------------

class TestSignificance:

    def test_insufficient_data(self, splitter):
        """Less than 30 samples → not significant."""
        result = splitter.calculate_significance(
            {"sent_count": 10, "metric_count": 5},
            {"sent_count": 10, "metric_count": 3},
        )
        assert result["is_significant"] is False
        assert result["winner"] == "neither"
        assert "Insufficient" in result["message"]

    def test_clear_winner(self, splitter):
        """Big difference with enough data → significant."""
        result = splitter.calculate_significance(
            {"sent_count": 1000, "metric_count": 300},  # 30% rate
            {"sent_count": 1000, "metric_count": 100},  # 10% rate
        )
        assert result["is_significant"] is True
        assert result["winner"] == "A"
        assert result["z_score"] > 0
        assert result["p_value"] < 0.05
        assert result["confidence"] > 95.0

    def test_b_wins(self, splitter):
        """When B has a higher rate and is significant."""
        result = splitter.calculate_significance(
            {"sent_count": 500, "metric_count": 25},   # 5%
            {"sent_count": 500, "metric_count": 75},    # 15%
        )
        assert result["is_significant"] is True
        assert result["winner"] == "B"

    def test_no_difference(self, splitter):
        """Equal rates → not significant."""
        result = splitter.calculate_significance(
            {"sent_count": 500, "metric_count": 50},   # 10%
            {"sent_count": 500, "metric_count": 50},   # 10%
        )
        assert result["is_significant"] is False
        assert result["winner"] == "neither"

    def test_marginal_difference(self, splitter):
        """Small difference with moderate sample → might not be significant."""
        result = splitter.calculate_significance(
            {"sent_count": 100, "metric_count": 12},   # 12%
            {"sent_count": 100, "metric_count": 10},   # 10%
        )
        # With only 2% difference at n=100, this should NOT be significant
        assert result["is_significant"] is False

    def test_zero_metrics(self, splitter):
        """Both have zero events → no variance → not significant."""
        result = splitter.calculate_significance(
            {"sent_count": 100, "metric_count": 0},
            {"sent_count": 100, "metric_count": 0},
        )
        assert result["is_significant"] is False
        assert "No variance" in result.get("message", "")

    def test_rates_in_result(self, splitter):
        """Result should include rate_a and rate_b."""
        result = splitter.calculate_significance(
            {"sent_count": 200, "metric_count": 40},   # 20%
            {"sent_count": 200, "metric_count": 20},   # 10%
        )
        assert result["rate_a"] == 20.0
        assert result["rate_b"] == 10.0

    def test_one_side_insufficient(self, splitter):
        """One variant has enough data, other doesn't → insufficient."""
        result = splitter.calculate_significance(
            {"sent_count": 500, "metric_count": 50},
            {"sent_count": 10, "metric_count": 1},
        )
        assert result["is_significant"] is False
        assert "Insufficient" in result["message"]


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:

    def test_normal_cdf(self, splitter):
        """Sanity check the CDF helper."""
        assert abs(splitter._normal_cdf(0) - 0.5) < 0.001
        assert splitter._normal_cdf(3) > 0.99
        assert splitter._normal_cdf(-3) < 0.01

    def test_assign_variant_with_zero_weights(self, splitter):
        """If all weights are 0, should still assign (fallback to count-based)."""
        variants = [_make_variant("A", 0), _make_variant("B", 0)]
        # Should not crash
        result = splitter.assign_variant("lead", "camp", variants)
        assert result.name in ["A", "B"]
