"""Workspace routes — settings and team management."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.utils.security import get_current_user, hash_password
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.workspace import (
    WorkspaceSettingsResponse,
    WorkspaceSettingsUpdate,
    TeamMemberResponse,
    InviteRequest,
    RoleUpdate,
)

router = APIRouter()


# ─── Workspace Settings ─────────────────────────────────────

@router.get("/settings", response_model=WorkspaceSettingsResponse)
async def get_workspace_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return workspace settings for the current user."""
    result = await db.execute(
        select(Workspace).where(Workspace.id == current_user.workspace_id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


@router.patch("/settings", response_model=WorkspaceSettingsResponse)
async def update_workspace_settings(
    req: WorkspaceSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update workspace settings. Only owners and admins can update."""
    if current_user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    result = await db.execute(
        select(Workspace).where(Workspace.id == current_user.workspace_id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(workspace, field, value)

    await db.flush()
    return workspace


# ─── Team Management ────────────────────────────────────────

@router.get("/team", response_model=list[TeamMemberResponse])
async def list_team_members(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all users in the workspace."""
    result = await db.execute(
        select(User)
        .where(User.workspace_id == current_user.workspace_id)
        .order_by(User.created_at)
    )
    return result.scalars().all()


@router.post("/team/invite", response_model=TeamMemberResponse, status_code=201)
async def invite_team_member(
    req: InviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Invite a new team member — creates a user record with a temporary password."""
    if current_user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Check if email already exists
    existing = await db.execute(select(User).where(User.email == req.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Validate role
    if req.role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'member'")

    import secrets
    temp_password = secrets.token_urlsafe(16)

    user = User(
        workspace_id=current_user.workspace_id,
        email=req.email.lower(),
        hashed_password=hash_password(temp_password),
        full_name=req.full_name or req.email.split("@")[0],
        role=req.role,
    )
    db.add(user)
    await db.flush()
    return user


@router.patch("/team/{user_id}/role", response_model=TeamMemberResponse)
async def update_team_member_role(
    user_id: UUID,
    req: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a team member's role. Only owners can update roles."""
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Only workspace owners can change roles")

    if str(user_id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    if req.role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'member'")

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.workspace_id == current_user.workspace_id,
        )
    )
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="Team member not found")

    target_user.role = req.role
    await db.flush()
    return target_user


@router.delete("/team/{user_id}", status_code=204)
async def remove_team_member(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a team member from the workspace."""
    if current_user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if str(user_id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Cannot remove yourself")

    result = await db.execute(
        select(User).where(
            User.id == user_id,
            User.workspace_id == current_user.workspace_id,
        )
    )
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="Team member not found")

    if target_user.role == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove the workspace owner")

    await db.delete(target_user)
    await db.flush()
