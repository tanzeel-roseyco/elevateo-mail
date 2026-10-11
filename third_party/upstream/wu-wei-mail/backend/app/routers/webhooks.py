"""Public webhook endpoints for external integrations.

These endpoints do NOT require authentication — the workflow UUID acts as
an opaque capability token.  External systems (form builders, Zapier,
Make, etc.) POST lead data here to trigger a published workflow.
"""

import hashlib
import hmac
import json
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.lead import Lead
from app.models.workflow import WorkflowDefinition
from app.services.workflow.runtime import workflow_runtime

router = APIRouter(tags=["webhooks"])


def _normalize_signature(signature: str) -> str:
    token = signature.strip()
    if token.lower().startswith("sha256="):
        token = token.split("=", 1)[1]
    return token


@router.post("/api/webhooks/inbound/{workflow_id}")
async def inbound_webhook(
    workflow_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_webhook_signature: str | None = Header(None),
):
    """Public endpoint that external systems POST to in order to trigger a workflow.

    No authentication required — the workflow UUID serves as its own key.

    Expected JSON body::

        {
            "email": "lead@example.com",   // required
            "first_name": "...",           // optional
            "last_name": "...",            // optional
            "company": "...",              // optional
            "title": "...",                // optional
            ... any additional fields ...
        }
    """
    settings = get_settings()
    body_bytes = await request.body()
    webhook_secret = settings.WEBHOOK_SIGNING_SECRET
    if webhook_secret:
        if not x_webhook_signature:
            raise HTTPException(status_code=401, detail="Missing webhook signature")
        provided = _normalize_signature(x_webhook_signature)
        expected = hmac.new(webhook_secret.encode(), body_bytes, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(provided, expected):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
    elif not settings.DEBUG:
        raise HTTPException(
            status_code=500,
            detail="WEBHOOK_SIGNING_SECRET must be configured in production",
        )

    # ------------------------------------------------------------------
    # 1. Verify workflow exists and is published
    # ------------------------------------------------------------------
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == workflow_id,
            WorkflowDefinition.status == "published",
        )
    )
    wf = result.scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found or not published")

    # ------------------------------------------------------------------
    # 2. Ensure workflow has a trigger_inbound_webhook node
    # ------------------------------------------------------------------
    canonical = wf.canonical_json or {}
    nodes = canonical.get("nodes", [])
    trigger_node = next(
        (n for n in nodes if n.get("type") == "trigger_inbound_webhook"),
        None,
    )
    if not trigger_node:
        raise HTTPException(
            status_code=400,
            detail="Workflow has no inbound webhook trigger",
        )

    trigger_node_id: str = trigger_node["id"]

    # ------------------------------------------------------------------
    # 3. Parse and validate request body
    # ------------------------------------------------------------------
    try:
        body = json.loads(body_bytes.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")

    email = body.get("email")
    if not email or not isinstance(email, str):
        raise HTTPException(
            status_code=400,
            detail="'email' field is required in webhook payload",
        )

    # ------------------------------------------------------------------
    # 4. Find or create the lead in the workflow's workspace
    # ------------------------------------------------------------------
    workspace_id = wf.workspace_id

    lead_result = await db.execute(
        select(Lead).where(
            Lead.workspace_id == workspace_id,
            Lead.email == email,
        )
    )
    lead = lead_result.scalar_one_or_none()

    if not lead:
        lead = Lead(
            workspace_id=workspace_id,
            email=email,
            first_name=body.get("first_name", "") or "",
            last_name=body.get("last_name", "") or "",
            company=body.get("company", "") or "",
            title=body.get("title", "") or "",
            phone=body.get("phone", "") or "",
            linkedin_url=body.get("linkedin_url", "") or "",
            status="active",
        )
        db.add(lead)
        await db.flush()  # assigns lead.id

    # ------------------------------------------------------------------
    # 5. Build event_data from the payload (extra context for the trigger)
    # ------------------------------------------------------------------
    known_lead_fields = {
        "email", "first_name", "last_name", "company", "title",
        "phone", "linkedin_url", "website", "city", "state",
        "country", "industry",
    }
    event_data = {
        "type": "inbound_webhook",
        "email": email,
        "first_name": body.get("first_name", ""),
        "last_name": body.get("last_name", ""),
        "company": body.get("company", ""),
        "title": body.get("title", ""),
    }
    # Include any extra (non-standard) fields as custom data
    for k, v in body.items():
        if k not in known_lead_fields:
            event_data[k] = v

    # ------------------------------------------------------------------
    # 6. Dispatch to workflow runtime
    # ------------------------------------------------------------------
    try:
        state = await workflow_runtime.dispatch_event_trigger(
            db=db,
            workflow_id=workflow_id,
            campaign_id=wf.campaign_id,
            lead_id=lead.id,
            trigger_node_id=trigger_node_id,
            event_data=event_data,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process webhook: {e}",
        )

    enrolled = state is not None
    return {
        "ok": True,
        "enrolled": enrolled,
        "message": (
            "Webhook received and workflow triggered"
            if enrolled
            else "Lead already enrolled in this workflow"
        ),
    }
