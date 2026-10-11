"""Analytics service — dashboard stats, campaign metrics, A/B test results."""

from uuid import UUID
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.models.campaign import Campaign, CampaignLead
from app.models.sent_email import SentEmail
from app.models.email_event import EmailEvent
from app.models.lead import Lead
from app.models.variant import Variant
from app.services.ab_splitter import ab_splitter


class AnalyticsService:

    async def dashboard_stats(self, db: AsyncSession, workspace_id: UUID) -> dict:
        """Aggregate stats across all campaigns in a workspace."""
        # Total sent
        total_sent = (await db.execute(
            select(func.count()).select_from(SentEmail).join(Campaign).where(Campaign.workspace_id == workspace_id)
        )).scalar() or 0

        # Events by type
        events_query = (
            select(EmailEvent.event_type, func.count().label("cnt"))
            .select_from(EmailEvent)
            .join(SentEmail)
            .join(Campaign)
            .where(Campaign.workspace_id == workspace_id)
            .group_by(EmailEvent.event_type)
        )
        event_counts = {}
        for row in await db.execute(events_query):
            event_counts[row.event_type] = row.cnt

        total_opens = event_counts.get("open", 0)
        total_clicks = event_counts.get("click", 0)
        total_replies = event_counts.get("reply", 0)
        total_bounces = event_counts.get("bounce", 0)

        # Active campaigns
        active_campaigns = (await db.execute(
            select(func.count()).where(Campaign.workspace_id == workspace_id, Campaign.status == "active")
        )).scalar() or 0

        # Total leads
        total_leads = (await db.execute(
            select(func.count()).where(Lead.workspace_id == workspace_id)
        )).scalar() or 0

        # Emails sent today
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        emails_today = (await db.execute(
            select(func.count())
            .select_from(SentEmail)
            .join(Campaign)
            .where(Campaign.workspace_id == workspace_id, SentEmail.sent_at >= today_start)
        )).scalar() or 0

        return {
            "total_sent": total_sent,
            "total_opens": total_opens,
            "total_clicks": total_clicks,
            "total_replies": total_replies,
            "total_bounces": total_bounces,
            "open_rate": round(total_opens / max(total_sent, 1) * 100, 2),
            "click_rate": round(total_clicks / max(total_sent, 1) * 100, 2),
            "reply_rate": round(total_replies / max(total_sent, 1) * 100, 2),
            "bounce_rate": round(total_bounces / max(total_sent, 1) * 100, 2),
            "active_campaigns": active_campaigns,
            "total_leads": total_leads,
            "emails_today": emails_today,
        }

    async def campaign_stats(self, db: AsyncSession, campaign_id: UUID, workspace_id: UUID = None) -> dict:
        """Stats for a single campaign."""
        query = select(Campaign).where(Campaign.id == campaign_id)
        if workspace_id:
            query = query.where(Campaign.workspace_id == workspace_id)
        campaign = (await db.execute(query)).scalar_one_or_none()
        if not campaign:
            raise ValueError("Campaign not found")

        total_leads = (await db.execute(
            select(func.count()).where(CampaignLead.campaign_id == campaign_id)
        )).scalar() or 0

        total_sent = (await db.execute(
            select(func.count()).where(SentEmail.campaign_id == campaign_id)
        )).scalar() or 0

        events_query = (
            select(EmailEvent.event_type, func.count().label("cnt"))
            .select_from(EmailEvent)
            .join(SentEmail)
            .where(SentEmail.campaign_id == campaign_id)
            .group_by(EmailEvent.event_type)
        )
        event_counts = {}
        for row in await db.execute(events_query):
            event_counts[row.event_type] = row.cnt

        total_opens = event_counts.get("open", 0)
        total_clicks = event_counts.get("click", 0)
        total_replies = event_counts.get("reply", 0)
        total_bounces = event_counts.get("bounce", 0)

        return {
            "campaign_id": str(campaign.id),
            "campaign_name": campaign.name,
            "status": campaign.status,
            "total_leads": total_leads,
            "total_sent": total_sent,
            "total_opens": total_opens,
            "total_clicks": total_clicks,
            "total_replies": total_replies,
            "total_bounces": total_bounces,
            "open_rate": round(total_opens / max(total_sent, 1) * 100, 2),
            "click_rate": round(total_clicks / max(total_sent, 1) * 100, 2),
            "reply_rate": round(total_replies / max(total_sent, 1) * 100, 2),
            "bounce_rate": round(total_bounces / max(total_sent, 1) * 100, 2),
        }

    async def ab_test_results(self, db: AsyncSession, step_id: UUID, workspace_id: UUID = None) -> dict:
        """Get A/B test results for a step's variants."""
        if workspace_id:
            from app.models.step import Step
            from app.models.sequence import Sequence
            ownership_check = await db.execute(
                select(Step.id)
                .join(Sequence, Step.sequence_id == Sequence.id)
                .join(Campaign, Sequence.campaign_id == Campaign.id)
                .where(Step.id == step_id, Campaign.workspace_id == workspace_id)
            )
            if not ownership_check.scalar_one_or_none():
                return {"step_id": str(step_id), "variants": [], "winner": None, "confidence": 0, "is_significant": False}
        result = await db.execute(select(Variant).where(Variant.step_id == step_id))
        variants = list(result.scalars().all())

        if len(variants) < 2:
            return {"step_id": str(step_id), "variants": [], "winner": None, "confidence": 0, "is_significant": False}

        variant_stats = []
        for v in variants:
            variant_stats.append({
                "variant_id": str(v.id),
                "variant_name": v.name,
                "sent_count": v.sent_count,
                "open_count": v.open_count,
                "click_count": v.click_count,
                "reply_count": v.reply_count,
                "bounce_count": v.bounce_count,
                "open_rate": round(v.open_count / max(v.sent_count, 1) * 100, 2),
                "click_rate": round(v.click_count / max(v.sent_count, 1) * 100, 2),
                "reply_rate": round(v.reply_count / max(v.sent_count, 1) * 100, 2),
            })

        # Calculate significance for reply rate (primary metric)
        if len(variants) >= 2:
            sig = ab_splitter.calculate_significance(
                {"sent_count": variants[0].sent_count, "metric_count": variants[0].reply_count},
                {"sent_count": variants[1].sent_count, "metric_count": variants[1].reply_count},
            )
        else:
            sig = {"winner": "neither", "confidence": 0, "is_significant": False}

        return {
            "step_id": str(step_id),
            "variants": variant_stats,
            "winner": sig.get("winner"),
            "confidence": sig.get("confidence", 0),
            "is_significant": sig.get("is_significant", False),
        }


    async def recent_activity(self, db: AsyncSession, workspace_id: UUID, limit: int = 20) -> list[dict]:
        """Latest email events across all campaigns."""
        query = (
            select(EmailEvent, SentEmail, Campaign, Lead)
            .select_from(EmailEvent)
            .join(SentEmail, EmailEvent.sent_email_id == SentEmail.id)
            .join(Campaign, SentEmail.campaign_id == Campaign.id)
            .outerjoin(Lead, SentEmail.lead_id == Lead.id)
            .where(Campaign.workspace_id == workspace_id)
            .order_by(EmailEvent.occurred_at.desc())
            .limit(limit)
        )
        result = await db.execute(query)
        items = []
        for event, sent, campaign, lead in result:
            items.append({
                "id": str(event.id),
                "campaign_name": campaign.name,
                "event_type": event.event_type,
                "lead_email": lead.email if lead else sent.to_email,
                "occurred_at": event.occurred_at.isoformat(),
            })
        return items

    async def time_series(self, db: AsyncSession, workspace_id: UUID, days: int = 30) -> list[dict]:
        """Daily aggregated metrics for the last N days."""
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

        # Sends per day
        sends_q = (
            select(
                func.date(SentEmail.sent_at).label("day"),
                func.count().label("cnt"),
            )
            .select_from(SentEmail)
            .join(Campaign)
            .where(Campaign.workspace_id == workspace_id, SentEmail.sent_at >= start_date)
            .group_by(func.date(SentEmail.sent_at))
        )
        sends_map: dict[str, int] = {}
        for row in await db.execute(sends_q):
            sends_map[str(row.day)] = row.cnt

        # Events per day per type
        events_q = (
            select(
                func.date(EmailEvent.occurred_at).label("day"),
                EmailEvent.event_type,
                func.count().label("cnt"),
            )
            .select_from(EmailEvent)
            .join(SentEmail)
            .join(Campaign)
            .where(Campaign.workspace_id == workspace_id, EmailEvent.occurred_at >= start_date)
            .group_by(func.date(EmailEvent.occurred_at), EmailEvent.event_type)
        )
        events_map: dict[str, dict[str, int]] = {}
        for row in await db.execute(events_q):
            day_key = str(row.day)
            if day_key not in events_map:
                events_map[day_key] = {}
            events_map[day_key][row.event_type] = row.cnt

        # Build series
        series = []
        for i in range(days):
            d = (start_date + timedelta(days=i)).date()
            day_key = str(d)
            ev = events_map.get(day_key, {})
            series.append({
                "date": day_key,
                "sent": sends_map.get(day_key, 0),
                "opens": ev.get("open", 0),
                "clicks": ev.get("click", 0),
                "replies": ev.get("reply", 0),
                "bounces": ev.get("bounce", 0),
            })
        return series

    async def campaign_comparison(self, db: AsyncSession, workspace_id: UUID) -> list[dict]:
        """Stats for all campaigns in a workspace, suitable for comparison."""
        result = await db.execute(
            select(Campaign).where(Campaign.workspace_id == workspace_id)
        )
        campaigns = list(result.scalars().all())
        out = []
        for c in campaigns:
            stats = await self.campaign_stats(db, c.id, workspace_id=workspace_id)
            out.append(stats)
        return out


analytics_service = AnalyticsService()
