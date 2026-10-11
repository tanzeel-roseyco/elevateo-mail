"""Email account schemas."""

from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime
from typing import Optional


class AccountCreate(BaseModel):
    email: EmailStr
    display_name: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: bool = True
    imap_host: Optional[str] = None
    imap_port: int = 993
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None
    daily_limit: int = 50
    warmup_enabled: bool = False


class AccountUpdate(BaseModel):
    display_name: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    imap_username: Optional[str] = None
    imap_password: Optional[str] = None
    daily_limit: Optional[int] = None
    warmup_enabled: Optional[bool] = None


class AccountResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    email: str
    display_name: Optional[str]
    smtp_host: Optional[str] = None
    smtp_port: int
    smtp_use_tls: bool
    imap_host: Optional[str]
    imap_port: int
    daily_limit: int
    sent_today: int
    health_score: float
    warmup_enabled: bool
    warmup_level: int
    spf_verified: bool
    dkim_verified: bool
    dmarc_verified: bool
    is_active: bool
    provider: str = "manual"
    provider_email: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class DNSCheckResponse(BaseModel):
    email: str
    domain: str
    spf: dict
    dkim: dict
    dmarc: dict
    overall_healthy: bool


class ConnectionTestResponse(BaseModel):
    success: bool
    smtp_ok: bool
    smtp_error: Optional[str] = None
    message: str
