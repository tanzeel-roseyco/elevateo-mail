"""Tests for tracking routes — open pixel, click redirect, unsubscribe."""

import hashlib
import hmac
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_WORKSPACE_ID
from app.utils.tracking_injector import (
    rewrite_links_for_click_tracking,
    post_process_email_body,
)


def _make_sent_email(**overrides):
    """Create a mock SentEmail record."""
    se = MagicMock()
    se.id = overrides.get("id", uuid.uuid4())
    se.campaign_id = overrides.get("campaign_id", uuid.uuid4())
    se.lead_id = overrides.get("lead_id", uuid.uuid4())
    se.account_id = overrides.get("account_id", uuid.uuid4())
    se.message_id = overrides.get("message_id", f"<{uuid.uuid4()}@example.com>")
    se.to_email = overrides.get("to_email", "lead@example.com")
    se.from_email = overrides.get("from_email", "sender@company.com")
    se.subject = overrides.get("subject", "Hello")
    se.body = overrides.get("body", "<p>Hi there</p>")
    se.status = overrides.get("status", "sent")
    se.sent_at = overrides.get("sent_at", datetime.now(timezone.utc))
    return se


def _make_lead(**overrides):
    """Create a mock Lead for unsubscribe tests."""
    lead = MagicMock()
    lead.id = overrides.get("id", uuid.uuid4())
    lead.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    lead.email = overrides.get("email", "lead@example.com")
    lead.status = overrides.get("status", "active")
    return lead


# ---------------------------------------------------------------------------
# GET /track/open/{tracking_id} — open pixel
# ---------------------------------------------------------------------------

class TestOpenPixel:

    async def test_open_pixel_valid(self, client, mock_db):
        """Valid tracking ID records open event and returns 1x1 GIF."""
        tracking_id = uuid.uuid4()
        sent_email = _make_sent_email(id=tracking_id)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sent_email
        mock_db.execute.return_value = mock_result

        resp = await client.get(f"/track/open/{tracking_id}")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/gif"
        # Verify it's a GIF (starts with GIF89a magic bytes)
        assert resp.content[:6] == b"GIF89a"
        # Verify event was recorded
        mock_db.add.assert_called_once()
        mock_db.flush.assert_called_once()

    async def test_open_pixel_unknown_tracking_id(self, client, mock_db):
        """Unknown tracking ID still returns GIF (graceful degradation)."""
        tracking_id = uuid.uuid4()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        resp = await client.get(f"/track/open/{tracking_id}")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/gif"
        # No event should be added when sent_email not found
        mock_db.add.assert_not_called()

    async def test_open_pixel_no_cache(self, client, mock_db):
        """Open pixel response includes no-cache headers."""
        tracking_id = uuid.uuid4()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        resp = await client.get(f"/track/open/{tracking_id}")
        assert resp.status_code == 200
        assert "no-store" in resp.headers.get("cache-control", "")
        assert "no-cache" in resp.headers.get("cache-control", "")

    async def test_open_pixel_invalid_uuid(self, client):
        """Non-UUID tracking ID returns 422."""
        resp = await client.get("/track/open/not-a-uuid")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /track/click/{tracking_id} — click redirect
# ---------------------------------------------------------------------------

class TestClickRedirect:

    async def test_click_redirect_valid(self, client, mock_db):
        """Valid tracking ID records click event and redirects."""
        tracking_id = uuid.uuid4()
        sent_email = _make_sent_email(id=tracking_id)
        dest_url = "https://example.com/landing-page"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sent_email
        mock_db.execute.return_value = mock_result

        mock_settings = MagicMock()
        mock_settings.CLICK_SIGNING_SECRET = ""
        mock_settings.DEBUG = True

        with patch("app.routers.tracking.get_settings", return_value=mock_settings):
            resp = await client.get(
                f"/track/click/{tracking_id}",
                params={"url": dest_url},
                follow_redirects=False,
            )
        assert resp.status_code == 302
        assert resp.headers["location"] == dest_url
        # Verify event was recorded
        mock_db.add.assert_called_once()
        mock_db.flush.assert_called_once()

    async def test_click_redirect_unknown_tracking_id(self, client, mock_db):
        """Unknown tracking ID still redirects (graceful degradation)."""
        tracking_id = uuid.uuid4()
        dest_url = "https://example.com/page"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        mock_settings = MagicMock()
        mock_settings.CLICK_SIGNING_SECRET = ""
        mock_settings.DEBUG = True

        with patch("app.routers.tracking.get_settings", return_value=mock_settings):
            resp = await client.get(
                f"/track/click/{tracking_id}",
                params={"url": dest_url},
                follow_redirects=False,
            )
        assert resp.status_code == 302
        assert resp.headers["location"] == dest_url
        # No event added
        mock_db.add.assert_not_called()

    async def test_click_redirect_missing_url(self, client):
        """Missing url query param returns 422."""
        tracking_id = uuid.uuid4()
        resp = await client.get(f"/track/click/{tracking_id}")
        assert resp.status_code == 422

    async def test_click_redirect_invalid_uuid(self, client):
        """Non-UUID tracking ID returns 422."""
        resp = await client.get("/track/click/not-a-uuid", params={"url": "https://example.com"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /track/unsubscribe/{tracking_id}
# ---------------------------------------------------------------------------

class TestUnsubscribe:

    async def test_unsubscribe_valid(self, client, mock_db):
        """Valid tracking ID adds to suppression list and returns HTML."""
        tracking_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        sent_email = _make_sent_email(id=tracking_id, lead_id=lead_id)
        lead = _make_lead(id=lead_id, email="lead@example.com")

        # First call: find sent_email; second call: find lead; third call: check suppression
        mock_sent_result = MagicMock()
        mock_sent_result.scalar_one_or_none.return_value = sent_email

        mock_lead_result = MagicMock()
        mock_lead_result.scalar_one_or_none.return_value = lead

        mock_sup_result = MagicMock()
        mock_sup_result.scalar_one_or_none.return_value = None  # No existing suppression

        mock_db.execute.side_effect = [mock_sent_result, mock_lead_result, mock_sup_result]

        resp = await client.get(f"/track/unsubscribe/{tracking_id}")
        assert resp.status_code == 200
        assert "unsubscribed" in resp.text.lower()
        # Verify suppression was added (event + suppression = 2 adds minimum)
        assert mock_db.add.call_count >= 2

    async def test_unsubscribe_invalid_tracking_id(self, client, mock_db):
        """Invalid tracking ID returns 404 with HTML error page."""
        tracking_id = uuid.uuid4()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        resp = await client.get(f"/track/unsubscribe/{tracking_id}")
        assert resp.status_code == 404
        assert "invalid" in resp.text.lower()

    async def test_unsubscribe_already_suppressed(self, client, mock_db):
        """Already-suppressed lead still gets 200 (idempotent)."""
        tracking_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        sent_email = _make_sent_email(id=tracking_id, lead_id=lead_id)
        lead = _make_lead(id=lead_id, email="lead@example.com")

        mock_sent_result = MagicMock()
        mock_sent_result.scalar_one_or_none.return_value = sent_email

        mock_lead_result = MagicMock()
        mock_lead_result.scalar_one_or_none.return_value = lead

        # Suppression already exists
        existing_suppression = MagicMock()
        mock_sup_result = MagicMock()
        mock_sup_result.scalar_one_or_none.return_value = existing_suppression

        mock_db.execute.side_effect = [mock_sent_result, mock_lead_result, mock_sup_result]

        resp = await client.get(f"/track/unsubscribe/{tracking_id}")
        assert resp.status_code == 200
        assert "unsubscribed" in resp.text.lower()

    async def test_unsubscribe_invalid_uuid(self, client):
        """Non-UUID tracking ID returns 422."""
        resp = await client.get("/track/unsubscribe/not-a-uuid")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Click URL signing — tracking_injector unit tests
# ---------------------------------------------------------------------------

class TestClickUrlSigning:

    def test_unsigned_links_no_sig_param(self):
        """Without signing secret, click URLs have no sig param."""
        html = '<a href="https://example.com/page">Link</a>'
        result = rewrite_links_for_click_tracking(
            html, "http://localhost:8000/track/click/abc123"
        )
        assert "sig=" not in result
        assert "track/click/abc123?url=" in result

    def test_signed_links_include_sig_param(self):
        """With signing secret, click URLs include sig param."""
        tracking_id = "abc123"
        secret = "test-secret"
        html = '<a href="https://example.com/page">Link</a>'
        result = rewrite_links_for_click_tracking(
            html,
            f"http://localhost:8000/track/click/{tracking_id}",
            signing_secret=secret,
        )
        assert "&sig=" in result

        # Verify the signature matches expected HMAC
        expected_sig = hmac.new(
            secret.encode(),
            f"{tracking_id}:https://example.com/page".encode(),
            hashlib.sha256,
        ).hexdigest()[:16]
        assert expected_sig in result

    def test_post_process_passes_signing_secret(self):
        """post_process_email_body passes click_signing_secret through."""
        html = '<html><body><a href="https://example.com">Link</a></body></html>'
        result = post_process_email_body(
            html,
            sent_email_id="abc123",
            base_url="http://localhost:8000",
            click_signing_secret="my-secret",
        )
        assert "&sig=" in result

    def test_skips_unsubscribe_links(self):
        """Unsubscribe links are not rewritten even with signing enabled."""
        html = '<a href="https://example.com/unsubscribe">Unsub</a>'
        result = rewrite_links_for_click_tracking(
            html,
            "http://localhost:8000/track/click/abc123",
            signing_secret="secret",
        )
        assert "track/click" not in result
        assert "https://example.com/unsubscribe" in result

    def test_skips_non_http_links(self):
        """mailto: and tel: links are not rewritten."""
        html = '<a href="mailto:test@example.com">Email</a><a href="tel:+1234">Call</a>'
        result = rewrite_links_for_click_tracking(
            html,
            "http://localhost:8000/track/click/abc123",
            signing_secret="secret",
        )
        assert "track/click" not in result


# ---------------------------------------------------------------------------
# Click signature verification — router integration
# ---------------------------------------------------------------------------

class TestClickSignatureVerification:

    async def test_click_rejected_with_bad_sig(self, client, mock_db):
        """When CLICK_SIGNING_SECRET is set, invalid sig returns 403."""
        tracking_id = uuid.uuid4()
        dest_url = "https://example.com/page"

        mock_settings = MagicMock()
        mock_settings.CLICK_SIGNING_SECRET = "test-secret"

        with patch("app.routers.tracking.get_settings", return_value=mock_settings):
            resp = await client.get(
                f"/track/click/{tracking_id}",
                params={"url": dest_url, "sig": "bad-signature"},
                follow_redirects=False,
            )
        assert resp.status_code == 403

    async def test_click_accepted_with_valid_sig(self, client, mock_db):
        """When CLICK_SIGNING_SECRET is set, valid sig allows redirect."""
        tracking_id = uuid.uuid4()
        dest_url = "https://example.com/page"
        secret = "test-secret"

        sig = hmac.new(
            secret.encode(),
            f"{tracking_id}:{dest_url}".encode(),
            hashlib.sha256,
        ).hexdigest()[:16]

        sent_email = _make_sent_email(id=tracking_id)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sent_email
        mock_db.execute.return_value = mock_result

        mock_settings = MagicMock()
        mock_settings.CLICK_SIGNING_SECRET = secret

        with patch("app.routers.tracking.get_settings", return_value=mock_settings):
            resp = await client.get(
                f"/track/click/{tracking_id}",
                params={"url": dest_url, "sig": sig},
                follow_redirects=False,
            )
        assert resp.status_code == 302
        assert resp.headers["location"] == dest_url

    async def test_click_no_sig_required_without_secret(self, client, mock_db):
        """When CLICK_SIGNING_SECRET is empty in debug mode, no sig verification happens."""
        tracking_id = uuid.uuid4()
        dest_url = "https://example.com/page"

        sent_email = _make_sent_email(id=tracking_id)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sent_email
        mock_db.execute.return_value = mock_result

        mock_settings = MagicMock()
        mock_settings.CLICK_SIGNING_SECRET = ""
        mock_settings.DEBUG = True

        with patch("app.routers.tracking.get_settings", return_value=mock_settings):
            resp = await client.get(
                f"/track/click/{tracking_id}",
                params={"url": dest_url},
                follow_redirects=False,
            )
        assert resp.status_code == 302

    async def test_click_blocked_in_production_without_signing_secret(self, client, mock_db):
        """In production (DEBUG=False), missing CLICK_SIGNING_SECRET returns 403."""
        tracking_id = uuid.uuid4()
        dest_url = "https://example.com/page"

        mock_settings = MagicMock()
        mock_settings.CLICK_SIGNING_SECRET = ""
        mock_settings.DEBUG = False

        with patch("app.routers.tracking.get_settings", return_value=mock_settings):
            resp = await client.get(
                f"/track/click/{tracking_id}",
                params={"url": dest_url},
                follow_redirects=False,
            )
        assert resp.status_code == 403
