"""Developer-facing API token management."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.api_token import (
    ApiTokenCreate,
    ApiTokenCreateResponse,
    ApiTokenListResponse,
    ApiTokenResponse,
    ApiTokenUpdate,
)
from app.services.api_token_service import api_token_service
from app.utils.security import get_current_user

router = APIRouter()


def _require_admin(user: User) -> None:
    if user.role not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Only workspace owners and admins can manage API tokens")


@router.get("/tokens", response_model=ApiTokenListResponse)
async def list_api_tokens(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    tokens = await api_token_service.list_tokens(db, current_user.workspace_id)
    return ApiTokenListResponse(items=[ApiTokenResponse.model_validate(token) for token in tokens])


@router.post("/tokens", response_model=ApiTokenCreateResponse, status_code=201)
async def create_api_token(
    req: ApiTokenCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    token, raw_token = await api_token_service.create_token(
        db,
        workspace_id=current_user.workspace_id,
        created_by_user_id=current_user.id,
        name=req.name,
        scopes=req.scopes,
        expires_at=req.expires_at,
    )
    payload = ApiTokenResponse.model_validate(token).model_dump()
    return ApiTokenCreateResponse(**payload, token=raw_token)


@router.patch("/tokens/{token_id}", response_model=ApiTokenResponse)
async def update_api_token(
    token_id: UUID,
    req: ApiTokenUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    if req.name is None:
        raise HTTPException(status_code=400, detail="No update fields provided")
    try:
        token = await api_token_service.update_token(
            db,
            workspace_id=current_user.workspace_id,
            token_id=token_id,
            name=req.name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return token


@router.delete("/tokens/{token_id}", response_model=ApiTokenResponse)
async def revoke_api_token(
    token_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    try:
        return await api_token_service.revoke_token(
            db,
            workspace_id=current_user.workspace_id,
            token_id=token_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
