"""Template routes — CRUD + preview with sample lead data."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User
from app.models.template import Template
from app.schemas.template import (
    TemplateCreate, TemplateUpdate, TemplateResponse,
    TemplatePreviewRequest, TemplatePreviewResponse,
)
from app.services.template_engine import template_engine

router = APIRouter()


@router.get("/", response_model=list[TemplateResponse])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Template)
        .where(Template.workspace_id == current_user.workspace_id)
        .order_by(Template.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Template).where(
            Template.id == template_id,
            Template.workspace_id == current_user.workspace_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/", response_model=TemplateResponse, status_code=201)
async def create_template(
    req: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = Template(workspace_id=current_user.workspace_id, **req.model_dump())
    db.add(template)
    await db.flush()
    return template


@router.patch("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    req: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Template).where(
            Template.id == template_id,
            Template.workspace_id == current_user.workspace_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    for key, value in req.model_dump(exclude_none=True).items():
        setattr(template, key, value)
    await db.flush()
    return template


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Template).where(
            Template.id == template_id,
            Template.workspace_id == current_user.workspace_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)
    await db.flush()


@router.post("/preview", response_model=TemplatePreviewResponse)
async def preview_template(
    req: TemplatePreviewRequest,
    current_user: User = Depends(get_current_user),
):
    """Render a template with sample data — no DB needed."""
    errors = template_engine.validate(req.subject) + template_engine.validate(req.body)
    variables = template_engine.extract_variables(req.subject + " " + req.body)

    rendered_subject, rendered_body = template_engine.render_subject_and_body(
        req.subject, req.body, req.sample_data,
    )

    return TemplatePreviewResponse(
        subject=rendered_subject,
        body=rendered_body,
        variables_found=variables,
        errors=errors,
    )
