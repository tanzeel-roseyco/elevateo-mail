"""Tests for lead routes — CRUD, CSV import, pagination."""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import TEST_USER_ID, TEST_WORKSPACE_ID


def _make_lead(**overrides):
    """Create a mock Lead."""
    lead = MagicMock()
    lead.id = overrides.get("id", uuid.uuid4())
    lead.workspace_id = overrides.get("workspace_id", TEST_WORKSPACE_ID)
    lead.email = overrides.get("email", "lead@example.com")
    lead.first_name = overrides.get("first_name", "Jane")
    lead.last_name = overrides.get("last_name", "Doe")
    lead.company = overrides.get("company", "Acme Corp")
    lead.title = overrides.get("title", "CTO")
    lead.phone = overrides.get("phone", None)
    lead.linkedin_url = overrides.get("linkedin_url", None)
    lead.website = overrides.get("website", None)
    lead.city = overrides.get("city", None)
    lead.state = overrides.get("state", None)
    lead.country = overrides.get("country", None)
    lead.industry = overrides.get("industry", None)
    lead.custom_fields = overrides.get("custom_fields", {})
    lead.status = overrides.get("status", "active")
    lead.created_at = overrides.get("created_at", datetime.now(timezone.utc))
    lead.updated_at = overrides.get("updated_at", datetime.now(timezone.utc))
    return lead


class _FakeAsyncResult:
    def __init__(self, *, state: str, info=None, result=None):
        self.state = state
        self.info = info
        self.result = result


# ---------------------------------------------------------------------------
# GET /api/leads — with pagination
# ---------------------------------------------------------------------------

class TestListLeads:

    async def test_list_empty(self, client):
        with patch(
            "app.routers.leads.lead_service.list_leads",
            new_callable=AsyncMock,
            return_value=([], 0),
        ):
            resp = await client.get("/api/leads/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["leads"] == []
        assert data["total"] == 0
        assert data["skip"] == 0
        assert data["limit"] == 50

    async def test_list_with_data(self, client):
        leads = [_make_lead(email="a@b.com"), _make_lead(email="c@d.com")]
        with patch(
            "app.routers.leads.lead_service.list_leads",
            new_callable=AsyncMock,
            return_value=(leads, 2),
        ):
            resp = await client.get("/api/leads/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["leads"]) == 2
        assert data["total"] == 2

    async def test_list_with_pagination_params(self, client):
        with patch(
            "app.routers.leads.lead_service.list_leads",
            new_callable=AsyncMock,
            return_value=([], 0),
        ) as mock_list:
            resp = await client.get("/api/leads/?skip=10&limit=25")
        assert resp.status_code == 200
        # Verify the service was called with correct pagination
        mock_list.assert_called_once()
        call_kwargs = mock_list.call_args
        assert call_kwargs.kwargs.get("skip") == 10 or call_kwargs[1].get("skip") == 10

    async def test_list_with_search(self, client):
        with patch(
            "app.routers.leads.lead_service.list_leads",
            new_callable=AsyncMock,
            return_value=([], 0),
        ) as mock_list:
            resp = await client.get("/api/leads/?search=acme")
        assert resp.status_code == 200

    async def test_list_with_status_filter(self, client):
        with patch(
            "app.routers.leads.lead_service.list_leads",
            new_callable=AsyncMock,
            return_value=([], 0),
        ):
            resp = await client.get("/api/leads/?status=bounced")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# POST /api/leads
# ---------------------------------------------------------------------------

class TestCreateLead:

    async def test_create_success(self, client):
        new_lead = _make_lead(email="new@lead.com", first_name="New")
        with patch(
            "app.routers.leads.lead_service.create_lead",
            new_callable=AsyncMock,
            return_value=new_lead,
        ):
            resp = await client.post("/api/leads/", json={
                "email": "new@lead.com",
                "first_name": "New",
                "company": "Startup Inc",
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "new@lead.com"

    async def test_create_minimal(self, client):
        """Only email is required."""
        lead = _make_lead(email="minimal@test.com", first_name=None)
        with patch(
            "app.routers.leads.lead_service.create_lead",
            new_callable=AsyncMock,
            return_value=lead,
        ):
            resp = await client.post("/api/leads/", json={"email": "minimal@test.com"})
        assert resp.status_code == 201

    async def test_create_invalid_email(self, client):
        """Invalid email format returns 422."""
        resp = await client.post("/api/leads/", json={"email": "not-an-email"})
        assert resp.status_code == 422

    async def test_create_duplicate(self, client):
        with patch(
            "app.routers.leads.lead_service.create_lead",
            new_callable=AsyncMock,
            side_effect=ValueError("duplicate key"),
        ):
            resp = await client.post("/api/leads/", json={"email": "dupe@test.com"})
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# GET /api/leads/{id}
# ---------------------------------------------------------------------------

class TestGetLead:

    async def test_get_found(self, client):
        lid = uuid.uuid4()
        lead = _make_lead(id=lid, email="found@lead.com")
        with patch(
            "app.routers.leads.lead_service.get_lead",
            new_callable=AsyncMock,
            return_value=lead,
        ):
            resp = await client.get(f"/api/leads/{lid}")
        assert resp.status_code == 200
        assert resp.json()["email"] == "found@lead.com"

    async def test_get_not_found(self, client):
        lid = uuid.uuid4()
        with patch(
            "app.routers.leads.lead_service.get_lead",
            new_callable=AsyncMock,
            side_effect=ValueError("Lead not found"),
        ):
            resp = await client.get(f"/api/leads/{lid}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/leads/{id}
# ---------------------------------------------------------------------------

class TestUpdateLead:

    async def test_update_success(self, client):
        lid = uuid.uuid4()
        updated = _make_lead(id=lid, first_name="Updated")
        with patch(
            "app.routers.leads.lead_service.update_lead",
            new_callable=AsyncMock,
            return_value=updated,
        ):
            resp = await client.patch(f"/api/leads/{lid}", json={"first_name": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["first_name"] == "Updated"

    async def test_update_not_found(self, client):
        lid = uuid.uuid4()
        with patch(
            "app.routers.leads.lead_service.update_lead",
            new_callable=AsyncMock,
            side_effect=ValueError("Lead not found"),
        ):
            resp = await client.patch(f"/api/leads/{lid}", json={"first_name": "X"})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/leads/{id}
# ---------------------------------------------------------------------------

class TestDeleteLead:

    async def test_delete_success(self, client):
        lid = uuid.uuid4()
        with patch(
            "app.routers.leads.lead_service.delete_lead",
            new_callable=AsyncMock,
        ):
            resp = await client.delete(f"/api/leads/{lid}")
        assert resp.status_code == 204

    async def test_delete_not_found(self, client):
        lid = uuid.uuid4()
        with patch(
            "app.routers.leads.lead_service.delete_lead",
            new_callable=AsyncMock,
            side_effect=ValueError("Lead not found"),
        ):
            resp = await client.delete(f"/api/leads/{lid}")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/leads/import/csv
# ---------------------------------------------------------------------------

class TestCSVImport:

    async def test_import_success(self, client):
        csv_content = "email,first_name,company\njohn@acme.com,John,Acme\njane@corp.com,Jane,Corp\n"
        with patch(
            "app.routers.leads.lead_service.import_csv",
            new_callable=AsyncMock,
            return_value={
                "total_rows": 2,
                "imported": 2,
                "skipped": 0,
                "errors": [],
            },
        ):
            resp = await client.post(
                "/api/leads/import/csv",
                files={"file": ("leads.csv", csv_content, "text/csv")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_rows"] == 2
        assert data["imported"] == 2
        assert data["skipped"] == 0

    async def test_import_with_skips(self, client):
        csv_content = "email,first_name\njohn@acme.com,John\n"
        with patch(
            "app.routers.leads.lead_service.import_csv",
            new_callable=AsyncMock,
            return_value={
                "total_rows": 1,
                "imported": 0,
                "skipped": 1,
                "errors": [],
            },
        ):
            resp = await client.post(
                "/api/leads/import/csv",
                files={"file": ("leads.csv", csv_content, "text/csv")},
            )
        assert resp.status_code == 200
        assert resp.json()["skipped"] == 1

    async def test_import_wrong_file_type(self, client):
        """Non-CSV file returns 400."""
        resp = await client.post(
            "/api/leads/import/csv",
            files={"file": ("data.txt", "not csv", "text/plain")},
        )
        assert resp.status_code == 400
        assert "CSV" in resp.json()["detail"]

    async def test_import_no_file(self, client):
        """Missing file returns 422."""
        resp = await client.post("/api/leads/import/csv")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# POST /api/leads/personalize
# ---------------------------------------------------------------------------

class TestLeadPersonalization:

    async def test_personalize_success(self, client):
        list_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        response_payload = {
            "list_id": str(list_id),
            "source_column": "website",
            "source_custom_field": None,
            "target_field": "personalization",
            "template_variable": "{{personalization}}",
            "alias_template_variable": "{{personalization}}",
            "processed": 1,
            "updated": 1,
            "skipped": 0,
            "failed": 0,
            "results": [
                {
                    "lead_id": str(lead_id),
                    "email": "lead@example.com",
                    "status": "updated",
                    "reason": None,
                    "personalization": "I noticed your team just launched a new product line.",
                }
            ],
        }
        with patch(
            "app.routers.leads.lead_service.personalize_leads",
            new_callable=AsyncMock,
            return_value=response_payload,
        ) as mock_personalize:
            resp = await client.post(
                "/api/leads/personalize",
                json={
                    "list_id": str(list_id),
                    "source_column": "website",
                    "target_field": "personalization",
                    "tone": "professional",
                    "instructions": "Keep it concise.",
                    "limit": 25,
                },
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["updated"] == 1
        assert data["results"][0]["status"] == "updated"
        mock_personalize.assert_called_once()

    async def test_personalize_invalid_request(self, client):
        resp = await client.post(
            "/api/leads/personalize",
            json={
                "source_column": "website",
                "target_field": "personalization",
                "limit": 10,
            },
        )
        assert resp.status_code == 422

    async def test_personalize_service_validation_error(self, client):
        list_id = uuid.uuid4()
        with patch(
            "app.routers.leads.lead_service.personalize_leads",
            new_callable=AsyncMock,
            side_effect=ValueError("No OpenRouter API key configured"),
        ):
            resp = await client.post(
                "/api/leads/personalize",
                json={
                    "list_id": str(list_id),
                    "source_column": "website",
                    "target_field": "personalization",
                    "limit": 10,
                },
            )
        assert resp.status_code == 400
        assert "OpenRouter API key" in resp.json()["detail"]


class TestLeadPersonalizationJobs:

    async def test_create_personalization_job_success(self, client):
        list_id = uuid.uuid4()
        mock_task = MagicMock()
        mock_task.id = "job-123"

        with patch(
            "app.workers.celery_app.celery_app.send_task",
            return_value=mock_task,
        ) as mock_send_task:
            resp = await client.post(
                "/api/leads/personalize/jobs",
                json={
                    "list_id": str(list_id),
                    "source_column": "custom_field",
                    "source_custom_field": "website_summary",
                    "target_field": "intro_line",
                    "tone": "professional",
                    "instructions": "Mention recent launches only.",
                    "limit": 20,
                },
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["job_id"] == "job-123"
        assert data["status"] == "queued"

        mock_send_task.assert_called_once()
        assert (
            mock_send_task.call_args.args[0]
            == "app.workers.lead_personalization_worker.run_lead_personalization_job"
        )
        assert mock_send_task.call_args.kwargs["args"][0] == str(TEST_WORKSPACE_ID)
        assert mock_send_task.call_args.kwargs["args"][1]["source_custom_field"] == "website_summary"

    async def test_create_personalization_job_without_limit_uses_backend_default(self, client):
        list_id = uuid.uuid4()
        mock_task = MagicMock()
        mock_task.id = "job-nolimit"

        with patch(
            "app.workers.celery_app.celery_app.send_task",
            return_value=mock_task,
        ) as mock_send_task:
            resp = await client.post(
                "/api/leads/personalize/jobs",
                json={
                    "list_id": str(list_id),
                    "source_column": "website",
                    "target_field": "personalization",
                },
            )

        assert resp.status_code == 200
        payload = mock_send_task.call_args.kwargs["args"][1]
        assert "limit" in payload
        assert payload["limit"] is None

    async def test_get_personalization_job_status_running(self, client):
        task = _FakeAsyncResult(
            state="PROGRESS",
            info={
                "workspace_id": str(TEST_WORKSPACE_ID),
                "processed": 7,
                "total": 25,
                "updated": 6,
                "skipped": 1,
                "failed": 0,
                "progress_percent": 28.0,
            },
        )

        with patch("celery.result.AsyncResult", return_value=task):
            resp = await client.get("/api/leads/personalize/jobs/job-xyz")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "running"
        assert data["progress"]["processed"] == 7
        assert data["progress"]["total"] == 25
        assert data["result"] is None

    async def test_get_personalization_job_status_completed_returns_result(self, client):
        list_id = uuid.uuid4()
        lead_id = uuid.uuid4()
        task = _FakeAsyncResult(
            state="SUCCESS",
            info={
                "workspace_id": str(TEST_WORKSPACE_ID),
                "processed": 1,
                "total": 1,
                "updated": 1,
                "skipped": 0,
                "failed": 0,
                "progress_percent": 100.0,
            },
            result={
                "workspace_id": str(TEST_WORKSPACE_ID),
                "result": {
                    "list_id": str(list_id),
                    "source_column": "website",
                    "source_custom_field": None,
                    "target_field": "personalization",
                    "template_variable": "{{personalization}}",
                    "alias_template_variable": "{{personalization}}",
                    "processed": 1,
                    "updated": 1,
                    "skipped": 0,
                    "failed": 0,
                    "results": [
                        {
                            "lead_id": str(lead_id),
                            "email": "lead@example.com",
                            "status": "updated",
                            "reason": None,
                            "personalization": "Loved your recent product launch focus.",
                        }
                    ],
                },
            },
        )

        with patch("celery.result.AsyncResult", return_value=task):
            resp = await client.get("/api/leads/personalize/jobs/job-complete")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"
        assert data["result"] is not None
        assert data["result"]["updated"] == 1
        assert data["error"] is None

    async def test_get_personalization_job_status_failed_returns_error(self, client):
        task = _FakeAsyncResult(
            state="FAILURE",
            info={"workspace_id": str(TEST_WORKSPACE_ID)},
            result=RuntimeError("upstream model timeout"),
        )

        with patch("celery.result.AsyncResult", return_value=task):
            resp = await client.get("/api/leads/personalize/jobs/job-failed")

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "failed"
        assert "timeout" in data["error"]

    async def test_get_personalization_job_status_workspace_guard_mismatch_meta(self, client):
        task = _FakeAsyncResult(
            state="PROGRESS",
            info={"workspace_id": str(uuid.uuid4())},
        )

        with patch("celery.result.AsyncResult", return_value=task):
            resp = await client.get("/api/leads/personalize/jobs/job-other-workspace")

        assert resp.status_code == 404

    async def test_get_personalization_job_status_workspace_guard_mismatch_result(self, client):
        task = _FakeAsyncResult(
            state="SUCCESS",
            info={"workspace_id": str(TEST_WORKSPACE_ID)},
            result={
                "workspace_id": str(uuid.uuid4()),
                "result": None,
            },
        )

        with patch("celery.result.AsyncResult", return_value=task):
            resp = await client.get("/api/leads/personalize/jobs/job-other-result")

        assert resp.status_code == 404
