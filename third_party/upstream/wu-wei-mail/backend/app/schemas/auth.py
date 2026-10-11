"""Auth schemas."""

from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    workspace_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    workspace_id: UUID


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    workspace_id: UUID
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
