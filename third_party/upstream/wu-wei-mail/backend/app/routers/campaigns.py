"""Campaign routes — CRUD, start/pause/resume, sequence management."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User
from app.schemas.campaign import (
    CampaignCreate, CampaignUpdate, CampaignResponse,
    SequenceCreate, SequenceResponse,
    StepCreate, StepResponse,
    VariantCreate, VariantResponse,
    ConditionCreate,
    CampaignLeadAdd, CampaignLeadListAdd, CampaignAccountAdd,
)
from app.services.campaign_service import campaign_service

router = APIRouter()


@router.get("/", response_model=list[CampaignResponse])
async def list_campaigns(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaigns = await campaign_service.list_campaigns(db, current_user.workspace_id)
    return campaigns


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await campaign_service.get_campaign(db, campaign_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/", response_model=CampaignResponse, status_code=201)
async def create_campaign(
    req: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = req.model_dump(exclude_none=True)
    campaign = await campaign_service.create_campaign(db, current_user.workspace_id, data)
    return await campaign_service.get_campaign(db, campaign.id, current_user.workspace_id)


@router.patch("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: UUID,
    req: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        data = req.model_dump(exclude_none=True)
        await campaign_service.update_campaign(db, campaign_id, current_user.workspace_id, data)
        return await campaign_service.get_campaign(db, campaign_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{campaign_id}", status_code=204)
async def delete_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        await campaign_service.delete_campaign(db, campaign_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Campaign actions ──

@router.post("/{campaign_id}/start", response_model=CampaignResponse)
async def start_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        await campaign_service.start_campaign(db, campaign_id, current_user.workspace_id)
        return await campaign_service.get_campaign(db, campaign_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{campaign_id}/pause", response_model=CampaignResponse)
async def pause_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        await campaign_service.pause_campaign(db, campaign_id, current_user.workspace_id)
        return await campaign_service.get_campaign(db, campaign_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{campaign_id}/resume", response_model=CampaignResponse)
async def resume_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        await campaign_service.resume_campaign(db, campaign_id, current_user.workspace_id)
        return await campaign_service.get_campaign(db, campaign_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Leads & Accounts assignment ──

@router.post("/{campaign_id}/leads")
async def add_leads_to_campaign(
    campaign_id: UUID,
    req: CampaignLeadAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        count = await campaign_service.add_leads(db, campaign_id, req.lead_ids, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"added": count}


@router.post("/{campaign_id}/leads-from-lists")
async def add_leads_from_lists(
    campaign_id: UUID,
    req: CampaignLeadListAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve lead list memberships and add those leads to the campaign."""
    from app.models.lead import LeadList, LeadListMember
    # Validate lists belong to the current workspace
    list_check = await db.execute(
        select(LeadList.id).where(
            LeadList.id.in_(req.list_ids),
            LeadList.workspace_id == current_user.workspace_id,
        )
    )
    valid_list_ids = [row[0] for row in list_check.all()]
    if not valid_list_ids:
        return {"added": 0}
    result = await db.execute(
        select(LeadListMember.lead_id)
        .where(LeadListMember.lead_list_id.in_(valid_list_ids))
        .distinct()
    )
    lead_ids = [row[0] for row in result.all()]
    if not lead_ids:
        return {"added": 0}
    try:
        count = await campaign_service.add_leads(db, campaign_id, lead_ids, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"added": count}


@router.post("/{campaign_id}/accounts")
async def add_accounts_to_campaign(
    campaign_id: UUID,
    req: CampaignAccountAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        count = await campaign_service.add_accounts(
            db, campaign_id, req.account_ids, req.weights, current_user.workspace_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"added": count}


# ── Sequence / Step / Variant management ──

@router.post("/{campaign_id}/sequences/{sequence_id}/steps", response_model=StepResponse, status_code=201)
async def add_step(
    campaign_id: UUID,
    sequence_id: UUID,
    req: StepCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        step = await campaign_service.add_step(db, sequence_id, req.model_dump(), workspace_id=current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return step


@router.post("/steps/{step_id}/variants", response_model=VariantResponse, status_code=201)
async def add_variant(
    step_id: UUID,
    req: VariantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        variant = await campaign_service.add_variant(db, step_id, req.model_dump(), workspace_id=current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return variant


@router.post("/steps/{step_id}/conditions", status_code=201)
async def add_condition(
    step_id: UUID,
    req: ConditionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        condition = await campaign_service.add_condition(db, step_id, req.model_dump(), workspace_id=current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"id": str(condition.id), "condition_type": condition.condition_type}
