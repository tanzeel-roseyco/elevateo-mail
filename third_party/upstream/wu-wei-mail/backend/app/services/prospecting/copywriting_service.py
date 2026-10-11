"""Copywriting specialist agent service — generates sequence-ready copy variants.

Generates cold email copy for selected lead segments:
1. Analyzes segment characteristics (industry, role, pain points).
2. Generates multiple copy variants with subject + body via LLM.
3. Enforces tone, compliance hints, and personalization variables.
4. Returns typed structure compatible with existing email templates.

Uses OpenRouter LLM for dynamic copy generation with template fallback.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prospecting import (
    ProspectingConversation, ProspectingLead, ProspectingMessage,
    ProspectingRun,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Copy variant model
# ---------------------------------------------------------------------------

@dataclass
class CopyVariant:
    """A single copy variant (subject + body)."""
    subject: str
    body: str
    variant_label: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class CopyDraft:
    """Complete copy draft with variants and metadata."""
    conversation_id: uuid.UUID
    variants: list[CopyVariant]
    segment_description: str | None = None
    tone: str = "professional"
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Tone presets
# ---------------------------------------------------------------------------

TONE_TEMPLATES: dict[str, dict[str, str]] = {
    "professional": {
        "greeting": "Hi {{first_name}},",
        "closing": "Best regards",
        "style": "clear, direct, business-appropriate",
    },
    "casual": {
        "greeting": "Hey {{first_name}},",
        "closing": "Cheers",
        "style": "friendly, conversational, approachable",
    },
    "formal": {
        "greeting": "Dear {{first_name}},",
        "closing": "Sincerely",
        "style": "formal, respectful, traditional business tone",
    },
    "bold": {
        "greeting": "{{first_name}} \u2014",
        "closing": "Talk soon",
        "style": "confident, attention-grabbing, concise",
    },
}


# ---------------------------------------------------------------------------
# Personalization variables
# ---------------------------------------------------------------------------

AVAILABLE_VARIABLES = {
    "{{first_name}}": "Lead's first name",
    "{{last_name}}": "Lead's last name",
    "{{company}}": "Lead's company name",
    "{{title}}": "Lead's job title",
    "{{industry}}": "Lead's industry",
    "{{city}}": "Lead's city",
}


# ---------------------------------------------------------------------------
# LLM prompt for copywriting
# ---------------------------------------------------------------------------

COPYWRITING_PROMPT = """You are an expert cold email copywriter. Generate {num_variants} unique cold email variants for outreach.

Target segment: {segment_description}
Tone: {tone} ({tone_style})
Top industries in segment: {industries}
Top titles in segment: {titles}
Number of leads: {lead_count}

Each variant should have a different angle/approach. Use these personalization variables where appropriate:
- {{{{first_name}}}} - recipient's first name
- {{{{last_name}}}} - recipient's last name
- {{{{company}}}} - recipient's company
- {{{{title}}}} - recipient's job title
- {{{{industry}}}} - recipient's industry
- {{{{city}}}} - recipient's city

Guidelines:
- Keep subject lines under 60 characters
- Keep body under 150 words
- Include a clear CTA (call to action)
- Don't be salesy or pushy
- Sound human, not like a template
- Each variant should use a different angle (question, observation, social proof, problem-solution, ultra-short)

Return a JSON array of objects, each with:
- "subject": the email subject line
- "body": the email body text
- "variant_label": a short label describing the angle (e.g., "Direct Question", "Social Proof")

Return ONLY valid JSON array, no other text."""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class CopywritingService:
    """Generates sequence-ready cold email copy variants."""

    async def generate_draft(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        segment_description: str | None = None,
        tone: str = "professional",
        num_variants: int = 2,
    ) -> CopyDraft:
        """Generate copy variants for a conversation's lead segment."""
        # Verify conversation
        result = await db.execute(
            select(ProspectingConversation).where(
                ProspectingConversation.id == conversation_id,
                ProspectingConversation.workspace_id == workspace_id,
            )
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found in workspace")

        # Get segment context from conversation leads
        segment_context = await self._build_segment_context(
            db, conversation_id, workspace_id,
        )

        # Try LLM-powered generation first, fall back to templates
        variants = await self._generate_variants_llm(
            db=db,
            workspace_id=workspace_id,
            segment_context=segment_context,
            segment_description=segment_description,
            tone=tone,
            num_variants=num_variants,
        )

        if not variants:
            # Fallback to template-based generation
            variants = self._generate_variants_template(
                segment_context=segment_context,
                segment_description=segment_description,
                tone=tone,
                num_variants=num_variants,
            )

        return CopyDraft(
            conversation_id=conversation_id,
            variants=variants,
            segment_description=segment_description,
            tone=tone,
            metadata={
                "segment_context": segment_context,
                "tone_preset": TONE_TEMPLATES.get(tone, TONE_TEMPLATES["professional"]),
                "available_variables": list(AVAILABLE_VARIABLES.keys()),
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    async def _build_segment_context(
        self,
        db: AsyncSession,
        conversation_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Build segment context from leads belonging to this conversation's runs."""
        leads_result = await db.execute(
            select(ProspectingLead)
            .join(ProspectingRun, ProspectingLead.run_id == ProspectingRun.id)
            .where(
                ProspectingRun.conversation_id == conversation_id,
                ProspectingLead.workspace_id == workspace_id,
                ProspectingLead.is_excluded.is_(False),
                ProspectingLead.is_selected.is_(True),
            ).limit(100)
        )
        leads = list(leads_result.scalars().all())

        if not leads:
            return {
                "lead_count": 0,
                "top_industries": [],
                "top_titles": [],
                "top_companies": [],
            }

        industries = {}
        titles = {}
        companies = {}

        for lead in leads:
            if lead.industry:
                industries[lead.industry] = industries.get(lead.industry, 0) + 1
            if lead.title:
                titles[lead.title] = titles.get(lead.title, 0) + 1
            if lead.company:
                companies[lead.company] = companies.get(lead.company, 0) + 1

        return {
            "lead_count": len(leads),
            "top_industries": sorted(industries, key=industries.get, reverse=True)[:5],
            "top_titles": sorted(titles, key=titles.get, reverse=True)[:5],
            "top_companies": sorted(companies, key=companies.get, reverse=True)[:5],
        }

    async def _generate_variants_llm(
        self,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        segment_context: dict[str, Any],
        segment_description: str | None,
        tone: str,
        num_variants: int,
    ) -> list[CopyVariant]:
        """Generate copy variants using OpenRouter LLM."""
        try:
            from app.utils.openrouter_client import chat_completion
            from app.services.prospecting.model_router_service import model_policy_crud
            from app.services.prospecting.openrouter_settings_service import (
                openrouter_settings_service,
            )

            tone_preset = TONE_TEMPLATES.get(tone, TONE_TEMPLATES["professional"])
            industries = segment_context.get("top_industries", [])
            titles = segment_context.get("top_titles", [])
            model_cfg = await model_policy_crud.get_effective_config(
                db=db,
                workspace_id=workspace_id,
                agent_type="copywriting",
            )
            model_id = str(model_cfg.get("model_id") or "").strip()
            api_key, _ = await openrouter_settings_service.resolve_api_key(
                db=db,
                workspace_id=workspace_id,
            )
            if not api_key:
                raise ValueError("No OpenRouter API key configured for copywriting")

            prompt = COPYWRITING_PROMPT.format(
                num_variants=num_variants,
                segment_description=segment_description or "General B2B prospects",
                tone=tone,
                tone_style=tone_preset["style"],
                industries=", ".join(industries) if industries else "Various",
                titles=", ".join(titles) if titles else "Various",
                lead_count=segment_context.get("lead_count", 0),
            )

            response = await chat_completion(
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": "Generate the copy variants now."},
                ],
                model=model_id or None,
                temperature=0.7,  # Higher temperature for creative copy
                api_key=api_key,
            )

            return self._parse_variants_json(response)

        except Exception as e:
            logger.warning("LLM copywriting failed, using templates: %s", str(e))
            return []

    def _parse_variants_json(self, response: str) -> list[CopyVariant]:
        """Parse copy variants from LLM JSON response."""
        cleaned = response.strip()

        # Strip markdown code block markers
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()

        try:
            data = json.loads(cleaned)
            if isinstance(data, dict):
                for key in ("variants", "results", "emails"):
                    if key in data and isinstance(data[key], list):
                        data = data[key]
                        break
                else:
                    data = [data]

            if not isinstance(data, list):
                return []

            variants = []
            for item in data:
                if isinstance(item, dict) and "subject" in item and "body" in item:
                    variants.append(CopyVariant(
                        subject=item["subject"],
                        body=item["body"],
                        variant_label=item.get("variant_label"),
                        metadata={"source": "llm"},
                    ))
            return variants

        except json.JSONDecodeError:
            logger.warning("Failed to parse copy variants JSON: %.200s", cleaned)
            return []

    def _generate_variants_template(
        self,
        segment_context: dict[str, Any],
        segment_description: str | None,
        tone: str,
        num_variants: int,
    ) -> list[CopyVariant]:
        """Generate copy variants using templates (fallback)."""
        tone_preset = TONE_TEMPLATES.get(tone, TONE_TEMPLATES["professional"])
        greeting = tone_preset["greeting"]
        closing = tone_preset["closing"]

        industries = segment_context.get("top_industries", [])
        titles = segment_context.get("top_titles", [])
        industry_text = industries[0] if industries else "your industry"
        title_text = titles[0] if titles else "{{title}}"
        segment_text = segment_description or f"{title_text}s in {industry_text}"

        templates = [
            CopyVariant(
                subject=f"Quick question for {{{{first_name}}}} at {{{{company}}}}",
                body=(
                    f"{greeting}\n\n"
                    f"I noticed you're a {title_text} at {{{{company}}}} and thought this might resonate.\n\n"
                    f"We help {segment_text} streamline their outreach and see better response rates. "
                    f"Would it make sense to have a quick 15-minute chat about how we could help {{{{company}}}}?\n\n"
                    f"{closing}"
                ),
                variant_label="Direct Question",
                metadata={"angle": "direct_question", "tone": tone, "source": "template"},
            ),
            CopyVariant(
                subject=f"{{{{first_name}}}}, saw {{{{company}}}}'s recent growth",
                body=(
                    f"{greeting}\n\n"
                    f"I've been following {{{{company}}}}'s trajectory and it's impressive. "
                    f"As a {title_text}, you're probably thinking about scaling your outbound efforts.\n\n"
                    f"I'd love to share a few strategies that have worked well for similar "
                    f"companies in {industry_text}. Open to a quick call this week?\n\n"
                    f"{closing}"
                ),
                variant_label="Observation + Value",
                metadata={"angle": "observation_value", "tone": tone, "source": "template"},
            ),
            CopyVariant(
                subject=f"Idea for {{{{company}}}}'s {industry_text} outreach",
                body=(
                    f"{greeting}\n\n"
                    f"Working with other {segment_text}, we've found a pattern that consistently "
                    f"improves response rates by 2-3x.\n\n"
                    f"I put together a quick overview that might be relevant for {{{{company}}}}. "
                    f"Would you like me to send it over?\n\n"
                    f"{closing}"
                ),
                variant_label="Social Proof + Curiosity",
                metadata={"angle": "social_proof_curiosity", "tone": tone, "source": "template"},
            ),
            CopyVariant(
                subject=f"{{{{first_name}}}}, quick thought on {industry_text}",
                body=(
                    f"{greeting}\n\n"
                    f"Not sure if this is on your radar, but we've been helping "
                    f"{segment_text} solve a common challenge with cold outreach.\n\n"
                    f"The short version: we help teams send more personalized emails at scale "
                    f"without sacrificing quality. Worth a conversation?\n\n"
                    f"{closing}"
                ),
                variant_label="Problem-Solution",
                metadata={"angle": "problem_solution", "tone": tone, "source": "template"},
            ),
            CopyVariant(
                subject=f"{{{{company}}}} + better outreach",
                body=(
                    f"{greeting}\n\n"
                    f"I'll keep this short \u2014 we help {segment_text} get more replies "
                    f"from cold email.\n\n"
                    f"If {{{{company}}}} is looking to improve outbound results, I'd love to "
                    f"show you what we've built. 15 minutes?\n\n"
                    f"{closing}"
                ),
                variant_label="Ultra-Short",
                metadata={"angle": "ultra_short", "tone": tone, "source": "template"},
            ),
        ]

        return templates[:num_variants]


copywriting_service = CopywritingService()
