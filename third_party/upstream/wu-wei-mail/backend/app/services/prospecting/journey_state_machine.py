"""Journey state machine — canonical stages and transition validation.

Stages:
  DISCOVERY → SELECTION → COPYWRITING → CAMPAIGN_SETUP → LAUNCH_READY → LAUNCHED

Each transition has a deterministic trigger condition. Illegal transitions
return typed errors via InvalidTransitionError.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import ClassVar


class JourneyStage:
    DISCOVERY = "DISCOVERY"
    SELECTION = "SELECTION"
    COPYWRITING = "COPYWRITING"
    CAMPAIGN_SETUP = "CAMPAIGN_SETUP"
    LAUNCH_READY = "LAUNCH_READY"
    LAUNCHED = "LAUNCHED"

    ALL: ClassVar[set[str]] = {
        DISCOVERY, SELECTION, COPYWRITING,
        CAMPAIGN_SETUP, LAUNCH_READY, LAUNCHED,
    }


# ---------------------------------------------------------------------------
# Allowed transitions: current_stage -> set of reachable stages
# ---------------------------------------------------------------------------

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    JourneyStage.DISCOVERY: {JourneyStage.SELECTION},
    JourneyStage.SELECTION: {JourneyStage.COPYWRITING, JourneyStage.DISCOVERY},  # can restart discovery
    JourneyStage.COPYWRITING: {JourneyStage.CAMPAIGN_SETUP, JourneyStage.SELECTION},  # can go back
    JourneyStage.CAMPAIGN_SETUP: {JourneyStage.LAUNCH_READY, JourneyStage.COPYWRITING},  # can revise copy
    JourneyStage.LAUNCH_READY: {JourneyStage.LAUNCHED, JourneyStage.CAMPAIGN_SETUP},  # can adjust config
    JourneyStage.LAUNCHED: set(),  # terminal
}


# ---------------------------------------------------------------------------
# Transition triggers (what condition triggers each forward transition)
# ---------------------------------------------------------------------------

TRANSITION_TRIGGERS: dict[tuple[str, str], str] = {
    (JourneyStage.DISCOVERY, JourneyStage.SELECTION): "min_leads_found_or_user_stop",
    (JourneyStage.SELECTION, JourneyStage.COPYWRITING): "user_confirms_segment",
    (JourneyStage.COPYWRITING, JourneyStage.CAMPAIGN_SETUP): "user_accepts_copy",
    (JourneyStage.CAMPAIGN_SETUP, JourneyStage.LAUNCH_READY): "required_config_complete",
    (JourneyStage.LAUNCH_READY, JourneyStage.LAUNCHED): "explicit_user_approval",
    # Backward transitions
    (JourneyStage.SELECTION, JourneyStage.DISCOVERY): "user_requests_more_leads",
    (JourneyStage.COPYWRITING, JourneyStage.SELECTION): "user_changes_segment",
    (JourneyStage.CAMPAIGN_SETUP, JourneyStage.COPYWRITING): "user_revises_copy",
    (JourneyStage.LAUNCH_READY, JourneyStage.CAMPAIGN_SETUP): "user_adjusts_config",
}


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

@dataclass
class InvalidTransitionError(Exception):
    """Raised when a stage transition is not allowed."""
    current_stage: str
    target_stage: str
    allowed: set[str]

    def __str__(self) -> str:
        return (
            f"Cannot transition from {self.current_stage} to {self.target_stage}. "
            f"Allowed targets: {sorted(self.allowed) or 'none (terminal state)'}"
        )


@dataclass
class InvalidStageError(Exception):
    """Raised when a stage value is not recognized."""
    stage: str

    def __str__(self) -> str:
        return f"Unknown stage '{self.stage}'. Valid stages: {sorted(JourneyStage.ALL)}"


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

class JourneyStateMachine:
    """Validates and executes journey stage transitions."""

    @staticmethod
    def validate_stage(stage: str) -> None:
        """Raise InvalidStageError if stage is not a known value."""
        if stage not in JourneyStage.ALL:
            raise InvalidStageError(stage)

    @staticmethod
    def can_transition(current: str, target: str) -> bool:
        """Check if transition is allowed without raising."""
        if current not in ALLOWED_TRANSITIONS:
            return False
        return target in ALLOWED_TRANSITIONS[current]

    @staticmethod
    def validate_transition(current: str, target: str) -> None:
        """Raise InvalidTransitionError if transition is illegal."""
        JourneyStateMachine.validate_stage(current)
        JourneyStateMachine.validate_stage(target)

        allowed = ALLOWED_TRANSITIONS.get(current, set())
        if target not in allowed:
            raise InvalidTransitionError(
                current_stage=current,
                target_stage=target,
                allowed=allowed,
            )

    @staticmethod
    def get_trigger(current: str, target: str) -> str | None:
        """Return the trigger condition name for a transition, or None."""
        return TRANSITION_TRIGGERS.get((current, target))

    @staticmethod
    def get_allowed_targets(current: str) -> set[str]:
        """Return the set of stages reachable from current."""
        JourneyStateMachine.validate_stage(current)
        return ALLOWED_TRANSITIONS.get(current, set())

    @staticmethod
    def is_terminal(stage: str) -> bool:
        """Check if stage is a terminal (no further transitions)."""
        JourneyStateMachine.validate_stage(stage)
        return len(ALLOWED_TRANSITIONS.get(stage, set())) == 0

    @staticmethod
    def transition(current: str, target: str) -> str:
        """Validate and return the new stage. Raises on illegal transition."""
        JourneyStateMachine.validate_transition(current, target)
        return target
