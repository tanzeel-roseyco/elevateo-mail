"""Analytics routes — dashboard, campaign stats, A/B test results."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.security import get_current_user
from app.models.user import User
from app.schemas.analytics import DashboardStats, CampaignStats, ABTestResult, TimeSeriesPoint, RecentActivityItem
from app.services.analytics_service import analytics_service

router = APIRouter()


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stats = await analytics_service.dashboard_stats(db, current_user.workspace_id)
    return DashboardStats(**stats)


@router.get("/campaigns/{campaign_id}", response_model=CampaignStats)
async def campaign_stats(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        stats = await analytics_service.campaign_stats(db, campaign_id, workspace_id=current_user.workspace_id)
        return CampaignStats(**stats)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/recent-activity", response_model=list[RecentActivityItem])
async def recent_activity(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await analytics_service.recent_activity(db, current_user.workspace_id, limit)


@router.get("/time-series", response_model=list[TimeSeriesPoint])
async def time_series(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await analytics_service.time_series(db, current_user.workspace_id, days)
    return data


@router.get("/campaigns", response_model=list[CampaignStats])
async def campaign_comparison(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await analytics_service.campaign_comparison(db, current_user.workspace_id)


@router.get("/ab-test/{step_id}")
async def ab_test_results(
    step_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await analytics_service.ab_test_results(db, step_id, workspace_id=current_user.workspace_id)
    return result
