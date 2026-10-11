"""Campaign schemas."""

from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class StepCreate(BaseModel):
    order: int = 0
    step_type: str = "email"
    wait_days: int = 0
    subject: Optional[str] = None
    body: Optional[str] = None


class StepResponse(BaseModel):
    id: UUID
    sequence_id: UUID
    order: int
    step_type: str
    wait_days: int
    subject: Optional[str]
    body: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class VariantCreate(BaseModel):
    name: str = "A"
    subject: str
    body: str
    weight: int = 50


class VariantResponse(BaseModel):
    id: UUID
    step_id: UUID
    name: str
    subject: str
    body: str
    weight: int
    sent_count: int
    open_count: int
    click_count: int
    reply_count: int
    bounce_count: int
    created_at: datetime
    model_config = {"from_attributes": True}


class SequenceCreate(BaseModel):
    name: str = "Main Sequence"
    order: int = 0


class SequenceResponse(BaseModel):
    id: UUID
    campaign_id: UUID
    name: str
    order: int
    steps: list[StepResponse] = []
    created_at: datetime
    model_config = {"from_attributes": True}


class CampaignCreate(BaseModel):
    name: str
    description: Optional[str] = None
    timezone: str = "UTC"
    send_days: Optional[dict] = None
    send_start_hour: int = 9
    send_end_hour: int = 17
    daily_limit: int = 100
    stop_on_reply: bool = True
    track_opens: bool = True
    track_clicks: bool = True


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    timezone: Optional[str] = None
    send_days: Optional[dict] = None
    send_start_hour: Optional[int] = None
    send_end_hour: Optional[int] = None
    daily_limit: Optional[int] = None
    stop_on_reply: Optional[bool] = None
    track_opens: Optional[bool] = None
    track_clicks: Optional[bool] = None


class CampaignResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    status: str
    description: Optional[str]
    timezone: str
    send_days: Optional[dict]
    send_start_hour: int
    send_end_hour: int
    daily_limit: int
    stop_on_reply: bool
    track_opens: bool
    track_clicks: bool
    sequences: list[SequenceResponse] = []
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class CampaignLeadAdd(BaseModel):
    lead_ids: list[UUID]


class CampaignLeadListAdd(BaseModel):
    list_ids: list[UUID]


class CampaignAccountAdd(BaseModel):
    account_ids: list[UUID]
    weights: Optional[list[int]] = None


class ConditionCreate(BaseModel):
    condition_type: str
    target_step_order: Optional[int] = None
