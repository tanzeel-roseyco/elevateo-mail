"""Auto-responder service — config, region matching, guardrails, and queue management."""

import json
import logging
from uuid import UUID
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, cast, Date

from app.models.auto_responder import (
    AutoResponderConfig, ResponderRegion, ResponderRule, ResponderNote, ResponderLog,
)
from app.models.inbox_message import InboxMessage
from app.models.lead import Lead
from app.models.suppression import Suppression
from app.utils.encryption import encrypt, decrypt

logger = logging.getLogger(__name__)

# Opt-out keywords that should prevent auto-response
OPT_OUT_KEYWORDS = [
    "unsubscribe", "opt out", "opt-out", "stop emailing", "remove me",
    "do not contact", "take me off", "no more emails",
]


class AutoResponderService:

    # ---- Config ----

    async def get_or_create_config(self, db: AsyncSession, workspace_id: UUID) -> AutoResponderConfig:
        result = await db.execute(
            select(AutoResponderConfig).where(AutoResponderConfig.workspace_id == workspace_id)
        )
        config = result.scalar_one_or_none()
        if config:
            return config

        config = AutoResponderConfig(workspace_id=workspace_id)
        db.add(config)
        await db.flush()
        return config

    async def update_config(self, db: AsyncSession, workspace_id: UUID, data: dict) -> AutoResponderConfig:
        config = await self.get_or_create_config(db, workspace_id)

        # Handle API key encryption
        if "ai_api_key" in data and data["ai_api_key"]:
            config.ai_api_key_encrypted = encrypt(data.pop("ai_api_key"))
        elif "ai_api_key" in data:
            data.pop("ai_api_key")

        for key, value in data.items():
            if hasattr(config, key) and value is not None:
                setattr(config, key, value)

        await db.flush()
        return config

    def get_decrypted_api_key(self, config: AutoResponderConfig) -> str:
        """Get decrypted OpenRouter API key, falling back to env var."""
        if config.ai_api_key_encrypted:
            return decrypt(config.ai_api_key_encrypted)
        from app.config import get_settings
        return get_settings().OPENROUTER_API_KEY

    # ---- Region Matching ----

    async def list_regions(self, db: AsyncSession, workspace_id: UUID) -> list[ResponderRegion]:
        result = await db.execute(
            select(ResponderRegion)
            .where(ResponderRegion.workspace_id == workspace_id)
            .order_by(ResponderRegion.priority.desc())
        )
        return list(result.scalars().all())

    async def create_region(self, db: AsyncSession, workspace_id: UUID, data: dict) -> ResponderRegion:
        region = ResponderRegion(workspace_id=workspace_id, **data)
        db.add(region)
        await db.flush()
        return region

    async def update_region(self, db: AsyncSession, region_id: UUID, workspace_id: UUID, data: dict) -> ResponderRegion | None:
        result = await db.execute(
            select(ResponderRegion).where(ResponderRegion.id == region_id, ResponderRegion.workspace_id == workspace_id)
        )
        region = result.scalar_one_or_none()
        if not region:
            return None
        for key, value in data.items():
            if hasattr(region, key) and value is not None:
                setattr(region, key, value)
        await db.flush()
        return region

    async def delete_region(self, db: AsyncSession, region_id: UUID, workspace_id: UUID) -> bool:
        result = await db.execute(
            select(ResponderRegion).where(ResponderRegion.id == region_id, ResponderRegion.workspace_id == workspace_id)
        )
        region = result.scalar_one_or_none()
        if not region:
            return False
        await db.delete(region)
        await db.flush()
        return True

    async def match_region(self, db: AsyncSession, workspace_id: UUID, lead: Lead) -> ResponderRegion | None:
        """Find the highest-priority active region whose conditions match the lead."""
        regions = await self.list_regions(db, workspace_id)
        for region in regions:
            if not region.is_active:
                continue
            if self.evaluate_region_conditions(lead, region.conditions):
                return region
        return None

    @staticmethod
    def evaluate_region_conditions(lead: Lead, conditions: dict) -> bool:
        """Evaluate region conditions against a lead's fields."""
        rules = conditions.get("rules", [])
        if not rules:
            return True  # No conditions = matches all

        match_all = conditions.get("match_all", True)
        results = []

        for rule in rules:
            field = rule.get("field", "")
            operator = rule.get("operator", "eq")
            target = rule.get("value", "")

            # Get field value from lead model or custom_fields
            field_value = getattr(lead, field, None)
            if field_value is None and lead.custom_fields:
                field_value = lead.custom_fields.get(field)

            if field_value is None:
                results.append(False)
                continue

            field_value_str = str(field_value).lower()
            matched = False

            if operator == "eq":
                matched = field_value_str == str(target).lower()
            elif operator == "neq":
                matched = field_value_str != str(target).lower()
            elif operator == "in":
                target_list = target if isinstance(target, list) else [target]
                matched = field_value_str in [str(t).lower() for t in target_list]
            elif operator == "not_in":
                target_list = target if isinstance(target, list) else [target]
                matched = field_value_str not in [str(t).lower() for t in target_list]
            elif operator == "contains":
                matched = str(target).lower() in field_value_str
            elif operator == "starts_with":
                matched = field_value_str.startswith(str(target).lower())

            results.append(matched)

        if match_all:
            return all(results)
        return any(results)

    # ---- Rules ----

    async def list_rules(self, db: AsyncSession, workspace_id: UUID) -> list[ResponderRule]:
        result = await db.execute(
            select(ResponderRule)
            .where(ResponderRule.workspace_id == workspace_id)
            .order_by(ResponderRule.priority.desc())
        )
        return list(result.scalars().all())

    async def create_rule(self, db: AsyncSession, workspace_id: UUID, data: dict) -> ResponderRule:
        rule = ResponderRule(workspace_id=workspace_id, **data)
        db.add(rule)
        await db.flush()
        return rule

    async def update_rule(self, db: AsyncSession, rule_id: UUID, workspace_id: UUID, data: dict) -> ResponderRule | None:
        result = await db.execute(
            select(ResponderRule).where(ResponderRule.id == rule_id, ResponderRule.workspace_id == workspace_id)
        )
        rule = result.scalar_one_or_none()
        if not rule:
            return None
        for key, value in data.items():
            if hasattr(rule, key) and value is not None:
                setattr(rule, key, value)
        await db.flush()
        return rule

    async def delete_rule(self, db: AsyncSession, rule_id: UUID, workspace_id: UUID) -> bool:
        result = await db.execute(
            select(ResponderRule).where(ResponderRule.id == rule_id, ResponderRule.workspace_id == workspace_id)
        )
        rule = result.scalar_one_or_none()
        if not rule:
            return False
        await db.delete(rule)
        await db.flush()
        return True

    async def match_rule(self, db: AsyncSession, workspace_id: UUID, campaign_id: UUID | None, region_id: UUID | None) -> ResponderRule | None:
        """Find the highest-priority active rule matching the campaign and region."""
        rules = await self.list_rules(db, workspace_id)
        for rule in rules:
            if not rule.is_active:
                continue
            # Campaign match: null rule matches all, or exact match
            if rule.campaign_id and campaign_id and rule.campaign_id != campaign_id:
                continue
            # Region match: null rule matches all, or exact match
            if rule.region_id and region_id and rule.region_id != region_id:
                continue
            return rule
        return None

    # ---- Notes ----

    async def list_notes(self, db: AsyncSession, workspace_id: UUID, inbox_message_id: UUID) -> list[ResponderNote]:
        result = await db.execute(
            select(ResponderNote)
            .where(ResponderNote.workspace_id == workspace_id, ResponderNote.inbox_message_id == inbox_message_id)
            .order_by(ResponderNote.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_note(self, db: AsyncSession, workspace_id: UUID, inbox_message_id: UUID, author_type: str, author_id: UUID | None, data: dict) -> ResponderNote:
        note = ResponderNote(
            workspace_id=workspace_id,
            inbox_message_id=inbox_message_id,
            author_type=author_type,
            author_id=author_id,
            **data,
        )
        db.add(note)
        await db.flush()
        return note

    async def delete_note(self, db: AsyncSession, note_id: UUID, workspace_id: UUID) -> bool:
        result = await db.execute(
            select(ResponderNote).where(ResponderNote.id == note_id, ResponderNote.workspace_id == workspace_id)
        )
        note = result.scalar_one_or_none()
        if not note:
            return False
        await db.delete(note)
        await db.flush()
        return True

    # ---- Rate Limiting ----

    async def check_rate_limit(self, db: AsyncSession, workspace_id: UUID, max_per_hour: int) -> bool:
        """Returns True if under the rate limit."""
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        count = (await db.execute(
            select(func.count()).where(
                ResponderLog.workspace_id == workspace_id,
                ResponderLog.status == "sent",
                ResponderLog.created_at >= one_hour_ago,
            )
        )).scalar() or 0
        return count < max_per_hour

    async def check_cooldown(self, db: AsyncSession, workspace_id: UUID, lead_id: UUID, cooldown_minutes: int) -> bool:
        """Returns True if the lead is NOT in cooldown (safe to respond)."""
        cooldown_start = datetime.now(timezone.utc) - timedelta(minutes=cooldown_minutes)
        count = (await db.execute(
            select(func.count()).where(
                ResponderLog.workspace_id == workspace_id,
                ResponderLog.lead_id == lead_id,
                ResponderLog.status == "sent",
                ResponderLog.created_at >= cooldown_start,
            )
        )).scalar() or 0
        return count == 0

    async def check_suppressed(self, db: AsyncSession, workspace_id: UUID, email: str) -> bool:
        """Returns True if the email is on the suppression list."""
        result = await db.execute(
            select(func.count()).where(
                Suppression.workspace_id == workspace_id,
                Suppression.email == email.lower(),
            )
        )
        return (result.scalar() or 0) > 0

    # ---- Opt-out Detection ----

    @staticmethod
    def detect_opt_out(message_body: str) -> bool:
        """Check if the inbound message contains opt-out keywords."""
        body_lower = (message_body or "").lower()
        return any(kw in body_lower for kw in OPT_OUT_KEYWORDS)

    # ---- Prompt Building ----

    def build_prompt(
        self,
        config: AutoResponderConfig,
        region: ResponderRegion | None,
        lead: Lead,
        conversation_history: list[InboxMessage],
        inbound_message: InboxMessage,
    ) -> tuple[str, str]:
        """Build system and user prompts for the AI model."""
        tone = (region.tone_override if region and region.tone_override else config.tone) or "professional"
        phrases = (region.example_phrases_override if region and region.example_phrases_override else config.example_phrases) or []
        forbidden = config.forbidden_words or []
        custom_prompt = (region.custom_system_prompt if region else None) or ""

        system_prompt = f"""You are an AI email assistant for {config.brand_description or 'a company'}.

Tone: {tone}
Language: {config.language}

Brand Guidelines:
- Example phrases to emulate: {json.dumps(phrases)}
- Words/phrases you must NEVER use: {json.dumps(forbidden)}
- Maximum response length: {config.max_response_length} characters

{custom_prompt}

Rules:
1. Respond naturally to the incoming email as a helpful representative.
2. Do not make up specific facts, pricing, or commitments unless provided in context.
3. If you are unsure how to respond or the message requires specialized handling, set confidence to a low value.
4. Keep the response concise and professional.
5. Do not include a subject line — only the body text.
6. Include a confidence score (0.0-1.0) indicating how well you can handle this message.

Respond in this JSON format:
{{"body": "your response text", "confidence": 0.85, "intent": "interested|not_interested|question|meeting_request|complaint|other"}}"""

        # Build conversation history text
        history_lines = []
        for msg in conversation_history[-10:]:  # Last 10 messages for context
            direction = "SENT" if msg.direction == "outbound" else "RECEIVED"
            history_lines.append(f"[{direction}] {msg.subject}\n{msg.body_text or '(no body)'}\n")

        history_text = "\n".join(history_lines) if history_lines else "(no previous messages)"

        user_prompt = f"""Lead Information:
- Name: {lead.first_name or ''} {lead.last_name or ''}
- Company: {lead.company or 'Unknown'}
- Title: {lead.title or 'Unknown'}
- Industry: {lead.industry or 'Unknown'}

Previous conversation:
{history_text}

New inbound message:
Subject: {inbound_message.subject}
Body: {inbound_message.body_text or inbound_message.body_html or '(empty)'}

Generate an appropriate response."""

        return system_prompt, user_prompt

    # ---- Guardrails ----

    def apply_guardrails(
        self,
        config: AutoResponderConfig,
        ai_response: dict,
        inbound_message: InboxMessage,
    ) -> tuple[bool, str | None]:
        """Apply guardrails to AI response. Returns (passed, reason_if_failed)."""

        # Confidence check
        confidence = ai_response.get("confidence", 0)
        if confidence < config.confidence_threshold:
            return False, f"Low confidence: {confidence:.2f} < {config.confidence_threshold:.2f}"

        # Forbidden words check
        body = ai_response.get("body", "")
        forbidden = config.forbidden_words or []
        for word in forbidden:
            if word.lower() in body.lower():
                return False, f"Forbidden word detected: {word}"

        # Escalation keywords in inbound message
        escalation_kws = config.escalation_keywords or []
        inbound_text = (inbound_message.body_text or "") + " " + (inbound_message.subject or "")
        inbound_lower = inbound_text.lower()
        for kw in escalation_kws:
            if kw.lower() in inbound_lower:
                return False, f"Escalation keyword detected in inbound: {kw}"

        # Response length check
        if len(body) > config.max_response_length * 2:
            return False, f"Response too long: {len(body)} chars (max {config.max_response_length * 2})"

        return True, None

    # ---- Queue ----

    async def get_queue(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        status: str | None = None,
        campaign_id: UUID | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[dict], int]:
        """Get paginated queue of messages with responder status."""
        base_where = [
            InboxMessage.workspace_id == workspace_id,
            InboxMessage.direction == "inbound",
            InboxMessage.is_auto_reply == False,
            InboxMessage.responder_status.isnot(None),
        ]

        if status:
            base_where.append(InboxMessage.responder_status == status)
        if campaign_id:
            base_where.append(InboxMessage.campaign_id == campaign_id)

        # Count
        total = (await db.execute(
            select(func.count()).where(*base_where)
        )).scalar() or 0

        # Fetch messages with lead info
        result = await db.execute(
            select(InboxMessage)
            .where(*base_where)
            .order_by(InboxMessage.received_at.desc())
            .offset(skip)
            .limit(limit)
        )
        messages = result.scalars().all()

        items = []
        for msg in messages:
            # Get lead name
            lead_name = None
            if msg.lead_id:
                lead_result = await db.execute(select(Lead).where(Lead.id == msg.lead_id))
                lead = lead_result.scalar_one_or_none()
                if lead:
                    lead_name = f"{lead.first_name or ''} {lead.last_name or ''}".strip() or None

            # Get responder log for this message
            log_result = await db.execute(
                select(ResponderLog).where(ResponderLog.inbox_message_id == msg.id).order_by(ResponderLog.created_at.desc()).limit(1)
            )
            log = log_result.scalar_one_or_none()

            items.append({
                "inbox_message_id": msg.id,
                "lead_email": msg.from_email,
                "lead_name": lead_name,
                "subject": msg.subject,
                "body_preview": (msg.body_text or "")[:200],
                "campaign_name": None,  # Could join campaign table if needed
                "region_name": None,
                "responder_status": msg.responder_status,
                "confidence_score": log.confidence_score if log else None,
                "generated_body": log.generated_body if log else None,
                "received_at": msg.received_at,
            })

        return items, total

    # ---- Logs ----

    async def create_log(self, db: AsyncSession, **kwargs) -> ResponderLog:
        log = ResponderLog(**kwargs)
        db.add(log)
        await db.flush()
        return log

    async def list_logs(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[ResponderLog], int]:
        base_where = [ResponderLog.workspace_id == workspace_id]
        if status:
            base_where.append(ResponderLog.status == status)

        total = (await db.execute(
            select(func.count()).where(*base_where)
        )).scalar() or 0

        result = await db.execute(
            select(ResponderLog)
            .where(*base_where)
            .order_by(ResponderLog.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    # ---- Analytics ----

    async def get_analytics_summary(self, db: AsyncSession, workspace_id: UUID, days: int = 30) -> dict:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        base_where = [
            ResponderLog.workspace_id == workspace_id,
            ResponderLog.created_at >= since,
        ]

        total = (await db.execute(select(func.count()).where(*base_where))).scalar() or 0
        responded = (await db.execute(select(func.count()).where(*base_where, ResponderLog.status == "sent"))).scalar() or 0
        escalated = (await db.execute(select(func.count()).where(*base_where, ResponderLog.status == "escalated"))).scalar() or 0
        skipped = (await db.execute(select(func.count()).where(*base_where, ResponderLog.status.in_(["skipped", "rejected"])))).scalar() or 0

        avg_confidence = (await db.execute(
            select(func.avg(ResponderLog.confidence_score)).where(*base_where, ResponderLog.confidence_score.isnot(None))
        )).scalar()

        avg_time = (await db.execute(
            select(func.avg(ResponderLog.processing_time_ms)).where(*base_where, ResponderLog.processing_time_ms.isnot(None))
        )).scalar()

        return {
            "total_processed": total,
            "total_responded": responded,
            "total_escalated": escalated,
            "total_skipped": skipped,
            "avg_confidence": round(avg_confidence, 3) if avg_confidence else None,
            "avg_response_time_ms": round(avg_time, 1) if avg_time else None,
            "escalation_rate": round(escalated / total, 3) if total > 0 else 0,
        }

    async def get_analytics_time_series(self, db: AsyncSession, workspace_id: UUID, days: int = 30) -> list[dict]:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        result = await db.execute(
            select(
                cast(ResponderLog.created_at, Date).label("date"),
                ResponderLog.status,
                func.count().label("count"),
            )
            .where(ResponderLog.workspace_id == workspace_id, ResponderLog.created_at >= since)
            .group_by(cast(ResponderLog.created_at, Date), ResponderLog.status)
            .order_by(cast(ResponderLog.created_at, Date))
        )

        date_map: dict[str, dict] = {}
        for row in result:
            d = str(row.date)
            if d not in date_map:
                date_map[d] = {"date": d, "responded": 0, "escalated": 0, "skipped": 0}
            if row.status == "sent":
                date_map[d]["responded"] = row.count
            elif row.status == "escalated":
                date_map[d]["escalated"] = row.count
            elif row.status in ("skipped", "rejected"):
                date_map[d]["skipped"] += row.count

        return list(date_map.values())

    async def get_analytics_regions(self, db: AsyncSession, workspace_id: UUID, days: int = 30) -> list[dict]:
        since = datetime.now(timezone.utc) - timedelta(days=days)

        result = await db.execute(
            select(
                ResponderLog.region_id,
                func.count().label("total"),
                func.avg(ResponderLog.confidence_score).label("avg_confidence"),
                func.count().filter(ResponderLog.status == "escalated").label("escalated"),
            )
            .where(
                ResponderLog.workspace_id == workspace_id,
                ResponderLog.created_at >= since,
                ResponderLog.region_id.isnot(None),
            )
            .group_by(ResponderLog.region_id)
        )

        stats = []
        for row in result:
            # Get region name
            region_result = await db.execute(select(ResponderRegion.name).where(ResponderRegion.id == row.region_id))
            name = region_result.scalar_one_or_none() or "Unknown"

            stats.append({
                "region_id": row.region_id,
                "region_name": name,
                "total_responses": row.total,
                "avg_confidence": round(row.avg_confidence, 3) if row.avg_confidence else None,
                "escalation_rate": round(row.escalated / row.total, 3) if row.total > 0 else 0,
            })

        return stats


auto_responder_service = AutoResponderService()
