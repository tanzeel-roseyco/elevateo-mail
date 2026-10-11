"""Workflow node executors — execute individual nodes in the workflow graph.

Each executor handles one node type, returning a NodeResult that tells
the runtime engine what to do next (advance, wait, fail, complete).

V2: Executors receive ExecutionContext envelope. Backward compat: plain dicts
are auto-wrapped.

Production executors receive `node_meta` dict with:
- db: AsyncSession
- workspace_id: UUID
- campaign_id: UUID (optional)
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json as json_module
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any
from urllib.parse import urlparse

import httpx

from app.schemas.workflow import ExecutionContext

logger = logging.getLogger(__name__)


class NodeResultAction(str, Enum):
    ADVANCE = "advance"       # evaluate edges and move to next node
    WAIT = "wait"             # set next_run_at and wait
    COMPLETE = "complete"     # lead has reached end node
    FAIL = "fail"             # node execution failed
    WAIT_FOR_EVENT = "wait_for_event"  # wait for external signal


@dataclass
class NodeResult:
    action: NodeResultAction
    output: dict[str, Any] = field(default_factory=dict)
    next_run_at: datetime | None = None
    error: str | None = None
    event_type: str | None = None  # for outreach event emission
    event_payload: dict[str, Any] = field(default_factory=dict)
    duration_ms: int = 0


# ---------------------------------------------------------------------------
# Executor registry
# ---------------------------------------------------------------------------

_EXECUTORS: dict[str, "NodeExecutor"] = {}


class NodeExecutor:
    """Base class for node executors."""

    node_type: str = ""

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if cls.node_type:
            _EXECUTORS[cls.node_type] = cls()

    async def execute(
        self,
        config: dict[str, Any],
        context: dict[str, Any] | ExecutionContext,
        lead_data: dict[str, Any] | None = None,
        channel_state: dict[str, Any] | None = None,
        node_meta: dict[str, Any] | None = None,
    ) -> NodeResult:
        """Execute the node.

        V2 signature: context is an ExecutionContext, lead_data/channel_state
        are extracted from it. V1 compat: context can be a plain dict.
        """
        raise NotImplementedError


def get_executor(node_type: str) -> NodeExecutor | None:
    return _EXECUTORS.get(node_type)


def _extract_context(
    context: dict[str, Any] | ExecutionContext,
    lead_data: dict[str, Any] | None,
    channel_state: dict[str, Any] | None,
) -> tuple[ExecutionContext, dict[str, Any], dict[str, Any]]:
    """Normalize executor args into (ExecutionContext, lead_data, channel_state)."""
    if isinstance(context, ExecutionContext):
        ld = lead_data if lead_data is not None else context.lead
        cs = channel_state if channel_state is not None else {}
        return context, ld, cs
    # V1 compat: context is a plain dict
    ld = lead_data if lead_data is not None else context.get("lead", {})
    cs = channel_state if channel_state is not None else {}
    # Carry over flat context keys as vars for backward compat
    reserved = {"lead", "trigger", "vars", "node_outputs", "execution"}
    vars_dict = {k: v for k, v in context.items() if k not in reserved}
    vars_dict.update(context.get("vars", {}))
    return ExecutionContext(lead=ld, vars=vars_dict), ld, cs


# ---------------------------------------------------------------------------
# Trigger executors (just pass through — they're entry points)
# ---------------------------------------------------------------------------

class TriggerManualExecutor(NodeExecutor):
    node_type = "trigger_manual"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        return NodeResult(action=NodeResultAction.ADVANCE, output={"triggered": "manual"})


class TriggerNewLeadExecutor(NodeExecutor):
    node_type = "trigger_new_lead"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        return NodeResult(action=NodeResultAction.ADVANCE, output={"triggered": "new_lead"})


class TriggerListMembershipExecutor(NodeExecutor):
    node_type = "trigger_list_membership_added"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        return NodeResult(action=NodeResultAction.ADVANCE, output={"triggered": "list_membership"})


class TriggerInboundWebhookExecutor(NodeExecutor):
    node_type = "trigger_inbound_webhook"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        return NodeResult(action=NodeResultAction.ADVANCE, output={"triggered": "webhook"})


class TriggerCronExecutor(NodeExecutor):
    node_type = "trigger_cron"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        return NodeResult(action=NodeResultAction.ADVANCE, output={"triggered": "cron"})


# ---------------------------------------------------------------------------
# Wait node
# ---------------------------------------------------------------------------

class WaitExecutor(NodeExecutor):
    node_type = "wait"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        days = config.get("days", 0)
        hours = config.get("hours", 0)
        minutes = config.get("minutes", 0)
        wait_delta = timedelta(days=days, hours=hours, minutes=minutes)
        next_run = datetime.now(timezone.utc) + wait_delta
        return NodeResult(
            action=NodeResultAction.WAIT,
            next_run_at=next_run,
            output={"wait_days": days, "wait_hours": hours, "wait_minutes": minutes},
        )


# ---------------------------------------------------------------------------
# End node
# ---------------------------------------------------------------------------

class EndExecutor(NodeExecutor):
    node_type = "end"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        result_label = config.get("result", "success")
        final_status = config.get("final_status", "completed")
        return NodeResult(
            action=NodeResultAction.COMPLETE,
            output={"result": result_label, "final_status": final_status},
        )


# ---------------------------------------------------------------------------
# If (condition) node
# ---------------------------------------------------------------------------

class IfExecutor(NodeExecutor):
    node_type = "if"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, cs = _extract_context(context, lead_data, channel_state)
        condition = config.get("condition", "")
        negate = config.get("negate", False)
        met = self._evaluate_condition(condition, ctx, ld, cs)
        if negate:
            met = not met
        return NodeResult(
            action=NodeResultAction.ADVANCE,
            output={"condition": condition, "condition_met": met},
        )

    def _evaluate_condition(
        self,
        condition: str,
        context: ExecutionContext | dict[str, Any],
        lead_data: dict[str, Any],
        channel_state: dict[str, Any],
    ) -> bool:
        # Support both ExecutionContext and plain dict for backward compat
        if isinstance(context, ExecutionContext):
            ctx_dict = context.model_dump()
            # Flatten for condition evaluation: check node_outputs + lead + vars
            flat_ctx: dict[str, Any] = {}
            flat_ctx.update(context.vars)
            flat_ctx.update(context.lead)
            for nid, outputs in context.node_outputs.items():
                for k, v in outputs.items():
                    flat_ctx[f"{nid}.{k}"] = v
        else:
            flat_ctx = context

        evaluators = {
            "email_replied": lambda: flat_ctx.get("email_replied", False),
            "email_opened": lambda: flat_ctx.get("email_opened", False),
            "email_clicked": lambda: flat_ctx.get("email_clicked", False),
            "email_not_replied": lambda: not flat_ctx.get("email_replied", False),
            "email_not_opened": lambda: not flat_ctx.get("email_opened", False),
            "email_not_clicked": lambda: not flat_ctx.get("email_clicked", False),
            "linkedin_accepted": lambda: channel_state.get("linkedin_connected", False),
            "linkedin_not_accepted": lambda: not channel_state.get("linkedin_connected", False),
            "linkedin_replied": lambda: channel_state.get("linkedin_replied", False),
            "linkedin_not_replied": lambda: not channel_state.get("linkedin_replied", False),
            "has_linkedin_url": lambda: bool(lead_data.get("linkedin_url")),
        }
        evaluator = evaluators.get(condition)
        if evaluator:
            return evaluator()
        logger.warning("Unknown condition: %s", condition)
        return False


# ---------------------------------------------------------------------------
# Switch node
# ---------------------------------------------------------------------------

class SwitchExecutor(NodeExecutor):
    node_type = "switch"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, cs = _extract_context(context, lead_data, channel_state)
        field_name = config.get("field", "")

        # Look in context.vars, then lead, then flat context
        if isinstance(context, ExecutionContext):
            value = context.vars.get(field_name, context.lead.get(field_name, ""))
        elif isinstance(context, dict):
            value = context.get(field_name, ld.get(field_name, ""))
        else:
            value = ""

        return NodeResult(
            action=NodeResultAction.ADVANCE,
            output={"switch_field": field_name, "switch_value": str(value)},
        )


# ---------------------------------------------------------------------------
# Email send node (placeholder — delegates to existing sender)
# ---------------------------------------------------------------------------

class EmailSendExecutor(NodeExecutor):
    node_type = "email_send"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, cs = _extract_context(context, lead_data, channel_state)
        meta = node_meta or {}
        db = meta.get("db")
        workspace_id = meta.get("workspace_id")

        # If no db session, fall back to stub mode (testing / dry-run)
        if not db or not workspace_id:
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={"email_queued": True, "stub": True},
                event_type="email_sent",
                event_payload={"template_id": config.get("template_id", "")},
            )

        try:
            return await self._send_real(config, ctx, ld, cs, db, workspace_id, meta)
        except Exception as e:
            logger.exception("EmailSendExecutor failed: %s", e)
            return NodeResult(
                action=NodeResultAction.FAIL,
                error=f"Email send failed: {str(e)}",
            )

    async def _send_real(self, config, ctx, ld, cs, db, workspace_id, meta) -> NodeResult:
        from sqlalchemy import select
        from app.models.campaign import Campaign, CampaignAccount
        from app.models.email_account import EmailAccount
        from app.models.lead import Lead
        from app.models.sent_email import SentEmail
        from app.models.inbox_message import InboxMessage
        from app.services.email_sender import email_sender
        from app.services.template_engine import template_engine
        from app.utils.redis_client import increment_account_sent, increment_campaign_sent
        from app.utils.tracking_injector import build_tracking_urls, post_process_email_body, ensure_unsubscribe_footer
        from app.config import get_settings

        settings = get_settings()
        campaign_id = meta.get("campaign_id")

        # Load lead from DB for full data
        lead_id = ld.get("id")
        lead = None
        if lead_id:
            result = await db.execute(select(Lead).where(Lead.id == uuid.UUID(str(lead_id))))
            lead = result.scalar_one_or_none()

        if not lead:
            return NodeResult(action=NodeResultAction.FAIL, error="Lead not found in database")

        # Resolve subject/body from config
        subject = config.get("subject_override") or config.get("subject", "")
        body = config.get("body_override") or config.get("body", "")

        if not subject or not body:
            return NodeResult(action=NodeResultAction.FAIL, error="Email node missing subject or body")

        # Select sending account
        # Try campaign accounts first, fall back to workspace accounts
        selected_account = None
        if campaign_id:
            ca_result = await db.execute(
                select(CampaignAccount).where(CampaignAccount.campaign_id == uuid.UUID(str(campaign_id)))
            )
            campaign_accounts = ca_result.scalars().all()
            if campaign_accounts:
                for ca in campaign_accounts:
                    acc_result = await db.execute(select(EmailAccount).where(EmailAccount.id == ca.account_id))
                    ca.account = acc_result.scalar_one()
                selected_account = email_sender.select_account(campaign_accounts)

        if not selected_account:
            # Try any active workspace account
            from app.models.email_account import EmailAccount
            acc_result = await db.execute(
                select(EmailAccount).where(
                    EmailAccount.workspace_id == workspace_id,
                    EmailAccount.is_active == True,
                ).limit(5)
            )
            workspace_accounts = acc_result.scalars().all()
            if workspace_accounts:
                # Simple selection: pick first available
                from app.utils.redis_client import get_account_sent_today
                for acc in workspace_accounts:
                    sent_today = get_account_sent_today(str(acc.id))
                    effective_limit = acc.daily_limit
                    if acc.warmup_enabled and acc.warmup_level < acc.daily_limit:
                        effective_limit = acc.warmup_level
                    if sent_today < effective_limit:
                        selected_account = acc
                        break

        if not selected_account:
            return NodeResult(
                action=NodeResultAction.FAIL,
                error="No available sending accounts (all at daily limit or inactive)",
            )

        # Build lead_data dict for template rendering
        lead_data_dict = {
            "email": lead.email,
            "first_name": lead.first_name or "",
            "last_name": lead.last_name or "",
            "company": lead.company or "",
            "title": lead.title or "",
            "phone": lead.phone or "",
            "linkedin_url": lead.linkedin_url or "",
            "website": lead.website or "",
            "city": lead.city or "",
            "state": lead.state or "",
            "country": lead.country or "",
            "industry": lead.industry or "",
            "custom_fields": lead.custom_fields or {},
        }

        # Create SentEmail BEFORE send (status="pending") for tracking ID
        sent_email = SentEmail(
            campaign_id=uuid.UUID(str(campaign_id)) if campaign_id else None,
            lead_id=lead.id,
            account_id=selected_account.id,
            to_email=lead.email,
            from_email=selected_account.email,
            subject="",  # set after rendering
            body="",     # set after tracking injection
            status="pending",
        )
        db.add(sent_email)
        await db.flush()

        # Build tracking URLs
        tracking_urls = build_tracking_urls(str(sent_email.id), settings.BASE_URL)
        lead_data_dict["unsubscribe_link"] = tracking_urls["unsubscribe_url"]

        # Render templates
        rendered_subject, rendered_body = template_engine.render_subject_and_body(
            subject, body, lead_data_dict
        )

        # Inject tracking
        track_opens = config.get("track_opens", True)
        track_clicks = config.get("track_clicks", True)
        tracked_body = post_process_email_body(
            rendered_body,
            str(sent_email.id),
            settings.BASE_URL,
            track_opens=track_opens,
            track_clicks=track_clicks,
            click_signing_secret=settings.CLICK_SIGNING_SECRET,
        )

        # Ensure unsubscribe link is present (compliance safety net)
        tracked_body = ensure_unsubscribe_footer(tracked_body, tracking_urls["unsubscribe_url"])

        # Update SentEmail with rendered content
        sent_email.subject = rendered_subject
        sent_email.body = tracked_body

        # Send the email
        message_id = await email_sender.send(
            to=lead.email,
            subject=rendered_subject,
            body=tracked_body,
            account=selected_account,
        )

        # Update SentEmail to "sent"
        sent_email.message_id = message_id
        sent_email.status = "sent"

        # Increment Redis daily counters
        increment_account_sent(str(selected_account.id))
        if campaign_id:
            increment_campaign_sent(str(campaign_id))

        # Create outbound InboxMessage for threading
        inbox_msg = InboxMessage(
            workspace_id=workspace_id,
            account_id=selected_account.id,
            campaign_id=uuid.UUID(str(campaign_id)) if campaign_id else None,
            lead_id=lead.id,
            message_id=message_id,
            from_email=selected_account.email,
            to_email=lead.email,
            subject=rendered_subject,
            body_html=tracked_body,
            direction="outbound",
            is_read=True,
        )
        db.add(inbox_msg)

        await db.flush()

        logger.info(
            "Workflow email sent to %s via account %s (message_id=%s)",
            lead.email, selected_account.email, message_id,
        )

        return NodeResult(
            action=NodeResultAction.ADVANCE,
            output={
                "message_id": message_id,
                "account_id": str(selected_account.id),
                "delivered": True,
                "sent_email_id": str(sent_email.id),
            },
            event_type="email_sent",
            event_payload={
                "message_id": message_id,
                "to_email": lead.email,
                "account_id": str(selected_account.id),
                "sent_email_id": str(sent_email.id),
            },
        )


# ---------------------------------------------------------------------------
# Auto-respond node — classifies inbound reply and sends AI response or escalates
# ---------------------------------------------------------------------------

class AutoRespondExecutor(NodeExecutor):
    node_type = "auto_respond"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, cs = _extract_context(context, lead_data, channel_state)
        meta = node_meta or {}
        db = meta.get("db")
        workspace_id = meta.get("workspace_id")

        # Extract reply text from context (set by event bus when reply wakes lead)
        reply_text = ""
        reply_subject = ""
        if isinstance(ctx, ExecutionContext):
            for nid, outputs in ctx.node_outputs.items():
                if "reply_text" in outputs:
                    reply_text = outputs["reply_text"]
                if "subject" in outputs:
                    reply_subject = outputs["subject"]
            reply_text = reply_text or ctx.vars.get("reply_text", "")
            reply_subject = reply_subject or ctx.vars.get("reply_subject", "")

        if not reply_text and not reply_subject:
            # No reply text — check channel_state
            reply_text = cs.get("last_reply_text", "")
            reply_subject = cs.get("last_reply_subject", "")

        if not reply_text:
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "response_sent": False,
                    "escalated": True,
                    "confidence": 0.0,
                    "intent": "unknown",
                    "escalation_reason": "No reply text found to respond to",
                },
            )

        # Check for opt-out keywords
        from app.services.auto_responder_service import OPT_OUT_KEYWORDS
        body_lower = reply_text.lower()
        if any(kw in body_lower for kw in OPT_OUT_KEYWORDS):
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "response_sent": False,
                    "escalated": True,
                    "confidence": 1.0,
                    "intent": "opt_out",
                    "escalation_reason": "Opt-out keyword detected",
                },
            )

        # Check escalation keywords
        escalation_keywords = config.get("escalation_keywords", [])
        for kw in escalation_keywords:
            if kw.lower() in body_lower:
                return NodeResult(
                    action=NodeResultAction.ADVANCE,
                    output={
                        "response_sent": False,
                        "escalated": True,
                        "confidence": 1.0,
                        "intent": "escalation",
                        "escalation_reason": f"Escalation keyword detected: {kw}",
                    },
                )

        # Build AI prompt
        tone = config.get("tone", "professional")
        language = config.get("language", "English")
        brand_description = config.get("brand_description", "a company")
        forbidden_words = config.get("forbidden_words", [])
        max_response_length = config.get("max_response_length", 500)
        confidence_threshold = config.get("confidence_threshold", 0.7)
        system_prompt_override = config.get("system_prompt_override", "")
        model_ref = config.get("model_ref", "")

        lead_name = f"{ld.get('first_name', '')} {ld.get('last_name', '')}".strip() or "the contact"
        lead_company = ld.get("company", "Unknown")

        import json as json_module

        system_prompt = system_prompt_override or (
            f"You are an AI email assistant for {brand_description}.\n\n"
            f"Tone: {tone}\nLanguage: {language}\n\n"
            f"Rules:\n"
            f"1. Respond naturally to the incoming email.\n"
            f"2. Do not make up facts, pricing, or commitments.\n"
            f"3. Keep the response under {max_response_length} characters.\n"
            f"4. Words you must NEVER use: {json_module.dumps(forbidden_words)}\n"
            f"5. Include a confidence score (0.0-1.0).\n\n"
            f'Respond ONLY with valid JSON: {{"body": "your response", "confidence": 0.85, "intent": "interested|not_interested|question|meeting_request|complaint|other"}}'
        )

        user_prompt = (
            f"Lead: {lead_name} at {lead_company} ({ld.get('title', 'Unknown')})\n\n"
            f"Subject: {reply_subject}\n"
            f"Body:\n{reply_text[:2000]}\n\n"
            f"Generate an appropriate response."
        )

        try:
            from app.utils.openrouter_client import chat_completion

            response = await chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                model=model_ref or None,
            )

            try:
                parsed = json_module.loads(response)
                body = parsed.get("body", "")
                confidence = float(parsed.get("confidence", 0.0))
                intent = parsed.get("intent", "other")
            except (json_module.JSONDecodeError, ValueError):
                body = response  # Use raw response as body
                confidence = 0.3
                intent = "unknown"

        except Exception as e:
            logger.warning("Auto-respond AI call failed: %s", e)
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "response_sent": False,
                    "escalated": True,
                    "confidence": 0.0,
                    "intent": "error",
                    "escalation_reason": f"AI generation failed: {e}",
                },
            )

        # Apply guardrails
        # 1. Confidence threshold
        if confidence < confidence_threshold:
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "response_sent": False,
                    "escalated": True,
                    "confidence": confidence,
                    "intent": intent,
                    "escalation_reason": f"Low confidence: {confidence:.2f} < {confidence_threshold:.2f}",
                },
            )

        # 2. Forbidden words
        for word in forbidden_words:
            if word.lower() in body.lower():
                return NodeResult(
                    action=NodeResultAction.ADVANCE,
                    output={
                        "response_sent": False,
                        "escalated": True,
                        "confidence": confidence,
                        "intent": intent,
                        "escalation_reason": f"Forbidden word detected: {word}",
                    },
                )

        # 3. Length check
        if len(body) > max_response_length * 2:
            body = body[:max_response_length]

        # If no db, return stub result
        if not db or not workspace_id:
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "response_sent": True,
                    "escalated": False,
                    "confidence": confidence,
                    "intent": intent,
                    "stub": True,
                },
                event_type="auto_response_sent",
                event_payload={"confidence": confidence, "intent": intent},
            )

        # Send the reply via email_sender
        try:
            from sqlalchemy import select as sa_select
            from app.models.email_account import EmailAccount
            from app.services.email_sender import email_sender

            # Find an active account in the workspace
            acc_result = await db.execute(
                sa_select(EmailAccount).where(
                    EmailAccount.workspace_id == workspace_id,
                    EmailAccount.is_active == True,
                ).limit(1)
            )
            account = acc_result.scalar_one_or_none()
            if not account:
                return NodeResult(
                    action=NodeResultAction.ADVANCE,
                    output={
                        "response_sent": False,
                        "escalated": True,
                        "confidence": confidence,
                        "intent": intent,
                        "escalation_reason": "No active email account available",
                    },
                )

            lead_email = ld.get("email", "")
            if not lead_email:
                return NodeResult(
                    action=NodeResultAction.ADVANCE,
                    output={
                        "response_sent": False,
                        "escalated": True,
                        "confidence": confidence,
                        "intent": intent,
                        "escalation_reason": "No lead email address",
                    },
                )

            message_id = await email_sender.send(
                to=lead_email,
                subject=f"Re: {reply_subject}" if reply_subject else "Re: your message",
                body=body,
                account=account,
            )

            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "response_sent": True,
                    "escalated": False,
                    "confidence": confidence,
                    "intent": intent,
                    "message_id": message_id,
                    "response_body": body,
                },
                event_type="auto_response_sent",
                event_payload={
                    "confidence": confidence,
                    "intent": intent,
                    "message_id": message_id,
                    "to_email": lead_email,
                },
            )

        except Exception as e:
            logger.warning("Auto-respond send failed: %s", e)
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "response_sent": False,
                    "escalated": True,
                    "confidence": confidence,
                    "intent": intent,
                    "escalation_reason": f"Send failed: {e}",
                },
            )


# ---------------------------------------------------------------------------
# Add note node
# ---------------------------------------------------------------------------

class AddNoteExecutor(NodeExecutor):
    node_type = "add_note"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        note_text = config.get("note_text", "")
        return NodeResult(
            action=NodeResultAction.ADVANCE,
            output={"note_added": note_text},
        )


# ---------------------------------------------------------------------------
# LinkedIn connect node
# ---------------------------------------------------------------------------

class LinkedInConnectExecutor(NodeExecutor):
    node_type = "linkedin_connect"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, cs = _extract_context(context, lead_data, channel_state)
        linkedin_url = ld.get("linkedin_url")
        if not linkedin_url:
            return NodeResult(
                action=NodeResultAction.FAIL,
                error="Lead has no linkedin_url",
            )

        message = config.get("message_template", "")
        wait_days = config.get("wait_for_acceptance_days", 7)
        deadline = datetime.now(timezone.utc) + timedelta(days=wait_days)
        return NodeResult(
            action=NodeResultAction.WAIT_FOR_EVENT,
            next_run_at=deadline,
            output={
                "invite_sent": True,
                "linkedin_url": linkedin_url,
                "message": message[:300],
            },
            event_type="invite_sent",
            event_payload={"linkedin_url": linkedin_url},
        )


# ---------------------------------------------------------------------------
# LinkedIn message node
# ---------------------------------------------------------------------------

class LinkedInMessageExecutor(NodeExecutor):
    node_type = "linkedin_message"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, cs = _extract_context(context, lead_data, channel_state)
        if not cs.get("linkedin_connected"):
            return NodeResult(
                action=NodeResultAction.FAIL,
                error="LinkedIn connection not established — cannot send message",
            )

        message = config.get("message_template", "")
        chat_id = cs.get("linkedin_chat_id", "")

        return NodeResult(
            action=NodeResultAction.ADVANCE,
            output={
                "message_sent": True,
                "chat_id": chat_id,
                "message": message,
            },
            event_type="linkedin_message_sent",
            event_payload={"chat_id": chat_id},
        )


# ---------------------------------------------------------------------------
# Merge node (passthrough — synchronises parallel branches)
# ---------------------------------------------------------------------------

class MergeExecutor(NodeExecutor):
    node_type = "merge"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        return NodeResult(action=NodeResultAction.ADVANCE, output={"merged": True})


# ---------------------------------------------------------------------------
# HTTP request node
# ---------------------------------------------------------------------------

class HttpRequestExecutor(NodeExecutor):
    node_type = "http_request"

    # Private/loopback IP ranges for SSRF protection
    _BLOCKED_NETWORKS = [
        ipaddress.ip_network("10.0.0.0/8"),
        ipaddress.ip_network("172.16.0.0/12"),
        ipaddress.ip_network("192.168.0.0/16"),
        ipaddress.ip_network("127.0.0.0/8"),
        ipaddress.ip_network("169.254.0.0/16"),
        ipaddress.ip_network("0.0.0.0/8"),
        ipaddress.ip_network("::1/128"),
        ipaddress.ip_network("fc00::/7"),
        ipaddress.ip_network("fe80::/10"),
    ]

    def _render_template(self, template: str, lead_data: dict[str, Any]) -> str:
        """Replace {{key}} placeholders with values from lead_data."""
        if not template or not lead_data:
            return template

        def replacer(match: re.Match) -> str:
            key = match.group(1).strip()
            return str(lead_data.get(key, ""))

        return re.sub(r"\{\{(\s*\w+\s*)\}\}", replacer, template)

    def _is_private_ip(self, hostname: str) -> bool:
        """Check if a hostname resolves to a private/loopback IP."""
        try:
            addr = ipaddress.ip_address(hostname)
        except ValueError:
            # Not a raw IP — resolve the hostname
            import socket
            try:
                resolved = socket.getaddrinfo(hostname, None)
                for family, _, _, _, sockaddr in resolved:
                    try:
                        addr = ipaddress.ip_address(sockaddr[0])
                        if any(addr in net for net in self._BLOCKED_NETWORKS):
                            return True
                    except ValueError:
                        continue
                return False
            except socket.gaierror:
                # Can't resolve — let httpx handle the error
                return False

        return any(addr in net for net in self._BLOCKED_NETWORKS)

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, _ = _extract_context(context, lead_data, channel_state)
        start_ms = time.monotonic_ns() // 1_000_000

        url = config.get("url", "")
        method = config.get("method", "POST").upper()
        headers = dict(config.get("headers", {}))
        body_template = config.get("body_template", "")
        timeout_seconds = config.get("timeout_seconds", 30)
        query_params = config.get("query_params", {})
        content_type = config.get("content_type", "application/json")
        follow_redirects = config.get("follow_redirects", True)
        ssrf_protection = config.get("ssrf_protection", True)

        if not url:
            return NodeResult(
                action=NodeResultAction.FAIL,
                error="HTTP request node has no URL configured",
            )

        if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
            return NodeResult(
                action=NodeResultAction.FAIL,
                error=f"Unsupported HTTP method: {method}",
            )

        # Render template variables in URL and body
        url = self._render_template(url, ld)
        body_str = self._render_template(body_template, ld) if body_template else ""

        # Render template variables in query params
        rendered_params = {k: self._render_template(v, ld) for k, v in query_params.items()}

        # SSRF protection: block requests to private IP ranges
        if ssrf_protection:
            parsed = urlparse(url)
            hostname = parsed.hostname or ""
            if self._is_private_ip(hostname):
                return NodeResult(
                    action=NodeResultAction.FAIL,
                    error=f"SSRF protection: requests to private/internal addresses are blocked ({hostname})",
                )

        # Set content-type header if body is present
        if body_str and "content-type" not in {k.lower() for k in headers}:
            headers["Content-Type"] = content_type

        # Build request kwargs
        request_kwargs: dict[str, Any] = {
            "method": method,
            "url": url,
            "headers": headers,
            "params": rendered_params or None,
            "follow_redirects": follow_redirects,
            "timeout": float(timeout_seconds),
        }

        if body_str and method in ("POST", "PUT", "PATCH"):
            if content_type == "application/json":
                # Try to send as parsed JSON, fall back to raw string
                try:
                    request_kwargs["json"] = json_module.loads(body_str)
                except (json_module.JSONDecodeError, ValueError):
                    request_kwargs["content"] = body_str.encode("utf-8")
            else:
                request_kwargs["content"] = body_str.encode("utf-8")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.request(**request_kwargs)

            elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms

            # Parse response body
            response_body: Any
            try:
                response_body = response.json()
            except Exception:
                response_body = response.text

            response_headers = dict(response.headers)

            output = {
                "http_status": response.status_code,
                "http_url": url,
                "http_method": method,
                "response_body": response_body,
                "response_headers": response_headers,
                "duration_ms": elapsed_ms,
            }

            if response.is_success:
                return NodeResult(
                    action=NodeResultAction.ADVANCE,
                    output=output,
                    duration_ms=elapsed_ms,
                    event_type="http_request_succeeded",
                    event_payload={"url": url, "method": method, "status": response.status_code},
                )
            else:
                return NodeResult(
                    action=NodeResultAction.FAIL,
                    output=output,
                    duration_ms=elapsed_ms,
                    error=f"HTTP {response.status_code}: {response_body if isinstance(response_body, str) else json_module.dumps(response_body)[:500]}",
                )

        except httpx.TimeoutException:
            elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms
            return NodeResult(
                action=NodeResultAction.FAIL,
                duration_ms=elapsed_ms,
                error=f"HTTP request timed out after {timeout_seconds}s: {url}",
            )
        except httpx.ConnectError as e:
            elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms
            return NodeResult(
                action=NodeResultAction.FAIL,
                duration_ms=elapsed_ms,
                error=f"HTTP connection error: {e}",
            )
        except Exception as e:
            elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms
            logger.exception("HttpRequestExecutor unexpected error: %s", e)
            return NodeResult(
                action=NodeResultAction.FAIL,
                duration_ms=elapsed_ms,
                error=f"HTTP request failed: {e}",
            )


# ---------------------------------------------------------------------------
# Outgoing webhook node
# ---------------------------------------------------------------------------

class OutgoingWebhookExecutor(NodeExecutor):
    node_type = "outgoing_webhook"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, _ = _extract_context(context, lead_data, channel_state)
        start_ms = time.monotonic_ns() // 1_000_000

        url = config.get("url", "")
        secret_ref = config.get("secret_ref", "")
        timeout_ms = config.get("timeout_ms", 10000)
        custom_headers = dict(config.get("custom_headers", {}))

        if not url:
            return NodeResult(
                action=NodeResultAction.FAIL,
                error="Outgoing webhook has no URL configured",
            )

        # Build webhook payload with lead data and event context
        timestamp = str(int(time.time()))
        payload: dict[str, Any] = {
            "lead": ld,
            "event": {
                "type": config.get("event_types", []),
                "timestamp": timestamp,
            },
        }
        # Include execution context vars if available
        if isinstance(ctx, ExecutionContext):
            payload["vars"] = ctx.vars
            payload["node_outputs"] = ctx.node_outputs

        payload_bytes = json_module.dumps(payload, default=str).encode("utf-8")

        # Build headers
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "X-Webhook-Timestamp": timestamp,
        }
        headers.update(custom_headers)

        # HMAC-SHA256 signature
        if secret_ref:
            signature = hmac.new(
                secret_ref.encode("utf-8"),
                payload_bytes,
                hashlib.sha256,
            ).hexdigest()
            headers["X-Webhook-Signature"] = signature

        timeout_seconds = timeout_ms / 1000.0

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    content=payload_bytes,
                    headers=headers,
                    timeout=timeout_seconds,
                )

            elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms

            # Parse response body
            response_body: Any
            try:
                response_body = response.json()
            except Exception:
                response_body = response.text

            output = {
                "webhook_sent": True,
                "url": url,
                "http_status": response.status_code,
                "response_body": response_body,
                "duration_ms": elapsed_ms,
            }

            if response.is_success:
                return NodeResult(
                    action=NodeResultAction.ADVANCE,
                    output=output,
                    duration_ms=elapsed_ms,
                    event_type="outgoing_webhook_sent",
                    event_payload={"url": url, "status": response.status_code},
                )
            else:
                return NodeResult(
                    action=NodeResultAction.FAIL,
                    output=output,
                    duration_ms=elapsed_ms,
                    error=f"Webhook returned HTTP {response.status_code}",
                )

        except httpx.TimeoutException:
            elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms
            return NodeResult(
                action=NodeResultAction.FAIL,
                duration_ms=elapsed_ms,
                error=f"Webhook timed out after {timeout_ms}ms: {url}",
            )
        except httpx.ConnectError as e:
            elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms
            return NodeResult(
                action=NodeResultAction.FAIL,
                duration_ms=elapsed_ms,
                error=f"Webhook connection error: {e}",
            )
        except Exception as e:
            elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms
            logger.exception("OutgoingWebhookExecutor unexpected error: %s", e)
            return NodeResult(
                action=NodeResultAction.FAIL,
                duration_ms=elapsed_ms,
                error=f"Webhook failed: {e}",
            )


# ---------------------------------------------------------------------------
# AI nodes
# ---------------------------------------------------------------------------

class AiGenerateMessageExecutor(NodeExecutor):
    node_type = "ai_generate_message"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, cs = _extract_context(context, lead_data, channel_state)

        prompt_template = config.get("prompt_template", "")
        system_prompt = config.get("system_prompt", "You are a helpful email writing assistant.")
        max_tokens = config.get("max_tokens", 500)
        model_ref = config.get("model_ref", "")
        fallback_text = config.get("fallback_text", "")

        # Render variables in prompt template
        user_prompt = prompt_template
        if isinstance(ctx, ExecutionContext):
            for key, value in ctx.lead.items():
                user_prompt = user_prompt.replace(f"{{{{{key}}}}}", str(value or ""))
            for key, value in ctx.vars.items():
                user_prompt = user_prompt.replace(f"{{{{{key}}}}}", str(value or ""))

        if not user_prompt:
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={"generated_text": fallback_text or "", "model_used": "none"},
            )

        try:
            from app.utils.openrouter_client import chat_completion
            response = await chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                model=model_ref or None,
                max_tokens=max_tokens,
            )

            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "generated_text": response,
                    "model_used": model_ref or "default",
                    "tokens_used": 0,
                    "cost_cents": 0,
                },
            )
        except Exception as e:
            logger.warning("AI generate failed: %s", e)
            if fallback_text:
                return NodeResult(
                    action=NodeResultAction.ADVANCE,
                    output={"generated_text": fallback_text, "model_used": "fallback", "error": str(e)},
                )
            return NodeResult(action=NodeResultAction.FAIL, error=f"AI generation failed: {e}")


class AiClassifyReplyExecutor(NodeExecutor):
    node_type = "ai_classify_reply"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, cs = _extract_context(context, lead_data, channel_state)

        labels = config.get("labels", ["interested", "not_interested", "other"])
        label_descriptions = config.get("label_descriptions", {})
        confidence_threshold = config.get("confidence_threshold", 0.5)
        fallback_label = config.get("fallback_label", "other")
        model_ref = config.get("model_ref", "")

        # Get the reply text to classify from context
        reply_text = ""
        if isinstance(ctx, ExecutionContext):
            # Look in node_outputs for the most recent reply data
            for nid, outputs in ctx.node_outputs.items():
                if "reply_text" in outputs:
                    reply_text = outputs["reply_text"]
                elif "body" in outputs:
                    reply_text = outputs["body"]
            # Also check vars
            reply_text = reply_text or ctx.vars.get("reply_text", "")

        if not reply_text:
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={"label": fallback_label, "confidence": 0.0, "reason": "No reply text found"},
            )

        # Build classification prompt
        label_desc_lines = "\n".join(
            f"- {label}: {label_descriptions.get(label, 'No description')}"
            for label in labels
        )

        system_prompt = (
            "You are an email reply classifier. Classify the following email reply into exactly one category.\n"
            f"Available categories:\n{label_desc_lines}\n\n"
            'Respond ONLY with valid JSON: {"label": "<category>", "confidence": <0.0-1.0>}'
        )

        try:
            from app.utils.openrouter_client import chat_completion
            import json

            response = await chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Email reply to classify:\n\n{reply_text[:2000]}"},
                ],
                model=model_ref or None,
            )

            try:
                parsed = json.loads(response)
                label = parsed.get("label", fallback_label)
                confidence = float(parsed.get("confidence", 0.0))
            except (json.JSONDecodeError, ValueError):
                label = fallback_label
                confidence = 0.0

            # Validate label
            if label not in labels:
                label = fallback_label
                confidence = 0.0

            # Apply confidence threshold
            if confidence < confidence_threshold:
                label = fallback_label

            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "label": label,
                    "confidence": confidence,
                    "available_labels": labels,
                },
                event_type="ai_classified",
                event_payload={"label": label, "confidence": confidence},
            )
        except Exception as e:
            logger.warning("AI classify failed: %s", e)
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={"label": fallback_label, "confidence": 0.0, "error": str(e)},
            )


class AiExtractFieldsExecutor(NodeExecutor):
    node_type = "ai_extract_fields"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, cs = _extract_context(context, lead_data, channel_state)

        fields = config.get("fields", [])
        field_descriptions = config.get("field_descriptions", {})
        field_types = config.get("field_types", {})
        model_ref = config.get("model_ref", "")

        if not fields:
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={"extracted": {}, "fields_requested": []},
            )

        # Get text to extract from — look in context
        source_text = ""
        if isinstance(ctx, ExecutionContext):
            for nid, outputs in ctx.node_outputs.items():
                if "reply_text" in outputs:
                    source_text = outputs["reply_text"]
                elif "body" in outputs:
                    source_text = outputs["body"]
                elif "generated_text" in outputs:
                    source_text = outputs["generated_text"]
            source_text = source_text or ctx.vars.get("source_text", "")

        if not source_text:
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "extracted": {f: None for f in fields},
                    "fields_requested": fields,
                    "reason": "No source text found",
                },
            )

        # Build extraction prompt
        field_lines = []
        for f in fields:
            desc = field_descriptions.get(f, "")
            ftype = field_types.get(f, "string")
            field_lines.append(f'- "{f}" (type: {ftype}){": " + desc if desc else ""}')

        system_prompt = (
            "You are a data extraction assistant. Extract the following fields from the provided text.\n"
            f"Fields to extract:\n" + "\n".join(field_lines) + "\n\n"
            "Respond ONLY with valid JSON containing the extracted fields. "
            "Use null for fields that cannot be found."
        )

        try:
            from app.utils.openrouter_client import chat_completion
            import json

            response = await chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Text to extract from:\n\n{source_text[:3000]}"},
                ],
                model=model_ref or None,
            )

            try:
                extracted = json.loads(response)
                # Only keep requested fields
                extracted = {f: extracted.get(f) for f in fields}
            except (json.JSONDecodeError, ValueError):
                extracted = {f: None for f in fields}

            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "extracted": extracted,
                    "fields_requested": fields,
                    "fields_found": sum(1 for v in extracted.values() if v is not None),
                },
            )
        except Exception as e:
            logger.warning("AI extract fields failed: %s", e)
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "extracted": {f: None for f in fields},
                    "fields_requested": fields,
                    "error": str(e),
                },
            )


class AiDecisionExecutor(NodeExecutor):
    node_type = "ai_decision"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        ctx, ld, cs = _extract_context(context, lead_data, channel_state)

        prompt_template = config.get("prompt_template", "")
        system_prompt = config.get("system_prompt", "You are a decision-making assistant.")
        branch_labels = config.get("branch_labels", [])
        confidence_threshold = config.get("confidence_threshold", 0.5)
        model_ref = config.get("model_ref", "")
        max_tokens = config.get("max_tokens", 500)

        if not branch_labels:
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "decision_label": "default",
                    "confidence": 0.0,
                    "condition_met": False,
                    "branch_labels": [],
                },
            )

        # Render variables in prompt template
        user_prompt = prompt_template
        if isinstance(ctx, ExecutionContext):
            for key, value in ctx.lead.items():
                user_prompt = user_prompt.replace(f"{{{{{key}}}}}", str(value or ""))
            for key, value in ctx.vars.items():
                user_prompt = user_prompt.replace(f"{{{{{key}}}}}", str(value or ""))

        if not user_prompt:
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "decision_label": branch_labels[0] if branch_labels else "default",
                    "confidence": 0.0,
                    "condition_met": False,
                    "branch_labels": branch_labels,
                },
            )

        branch_list = ", ".join(f'"{b}"' for b in branch_labels)
        full_system_prompt = (
            f"{system_prompt}\n\n"
            f"You must choose exactly one of these branches: {branch_list}\n\n"
            'Respond ONLY with valid JSON: {"decision": "<branch>", "confidence": <0.0-1.0>, "reasoning": "<brief reason>"}'
        )

        try:
            from app.utils.openrouter_client import chat_completion
            import json

            response = await chat_completion(
                messages=[
                    {"role": "system", "content": full_system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                model=model_ref or None,
                max_tokens=max_tokens,
            )

            try:
                parsed = json.loads(response)
                decision = parsed.get("decision", "")
                confidence = float(parsed.get("confidence", 0.0))
                reasoning = parsed.get("reasoning", "")
            except (json.JSONDecodeError, ValueError):
                decision = branch_labels[0]
                confidence = 0.0
                reasoning = "Failed to parse AI response"

            # Validate decision
            if decision not in branch_labels:
                decision = branch_labels[0]
                confidence = 0.0

            # Apply confidence threshold
            condition_met = confidence >= confidence_threshold

            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "decision_label": decision,
                    "confidence": confidence,
                    "condition_met": condition_met,
                    "branch_labels": branch_labels,
                    "reasoning": reasoning,
                },
            )
        except Exception as e:
            logger.warning("AI decision failed: %s", e)
            return NodeResult(
                action=NodeResultAction.ADVANCE,
                output={
                    "decision_label": branch_labels[0] if branch_labels else "default",
                    "confidence": 0.0,
                    "condition_met": False,
                    "branch_labels": branch_labels,
                    "error": str(e),
                },
            )


# ---------------------------------------------------------------------------
# Collaboration nodes
# ---------------------------------------------------------------------------

class CreateTaskExecutor(NodeExecutor):
    node_type = "create_task"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        title = config.get("task_title", "")
        assignee = config.get("assignee_ref", "")
        return NodeResult(
            action=NodeResultAction.ADVANCE,
            output={"task_created": True, "title": title, "assignee": assignee},
        )


class ApprovalGateExecutor(NodeExecutor):
    node_type = "approval_gate"

    async def execute(self, config, context, lead_data=None, channel_state=None, node_meta=None) -> NodeResult:
        timeout_hours = config.get("timeout_hours", 24)
        deadline = datetime.now(timezone.utc) + timedelta(hours=timeout_hours)
        return NodeResult(
            action=NodeResultAction.WAIT_FOR_EVENT,
            next_run_at=deadline,
            output={"approval_required": True, "timeout_hours": timeout_hours},
        )
