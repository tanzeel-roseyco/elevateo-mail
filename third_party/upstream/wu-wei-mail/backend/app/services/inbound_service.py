"""Inbound email processing service — handles incoming replies and webhooks."""

import hashlib
import logging
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.inbox_message import InboxMessage
from app.models.email_account import EmailAccount
from app.models.lead import Lead
from app.models.sent_email import SentEmail
from app.models.email_event import EmailEvent
from app.models.campaign import Campaign, CampaignLead

logger = logging.getLogger(__name__)


class InboundService:
    @staticmethod
    def _normalize_message_ref(value: str | None) -> str | None:
        if not value:
            return None
        token = str(value).strip()
        if not token:
            return None
        if token.startswith("<") and token.endswith(">"):
            return token
        if "@" in token and not token.startswith("<"):
            return f"<{token}>"
        return token

    @staticmethod
    def _message_ref_candidates(raw_email: dict) -> list[str]:
        """Collect normalized message reference candidates for correlation."""
        refs = []
        headers = raw_email.get("headers", {}) or {}
        if isinstance(headers, dict):
            header_reply = headers.get("in-reply-to") or headers.get("In-Reply-To")
            header_refs = headers.get("references") or headers.get("References")
            if header_reply:
                refs.append(header_reply)
            if header_refs:
                refs.extend(str(header_refs).split())

        refs.extend(
            [
                raw_email.get("in_reply_to"),
                raw_email.get("in_reply_to_message_id"),
                raw_email.get("provider_in_reply_to"),
                raw_email.get("graph_in_reply_to"),
            ]
        )
        normalized = []
        seen = set()
        for ref in refs:
            token = InboundService._normalize_message_ref(ref)
            if not token:
                continue
            variants = [token]
            if token.startswith("<") and token.endswith(">"):
                variants.append(token[1:-1])
            else:
                variants.append(f"<{token}>")
            for candidate in variants:
                if candidate not in seen:
                    seen.add(candidate)
                    normalized.append(candidate)
        return normalized

    async def process_inbound(self, db: AsyncSession, raw_email: dict) -> InboxMessage:
        """Process a raw inbound email and store as InboxMessage.

        Expected raw_email dict keys:
            - from_email: str
            - to_email: str
            - subject: str
            - body_text: str (optional)
            - body_html: str (optional)
            - message_id: str (optional, SMTP Message-ID)
            - in_reply_to: str (optional, SMTP In-Reply-To header)
        """
        from_email = raw_email.get("from_email", "").strip().lower()
        to_email = raw_email.get("to_email", "").strip().lower()
        subject = raw_email.get("subject", "(no subject)")
        body_text = raw_email.get("body_text")
        body_html = raw_email.get("body_html")
        message_id = raw_email.get("message_id")
        in_reply_to = self._normalize_message_ref(raw_email.get("in_reply_to"))
        message_ref_candidates = self._message_ref_candidates(raw_email)

        if not from_email or not to_email:
            raise ValueError("from_email and to_email are required")

        # 1. Find matching account by to_email (deterministic: prefer active, most recent)
        account_result = await db.execute(
            select(EmailAccount)
            .where(EmailAccount.email == to_email, EmailAccount.is_active.is_(True))
            .order_by(EmailAccount.updated_at.desc())
            .limit(1)
        )
        account = account_result.scalar_one_or_none()

        if not account:
            # Fallback: include inactive accounts
            account_result = await db.execute(
                select(EmailAccount)
                .where(EmailAccount.email == to_email)
                .order_by(EmailAccount.updated_at.desc())
                .limit(1)
            )
            account = account_result.scalar_one_or_none()

        if not account:
            raise ValueError(f"No email account found for {to_email}")

        workspace_id = account.workspace_id

        # 2. Find matching lead by from_email
        lead_result = await db.execute(
            select(Lead).where(
                Lead.workspace_id == workspace_id,
                Lead.email == from_email,
            )
        )
        lead = lead_result.scalar_one_or_none()

        # 3. Generate/find thread_id based on subject and lead
        thread_id = await self._resolve_thread_id(
            db, workspace_id, subject, from_email, message_ref_candidates
        )

        # 4. Find matching sent_email (for reply tracking)
        sent_email = None
        campaign_id = None

        for ref in message_ref_candidates:
            sent_result = await db.execute(select(SentEmail).where(SentEmail.message_id == ref))
            sent_email = sent_result.scalar_one_or_none()
            if sent_email:
                break

        # Avoid risky synthetic fallback for Microsoft unless we have explicit message refs.
        if not sent_email and lead and account.provider != "microsoft":
            # Fallback: find the most recent sent email to this lead
            sent_result = await db.execute(
                select(SentEmail)
                .where(
                    SentEmail.to_email == from_email,
                    SentEmail.account_id == account.id,
                )
                .order_by(SentEmail.sent_at.desc())
                .limit(1)
            )
            sent_email = sent_result.scalar_one_or_none()

        if sent_email:
            campaign_id = sent_email.campaign_id

        # 5. Detect auto-reply
        is_auto_reply = self._detect_auto_reply(subject, raw_email)

        # 6. Create InboxMessage record
        inbox_message = InboxMessage(
            workspace_id=workspace_id,
            account_id=account.id,
            campaign_id=campaign_id,
            lead_id=lead.id if lead else None,
            message_id=message_id,
            in_reply_to=in_reply_to,
            thread_id=thread_id,
            from_email=from_email,
            to_email=to_email,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            direction="inbound",
            is_read=False,
            is_auto_reply=is_auto_reply,
            received_at=datetime.now(timezone.utc),
        )
        db.add(inbox_message)
        await db.flush()

        # 7. If lead found, check if they're in any active campaigns
        #    and update CampaignLead status if stop_on_reply is enabled
        if lead and sent_email:
            await self._handle_campaign_reply(db, lead, sent_email, is_auto_reply)

        # 8. Create EmailEvent — bounce detection or reply
        is_bounce = sent_email and self._detect_bounce(subject, raw_email)
        if sent_email:
            if is_bounce:
                bounce_event = EmailEvent(
                    sent_email_id=sent_email.id,
                    event_type="bounce",
                    metadata_={
                        "inbox_message_id": str(inbox_message.id),
                        "source": "inbound_ndr",
                    },
                )
                db.add(bounce_event)
            else:
                reply_event = EmailEvent(
                    sent_email_id=sent_email.id,
                    event_type="reply",
                    metadata_={
                        "inbox_message_id": str(inbox_message.id),
                        "is_auto_reply": is_auto_reply,
                    },
                )
                db.add(reply_event)
            await db.flush()

        logger.info(
            f"Processed inbound email from={from_email} to={to_email} "
            f"thread={thread_id} campaign={campaign_id}"
        )

        # 9. Notify workflow event bus (reply → wake waiting leads)
        if sent_email and lead:
            try:
                from app.services.workflow.event_bus import workflow_event_bus
                await workflow_event_bus.on_email_reply(
                    db=db,
                    workspace_id=workspace_id,
                    lead_id=lead.id,
                    campaign_id=campaign_id,
                    event_data={
                        "inbox_message_id": str(inbox_message.id),
                        "from_email": from_email,
                        "subject": subject,
                        "is_auto_reply": is_auto_reply,
                    },
                )
            except Exception as e:
                logger.warning("Failed to notify workflow event bus: %s", str(e))

        # 10. Trigger auto-responder if applicable (skip bounces and auto-replies)
        if not is_auto_reply and not is_bounce and campaign_id:
            try:
                from app.workers.auto_responder_worker import process_auto_response
                process_auto_response.delay(str(inbox_message.id))
            except Exception as e:
                logger.warning("Failed to queue auto-response: %s", str(e))

        return inbox_message

    async def _resolve_thread_id(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        subject: str,
        from_email: str,
        message_ref_candidates: list[str],
    ) -> str:
        """Generate or find a thread_id for this message."""
        # If we have an in_reply_to, try to find the existing thread
        for in_reply_to in message_ref_candidates:
            existing = await db.execute(
                select(InboxMessage.thread_id).where(
                    InboxMessage.workspace_id == workspace_id,
                    InboxMessage.message_id == in_reply_to,
                )
            )
            row = existing.scalar_one_or_none()
            if row:
                return row

        # Also try matching by sent_email message_id
        for in_reply_to in message_ref_candidates:
            sent_result = await db.execute(
                select(SentEmail).where(SentEmail.message_id == in_reply_to)
            )
            sent = sent_result.scalar_one_or_none()
            if sent:
                # Check if there's already an inbox thread for this sent email
                existing_thread = await db.execute(
                    select(InboxMessage.thread_id).where(
                        InboxMessage.workspace_id == workspace_id,
                        InboxMessage.campaign_id == sent.campaign_id,
                        InboxMessage.from_email == from_email,
                    ).limit(1)
                )
                thread = existing_thread.scalar_one_or_none()
                if thread:
                    return thread

        # Generate a new thread_id based on normalized subject + from_email
        normalized_subject = self._normalize_subject(subject)
        raw = f"{workspace_id}:{from_email}:{normalized_subject}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    @staticmethod
    def _normalize_subject(subject: str) -> str:
        """Strip Re:/Fwd: prefixes for thread matching."""
        import re
        cleaned = re.sub(r"^(Re|Fwd|Fw)\s*:\s*", "", subject, flags=re.IGNORECASE)
        return cleaned.strip().lower()

    @staticmethod
    def _detect_auto_reply(subject: str, raw_email: dict) -> bool:
        """Detect if this is an auto-reply / out-of-office message."""
        auto_subjects = [
            "out of office",
            "automatic reply",
            "auto-reply",
            "autoreply",
            "away from office",
            "on vacation",
        ]
        subject_lower = subject.lower()
        for pattern in auto_subjects:
            if pattern in subject_lower:
                return True

        # Check for Auto-Submitted header
        headers = raw_email.get("headers", {})
        auto_submitted = headers.get("auto-submitted", "")
        if auto_submitted and auto_submitted.lower() != "no":
            return True

        return False

    @staticmethod
    def _detect_bounce(subject: str, raw_email: dict) -> bool:
        """Detect if this inbound message is a bounce/NDR notification."""
        bounce_subjects = [
            "delivery status notification",
            "undeliverable",
            "mail delivery failed",
            "returned mail",
            "delivery failure",
            "undelivered mail",
            "failure notice",
            "non-delivery report",
        ]
        subject_lower = subject.lower()
        for pattern in bounce_subjects:
            if pattern in subject_lower:
                return True

        # Check for DSN content type (multipart/report) or diagnostic headers
        content_type = raw_email.get("content_type", "")
        if "multipart/report" in content_type.lower():
            return True

        headers = raw_email.get("headers", {})
        # RFC 3464 DSN header
        if headers.get("x-failed-recipients"):
            return True
        # Some MTAs set this
        action = headers.get("action", "").lower()
        if action in ("failed", "delayed"):
            return True

        return False

    async def _handle_campaign_reply(
        self,
        db: AsyncSession,
        lead: Lead,
        sent_email: SentEmail,
        is_auto_reply: bool,
    ) -> None:
        """Update campaign lead status when a reply is received."""
        # Find the campaign
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.id == sent_email.campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()

        if not campaign:
            return

        # Check stop_on_reply / stop_on_auto_reply settings
        should_stop = False
        if campaign.stop_on_reply and not is_auto_reply:
            should_stop = True
        if campaign.stop_on_auto_reply and is_auto_reply:
            should_stop = True

        if should_stop:
            # Update CampaignLead status
            cl_result = await db.execute(
                select(CampaignLead).where(
                    CampaignLead.campaign_id == campaign.id,
                    CampaignLead.lead_id == lead.id,
                )
            )
            campaign_lead = cl_result.scalar_one_or_none()
            if campaign_lead:
                campaign_lead.status = "replied"
                await db.flush()

        # Update lead status to replied (regardless of campaign setting)
        if not is_auto_reply and lead.status == "active":
            lead.status = "replied"
            await db.flush()

    async def poll_imap(self, account_id: UUID) -> list[dict]:
        """Poll IMAP for new messages — not implemented.

        Webhook-based ingestion (e.g. SendGrid Inbound Parse, Mailgun routes)
        is the supported path for reply ingestion in v1. Direct IMAP polling
        is not yet implemented.
        """
        logger.warning(
            "poll_imap called for account %s, but IMAP polling is not implemented. "
            "Use webhook-based ingestion (InboundService.process_inbound) instead.",
            account_id,
        )
        return []


inbound_service = InboundService()
