"""Analytics schemas."""

from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class DashboardStats(BaseModel):
    total_sent: int = 0
    total_opens: int = 0
    total_clicks: int = 0
    total_replies: int = 0
    total_bounces: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0
    reply_rate: float = 0.0
    bounce_rate: float = 0.0
    active_campaigns: int = 0
    total_leads: int = 0
    emails_today: int = 0


class CampaignStats(BaseModel):
    campaign_id: UUID
    campaign_name: str
    status: str
    total_leads: int = 0
    total_sent: int = 0
    total_opens: int = 0
    total_clicks: int = 0
    total_replies: int = 0
    total_bounces: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0
    reply_rate: float = 0.0
    bounce_rate: float = 0.0


class VariantStats(BaseModel):
    variant_id: UUID
    variant_name: str
    sent_count: int = 0
    open_count: int = 0
    click_count: int = 0
    reply_count: int = 0
    bounce_count: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0
    reply_rate: float = 0.0


class ABTestResult(BaseModel):
    step_id: UUID
    variants: list[VariantStats]
    winner: Optional[str] = None
    confidence: float = 0.0
    is_significant: bool = False


class RecentActivityItem(BaseModel):
    id: UUID
    campaign_name: str
    event_type: str
    lead_email: Optional[str] = None
    occurred_at: datetime


class TimeSeriesPoint(BaseModel):
    date: datetime
    sent: int = 0
    opens: int = 0
    clicks: int = 0
    replies: int = 0
    bounces: int = 0
