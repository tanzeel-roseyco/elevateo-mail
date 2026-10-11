"""Lead service — CRUD, CSV import, bulk operations."""

import asyncio
import csv
import io
import json
import logging
import re
from uuid import UUID
from datetime import datetime, timezone
from typing import Any, Callable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.lead import Lead, LeadList, LeadListMember

logger = logging.getLogger(__name__)

VALID_PERSONALIZATION_SOURCE_COLUMNS = {
    "website",
    "linkedin_url",
    "company",
    "title",
    "industry",
    "city",
    "state",
    "country",
    "first_name",
    "last_name",
    "custom_field",
}

TARGET_FIELD_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,63}$")

WEBSITE_FALLBACK_CUSTOM_FIELD_KEYS = (
    "website",
    "company_website",
    "company_url",
    "domain",
    "company_domain",
    "url",
    "site",
)

FREE_EMAIL_DOMAINS = {
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.uk",
    "hotmail.com",
    "outlook.com",
    "live.com",
    "icloud.com",
    "me.com",
    "aol.com",
    "proton.me",
    "protonmail.com",
    "gmx.com",
    "yandex.com",
    "zoho.com",
    "mail.com",
}

PERSONALIZATION_CONCURRENCY = 8
PERSONALIZATION_BATCH_SIZE = 24


class LeadService:

    async def list_leads(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        skip: int = 0,
        limit: int = 50,
        status: str | None = None,
        search: str | None = None,
        list_id: UUID | None = None,
    ) -> tuple[list[Lead], int]:
        """List leads with pagination, optional status/search/list filter."""
        query = select(Lead).where(Lead.workspace_id == workspace_id)

        if list_id:
            query = query.join(LeadListMember, LeadListMember.lead_id == Lead.id).where(
                LeadListMember.lead_list_id == list_id
            )
        if status:
            query = query.where(Lead.status == status)
        if search:
            search_term = f"%{search}%"
            query = query.where(
                (Lead.email.ilike(search_term))
                | (Lead.first_name.ilike(search_term))
                | (Lead.last_name.ilike(search_term))
                | (Lead.company.ilike(search_term))
            )

        # Count
        count_query = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_query)).scalar() or 0

        # Paginate
        result = await db.execute(query.offset(skip).limit(limit).order_by(Lead.created_at.desc()))
        return list(result.scalars().all()), total

    async def get_lead(self, db: AsyncSession, lead_id: UUID, workspace_id: UUID) -> Lead:
        result = await db.execute(
            select(Lead).where(Lead.id == lead_id, Lead.workspace_id == workspace_id)
        )
        lead = result.scalar_one_or_none()
        if not lead:
            raise ValueError("Lead not found")
        return lead

    async def create_lead(self, db: AsyncSession, workspace_id: UUID, data: dict) -> Lead:
        # Normalize email to lowercase for consistent matching
        if data.get("email"):
            data["email"] = data["email"].strip().lower()
        lead = Lead(workspace_id=workspace_id, **data)
        db.add(lead)
        await db.flush()
        return lead

    async def update_lead(self, db: AsyncSession, lead_id: UUID, workspace_id: UUID, data: dict) -> Lead:
        lead = await self.get_lead(db, lead_id, workspace_id)
        # Normalize email to lowercase on update
        if "email" in data and data["email"]:
            data["email"] = data["email"].strip().lower()
        for key, value in data.items():
            if value is not None:
                setattr(lead, key, value)
        lead.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return lead

    async def delete_lead(self, db: AsyncSession, lead_id: UUID, workspace_id: UUID) -> None:
        lead = await self.get_lead(db, lead_id, workspace_id)
        await db.delete(lead)
        await db.flush()

    async def _verify_list_ownership(self, db: AsyncSession, list_id: UUID, workspace_id: UUID) -> LeadList:
        """Verify a lead list belongs to the workspace."""
        result = await db.execute(
            select(LeadList).where(LeadList.id == list_id, LeadList.workspace_id == workspace_id)
        )
        lead_list = result.scalar_one_or_none()
        if not lead_list:
            raise ValueError("Lead list not found")
        return lead_list

    def _normalize_source_column(self, source_column: str) -> str:
        normalized = source_column.strip().lower()
        if normalized not in VALID_PERSONALIZATION_SOURCE_COLUMNS:
            supported = ", ".join(sorted(VALID_PERSONALIZATION_SOURCE_COLUMNS))
            raise ValueError(f"Invalid source_column '{source_column}'. Supported: {supported}")
        return normalized

    def _extract_source_value(
        self,
        lead: Lead,
        source_column: str,
        source_custom_field: str | None,
    ) -> str:
        if source_column == "custom_field":
            key = (source_custom_field or "").strip()
            if not key:
                raise ValueError("source_custom_field is required when source_column is custom_field")
            value = (lead.custom_fields or {}).get(key)
            return str(value).strip() if value is not None else ""

        if source_column == "website":
            direct_website = self._normalize_website_candidate(getattr(lead, "website", None))
            if direct_website:
                return direct_website

            custom_fields = lead.custom_fields if isinstance(lead.custom_fields, dict) else {}
            for key in WEBSITE_FALLBACK_CUSTOM_FIELD_KEYS:
                custom_value = self._normalize_website_candidate(custom_fields.get(key))
                if custom_value:
                    return custom_value

            return self._derive_website_from_email(getattr(lead, "email", None))

        value = getattr(lead, source_column, None)
        return str(value).strip() if value is not None else ""

    def _normalize_website_candidate(self, raw_value: Any) -> str:
        value = str(raw_value or "").strip()
        if not value:
            return ""
        if value.startswith(("http://", "https://")):
            return value

        bare = value.strip().strip("/").lower()
        if re.match(r"^[a-z0-9.-]+\.[a-z]{2,}$", bare):
            return f"https://{bare}"
        return ""

    def _derive_website_from_email(self, email: str | None) -> str:
        raw_email = str(email or "").strip().lower()
        if "@" not in raw_email:
            return ""
        domain = raw_email.split("@", 1)[1].strip().lower().strip(".")
        if not domain or "." not in domain:
            return ""
        if domain in FREE_EMAIL_DOMAINS:
            return ""
        return f"https://{domain}"

    def _build_personalization_messages(
        self,
        *,
        lead: Lead,
        source_column: str,
        source_custom_field: str | None,
        source_value: str,
        tone: str | None,
        instructions: str | None,
    ) -> list[dict[str, str]]:
        source_label = (
            f"custom_fields.{source_custom_field}" if source_column == "custom_field" else source_column
        )
        lead_context: dict[str, Any] = {
            "first_name": lead.first_name or "",
            "last_name": lead.last_name or "",
            "email": lead.email or "",
            "company": lead.company or "",
            "title": lead.title or "",
            "industry": lead.industry or "",
            "city": lead.city or "",
            "state": lead.state or "",
            "country": lead.country or "",
            "linkedin_url": lead.linkedin_url or "",
            "website": lead.website or "",
        }
        if lead.custom_fields and isinstance(lead.custom_fields, dict):
            lead_context["custom_fields"] = {
                str(k): str(v)
                for k, v in list(lead.custom_fields.items())[:20]
                if v is not None and str(v).strip()
            }

        system_prompt = (
            "You write short, high-quality cold-email personalization lines. "
            "Use only the provided lead context and source text. "
            "Do not invent facts. Do not use placeholders like {{first_name}}. "
            "Return strict JSON object: {\"personalization\":\"...\"}."
        )
        user_prompt = (
            "Write one personalized opening line for this lead.\n"
            f"Tone: {tone or 'professional'}\n"
            f"Source column: {source_label}\n"
            f"Source value:\n{source_value}\n\n"
            f"Lead context JSON:\n{json.dumps(lead_context, ensure_ascii=True)}\n\n"
            "Requirements:\n"
            "- 1 sentence\n"
            "- max 220 characters\n"
            "- specific and natural\n"
            "- no markdown, no emojis\n"
            "- output JSON only\n"
        )
        if instructions and instructions.strip():
            user_prompt += f"\nExtra instructions:\n{instructions.strip()}\n"

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    def _extract_personalization_text(self, llm_response: str) -> str:
        cleaned = (llm_response or "").strip()
        if not cleaned:
            return ""

        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

        candidate: Any = ""
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict):
                candidate = (
                    parsed.get("personalization")
                    or parsed.get("line")
                    or parsed.get("opening_line")
                    or parsed.get("text")
                    or ""
                )
            elif isinstance(parsed, list) and parsed:
                first = parsed[0]
                if isinstance(first, dict):
                    candidate = (
                        first.get("personalization")
                        or first.get("line")
                        or first.get("opening_line")
                        or first.get("text")
                        or ""
                    )
        except json.JSONDecodeError:
            candidate = cleaned

        text = str(candidate or "").strip().strip("\"'")
        text = re.sub(r"\s+", " ", text).strip()
        return text[:220]

    async def personalize_leads(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        *,
        list_id: UUID,
        source_column: str = "website",
        source_custom_field: str | None = None,
        target_field: str = "personalization",
        tone: str | None = "professional",
        instructions: str | None = None,
        limit: int | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        source_column_normalized = self._normalize_source_column(source_column)
        source_custom_field_clean = source_custom_field.strip() if source_custom_field else None
        target_field_clean = target_field.strip()
        if not TARGET_FIELD_PATTERN.match(target_field_clean):
            raise ValueError(
                "target_field must start with a letter/underscore and contain only letters, numbers, underscores"
            )
        if source_column_normalized == "custom_field" and not source_custom_field_clean:
            raise ValueError("source_custom_field is required when source_column is custom_field")

        await self._verify_list_ownership(db, list_id, workspace_id)

        effective_limit = int(limit) if limit is not None else None
        if effective_limit is not None and effective_limit < 1:
            raise ValueError("limit must be >= 1")

        lead_query = (
            select(Lead)
            .join(LeadListMember, LeadListMember.lead_id == Lead.id)
            .where(
                Lead.workspace_id == workspace_id,
                LeadListMember.lead_list_id == list_id,
            )
            .order_by(Lead.created_at.desc())
        )
        if effective_limit is not None:
            lead_query = lead_query.limit(effective_limit)

        lead_result = await db.execute(lead_query)
        leads = list(lead_result.scalars().all())
        total = len(leads)

        def emit_progress(updated_count: int, skipped_count: int, failed_count: int) -> None:
            if not progress_callback:
                return
            processed_count = updated_count + skipped_count + failed_count
            percent = round((processed_count / total) * 100, 1) if total > 0 else 100.0
            progress_callback(
                {
                    "processed": processed_count,
                    "total": total,
                    "updated": updated_count,
                    "skipped": skipped_count,
                    "failed": failed_count,
                    "progress_percent": percent,
                }
            )

        if not leads:
            emit_progress(0, 0, 0)
            return {
                "list_id": list_id,
                "source_column": source_column_normalized,
                "source_custom_field": source_custom_field_clean,
                "target_field": target_field_clean,
                "template_variable": f"{{{{{target_field_clean}}}}}",
                "alias_template_variable": "{{personalization}}",
                "processed": 0,
                "updated": 0,
                "skipped": 0,
                "failed": 0,
                "results": [],
            }

        from app.services.prospecting.model_router_service import model_policy_crud
        from app.services.prospecting.openrouter_settings_service import (
            openrouter_settings_service,
        )
        from app.utils.openrouter_client import chat_completion

        model_cfg = await model_policy_crud.get_effective_config(
            db=db,
            workspace_id=workspace_id,
            agent_type="copywriting",
        )
        model_id = str(model_cfg.get("model_id") or "").strip() or None
        api_key, _ = await openrouter_settings_service.resolve_api_key(
            db=db,
            workspace_id=workspace_id,
        )
        if not api_key:
            raise ValueError(
                "No OpenRouter API key configured for personalization. "
                "Set one in Settings > AI Personalization."
            )

        source_label = (
            f"custom_fields.{source_custom_field_clean}"
            if source_column_normalized == "custom_field"
            else source_column_normalized
        )
        updated = 0
        skipped = 0
        failed = 0
        results: list[dict[str, Any]] = []

        emit_progress(updated, skipped, failed)

        runnable: list[tuple[Lead, str]] = []
        for lead in leads:
            source_value = self._extract_source_value(
                lead=lead,
                source_column=source_column_normalized,
                source_custom_field=source_custom_field_clean,
            )
            if not source_value:
                skipped += 1
                results.append(
                    {
                        "lead_id": lead.id,
                        "email": lead.email,
                        "status": "skipped",
                        "reason": f"No value in '{source_label}'",
                    }
                )
                emit_progress(updated, skipped, failed)
                continue

            runnable.append((lead, source_value))

        if not runnable:
            return {
                "list_id": list_id,
                "source_column": source_column_normalized,
                "source_custom_field": source_custom_field_clean,
                "target_field": target_field_clean,
                "template_variable": f"{{{{{target_field_clean}}}}}",
                "alias_template_variable": "{{personalization}}",
                "processed": total,
                "updated": updated,
                "skipped": skipped,
                "failed": failed,
                "results": results,
            }

        concurrency = max(1, min(PERSONALIZATION_CONCURRENCY, len(runnable)))
        semaphore = asyncio.Semaphore(concurrency)

        async def generate_for_lead(lead: Lead, source_value: str) -> dict[str, Any]:
            try:
                async with semaphore:
                    messages = self._build_personalization_messages(
                        lead=lead,
                        source_column=source_column_normalized,
                        source_custom_field=source_custom_field_clean,
                        source_value=source_value,
                        tone=tone,
                        instructions=instructions,
                    )
                    response_text = await chat_completion(
                        messages=messages,
                        model=model_id,
                        temperature=0.25,
                        max_tokens=220,
                        api_key=api_key,
                    )
                personalization = self._extract_personalization_text(response_text)
                if not personalization:
                    return {
                        "lead_id": lead.id,
                        "email": lead.email,
                        "status": "failed",
                        "reason": "Model returned empty personalization",
                    }
                return {
                    "lead_id": lead.id,
                    "email": lead.email,
                    "status": "updated",
                    "personalization": personalization,
                    "lead": lead,
                }
            except Exception as exc:
                logger.warning(
                    "Personalization failed for lead %s (%s): %s",
                    lead.id,
                    lead.email,
                    exc,
                )
                return {
                    "lead_id": lead.id,
                    "email": lead.email,
                    "status": "failed",
                    "reason": "Model call failed",
                }

        for offset in range(0, len(runnable), PERSONALIZATION_BATCH_SIZE):
            batch = runnable[offset : offset + PERSONALIZATION_BATCH_SIZE]
            batch_results = await asyncio.gather(
                *(generate_for_lead(lead, source_value) for lead, source_value in batch)
            )

            batch_updated = 0
            for item in batch_results:
                status = item.get("status")
                if status == "updated":
                    lead_obj = item.pop("lead")
                    personalization_text = str(item.get("personalization") or "").strip()
                    custom_fields = dict(lead_obj.custom_fields or {})
                    custom_fields[target_field_clean] = personalization_text
                    custom_fields["personalization"] = personalization_text
                    lead_obj.custom_fields = custom_fields
                    lead_obj.updated_at = datetime.now(timezone.utc)
                    updated += 1
                    batch_updated += 1
                    results.append(
                        {
                            "lead_id": item["lead_id"],
                            "email": item["email"],
                            "status": "updated",
                            "personalization": personalization_text,
                        }
                    )
                elif status == "failed":
                    failed += 1
                    results.append(
                        {
                            "lead_id": item["lead_id"],
                            "email": item["email"],
                            "status": "failed",
                            "reason": item.get("reason") or "Model call failed",
                        }
                    )
                else:
                    failed += 1
                    results.append(
                        {
                            "lead_id": item.get("lead_id"),
                            "email": item.get("email"),
                            "status": "failed",
                            "reason": "Unknown personalization result",
                        }
                    )
                emit_progress(updated, skipped, failed)

            if batch_updated > 0:
                await db.flush()

        return {
            "list_id": list_id,
            "source_column": source_column_normalized,
            "source_custom_field": source_custom_field_clean,
            "target_field": target_field_clean,
            "template_variable": f"{{{{{target_field_clean}}}}}",
            "alias_template_variable": "{{personalization}}",
            "processed": total,
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "results": results,
        }

    async def import_csv(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        csv_content: str,
        list_id: UUID | None = None,
    ) -> dict:
        """
        Import leads from CSV content.

        Expected columns: email (required), first_name, last_name, company,
        title, phone, linkedin_url, website, city, state, country, industry.
        Any unrecognized columns go into custom_fields.
        """
        # Validate list ownership if provided
        if list_id:
            await self._verify_list_ownership(db, list_id, workspace_id)

        known_fields = {
            "email", "first_name", "last_name", "company", "title",
            "phone", "linkedin_url", "website", "city", "state",
            "country", "industry",
        }

        reader = csv.DictReader(io.StringIO(csv_content))
        total = 0
        imported = 0
        skipped = 0
        errors = []

        for row in reader:
            total += 1
            email = row.get("email", "").strip().lower()
            if not email:
                errors.append(f"Row {total}: missing email")
                skipped += 1
                continue

            # Check for duplicate
            existing = await db.execute(
                select(Lead).where(Lead.workspace_id == workspace_id, Lead.email == email)
            )
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            # Separate known vs custom fields
            lead_data = {}
            custom = {}
            for key, value in row.items():
                if not key:
                    continue
                clean_key = key.strip().lower().replace(" ", "_")
                clean_value = value.strip() if value else None
                if clean_key in known_fields:
                    lead_data[clean_key] = clean_value
                elif clean_value:
                    custom[clean_key] = clean_value

            lead_data["email"] = email
            if custom:
                lead_data["custom_fields"] = custom

            try:
                lead = Lead(workspace_id=workspace_id, **lead_data)
                db.add(lead)
                imported += 1
                if list_id:
                    await db.flush()  # ensure lead.id is assigned
                    db.add(LeadListMember(lead_list_id=list_id, lead_id=lead.id))
            except Exception as e:
                errors.append(f"Row {total}: {str(e)}")
                skipped += 1

        await db.flush()

        # Notify workflow event bus about imported leads
        if imported > 0:
            try:
                from app.services.workflow.event_bus import workflow_event_bus
                # Collect IDs of imported leads
                imported_lead_ids = [
                    lead.id for lead in db.new
                    if hasattr(lead, '__tablename__') and getattr(lead, '__tablename__', '') == 'leads'
                ]
                if not imported_lead_ids:
                    # Fallback: query recently created leads
                    recent = await db.execute(
                        select(Lead.id).where(
                            Lead.workspace_id == workspace_id,
                        ).order_by(Lead.created_at.desc()).limit(imported)
                    )
                    imported_lead_ids = [row for row in recent.scalars().all()]

                if imported_lead_ids:
                    await workflow_event_bus.on_leads_imported(
                        db=db,
                        workspace_id=workspace_id,
                        lead_ids=imported_lead_ids,
                        trigger_data={"source": "csv_import"},
                    )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(
                    "Failed to notify workflow event bus on CSV import: %s", e
                )

        return {
            "total_rows": total,
            "imported": imported,
            "skipped": skipped,
            "errors": errors[:50],  # Cap error list
        }

    async def _verify_leads_ownership(
        self, db: AsyncSession, lead_ids: list[UUID], workspace_id: UUID
    ) -> list[UUID]:
        """Return only lead IDs that belong to the workspace. Silently drops foreign IDs."""
        if not lead_ids:
            return []
        result = await db.execute(
            select(Lead.id).where(Lead.workspace_id == workspace_id, Lead.id.in_(lead_ids))
        )
        return list(result.scalars().all())

    async def bulk_action(
        self,
        db: AsyncSession,
        workspace_id: UUID,
        lead_ids: list[UUID],
        action: str,
        list_id: UUID | None = None,
    ) -> dict:
        """Perform bulk actions on leads."""
        # Validate list ownership if provided
        if list_id:
            await self._verify_list_ownership(db, list_id, workspace_id)

        affected = 0

        if action == "delete":
            for lid in lead_ids:
                try:
                    lead = await self.get_lead(db, lid, workspace_id)
                    await db.delete(lead)
                    affected += 1
                except ValueError:
                    pass
            await db.flush()

        elif action == "add_to_list" and list_id:
            # Verify all lead IDs belong to this workspace
            owned_ids = await self._verify_leads_ownership(db, lead_ids, workspace_id)
            added_lead_ids = []
            for lid in owned_ids:
                existing = await db.execute(
                    select(LeadListMember).where(
                        LeadListMember.lead_list_id == list_id,
                        LeadListMember.lead_id == lid,
                    )
                )
                if not existing.scalar_one_or_none():
                    db.add(LeadListMember(lead_list_id=list_id, lead_id=lid))
                    added_lead_ids.append(lid)
                    affected += 1
            await db.flush()

            # Notify workflow event bus about list membership changes
            if added_lead_ids:
                try:
                    from app.services.workflow.event_bus import workflow_event_bus
                    await workflow_event_bus.on_list_membership_added(
                        db=db,
                        workspace_id=workspace_id,
                        lead_ids=added_lead_ids,
                        list_id=list_id,
                    )
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(
                        "Failed to notify workflow event bus on list add: %s", e
                    )

        elif action == "remove_from_list" and list_id:
            # Verify all lead IDs belong to this workspace
            owned_ids = await self._verify_leads_ownership(db, lead_ids, workspace_id)
            for lid in owned_ids:
                result = await db.execute(
                    select(LeadListMember).where(
                        LeadListMember.lead_list_id == list_id,
                        LeadListMember.lead_id == lid,
                    )
                )
                member = result.scalar_one_or_none()
                if member:
                    await db.delete(member)
                    affected += 1
            await db.flush()

        return {"action": action, "affected": affected}

    # ── Lead Lists ──

    async def create_list(self, db: AsyncSession, workspace_id: UUID, name: str, description: str | None = None) -> LeadList:
        lead_list = LeadList(workspace_id=workspace_id, name=name, description=description)
        db.add(lead_list)
        await db.flush()
        return lead_list

    async def get_lists(self, db: AsyncSession, workspace_id: UUID) -> list[LeadList]:
        result = await db.execute(
            select(LeadList).where(LeadList.workspace_id == workspace_id).order_by(LeadList.created_at.desc())
        )
        return list(result.scalars().all())


lead_service = LeadService()
