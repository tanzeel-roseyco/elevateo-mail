"""Agent-friendly external API schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.analytics import CampaignStats
from app.schemas.campaign import CampaignResponse


class ExternalLeadUpsert(BaseModel):
    email: EmailStr
    first_name: str | None = None
    last_name: str | None = None
    company: str | None = None
    title: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    website: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    industry: str | None = None
    custom_fields: dict | None = None


class ExternalLeadUpsertRequest(BaseModel):
    leads: list[ExternalLeadUpsert] = Field(min_length=1, max_length=5000)
    list_id: UUID | None = None
    create_list_name: str | None = Field(default=None, max_length=255)


class ExternalLeadUpsertResult(BaseModel):
    lead_id: UUID
    email: str
    status: str


class ExternalLeadUpsertResponse(BaseModel):
    created: int
    updated: int
    added_to_list: int
    list_id: UUID | None
    results: list[ExternalLeadUpsertResult]


class ExternalCopyVariant(BaseModel):
    name: str = "A"
    subject: str
    body: str
    weight: int = Field(default=100, ge=1, le=100)


class ExternalCampaignCopyRequest(BaseModel):
    sequence_id: UUID | None = None
    order: int = Field(default=0, ge=0)
    wait_days: int = Field(default=0, ge=0)
    variants: list[ExternalCopyVariant] = Field(min_length=1, max_length=5)


class ExternalCreatedVariant(BaseModel):
    id: UUID
    name: str
    subject: str
    body: str
    weight: int


class ExternalCampaignCopyResponse(BaseModel):
    step_id: UUID
    variants: list[ExternalCreatedVariant]


class ExternalLaunchValidationResponse(BaseModel):
    campaign_id: UUID
    ready: bool
    blockers: list[str]
    warnings: list[str]
    lead_count: int
    account_count: int
    sendable_account_count: int
    variant_count: int


class ExternalCampaignStatusResponse(BaseModel):
    campaign: CampaignResponse
    analytics: CampaignStats
    lead_status_counts: dict[str, int]
    next_send_at: datetime | None


class ExternalLeadState(BaseModel):
    campaign_lead_id: UUID
    lead_id: UUID
    email: str
    first_name: str | None
    last_name: str | None
    company: str | None
    status: str
    current_step: int
    next_send_at: datetime | None
    created_at: datetime


class ExternalLeadStatesResponse(BaseModel):
    items: list[ExternalLeadState]
    total: int
    skip: int
    limit: int
