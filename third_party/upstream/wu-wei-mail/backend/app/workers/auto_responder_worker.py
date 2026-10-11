"""Auto-responder worker — processes inbound messages and generates AI responses."""

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session_factory
from app.models.inbox_message import InboxMessage
from app.models.lead import Lead
from app.models.email_account import EmailAccount
from app.models.auto_responder import AutoResponderConfig, ResponderLog, ResponderNote
from app.models.suppression import Suppression
from app.services.auto_responder_service import auto_responder_service
from app.services.email_sender import email_sender
from app.services.inbox_service import inbox_service
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)
settings = get_settings()


@celery_app.task(name="app.workers.auto_responder_worker.process_auto_response")
def process_auto_response(inbox_message_id: str):
    """Process an inbound message and generate an AI auto-response."""
    asyncio.run(_process_auto_response_async(inbox_message_id))


@celery_app.task(name="app.workers.auto_responder_worker.retry_failed_responses")
def retry_failed_responses():
    """Retry messages stuck in 'pending' status."""
    asyncio.run(_retry_failed_async())


@celery_app.task(name="app.workers.auto_responder_worker.cleanup_old_logs")
def cleanup_old_logs():
    """Delete responder logs older than 90 days."""
    asyncio.run(_cleanup_logs_async())


async def _process_auto_response_async(inbox_message_id: str):
    async with async_session_factory() as db:
        try:
            start_time = time.monotonic()

            # ── 1. Load inbound message ──────────────────────────────────
            msg_result = await db.execute(
                select(InboxMessage).where(InboxMessage.id == uuid.UUID(inbox_message_id))
            )
            inbound = msg_result.scalar_one_or_none()
            if not inbound:
                logger.error("InboxMessage %s not found", inbox_message_id)
                return

            workspace_id = inbound.workspace_id

            # ── 2. Check config is enabled ───────────────────────────────
            config = await auto_responder_service.get_or_create_config(db, workspace_id)
            if not config.is_enabled:
                inbound.responder_status = "skipped"
                await db.commit()
                return

            # ── 3. Load lead ─────────────────────────────────────────────
            lead = None
            if inbound.lead_id:
                lead_result = await db.execute(
                    select(Lead).where(Lead.id == inbound.lead_id)
                )
                lead = lead_result.scalar_one_or_none()

            if not lead:
                logger.info("No lead found for message %s, skipping auto-response", inbox_message_id)
                inbound.responder_status = "skipped"
                await db.commit()
                return

            # ── 4. Check suppression ─────────────────────────────────────
            if await auto_responder_service.check_suppressed(db, workspace_id, lead.email):
                inbound.responder_status = "skipped"
                await db.commit()
                return

            # ── 5. Check opt-out keywords ────────────────────────────────
            if auto_responder_service.detect_opt_out(inbound.body_text or ""):
                # Add to suppression list
                suppression = Suppression(
                    workspace_id=workspace_id,
                    email=lead.email.lower(),
                    reason="opt_out_detected",
                )
                db.add(suppression)
                lead.status = "unsubscribed"
                inbound.responder_status = "escalated"

                await auto_responder_service.create_log(
                    db,
                    workspace_id=workspace_id,
                    inbox_message_id=inbound.id,
                    lead_id=lead.id,
                    campaign_id=inbound.campaign_id,
                    ai_model=config.ai_model,
                    generated_body="",
                    status="escalated",
                    escalation_reason="opt_out_detected",
                )
                await db.commit()
                return

            # ── 6. Check rate limit ──────────────────────────────────────
            if not await auto_responder_service.check_rate_limit(db, workspace_id, config.max_responses_per_hour):
                inbound.responder_status = "pending"
                await db.commit()
                # Re-queue with delay
                process_auto_response.apply_async(
                    args=[inbox_message_id],
                    countdown=60,
                )
                return

            # ── 7. Check cooldown ────────────────────────────────────────
            if not await auto_responder_service.check_cooldown(db, workspace_id, lead.id, config.cooldown_minutes):
                inbound.responder_status = "skipped"
                await db.commit()
                return

            # ── 8. Match region ──────────────────────────────────────────
            inbound.responder_status = "pending"
            await db.flush()

            region = await auto_responder_service.match_region(db, workspace_id, lead)

            # ── 9. Match rule ────────────────────────────────────────────
            rule = await auto_responder_service.match_rule(
                db, workspace_id, inbound.campaign_id, region.id if region else None
            )

            if rule:
                if rule.action == "skip":
                    inbound.responder_status = "skipped"
                    await db.commit()
                    return
                if rule.action == "escalate":
                    inbound.responder_status = "escalated"
                    await auto_responder_service.create_log(
                        db,
                        workspace_id=workspace_id,
                        inbox_message_id=inbound.id,
                        lead_id=lead.id,
                        campaign_id=inbound.campaign_id,
                        region_id=region.id if region else None,
                        rule_id=rule.id,
                        ai_model=config.ai_model,
                        generated_body="",
                        status="escalated",
                        escalation_reason="rule_action_escalate",
                    )
                    await db.commit()
                    return

            # ── 10. Get conversation history ─────────────────────────────
            conversation = []
            if inbound.thread_id:
                thread_result = await db.execute(
                    select(InboxMessage)
                    .where(
                        InboxMessage.workspace_id == workspace_id,
                        InboxMessage.thread_id == inbound.thread_id,
                    )
                    .order_by(InboxMessage.received_at.asc())
                )
                conversation = list(thread_result.scalars().all())

            # ── 11. Build prompt ─────────────────────────────────────────
            system_prompt, user_prompt = auto_responder_service.build_prompt(
                config, region, lead, conversation, inbound
            )

            # ── 12. Call AI via OpenRouter ────────────────────────────────
            api_key = auto_responder_service.get_decrypted_api_key(config)
            if not api_key:
                logger.error("No OpenRouter API key configured for workspace %s", workspace_id)
                inbound.responder_status = "skipped"
                await db.commit()
                return

            from app.services.ai_provider import generate_response

            ai_response = await generate_response(
                api_key=api_key,
                model=config.ai_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
            )

            # ── 13. Apply guardrails ─────────────────────────────────────
            passed, reason = auto_responder_service.apply_guardrails(config, ai_response, inbound)

            processing_ms = int((time.monotonic() - start_time) * 1000)

            if not passed:
                # Escalate
                inbound.responder_status = "escalated"
                await auto_responder_service.create_log(
                    db,
                    workspace_id=workspace_id,
                    inbox_message_id=inbound.id,
                    lead_id=lead.id,
                    campaign_id=inbound.campaign_id,
                    region_id=region.id if region else None,
                    rule_id=rule.id if rule else None,
                    ai_model=config.ai_model,
                    prompt_tokens=ai_response.get("prompt_tokens"),
                    completion_tokens=ai_response.get("completion_tokens"),
                    generated_body=ai_response.get("body", ""),
                    confidence_score=ai_response.get("confidence"),
                    status="escalated",
                    escalation_reason=reason,
                    processing_time_ms=processing_ms,
                )
                await db.commit()
                return

            # ── 14. Select account to send from ──────────────────────────
            account_result = await db.execute(
                select(EmailAccount).where(EmailAccount.id == inbound.account_id)
            )
            account = account_result.scalar_one_or_none()

            if not account or not account.is_active:
                logger.error("Sending account %s not available", inbound.account_id)
                inbound.responder_status = "skipped"
                await db.commit()
                return

            # ── 15. Send the response ────────────────────────────────────
            response_body = ai_response["body"]
            if config.signature_template:
                response_body += f"\n\n{config.signature_template}"

            message_id = await email_sender.send(
                to=inbound.from_email,
                subject=f"Re: {inbound.subject}",
                body=response_body,
                account=account,
                in_reply_to=inbound.message_id,
                html=False,
            )

            # ── 16. Create outbound InboxMessage ─────────────────────────
            outbound = InboxMessage(
                workspace_id=workspace_id,
                account_id=account.id,
                campaign_id=inbound.campaign_id,
                lead_id=lead.id,
                message_id=message_id,
                in_reply_to=inbound.message_id,
                thread_id=inbound.thread_id,
                from_email=account.email,
                to_email=inbound.from_email,
                subject=f"Re: {inbound.subject}",
                body_text=response_body,
                direction="outbound",
                is_read=True,
                is_auto_reply=True,
            )
            db.add(outbound)
            await db.flush()

            # ── 17. Create log + note ────────────────────────────────────
            inbound.responder_status = "responded"

            await auto_responder_service.create_log(
                db,
                workspace_id=workspace_id,
                inbox_message_id=inbound.id,
                response_message_id=outbound.id,
                lead_id=lead.id,
                campaign_id=inbound.campaign_id,
                region_id=region.id if region else None,
                rule_id=rule.id if rule else None,
                ai_model=config.ai_model,
                prompt_tokens=ai_response.get("prompt_tokens"),
                completion_tokens=ai_response.get("completion_tokens"),
                generated_body=ai_response["body"],
                confidence_score=ai_response.get("confidence"),
                status="sent",
                processing_time_ms=processing_ms,
                sent_at=datetime.now(timezone.utc),
            )

            # AI intent classification note
            intent = ai_response.get("intent", "other")
            note = ResponderNote(
                workspace_id=workspace_id,
                inbox_message_id=inbound.id,
                author_type="ai",
                content=f"Intent: {intent} | Confidence: {ai_response.get('confidence', 0):.2f}",
                note_type="intent_classification",
            )
            db.add(note)

            await db.commit()

            logger.info(
                "Auto-responded to %s (confidence=%.2f, intent=%s)",
                inbound.from_email, ai_response.get("confidence", 0), intent,
            )

        except ConnectionError as e:
            logger.error("SMTP send failed for auto-response to %s: %s", inbox_message_id, str(e))
            await db.rollback()
        except Exception as e:
            logger.exception("Auto-responder error for message %s: %s", inbox_message_id, str(e))
            await db.rollback()


async def _retry_failed_async():
    """Retry messages stuck in 'pending' responder_status."""
    async with async_session_factory() as db:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
            result = await db.execute(
                select(InboxMessage)
                .where(
                    InboxMessage.responder_status == "pending",
                    InboxMessage.received_at < cutoff,
                )
                .limit(20)
            )
            messages = result.scalars().all()
            for msg in messages:
                process_auto_response.delay(str(msg.id))
            if messages:
                logger.info("Re-queued %d pending auto-response messages", len(messages))
        except Exception as e:
            logger.exception("Error retrying failed auto-responses: %s", str(e))


async def _cleanup_logs_async():
    """Delete responder logs older than 90 days."""
    async with async_session_factory() as db:
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=90)
            from sqlalchemy import delete
            result = await db.execute(
                delete(ResponderLog).where(ResponderLog.created_at < cutoff)
            )
            await db.commit()
            logger.info("Cleaned up %d old responder logs", result.rowcount)
        except Exception as e:
            logger.exception("Error cleaning up responder logs: %s", str(e))
