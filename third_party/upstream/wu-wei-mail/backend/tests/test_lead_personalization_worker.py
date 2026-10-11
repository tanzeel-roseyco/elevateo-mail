"""Tests for lead personalization worker helpers."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.lead_personalization_worker import _run_personalization_job_async


class _TaskSpy:
    def __init__(self):
        self.calls: list[dict] = []

    def update_state(self, *, state: str, meta: dict):
        self.calls.append({"state": state, "meta": meta})


def _session_context(session):
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=session)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


class TestLeadPersonalizationWorker:

    async def test_run_personalization_job_async_reports_progress(self):
        workspace_id = str(uuid.uuid4())
        list_id = str(uuid.uuid4())
        task = _TaskSpy()

        session = AsyncMock()
        session.commit = AsyncMock()
        session.rollback = AsyncMock()

        async def _mock_personalize(**kwargs):
            progress_callback = kwargs["progress_callback"]
            progress_callback(
                {
                    "processed": 1,
                    "total": 2,
                    "updated": 1,
                    "skipped": 0,
                    "failed": 0,
                    "progress_percent": 50.0,
                }
            )
            progress_callback(
                {
                    "processed": 2,
                    "total": 2,
                    "updated": 2,
                    "skipped": 0,
                    "failed": 0,
                    "progress_percent": 100.0,
                }
            )
            return {
                "list_id": list_id,
                "source_column": "website",
                "source_custom_field": None,
                "target_field": "personalization",
                "template_variable": "{{personalization}}",
                "alias_template_variable": "{{personalization}}",
                "processed": 2,
                "updated": 2,
                "skipped": 0,
                "failed": 0,
                "results": [],
            }

        with patch(
            "app.database.async_session_factory",
            return_value=_session_context(session),
        ), patch(
            "app.services.lead_service.lead_service.personalize_leads",
            new=AsyncMock(side_effect=_mock_personalize),
        ):
            result = await _run_personalization_job_async(
                task=task,
                workspace_id=workspace_id,
                payload={
                    "list_id": list_id,
                    "source_column": "website",
                    "target_field": "personalization",
                    "tone": "professional",
                    "limit": 2,
                },
            )

        assert result["workspace_id"] == workspace_id
        assert result["result"]["updated"] == 2
        assert len(task.calls) == 2
        assert task.calls[-1]["state"] == "PROGRESS"
        assert task.calls[-1]["meta"]["workspace_id"] == workspace_id
        assert task.calls[-1]["meta"]["progress_percent"] == 100.0
        session.commit.assert_awaited_once()
        session.rollback.assert_not_awaited()

    async def test_run_personalization_job_async_rolls_back_on_error(self):
        workspace_id = str(uuid.uuid4())
        list_id = str(uuid.uuid4())
        task = _TaskSpy()

        session = AsyncMock()
        session.commit = AsyncMock()
        session.rollback = AsyncMock()

        with patch(
            "app.database.async_session_factory",
            return_value=_session_context(session),
        ), patch(
            "app.services.lead_service.lead_service.personalize_leads",
            new=AsyncMock(side_effect=RuntimeError("model failed")),
        ):
            with pytest.raises(RuntimeError):
                await _run_personalization_job_async(
                    task=task,
                    workspace_id=workspace_id,
                    payload={
                        "list_id": list_id,
                        "source_column": "website",
                        "target_field": "personalization",
                        "limit": 1,
                    },
                )

        session.commit.assert_not_awaited()
        session.rollback.assert_awaited_once()

    async def test_run_personalization_job_async_allows_missing_limit(self):
        workspace_id = str(uuid.uuid4())
        list_id = str(uuid.uuid4())
        task = _TaskSpy()

        session = AsyncMock()
        session.commit = AsyncMock()
        session.rollback = AsyncMock()

        with patch(
            "app.database.async_session_factory",
            return_value=_session_context(session),
        ), patch(
            "app.services.lead_service.lead_service.personalize_leads",
            new=AsyncMock(
                return_value={
                    "list_id": list_id,
                    "source_column": "website",
                    "source_custom_field": None,
                    "target_field": "personalization",
                    "template_variable": "{{personalization}}",
                    "alias_template_variable": "{{personalization}}",
                    "processed": 0,
                    "updated": 0,
                    "skipped": 0,
                    "failed": 0,
                    "results": [],
                }
            ),
        ) as mock_personalize:
            result = await _run_personalization_job_async(
                task=task,
                workspace_id=workspace_id,
                payload={
                    "list_id": list_id,
                    "source_column": "website",
                    "target_field": "personalization",
                },
            )

        assert result["workspace_id"] == workspace_id
        assert result["result"]["processed"] == 0
        assert mock_personalize.await_args.kwargs["limit"] is None
        session.commit.assert_awaited_once()
