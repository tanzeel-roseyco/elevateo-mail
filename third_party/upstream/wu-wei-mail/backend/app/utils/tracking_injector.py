"""Tracking injection utilities — open pixel, click redirect, unsubscribe link."""

import hashlib
import hmac
import re
from urllib.parse import quote


def build_tracking_urls(sent_email_id: str, base_url: str) -> dict:
    """Build all tracking URLs for a sent email."""
    base = base_url.rstrip("/")
    return {
        "open_pixel_url": f"{base}/track/open/{sent_email_id}",
        "click_base_url": f"{base}/track/click/{sent_email_id}",
        "unsubscribe_url": f"{base}/track/unsubscribe/{sent_email_id}",
    }


def inject_open_pixel(html: str, pixel_url: str) -> str:
    """Append invisible 1x1 tracking pixel before </body> or at end."""
    pixel = f'<img src="{pixel_url}" width="1" height="1" alt="" style="display:none" />'
    lower = html.lower()
    idx = lower.rfind("</body>")
    if idx != -1:
        return html[:idx] + pixel + html[idx:]
    return html + pixel


def rewrite_links_for_click_tracking(
    html: str,
    click_base_url: str,
    signing_secret: str = "",
) -> str:
    """Rewrite <a href="..."> links to route through the click tracker.

    When signing_secret is provided, appends an HMAC sig param to prevent
    open-redirect abuse.
    """
    # Extract tracking_id from click_base_url (last path segment)
    tracking_id = click_base_url.rstrip("/").rsplit("/", 1)[-1]

    def _replace(match: re.Match) -> str:
        original_url = match.group(1)
        # Only track http(s) links; skip mailto, tel, anchors, unsubscribe
        if not original_url.startswith(("http://", "https://")):
            return match.group(0)
        if "unsubscribe" in original_url.lower():
            return match.group(0)
        tracked = f"{click_base_url}?url={quote(original_url, safe='')}"
        if signing_secret:
            sig = hmac.new(
                signing_secret.encode(),
                f"{tracking_id}:{original_url}".encode(),
                hashlib.sha256,
            ).hexdigest()[:16]
            tracked += f"&sig={sig}"
        return f'href="{tracked}"'

    return re.sub(r'href="([^"]+)"', _replace, html, flags=re.IGNORECASE)


def ensure_unsubscribe_footer(html: str, unsubscribe_url: str) -> str:
    """Append a minimal unsubscribe footer if the body doesn't already contain one.

    This is a compliance safety net — if the template author forgot to include
    {{unsubscribe_link}}, we add a minimal footer to stay CAN-SPAM/GDPR compliant.
    """
    if unsubscribe_url in html:
        return html
    footer = (
        '<div style="margin-top:20px;padding-top:10px;border-top:1px solid #eee;'
        'font-size:11px;color:#999;text-align:center">'
        f'<a href="{unsubscribe_url}" style="color:#999">Unsubscribe</a>'
        '</div>'
    )
    # Insert before </body> if present, otherwise append
    lower = html.lower()
    idx = lower.rfind("</body>")
    if idx != -1:
        return html[:idx] + footer + html[idx:]
    return html + footer


def post_process_email_body(
    html: str,
    sent_email_id: str,
    base_url: str,
    track_opens: bool = True,
    track_clicks: bool = True,
    click_signing_secret: str = "",
) -> str:
    """Apply all tracking instrumentation to a rendered email body."""
    urls = build_tracking_urls(sent_email_id, base_url)
    if track_clicks:
        html = rewrite_links_for_click_tracking(
            html, urls["click_base_url"], signing_secret=click_signing_secret,
        )
    if track_opens:
        html = inject_open_pixel(html, urls["open_pixel_url"])
    return html
