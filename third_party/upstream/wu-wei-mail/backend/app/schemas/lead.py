"""Lead schemas."""

from pydantic import BaseModel, EmailStr, Field
from uuid import UUID
from datetime import datetime
from typing import Optional, Literal


class LeadCreate(BaseModel):
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    custom_fields: Optional[dict] = None


class LeadUpdate(BaseModel):
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    custom_fields: Optional[dict] = None
    status: Optional[str] = None


class LeadResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    company: Optional[str]
    title: Optional[str]
    phone: Optional[str]
    linkedin_url: Optional[str]
    website: Optional[str]
    city: Optional[str]
    state: Optional[str]
    country: Optional[str]
    industry: Optional[str]
    custom_fields: Optional[dict]
    status: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class LeadListCreate(BaseModel):
    name: str
    description: Optional[str] = None


class LeadListResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    description: Optional[str]
    member_count: int = 0
    created_at: datetime
    model_config = {"from_attributes": True}


class LeadBulkAction(BaseModel):
    lead_ids: list[UUID]
    action: str  # delete, add_to_list, remove_from_list
    list_id: Optional[UUID] = None


class CSVImportResponse(BaseModel):
    total_rows: int
    imported: int
    skipped: int
    errors: list[str]


class LeadPersonalizationRequest(BaseModel):
    list_id: UUID
    source_column: str = Field(default="website", min_length=1, max_length=64)
    source_custom_field: Optional[str] = Field(default=None, min_length=1, max_length=64)
    target_field: str = Field(
        default="personalization",
        min_length=1,
        max_length=64,
        pattern=r"^[a-zA-Z_][a-zA-Z0-9_]{0,63}$",
    )
    tone: Optional[str] = Field(default="professional", max_length=64)
    instructions: Optional[str] = Field(default=None, max_length=1000)
    limit: int | None = Field(default=None, ge=1, le=10000)


class LeadPersonalizationResult(BaseModel):
    lead_id: UUID
    email: str
    status: Literal["updated", "skipped", "failed"]
    reason: Optional[str] = None
    personalization: Optional[str] = None


class LeadPersonalizationResponse(BaseModel):
    list_id: UUID
    source_column: str
    source_custom_field: Optional[str] = None
    target_field: str
    template_variable: str
    alias_template_variable: str
    processed: int
    updated: int
    skipped: int
    failed: int
    results: list[LeadPersonalizationResult]


class LeadPersonalizationJobCreateResponse(BaseModel):
    job_id: str
    status: str


class LeadPersonalizationJobProgress(BaseModel):
    processed: int = 0
    total: int = 0
    updated: int = 0
    skipped: int = 0
    failed: int = 0
    progress_percent: float = 0.0


class LeadPersonalizationJobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: LeadPersonalizationJobProgress
    result: LeadPersonalizationResponse | None = None
    error: str | None = None
