"""Proactive next-step prompt engine.

Generates contextual prompts at stage boundaries to guide the user
through the prospecting → campaign journey.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.prospecting.journey_state_machine import JourneyStage


@dataclass
class StagePrompt:
    """A proactive prompt shown at a stage boundary."""
    stage: str
    prompt_text: str
    suggested_actions: list[str]
    metadata: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Stage boundary prompts
# ---------------------------------------------------------------------------

STAGE_BOUNDARY_PROMPTS: dict[str, StagePrompt] = {
    JourneyStage.DISCOVERY: StagePrompt(
        stage=JourneyStage.DISCOVERY,
        prompt_text="Discovery complete! Should I prepare outreach copy for these leads?",
        suggested_actions=[
            "Review and select leads",
            "Search for more leads",
            "Export lead list",
        ],
    ),
    JourneyStage.SELECTION: StagePrompt(
        stage=JourneyStage.SELECTION,
        prompt_text="Leads selected. Would you like me to draft outreach copy for this segment?",
        suggested_actions=[
            "Draft outreach copy",
            "Refine lead selection",
            "Import leads to CRM first",
        ],
    ),
    JourneyStage.COPYWRITING: StagePrompt(
        stage=JourneyStage.COPYWRITING,
        prompt_text="Copy is ready for review. Should I create a campaign draft now?",
        suggested_actions=[
            "Create campaign draft",
            "Edit copy variants",
            "Generate more variants",
        ],
    ),
    JourneyStage.CAMPAIGN_SETUP: StagePrompt(
        stage=JourneyStage.CAMPAIGN_SETUP,
        prompt_text="Campaign configuration complete. Launch in native engine or Instantly?",
        suggested_actions=[
            "Launch with native engine",
            "Launch with Instantly",
            "Adjust campaign settings",
        ],
    ),
    JourneyStage.LAUNCH_READY: StagePrompt(
        stage=JourneyStage.LAUNCH_READY,
        prompt_text="Everything is set. Confirm to launch your campaign.",
        suggested_actions=[
            "Confirm and launch",
            "Review campaign details",
            "Go back to settings",
        ],
    ),
    JourneyStage.LAUNCHED: StagePrompt(
        stage=JourneyStage.LAUNCHED,
        prompt_text="Campaign launched! You can monitor performance in the analytics dashboard.",
        suggested_actions=[
            "View campaign analytics",
            "Start a new prospecting run",
        ],
    ),
}


class PromptEngine:
    """Generates proactive next-step prompts based on conversation state."""

    def get_stage_prompt(
        self,
        current_stage: str,
        context: dict[str, Any] | None = None,
    ) -> StagePrompt:
        """Get the proactive prompt for the current stage.

        Args:
            current_stage: The current journey stage.
            context: Optional context dict for dynamic prompt enrichment
                     (e.g., lead count, copy variant count).
        """
        prompt = STAGE_BOUNDARY_PROMPTS.get(current_stage)
        if not prompt:
            return StagePrompt(
                stage=current_stage,
                prompt_text="How would you like to proceed?",
                suggested_actions=["Continue"],
            )

        # Enrich with context if provided
        if context:
            prompt = self._enrich_prompt(prompt, context)

        return prompt

    def _enrich_prompt(
        self,
        prompt: StagePrompt,
        context: dict[str, Any],
    ) -> StagePrompt:
        """Add contextual details to the prompt text."""
        enriched_text = prompt.prompt_text

        lead_count = context.get("lead_count")
        if lead_count is not None and prompt.stage == JourneyStage.DISCOVERY:
            enriched_text = (
                f"Discovery found {lead_count} leads! "
                "Should I prepare outreach copy for these leads?"
            )

        selected_count = context.get("selected_count")
        if selected_count is not None and prompt.stage == JourneyStage.SELECTION:
            enriched_text = (
                f"{selected_count} leads selected. "
                "Would you like me to draft outreach copy for this segment?"
            )

        variant_count = context.get("variant_count")
        if variant_count is not None and prompt.stage == JourneyStage.COPYWRITING:
            enriched_text = (
                f"{variant_count} copy variant(s) ready for review. "
                "Should I create a campaign draft now?"
            )

        return StagePrompt(
            stage=prompt.stage,
            prompt_text=enriched_text,
            suggested_actions=prompt.suggested_actions,
            metadata=context,
        )

    def should_show_prompt(self, current_stage: str, previous_stage: str | None) -> bool:
        """Determine if a proactive prompt should be shown.

        Show prompt when:
        - Stage just changed (previous != current).
        - Stage is at a meaningful boundary.
        """
        if previous_stage is None:
            return True  # First message, show discovery prompt
        return previous_stage != current_stage


prompt_engine = PromptEngine()
