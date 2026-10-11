"""Inbox schemas."""

from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime
from typing import Optional


class InboxMessageResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    account_id: UUID
    campaign_id: Optional[UUID]
    lead_id: Optional[UUID]
    from_email: str
    to_email: str
    subject: str
    body_text: Optional[str]
    body_html: Optional[str]
    direction: str
    is_read: bool
    is_auto_reply: bool
    thread_id: Optional[str]
    received_at: datetime
    created_at: datetime
    model_config = {"from_attributes": True}


class InboxThreadResponse(BaseModel):
    thread_id: str
    subject: str
    lead_email: str
    account_email: str
    message_count: int
    last_message_at: datetime
    is_read: bool
    messages: list[InboxMessageResponse] = []


class InboxReplyRequest(BaseModel):
    to_email: EmailStr
    account_id: UUID
    subject: str
    body: str
    thread_id: Optional[str] = None


class InboxStats(BaseModel):
    total: int
    unread: int
    auto_replies: int
