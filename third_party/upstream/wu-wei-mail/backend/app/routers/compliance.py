"""Compliance routes — suppression list management."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User
from app.models.suppression import Suppression

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import csv
import io

router = APIRouter()


class SuppressionCreate(BaseModel):
    email: EmailStr
    reason: str = "manual"  # bounce, unsubscribe, complaint, manual
    source: Optional[str] = None


class SuppressionResponse(BaseModel):
    id: UUID
    email: str
    reason: str
    source: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


@router.get("/suppression", response_model=dict)
async def list_suppressions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Suppression).where(Suppression.workspace_id == current_user.workspace_id)
    if search:
        query = query.where(Suppression.email.ilike(f"%{search}%"))

    total = (await db.execute(
        select(func.count()).select_from(query.subquery())
    )).scalar() or 0

    result = await db.execute(
        query.offset(skip).limit(limit).order_by(Suppression.created_at.desc())
    )
    items = [SuppressionResponse.model_validate(s) for s in result.scalars().all()]

    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/suppression", response_model=SuppressionResponse, status_code=201)
async def add_suppression(
    req: SuppressionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Check if already suppressed
    existing = await db.execute(
        select(Suppression).where(
            Suppression.workspace_id == current_user.workspace_id,
            Suppression.email == req.email.lower(),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already on suppression list")

    suppression = Suppression(
        workspace_id=current_user.workspace_id,
        email=req.email.lower(),
        reason=req.reason,
        source=req.source,
    )
    db.add(suppression)
    await db.flush()
    return suppression


@router.delete("/suppression/{suppression_id}", status_code=204)
async def remove_suppression(
    suppression_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Suppression).where(
            Suppression.id == suppression_id,
            Suppression.workspace_id == current_user.workspace_id,
        )
    )
    suppression = result.scalar_one_or_none()
    if not suppression:
        raise HTTPException(status_code=404, detail="Suppression entry not found")
    await db.delete(suppression)
    await db.flush()


@router.post("/suppression/import")
async def import_suppression_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import suppression list from CSV (column: email, optional: reason)."""
    content = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))

    added = 0
    skipped = 0
    for row in reader:
        email = (row.get("email") or "").strip().lower()
        if not email:
            skipped += 1
            continue

        existing = await db.execute(
            select(Suppression).where(
                Suppression.workspace_id == current_user.workspace_id,
                Suppression.email == email,
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        reason = row.get("reason", "manual").strip() or "manual"
        db.add(Suppression(
            workspace_id=current_user.workspace_id,
            email=email,
            reason=reason,
            source="csv_import",
        ))
        added += 1

    await db.flush()
    return {"added": added, "skipped": skipped}


@router.get("/suppression/check/{email}")
async def check_suppression(
    email: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if an email is on the suppression list."""
    result = await db.execute(
        select(Suppression).where(
            Suppression.workspace_id == current_user.workspace_id,
            Suppression.email == email.lower(),
        )
    )
    suppression = result.scalar_one_or_none()
    return {
        "email": email,
        "suppressed": suppression is not None,
        "reason": suppression.reason if suppression else None,
    }
