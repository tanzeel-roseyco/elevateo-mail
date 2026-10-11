"""Unit tests for lead personalization service behavior."""

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.lead_service import lead_service


class _ScalarList:
    def __init__(self, items):
        self._items = items

    def all(self):
        return list(self._items)


class _QueryResult:
    def __init__(self, *, one=None, items=None):
        self._one = one
        self._items = items or []

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        return _ScalarList(self._items)


def _make_lead(**overrides):
    return SimpleNamespace(
        id=overrides.get("id", uuid.uuid4()),
        email=overrides.get("email", "lead@example.com"),
        first_name=overrides.get("first_name", "Ava"),
        last_name=overrides.get("last_name", "Smith"),
        company=overrides.get("company", "Acme"),
        title=overrides.get("title", "Founder"),
        industry=overrides.get("industry", "SaaS"),
        city=overrides.get("city", "Copenhagen"),
        state=overrides.get("state", ""),
        country=overrides.get("country", "Denmark"),
        linkedin_url=overrides.get("linkedin_url", "https://linkedin.com/in/ava"),
        website=overrides.get("website", "https://acme.example"),
        custom_fields=overrides.get("custom_fields", {}),
        created_at=overrides.get("created_at"),
        updated_at=overrides.get("updated_at"),
    )


class TestLeadPersonalizationService:

    async def test_personalize_updates_target_and_alias_field(self):
        workspace_id = uuid.uuid4()
        list_id = uuid.uuid4()
        lead = _make_lead(custom_fields={"segment": "b2b"})

        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _QueryResult(one=SimpleNamespace(id=list_id)),  # list ownership check
                _QueryResult(items=[lead]),  # leads in list
            ]
        )
        db.flush = AsyncMock()

        with patch(
            "app.services.prospecting.model_router_service.model_policy_crud.get_effective_config",
            new_callable=AsyncMock,
            return_value={"model_id": "openai/gpt-4o-mini"},
        ), patch(
            "app.services.prospecting.openrouter_settings_service.openrouter_settings_service.resolve_api_key",
            new_callable=AsyncMock,
            return_value=("test-openrouter-key", "workspace"),
        ), patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value='{"personalization":"Loved your homepage positioning around workflow speed."}',
        ):
            result = await lead_service.personalize_leads(
                db=db,
                workspace_id=workspace_id,
                list_id=list_id,
                source_column="website",
                target_field="custom_intro",
                tone="professional",
                instructions="Keep it specific.",
                limit=10,
            )

        assert result["updated"] == 1
        assert result["failed"] == 0
        assert lead.custom_fields["custom_intro"] == "Loved your homepage positioning around workflow speed."
        assert lead.custom_fields["personalization"] == "Loved your homepage positioning around workflow speed."
        db.flush.assert_awaited_once()

    async def test_personalize_skips_when_source_value_missing(self):
        workspace_id = uuid.uuid4()
        list_id = uuid.uuid4()
        lead = _make_lead(email="lead@gmail.com", website=None, custom_fields={})

        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _QueryResult(one=SimpleNamespace(id=list_id)),
                _QueryResult(items=[lead]),
            ]
        )
        db.flush = AsyncMock()

        with patch(
            "app.services.prospecting.model_router_service.model_policy_crud.get_effective_config",
            new_callable=AsyncMock,
            return_value={"model_id": "openai/gpt-4o-mini"},
        ), patch(
            "app.services.prospecting.openrouter_settings_service.openrouter_settings_service.resolve_api_key",
            new_callable=AsyncMock,
            return_value=("test-openrouter-key", "workspace"),
        ), patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
        ) as mock_chat:
            result = await lead_service.personalize_leads(
                db=db,
                workspace_id=workspace_id,
                list_id=list_id,
                source_column="website",
                target_field="personalization",
                limit=10,
            )

        assert result["updated"] == 0
        assert result["skipped"] == 1
        assert result["results"][0]["status"] == "skipped"
        assert "No value in 'website'" in result["results"][0]["reason"]
        assert mock_chat.await_count == 0
        assert db.flush.await_count == 0

    async def test_custom_field_source_requires_key(self):
        workspace_id = uuid.uuid4()
        list_id = uuid.uuid4()
        db = AsyncMock()

        with pytest.raises(ValueError) as exc:
            await lead_service.personalize_leads(
                db=db,
                workspace_id=workspace_id,
                list_id=list_id,
                source_column="custom_field",
                source_custom_field=None,
                target_field="personalization",
                limit=10,
            )

        assert "source_custom_field is required" in str(exc.value)
        assert db.execute.await_count == 0

    async def test_personalize_emits_progress_callback(self):
        workspace_id = uuid.uuid4()
        list_id = uuid.uuid4()
        lead_with_source = _make_lead(email="one@example.com", website="https://one.example")
        lead_missing_source = _make_lead(email="two@gmail.com", website=None)

        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _QueryResult(one=SimpleNamespace(id=list_id)),
                _QueryResult(items=[lead_with_source, lead_missing_source]),
            ]
        )
        db.flush = AsyncMock()

        progress_events: list[dict] = []

        with patch(
            "app.services.prospecting.model_router_service.model_policy_crud.get_effective_config",
            new_callable=AsyncMock,
            return_value={"model_id": "openai/gpt-4o-mini"},
        ), patch(
            "app.services.prospecting.openrouter_settings_service.openrouter_settings_service.resolve_api_key",
            new_callable=AsyncMock,
            return_value=("test-openrouter-key", "workspace"),
        ), patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value='{"personalization":"Loved the clarity on your pricing page."}',
        ):
            result = await lead_service.personalize_leads(
                db=db,
                workspace_id=workspace_id,
                list_id=list_id,
                source_column="website",
                target_field="personalization",
                limit=10,
                progress_callback=lambda meta: progress_events.append(dict(meta)),
            )

        assert result["updated"] == 1
        assert result["skipped"] == 1
        assert len(progress_events) >= 3
        assert progress_events[0]["processed"] == 0
        assert progress_events[0]["total"] == 2
        assert progress_events[-1]["processed"] == 2
        assert progress_events[-1]["updated"] == 1
        assert progress_events[-1]["skipped"] == 1
        assert progress_events[-1]["failed"] == 0
        assert progress_events[-1]["progress_percent"] == 100.0

    async def test_personalize_uses_custom_field_website_fallback(self):
        workspace_id = uuid.uuid4()
        list_id = uuid.uuid4()
        lead = _make_lead(
            email="lead@gmail.com",
            website=None,
            custom_fields={"company_website": "acme.example"},
        )

        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _QueryResult(one=SimpleNamespace(id=list_id)),
                _QueryResult(items=[lead]),
            ]
        )
        db.flush = AsyncMock()

        with patch(
            "app.services.prospecting.model_router_service.model_policy_crud.get_effective_config",
            new_callable=AsyncMock,
            return_value={"model_id": "openai/gpt-4o-mini"},
        ), patch(
            "app.services.prospecting.openrouter_settings_service.openrouter_settings_service.resolve_api_key",
            new_callable=AsyncMock,
            return_value=("test-openrouter-key", "workspace"),
        ), patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value='{"personalization":"Noticed your updated product pages and clear positioning."}',
        ) as mock_chat:
            result = await lead_service.personalize_leads(
                db=db,
                workspace_id=workspace_id,
                list_id=list_id,
                source_column="website",
                target_field="personalization",
                limit=10,
            )

        assert result["updated"] == 1
        assert result["skipped"] == 0
        messages = mock_chat.await_args.kwargs["messages"]
        assert "https://acme.example" in messages[1]["content"]

    async def test_personalize_uses_email_domain_website_fallback(self):
        workspace_id = uuid.uuid4()
        list_id = uuid.uuid4()
        lead = _make_lead(
            email="owner@acme.com",
            website=None,
            custom_fields={},
        )

        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _QueryResult(one=SimpleNamespace(id=list_id)),
                _QueryResult(items=[lead]),
            ]
        )
        db.flush = AsyncMock()

        with patch(
            "app.services.prospecting.model_router_service.model_policy_crud.get_effective_config",
            new_callable=AsyncMock,
            return_value={"model_id": "openai/gpt-4o-mini"},
        ), patch(
            "app.services.prospecting.openrouter_settings_service.openrouter_settings_service.resolve_api_key",
            new_callable=AsyncMock,
            return_value=("test-openrouter-key", "workspace"),
        ), patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value='{"personalization":"Your homepage makes the product value proposition very clear."}',
        ) as mock_chat:
            result = await lead_service.personalize_leads(
                db=db,
                workspace_id=workspace_id,
                list_id=list_id,
                source_column="website",
                target_field="personalization",
                limit=10,
            )

        assert result["updated"] == 1
        assert result["skipped"] == 0
        messages = mock_chat.await_args.kwargs["messages"]
        assert "https://acme.com" in messages[1]["content"]

    async def test_personalize_without_limit_processes_full_list(self):
        workspace_id = uuid.uuid4()
        list_id = uuid.uuid4()
        leads = [
            _make_lead(email="a@example.com", website="https://a.example"),
            _make_lead(email="b@example.com", website="https://b.example"),
        ]

        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[
                _QueryResult(one=SimpleNamespace(id=list_id)),
                _QueryResult(items=leads),
            ]
        )
        db.flush = AsyncMock()

        with patch(
            "app.services.prospecting.model_router_service.model_policy_crud.get_effective_config",
            new_callable=AsyncMock,
            return_value={"model_id": "openai/gpt-4o-mini"},
        ), patch(
            "app.services.prospecting.openrouter_settings_service.openrouter_settings_service.resolve_api_key",
            new_callable=AsyncMock,
            return_value=("test-openrouter-key", "workspace"),
        ), patch(
            "app.utils.openrouter_client.chat_completion",
            new_callable=AsyncMock,
            return_value='{"personalization":"Loved your concise homepage messaging."}',
        ) as mock_chat:
            result = await lead_service.personalize_leads(
                db=db,
                workspace_id=workspace_id,
                list_id=list_id,
                source_column="website",
                target_field="personalization",
                limit=None,
            )

        assert result["processed"] == 2
        assert result["updated"] == 2
        assert result["failed"] == 0
        assert mock_chat.await_count == 2
