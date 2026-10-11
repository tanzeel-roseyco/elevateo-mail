"""Workspace settings and team management schemas."""

from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime
from typing import Optional


# ─── Workspace Settings ─────────────────────────────────────

class WorkspaceSettingsResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    plan: str
    timezone: str
    unsubscribe_text: Optional[str]
    gdpr_enabled: bool
    can_spam_enabled: bool
    model_config = {"from_attributes": True}


class WorkspaceSettingsUpdate(BaseModel):
    name: Optional[str] = None
    timezone: Optional[str] = None
    unsubscribe_text: Optional[str] = None
    gdpr_enabled: Optional[bool] = None
    can_spam_enabled: Optional[bool] = None


# ─── Team Management ────────────────────────────────────────

class TeamMemberResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class InviteRequest(BaseModel):
    email: EmailStr
    full_name: str = ""
    role: str = "member"


class RoleUpdate(BaseModel):
    role: str
