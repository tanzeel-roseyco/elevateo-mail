"""Scoped external API for campaign automation agents."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.campaign import Campaign, CampaignAccount, CampaignLead
from app.models.email_account import EmailAccount
from app.models.lead import Lead, LeadList, LeadListMember
from app.models.sequence import Sequence
from app.models.step import Step
from app.models.variant import Variant
from app.schemas.analytics import CampaignStats
from app.schemas.campaign import CampaignResponse
from app.schemas.external import (
    ExternalCampaignCopyRequest,
    ExternalCampaignCopyResponse,
    ExternalCampaignStatusResponse,
    ExternalLaunchValidationResponse,
    ExternalLeadState,
    ExternalLeadStatesResponse,
    ExternalLeadUpsertRequest,
    ExternalLeadUpsertResponse,
    ExternalLeadUpsertResult,
)
from app.services.analytics_service import analytics_service
from app.services.campaign_service import campaign_service
from app.services.workflow.event_bus import workflow_event_bus
from app.utils.security import AuthPrincipal, require_scope

router = APIRouter()


async def _get_campaign(db: AsyncSession, campaign_id: UUID, workspace_id: UUID) -> Campaign:
    result = await db.execute(
        select(Campaign)
        .where(Campaign.id == campaign_id, Campaign.workspace_id == workspace_id)
        .options(
            selectinload(Campaign.sequences)
            .selectinload(Sequence.steps)
            .selectinload(Step.variants),
            selectinload(Campaign.campaign_leads),
            selectinload(Campaign.campaign_accounts),
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


async def _validate_launch(db: AsyncSession, campaign_id: UUID, workspace_id: UUID) -> ExternalLaunchValidationResponse:
    campaign = await _get_campaign(db, campaign_id, workspace_id)
    blockers: list[str] = []
    warnings: list[str] = []

    lead_count = (await db.execute(
        select(func.count()).select_from(CampaignLead).where(CampaignLead.campaign_id == campaign_id)
    )).scalar() or 0
    if lead_count == 0:
        blockers.append("No leads assigned")

    account_count = (await db.execute(
        select(func.count()).select_from(CampaignAccount).where(CampaignAccount.campaign_id == campaign_id)
    )).scalar() or 0
    if account_count == 0:
        blockers.append("No sending accounts assigned")

    accounts_result = await db.execute(
        select(EmailAccount)
        .join(CampaignAccount, CampaignAccount.account_id == EmailAccount.id)
        .where(CampaignAccount.campaign_id == campaign_id, EmailAccount.workspace_id == workspace_id)
    )
    accounts = list(accounts_result.scalars().all())
    sendable_account_count = 0
    for account in accounts:
        reason = campaign_service._account_sendability_reason(account)
        if reason:
            warnings.append(f"{account.email}: {reason}")
        else:
            sendable_account_count += 1
    if account_count > 0 and sendable_account_count == 0:
        blockers.append("No sendable accounts are ready")

    variant_count = (await db.execute(
        select(func.count())
        .select_from(Variant)
        .join(Step, Variant.step_id == Step.id)
        .join(Sequence, Step.sequence_id == Sequence.id)
        .where(Sequence.campaign_id == campaign_id)
    )).scalar() or 0
    if variant_count == 0:
        blockers.append("No email variants configured")

    if campaign.status not in {"draft", "paused"}:
        blockers.append(f"Campaign cannot launch from status '{campaign.status}'")

    return ExternalLaunchValidationResponse(
        campaign_id=campaign_id,
        ready=not blockers,
        blockers=blockers,
        warnings=warnings,
        lead_count=lead_count,
        account_count=account_count,
        sendable_account_count=sendable_account_count,
        variant_count=variant_count,
    )


@router.post("/leads/upsert-bulk", response_model=ExternalLeadUpsertResponse)
async def upsert_leads_bulk(
    req: ExternalLeadUpsertRequest,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_scope("leads:write")),
):
    list_id = req.list_id
    if req.create_list_name and not list_id:
        lead_list = LeadList(workspace_id=principal.workspace_id, name=req.create_list_name.strip())
        db.add(lead_list)
        await db.flush()
        list_id = lead_list.id
    elif list_id:
        check = await db.execute(
            select(LeadList.id).where(LeadList.id == list_id, LeadList.workspace_id == principal.workspace_id)
        )
        if not check.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Lead list not found")

    created = 0
    updated = 0
    added_to_list = 0
    results: list[ExternalLeadUpsertResult] = []
    created_ids: list[UUID] = []
    list_added_ids: list[UUID] = []

    for item in req.leads:
        data = item.model_dump(exclude_none=True)
        email = data.pop("email").strip().lower()
        result = await db.execute(
            select(Lead).where(Lead.workspace_id == principal.workspace_id, Lead.email == email)
        )
        lead = result.scalar_one_or_none()
        if lead:
            for key, value in data.items():
                setattr(lead, key, value)
            updated += 1
            status = "updated"
        else:
            lead = Lead(workspace_id=principal.workspace_id, email=email, **data)
            db.add(lead)
            await db.flush()
            created += 1
            created_ids.append(lead.id)
            status = "created"

        if list_id:
            existing = await db.execute(
                select(LeadListMember.id).where(
                    LeadListMember.lead_list_id == list_id,
                    LeadListMember.lead_id == lead.id,
                )
            )
            if not existing.scalar_one_or_none():
                db.add(LeadListMember(lead_list_id=list_id, lead_id=lead.id))
                added_to_list += 1
                list_added_ids.append(lead.id)
        results.append(ExternalLeadUpsertResult(lead_id=lead.id, email=lead.email, status=status))

    await db.flush()
    if created_ids:
        try:
            await workflow_event_bus.on_leads_imported(
                db=db,
                workspace_id=principal.workspace_id,
                lead_ids=created_ids,
                trigger_data={"source": "external_api_upsert"},
            )
        except Exception:
            pass
    if list_id and list_added_ids:
        try:
            await workflow_event_bus.on_list_membership_added(
                db=db,
                workspace_id=principal.workspace_id,
                lead_ids=list_added_ids,
                list_id=list_id,
            )
        except Exception:
            pass

    return ExternalLeadUpsertResponse(
        created=created,
        updated=updated,
        added_to_list=added_to_list,
        list_id=list_id,
        results=results,
    )


@router.post("/campaigns/{campaign_id}/copy", response_model=ExternalCampaignCopyResponse)
async def load_campaign_copy(
    campaign_id: UUID,
    req: ExternalCampaignCopyRequest,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_scope("campaigns:write")),
):
    campaign = await _get_campaign(db, campaign_id, principal.workspace_id)
    sequence_id = req.sequence_id
    if sequence_id:
        if not any(seq.id == sequence_id for seq in campaign.sequences):
            raise HTTPException(status_code=404, detail="Sequence not found")
    else:
        if not campaign.sequences:
            sequence = Sequence(campaign_id=campaign.id, name="Main Sequence", order=0)
            db.add(sequence)
            await db.flush()
            sequence_id = sequence.id
        else:
            sequence_id = sorted(campaign.sequences, key=lambda seq: seq.order)[0].id

    step = await campaign_service.add_step(
        db,
        sequence_id,
        {
            "order": req.order,
            "step_type": "email",
            "wait_days": req.wait_days,
            "subject": req.variants[0].subject,
            "body": req.variants[0].body,
        },
        workspace_id=principal.workspace_id,
    )
    variants = []
    for variant in req.variants:
        created = await campaign_service.add_variant(
            db,
            step.id,
            variant.model_dump(),
            workspace_id=principal.workspace_id,
        )
        variants.append(created)
    return ExternalCampaignCopyResponse(
        step_id=step.id,
        variants=[
            {
                "id": v.id,
                "name": v.name,
                "subject": v.subject,
                "body": v.body,
                "weight": v.weight,
            }
            for v in variants
        ],
    )


@router.post("/campaigns/{campaign_id}/validate-launch", response_model=ExternalLaunchValidationResponse)
async def validate_campaign_launch(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_scope("campaigns:read")),
):
    return await _validate_launch(db, campaign_id, principal.workspace_id)


@router.post("/campaigns/{campaign_id}/launch", response_model=CampaignResponse)
async def launch_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_scope("campaigns:launch")),
):
    validation = await _validate_launch(db, campaign_id, principal.workspace_id)
    if not validation.ready:
        raise HTTPException(status_code=400, detail={"message": "Campaign is not launch-ready", "blockers": validation.blockers})
    try:
        await campaign_service.start_campaign(db, campaign_id, principal.workspace_id)
        return await campaign_service.get_campaign(db, campaign_id, principal.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/campaigns/{campaign_id}/pause", response_model=CampaignResponse)
async def pause_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_scope("campaigns:launch")),
):
    try:
        await campaign_service.pause_campaign(db, campaign_id, principal.workspace_id)
        return await campaign_service.get_campaign(db, campaign_id, principal.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/campaigns/{campaign_id}/status", response_model=ExternalCampaignStatusResponse)
async def campaign_status(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_scope("campaigns:read")),
):
    try:
        campaign = await campaign_service.get_campaign(db, campaign_id, principal.workspace_id)
        stats = await analytics_service.campaign_stats(db, campaign_id, workspace_id=principal.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    status_rows = await db.execute(
        select(CampaignLead.status, func.count())
        .where(CampaignLead.campaign_id == campaign_id)
        .group_by(CampaignLead.status)
    )
    next_send_at = (await db.execute(
        select(func.min(CampaignLead.next_send_at)).where(
            CampaignLead.campaign_id == campaign_id,
            CampaignLead.next_send_at.is_not(None),
        )
    )).scalar_one_or_none()
    return ExternalCampaignStatusResponse(
        campaign=CampaignResponse.model_validate(campaign),
        analytics=CampaignStats(**stats),
        lead_status_counts={status: count for status, count in status_rows.all()},
        next_send_at=next_send_at,
    )


@router.get("/campaigns/{campaign_id}/lead-states", response_model=ExternalLeadStatesResponse)
async def campaign_lead_states(
    campaign_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_scope("campaigns:read")),
):
    await _get_campaign(db, campaign_id, principal.workspace_id)
    total = (await db.execute(
        select(func.count()).select_from(CampaignLead).where(CampaignLead.campaign_id == campaign_id)
    )).scalar() or 0
    rows = await db.execute(
        select(CampaignLead, Lead)
        .join(Lead, CampaignLead.lead_id == Lead.id)
        .where(CampaignLead.campaign_id == campaign_id, Lead.workspace_id == principal.workspace_id)
        .order_by(CampaignLead.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    items = [
        ExternalLeadState(
            campaign_lead_id=state.id,
            lead_id=lead.id,
            email=lead.email,
            first_name=lead.first_name,
            last_name=lead.last_name,
            company=lead.company,
            status=state.status,
            current_step=state.current_step,
            next_send_at=state.next_send_at,
            created_at=state.created_at,
        )
        for state, lead in rows.all()
    ]
    return ExternalLeadStatesResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/campaigns/{campaign_id}/analytics", response_model=CampaignStats)
async def campaign_analytics(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    principal: AuthPrincipal = Depends(require_scope("analytics:read")),
):
    try:
        stats = await analytics_service.campaign_stats(db, campaign_id, workspace_id=principal.workspace_id)
        return CampaignStats(**stats)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
