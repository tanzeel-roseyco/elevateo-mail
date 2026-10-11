"""Template schemas."""

from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import Optional


class TemplateCreate(BaseModel):
    name: str
    subject: str
    body: str
    category: Optional[str] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None


class TemplateResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    subject: str
    body: str
    category: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class TemplatePreviewRequest(BaseModel):
    subject: str
    body: str
    sample_data: dict = {
        "first_name": "John",
        "last_name": "Doe",
        "company": "Acme Inc",
        "title": "CEO",
        "email": "john@acme.com",
    }


class TemplatePreviewResponse(BaseModel):
    subject: str
    body: str
    variables_found: list[str]
    errors: list[str]
