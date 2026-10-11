"""Tests for security headers middleware."""

import pytest


class TestSecurityHeaders:

    async def test_baseline_headers_present(self, client):
        """All responses include baseline security headers."""
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.headers["x-content-type-options"] == "nosniff"
        assert resp.headers["x-frame-options"] == "DENY"
        assert resp.headers["referrer-policy"] == "strict-origin-when-cross-origin"
        assert "camera=()" in resp.headers["permissions-policy"]

    async def test_hsts_present_in_production_mode(self, client):
        """HSTS header is set when DEBUG=False (production)."""
        resp = await client.get("/health")
        # Test settings have DEBUG=False, so HSTS is present
        assert resp.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"

    async def test_cors_explicit_methods(self, client):
        """CORS allows only explicit HTTP methods, not wildcards."""
        resp = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        allowed = resp.headers.get("access-control-allow-methods", "")
        assert "*" not in allowed
