"""A/B test variant assignment and statistical significance testing."""

import hashlib
import math
from typing import Optional


class ABSplitter:
    """Deterministic A/B split assignment and z-test significance calculator."""

    def assign_variant(self, lead_id: str, campaign_id: str, variants: list) -> object:
        """
        Deterministic hash-based variant assignment.

        Uses MD5 hash of lead_id + campaign_id to assign a variant,
        respecting variant weights. Same lead+campaign always gets same variant.
        """
        if not variants:
            raise ValueError("No variants provided")
        if len(variants) == 1:
            return variants[0]

        # Create deterministic hash
        hash_input = f"{lead_id}:{campaign_id}"
        hash_value = int(hashlib.md5(hash_input.encode()).hexdigest(), 16)

        # Normalize weights to sum to 100
        total_weight = sum(getattr(v, "weight", 50) for v in variants)
        if total_weight == 0:
            total_weight = len(variants)

        # Map hash to [0, total_weight) range
        bucket = hash_value % total_weight
        cumulative = 0
        for variant in variants:
            cumulative += getattr(variant, "weight", 50)
            if bucket < cumulative:
                return variant

        # Fallback (shouldn't reach here)
        return variants[-1]

    def calculate_significance(
        self,
        variant_a_stats: dict,
        variant_b_stats: dict,
    ) -> dict:
        """
        Two-proportion z-test for statistical significance.

        Each stats dict should have:
          - sent_count: int
          - metric_count: int (e.g. open_count, reply_count)

        Returns:
          - z_score: float
          - p_value: float (approximate)
          - confidence: float (1 - p_value, as percentage)
          - is_significant: bool (p < 0.05)
          - winner: str ("A", "B", or "neither")
        """
        n_a = variant_a_stats.get("sent_count", 0)
        n_b = variant_b_stats.get("sent_count", 0)
        x_a = variant_a_stats.get("metric_count", 0)
        x_b = variant_b_stats.get("metric_count", 0)

        # Need minimum sample size
        if n_a < 30 or n_b < 30:
            return {
                "z_score": 0.0,
                "p_value": 1.0,
                "confidence": 0.0,
                "is_significant": False,
                "winner": "neither",
                "message": f"Insufficient data (need ≥30 per variant, got A={n_a}, B={n_b})",
            }

        p_a = x_a / n_a
        p_b = x_b / n_b

        # Pooled proportion
        p_pool = (x_a + x_b) / (n_a + n_b)

        # Standard error
        se = math.sqrt(p_pool * (1 - p_pool) * (1 / n_a + 1 / n_b))

        if se == 0:
            return {
                "z_score": 0.0,
                "p_value": 1.0,
                "confidence": 0.0,
                "is_significant": False,
                "winner": "neither",
                "message": "No variance in data",
            }

        z_score = (p_a - p_b) / se

        # Approximate two-tailed p-value using the error function
        p_value = 2 * (1 - self._normal_cdf(abs(z_score)))

        confidence = (1 - p_value) * 100
        is_significant = p_value < 0.05

        if is_significant:
            winner = "A" if p_a > p_b else "B"
        else:
            winner = "neither"

        return {
            "z_score": round(z_score, 4),
            "p_value": round(p_value, 6),
            "confidence": round(confidence, 2),
            "is_significant": is_significant,
            "winner": winner,
            "rate_a": round(p_a * 100, 2),
            "rate_b": round(p_b * 100, 2),
            "message": f"{'Statistically significant' if is_significant else 'Not yet significant'} at 95% confidence",
        }

    @staticmethod
    def _normal_cdf(x: float) -> float:
        """Approximate the standard normal CDF using the error function."""
        return 0.5 * (1 + math.erf(x / math.sqrt(2)))


# Singleton
ab_splitter = ABSplitter()
