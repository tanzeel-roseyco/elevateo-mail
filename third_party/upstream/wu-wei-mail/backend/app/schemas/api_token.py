"""Schemas for workspace API token management."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


API_TOKEN_SCOPES = {
    "full_access",
    "leads:read",
    "leads:write",
    "templates:read",
    "templates:write",
    "campaigns:read",
    "campaigns:write",
    "campaigns:launch",
    "analytics:read",
    "compliance:read",
    "compliance:write",
    "inbox:read",
    "inbox:reply",
}


class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    scopes: list[str] = Field(default_factory=lambda: ["full_access"])
    expires_at: datetime | None = None

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, scopes: list[str]) -> list[str]:
        cleaned = sorted({scope.strip() for scope in scopes if scope and scope.strip()})
        if not cleaned:
            raise ValueError("At least one scope is required")
        unknown = [scope for scope in cleaned if scope not in API_TOKEN_SCOPES]
        if unknown:
            raise ValueError(f"Unknown API token scope(s): {', '.join(unknown)}")
        if "full_access" in cleaned and len(cleaned) > 1:
            return ["full_access"]
        return cleaned


class ApiTokenUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class ApiTokenResponse(BaseModel):
    id: UUID
    name: str
    token_prefix: str
    scopes: list[str]
    is_active: bool
    expires_at: datetime | None
    last_used_at: datetime | None
    last_used_ip: str | None
    revoked_at: datetime | None
    created_at: datetime
    updated_at: datetime
    created_by_user_id: UUID | None

    model_config = {"from_attributes": True}


class ApiTokenCreateResponse(ApiTokenResponse):
    token: str


class ApiTokenListResponse(BaseModel):
    items: list[ApiTokenResponse]
