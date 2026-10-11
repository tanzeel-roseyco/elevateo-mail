"""Tracking routes: open pixel, click redirect, unsubscribe, inbound webhook."""

import hashlib
import hmac
import json
import logging
from email.utils import parseaddr
from urllib.parse import parse_qs
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.email_event import EmailEvent
from app.models.lead import Lead
from app.models.sent_email import SentEmail
from app.models.suppression import Suppression
from app.services.inbound_service import inbound_service

logger = logging.getLogger(__name__)
router = APIRouter()

# 1x1 transparent GIF pixel
TRANSPARENT_GIF = bytes(
    [
        0x47,
        0x49,
        0x46,
        0x38,
        0x39,
        0x61,
        0x01,
        0x00,
        0x01,
        0x00,
        0x80,
        0x00,
        0x00,
        0xFF,
        0xFF,
        0xFF,
        0x00,
        0x00,
        0x00,
        0x21,
        0xF9,
        0x04,
        0x01,
        0x00,
        0x00,
        0x00,
        0x00,
        0x2C,
        0x00,
        0x00,
        0x00,
        0x00,
        0x01,
        0x00,
        0x01,
        0x00,
        0x00,
        0x02,
        0x02,
        0x44,
        0x01,
        0x00,
        0x3B,
    ]
)


def _normalize_header_map(raw_headers: object) -> dict[str, str]:
    if isinstance(raw_headers, dict):
        return {str(k).lower(): str(v) for k, v in raw_headers.items()}
    if isinstance(raw_headers, list):
        normalized = {}
        for item in raw_headers:
            if not isinstance(item, dict):
                continue
            name = item.get("name") or item.get("Name")
            value = item.get("value") or item.get("Value")
            if name:
                normalized[str(name).lower()] = str(value or "")
        return normalized
    if isinstance(raw_headers, str):
        normalized = {}
        for line in raw_headers.splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            normalized[key.strip().lower()] = value.strip()
        return normalized
    return {}


def _extract_first(payload: dict, *keys: str) -> object:
    for key in keys:
        if key in payload and payload[key] not in (None, ""):
            return payload[key]
    return None


def _extract_address(value: object) -> str:
    if isinstance(value, dict):
        value = (
            value.get("email")
            or value.get("Email")
            or value.get("address")
            or value.get("Address")
            or ""
        )
    if isinstance(value, list):
        if not value:
            return ""
        return _extract_address(value[0])
    if not value:
        return ""
    _, address = parseaddr(str(value))
    return (address or str(value)).strip().lower()


def _normalize_message_ref(value: object) -> str | None:
    if value is None:
        return None
    token = str(value).strip()
    if not token:
        return None
    if token.startswith("<") and token.endswith(">"):
        return token
    if "@" in token and not token.startswith("<"):
        return f"<{token}>"
    return token


def _normalize_inbound_payload(payload: dict) -> dict:
    headers = _normalize_header_map(_extract_first(payload, "headers", "Headers"))

    message_id = _normalize_message_ref(
        _extract_first(payload, "message_id", "message-id", "Message-Id", "MessageID")
        or headers.get("message-id")
    )
    in_reply_to = _normalize_message_ref(
        _extract_first(
            payload,
            "in_reply_to",
            "in-reply-to",
            "In-Reply-To",
            "inReplyTo",
            "in_reply_to_message_id",
            "provider_in_reply_to",
            "graph_in_reply_to",
        )
        or headers.get("in-reply-to")
    )

    return {
        "from_email": _extract_address(
            _extract_first(payload, "from_email", "from", "From", "sender", "Sender", "fromAddress")
        ),
        "to_email": _extract_address(
            _extract_first(payload, "to_email", "to", "To", "recipient", "Recipient", "toAddress")
        ),
        "subject": str(_extract_first(payload, "subject", "Subject") or "(no subject)"),
        "body_text": _extract_first(payload, "body_text", "text", "TextBody", "body-plain"),
        "body_html": _extract_first(payload, "body_html", "html", "HtmlBody", "body-html"),
        "message_id": message_id,
        "in_reply_to": in_reply_to,
        "headers": headers,
        "content_type": str(_extract_first(payload, "content_type", "ContentType") or ""),
    }


def _normalize_signature(signature: str) -> str:
    token = signature.strip()
    if token.lower().startswith("sha256="):
        token = token.split("=", 1)[1]
    return token


@router.get("/open/{tracking_id}")
async def track_open(
    tracking_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Open tracking pixel endpoint."""
    result = await db.execute(select(SentEmail).where(SentEmail.id == tracking_id))
    sent_email = result.scalar_one_or_none()

    if sent_email:
        db.add(EmailEvent(sent_email_id=sent_email.id, event_type="open"))
        await db.flush()
    else:
        logger.warning("Open tracking: sent_email not found for tracking_id=%s", tracking_id)

    return Response(
        content=TRANSPARENT_GIF,
        media_type="image/gif",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@router.get("/click/{tracking_id}")
async def track_click(
    tracking_id: UUID,
    url: str = Query(..., description="Destination URL"),
    sig: str = Query("", description="HMAC signature"),
    db: AsyncSession = Depends(get_db),
):
    """Click tracking redirect."""
    settings = get_settings()
    if settings.CLICK_SIGNING_SECRET:
        expected_sig = hmac.new(
            settings.CLICK_SIGNING_SECRET.encode(),
            f"{tracking_id}:{url}".encode(),
            hashlib.sha256,
        ).hexdigest()[:16]
        if not sig or not hmac.compare_digest(sig, expected_sig):
            logger.warning("Click tracking: invalid signature for tracking_id=%s", tracking_id)
            return Response(content="Invalid click link", status_code=403)
    elif not settings.DEBUG:
        logger.error("Click tracking blocked: CLICK_SIGNING_SECRET missing in production")
        return Response(content="Click tracking not configured", status_code=403)

    result = await db.execute(select(SentEmail).where(SentEmail.id == tracking_id))
    sent_email = result.scalar_one_or_none()
    if sent_email:
        db.add(EmailEvent(sent_email_id=sent_email.id, event_type="click", metadata_={"url": url}))
        await db.flush()
    else:
        logger.warning("Click tracking: sent_email not found for tracking_id=%s", tracking_id)

    return RedirectResponse(url=url, status_code=302)


@router.get("/unsubscribe/{tracking_id}")
async def unsubscribe(
    tracking_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Unsubscribe endpoint."""
    result = await db.execute(select(SentEmail).where(SentEmail.id == tracking_id))
    sent_email = result.scalar_one_or_none()
    if not sent_email:
        return HTMLResponse(
            content="<html><body><h1>Invalid unsubscribe link</h1></body></html>",
            status_code=404,
        )

    db.add(EmailEvent(sent_email_id=sent_email.id, event_type="unsubscribe"))
    lead_result = await db.execute(select(Lead).where(Lead.id == sent_email.lead_id))
    lead = lead_result.scalar_one_or_none()
    if lead:
        lead.status = "unsubscribed"
        existing = await db.execute(
            select(Suppression).where(
                Suppression.workspace_id == lead.workspace_id,
                Suppression.email == lead.email.lower(),
            )
        )
        if not existing.scalar_one_or_none():
            db.add(
                Suppression(
                    workspace_id=lead.workspace_id,
                    email=lead.email.lower(),
                    reason="unsubscribe",
                    source=f"campaign:{sent_email.campaign_id}",
                )
            )
    await db.flush()

    return HTMLResponse(
        content="""
        <html>
        <head><title>Unsubscribed</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>You have been unsubscribed</h1>
            <p>You will no longer receive emails from us.</p>
        </body>
        </html>
        """,
        status_code=200,
    )


@router.post("/webhook/inbound")
async def inbound_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_webhook_signature: str | None = Header(None),
):
    """Inbound webhook endpoint with mandatory signature in production."""
    settings = get_settings()
    webhook_secret = settings.WEBHOOK_SIGNING_SECRET

    body = await request.body()
    if webhook_secret:
        if not x_webhook_signature:
            raise HTTPException(status_code=401, detail="Missing webhook signature")
        provided = _normalize_signature(x_webhook_signature)
        expected = hmac.new(webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(provided, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
    elif not settings.DEBUG:
        raise HTTPException(
            status_code=500,
            detail="WEBHOOK_SIGNING_SECRET must be configured in production",
        )

    content_type = (request.headers.get("content-type") or "").lower()
    payload = None
    if "application/json" in content_type or not content_type:
        try:
            parsed_json = json.loads(body.decode("utf-8") or "{}")
            if isinstance(parsed_json, dict):
                payload = parsed_json
        except json.JSONDecodeError:
            payload = None

    if payload is None and "application/x-www-form-urlencoded" in content_type:
        parsed_form = parse_qs(body.decode("utf-8"), keep_blank_values=True)
        payload = {k: (v[0] if len(v) == 1 else v) for k, v in parsed_form.items()}

    if payload is None and "multipart/form-data" in content_type:
        form = await request.form()
        payload = {}
        for key, value in form.multi_items():
            if hasattr(value, "filename"):
                # Ignore file uploads/attachments for webhook normalization.
                continue
            payload[key] = value

    if payload is None:
        raise HTTPException(status_code=400, detail="Unsupported webhook content type")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Webhook body must normalize to a JSON object")

    normalized = _normalize_inbound_payload(payload)
    try:
        message = await inbound_service.process_inbound(db, normalized)
        return {"status": "ok", "message_id": str(message.id)}
    except Exception as exc:
        logger.error("Error processing inbound webhook: %s", str(exc))
        raise HTTPException(status_code=422, detail=str(exc))
