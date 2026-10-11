"""Pydantic schemas for the warmup bounded context."""

from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Any
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Program
# ---------------------------------------------------------------------------

class WarmupProgramCreate(BaseModel):
    mode: str = "managed"
    default_target_volume: int = Field(default=50, ge=5, le=500)
    ramp_increment_per_day: int = Field(default=3, ge=1, le=20)
    max_daily_warmup: int = Field(default=200, ge=10, le=1000)
    dns_required: bool = True
    auto_pause_on_bounce_rate: float = Field(default=0.08, ge=0.0, le=1.0)
    auto_pause_on_complaint_rate: float = Field(default=0.003, ge=0.0, le=1.0)


class WarmupProgramResponse(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    mode: str
    default_target_volume: int
    ramp_increment_per_day: int
    max_daily_warmup: int
    dns_required: bool
    auto_pause_on_bounce_rate: float
    auto_pause_on_complaint_rate: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Enrollment
# ---------------------------------------------------------------------------

class WarmupEnrollRequest(BaseModel):
    target_volume: int = Field(default=50, ge=5, le=200)


# ---------------------------------------------------------------------------
# Pause
# ---------------------------------------------------------------------------

class WarmupPauseRequest(BaseModel):
    reason: str | None = None


# ---------------------------------------------------------------------------
# Account Status (assembled from state + provider link + metrics + risk)
# ---------------------------------------------------------------------------

class WarmupAccountStatusResponse(BaseModel):
    account_id: uuid.UUID
    workspace_id: uuid.UUID
    phase: str
    target_volume: int
    current_allowed_volume: int
    actual_sent_today: int
    warmup_health_score: float
    inbox_placement_rate: float
    enrolled_at: datetime | None = None
    graduated_at: datetime | None = None
    paused_at: datetime | None = None
    pause_reason: str | None = None
    provider_name: str | None = None
    provider_status: str | None = None
    last_synced_at: datetime | None = None
    risk_flags: list[str] = []
    recent_metrics: list[WarmupDailyMetricResponse] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Daily Metrics
# ---------------------------------------------------------------------------

class WarmupDailyMetricResponse(BaseModel):
    date: date
    sent: int
    delivered: int
    opened: int
    replied: int
    bounced: int
    spam_reported: int
    inbox_placed: int
    spam_placed: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Action Timeline
# ---------------------------------------------------------------------------

class WarmupActionResponse(BaseModel):
    id: uuid.UUID
    action_type: str
    status: str
    source: str
    detail: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
