"""Lead routes — CRUD, CSV import, bulk operations, lead lists."""

import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.encoders import jsonable_encoder
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User
from app.schemas.lead import (
    LeadCreate, LeadUpdate, LeadResponse,
    LeadListCreate, LeadListResponse,
    LeadBulkAction, CSVImportResponse,
    LeadPersonalizationRequest, LeadPersonalizationResponse,
    LeadPersonalizationJobCreateResponse,
    LeadPersonalizationJobStatusResponse,
    LeadPersonalizationJobProgress,
)
from app.services.lead_service import lead_service
from app.services.workflow.event_bus import workflow_event_bus

logger = logging.getLogger(__name__)

router = APIRouter()


def _map_personalization_task_state(task_state: str) -> str:
    state = (task_state or "").upper()
    if state in {"PENDING", "RETRY", "RECEIVED"}:
        return "queued"
    if state in {"STARTED", "PROGRESS"}:
        return "running"
    if state == "SUCCESS":
        return "completed"
    if state == "FAILURE":
        return "failed"
    return "queued"


@router.get("/", response_model=dict)
async def list_leads(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    status: str | None = Query(None),
    search: str | None = Query(None),
    list_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    leads, total = await lead_service.list_leads(
        db, current_user.workspace_id, skip=skip, limit=limit, status=status, search=search, list_id=list_id,
    )
    return {
        "leads": [LeadResponse.model_validate(l) for l in leads],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await lead_service.get_lead(db, lead_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/", response_model=LeadResponse, status_code=201)
async def create_lead(
    req: LeadCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        lead = await lead_service.create_lead(db, current_user.workspace_id, req.model_dump(exclude_none=True))
        # Fire trigger_new_lead workflows (best-effort, don't block on failure)
        try:
            await workflow_event_bus.on_leads_imported(
                db=db,
                workspace_id=current_user.workspace_id,
                lead_ids=[lead.id],
                trigger_data={"source": "api_create"},
            )
        except Exception:
            logger.warning("Failed to dispatch new-lead triggers for %s", lead.id, exc_info=True)
        return lead
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Lead with this email already exists")


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: UUID,
    req: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await lead_service.update_lead(db, lead_id, current_user.workspace_id, req.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{lead_id}", status_code=204)
async def delete_lead(
    lead_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        await lead_service.delete_lead(db, lead_id, current_user.workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── CSV Import ──

@router.post("/import/csv", response_model=CSVImportResponse)
async def import_csv(
    file: UploadFile = File(...),
    list_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")

    # Prevent DoS — limit CSV uploads to 10 MB
    max_size = 10 * 1024 * 1024
    raw = await file.read()
    if len(raw) > max_size:
        raise HTTPException(status_code=413, detail="CSV file too large (max 10 MB)")

    content = raw.decode("utf-8-sig")
    result = await lead_service.import_csv(db, current_user.workspace_id, content, list_id=list_id)
    return CSVImportResponse(**result)


# ── Bulk Operations ──



@router.post("/bulk")
async def bulk_action(
    req: LeadBulkAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await lead_service.bulk_action(
        db, current_user.workspace_id, req.lead_ids, req.action, req.list_id,
    )
    return result


@router.post("/personalize", response_model=LeadPersonalizationResponse)
async def personalize_leads(
    req: LeadPersonalizationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return await lead_service.personalize_leads(
            db=db,
            workspace_id=current_user.workspace_id,
            list_id=req.list_id,
            source_column=req.source_column,
            source_custom_field=req.source_custom_field,
            target_field=req.target_field,
            tone=req.tone,
            instructions=req.instructions,
            limit=req.limit,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))



@router.post("/personalize/jobs", response_model=LeadPersonalizationJobCreateResponse)
async def create_personalization_job(
    req: LeadPersonalizationRequest,
    current_user: User = Depends(get_current_user),
):
    from app.workers.celery_app import celery_app

    payload = jsonable_encoder(req.model_dump())
    task = celery_app.send_task(
        "app.workers.lead_personalization_worker.run_lead_personalization_job",
        args=[str(current_user.workspace_id), payload],
    )
    return LeadPersonalizationJobCreateResponse(job_id=str(task.id), status="queued")


@router.get(
    "/personalize/jobs/{job_id}",
    response_model=LeadPersonalizationJobStatusResponse,
)
async def get_personalization_job_status(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    from celery.result import AsyncResult
    from app.workers.celery_app import celery_app

    workspace_key = str(current_user.workspace_id)
    task = AsyncResult(job_id, app=celery_app)
    status = _map_personalization_task_state(task.state)
    info = task.info if isinstance(task.info, dict) else {}
    owner_workspace = str(info.get("workspace_id") or "")
    if owner_workspace and owner_workspace != workspace_key:
        raise HTTPException(status_code=404, detail="Job not found")

    progress = LeadPersonalizationJobProgress(
        processed=int(info.get("processed") or 0),
        total=int(info.get("total") or 0),
        updated=int(info.get("updated") or 0),
        skipped=int(info.get("skipped") or 0),
        failed=int(info.get("failed") or 0),
        progress_percent=float(info.get("progress_percent") or 0.0),
    )

    result_payload = None
    error_message = None

    if status == "completed":
        task_result = task.result
        if isinstance(task_result, dict):
            result_workspace = str(task_result.get("workspace_id") or "")
            if result_workspace and result_workspace != workspace_key:
                raise HTTPException(status_code=404, detail="Job not found")
            inner = task_result.get("result")
            if isinstance(inner, dict):
                result_payload = inner
    elif status == "failed":
        error_message = str(task.result) if task.result is not None else "Personalization job failed"

    return LeadPersonalizationJobStatusResponse(
        job_id=job_id,
        status=status,
        progress=progress,
        result=result_payload,
        error=error_message,
    )

# ── Lead Lists ──

@router.get("/lists/all", response_model=list[LeadListResponse])
async def list_lead_lists(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lists = await lead_service.get_lists(db, current_user.workspace_id)
    result = []
    for ll in lists:
        resp = LeadListResponse.model_validate(ll)
        resp.member_count = len(ll.members) if ll.members else 0
        result.append(resp)
    return result


@router.post("/lists", response_model=LeadListResponse, status_code=201)
async def create_lead_list(
    req: LeadListCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lead_list = await lead_service.create_list(db, current_user.workspace_id, req.name, req.description)
    return LeadListResponse.model_validate(lead_list)



