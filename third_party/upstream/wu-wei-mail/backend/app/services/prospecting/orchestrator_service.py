"""Orchestrator service — classifies intent, routes to specialists, manages stage transitions.

The orchestrator is the coordinator in the coordinator + specialist pattern. It:
1. Classifies user intent from message content.
2. Routes to the appropriate specialist agent.
3. Manages journey stage transitions.
4. Uses an iterative agent loop with stage-gated tools for LLM responses.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prospecting import (
    ProspectingConversation, ProspectingMessage, ProspectingRun, ProspectingLead,
)
from app.services.prospecting.journey_state_machine import (
    JourneyStage, JourneyStateMachine, InvalidTransitionError,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Intent classification
# ---------------------------------------------------------------------------

class UserIntent(str, Enum):
    """Classified user intents for routing."""
    LEAD_GENERATION = "lead_generation"
    LEAD_SELECTION = "lead_selection"
    COPYWRITING = "copywriting"
    CAMPAIGN_SETUP = "campaign_setup"
    CAMPAIGN_LAUNCH = "campaign_launch"
    MODEL_CONFIG = "model_config"
    GENERAL_QUESTION = "general_question"
    STAGE_NAVIGATION = "stage_navigation"


# Intent → agent type mapping
INTENT_TO_AGENT: dict[str, str] = {
    UserIntent.LEAD_GENERATION: "lead_discovery",
    UserIntent.LEAD_SELECTION: "lead_discovery",
    UserIntent.COPYWRITING: "copywriting",
    UserIntent.CAMPAIGN_SETUP: "campaign_builder",
    UserIntent.CAMPAIGN_LAUNCH: "campaign_builder",
    UserIntent.MODEL_CONFIG: "orchestrator",
    UserIntent.GENERAL_QUESTION: "orchestrator",
    UserIntent.STAGE_NAVIGATION: "orchestrator",
}

# Stage → expected intents mapping (what intents make sense in each stage)
STAGE_INTENTS: dict[str, set[str]] = {
    JourneyStage.DISCOVERY: {
        UserIntent.LEAD_GENERATION, UserIntent.LEAD_SELECTION,
        UserIntent.GENERAL_QUESTION,
    },
    JourneyStage.SELECTION: {
        UserIntent.LEAD_SELECTION, UserIntent.LEAD_GENERATION,
        UserIntent.GENERAL_QUESTION,
    },
    JourneyStage.COPYWRITING: {
        UserIntent.COPYWRITING, UserIntent.GENERAL_QUESTION,
        UserIntent.STAGE_NAVIGATION,
    },
    JourneyStage.CAMPAIGN_SETUP: {
        UserIntent.CAMPAIGN_SETUP, UserIntent.GENERAL_QUESTION,
        UserIntent.STAGE_NAVIGATION,
    },
    JourneyStage.LAUNCH_READY: {
        UserIntent.CAMPAIGN_LAUNCH, UserIntent.CAMPAIGN_SETUP,
        UserIntent.GENERAL_QUESTION,
    },
    JourneyStage.LAUNCHED: {
        UserIntent.GENERAL_QUESTION,
    },
}

# Keyword-based intent classification (deterministic fallback)
INTENT_KEYWORDS: dict[str, list[str]] = {
    UserIntent.LEAD_GENERATION: [
        "find leads", "discover", "search for", "look for", "icp",
        "prospects", "lead gen", "find me", "source", "scrape",
        "industries", "companies in", "people in", "roles",
    ],
    UserIntent.LEAD_SELECTION: [
        "select", "choose", "pick", "filter", "import these",
        "add to list", "accept", "reject", "exclude",
        "review", "show", "list", "see", "view", "full list",
        "all leads", "show me", "browse", "the leads",
    ],
    UserIntent.COPYWRITING: [
        "write copy", "draft", "email copy", "subject line",
        "sequence", "outreach copy", "message", "template",
        "write me", "generate copy", "cold email",
    ],
    UserIntent.CAMPAIGN_SETUP: [
        "create campaign", "set up campaign", "campaign settings",
        "schedule", "daily limit", "sending window", "accounts",
    ],
    UserIntent.CAMPAIGN_LAUNCH: [
        "launch", "start campaign", "go live", "send it",
        "activate", "begin sending",
    ],
    UserIntent.MODEL_CONFIG: [
        "change model", "switch model", "use gpt", "use claude",
        "model settings", "temperature",
    ],
}


# ---------------------------------------------------------------------------
# Conversation context builder — gives the agent real situational awareness
# ---------------------------------------------------------------------------

async def build_conversation_context(
    db: AsyncSession,
    conversation_id: uuid.UUID,
) -> str:
    """Build a dynamic context string describing the current state of this
    conversation's lead pool.  This is injected into the system prompt so the
    agent *knows* what it has to work with — no keyword hacks needed.
    """
    # Get all runs for this conversation
    run_result = await db.execute(
        select(ProspectingRun.id, ProspectingRun.status).where(
            ProspectingRun.conversation_id == conversation_id,
        )
    )
    runs = run_result.all()

    if not runs:
        return "Conversation state: No discovery runs yet. No leads in the pool."

    run_ids = [r[0] for r in runs]
    completed_runs = sum(1 for r in runs if r[1] == "completed")

    # Total leads
    total_result = await db.execute(
        select(func.count()).select_from(ProspectingLead).where(
            ProspectingLead.run_id.in_(run_ids),
        )
    )
    total = total_result.scalar() or 0

    if total == 0:
        return (
            f"Conversation state: {len(runs)} discovery run(s) executed "
            f"({completed_runs} completed), but 0 leads found."
        )

    # Active vs excluded
    excluded_result = await db.execute(
        select(func.count()).select_from(ProspectingLead).where(
            ProspectingLead.run_id.in_(run_ids),
            ProspectingLead.is_excluded == True,  # noqa: E712
        )
    )
    excluded = excluded_result.scalar() or 0
    active = total - excluded

    # Leads with email
    email_result = await db.execute(
        select(func.count()).select_from(ProspectingLead).where(
            ProspectingLead.run_id.in_(run_ids),
            ProspectingLead.is_excluded == False,  # noqa: E712
            ProspectingLead.email.isnot(None),
            ProspectingLead.email != "",
        )
    )
    with_email = email_result.scalar() or 0

    return (
        f"Conversation state: {completed_runs} discovery run(s) completed. "
        f"Lead pool: {active} active leads"
        f"{f', {excluded} excluded' if excluded else ''}"
        f", {with_email} with verified email. "
        f"The leads already exist — use list_leads to show them, "
        f"search_leads only to find NEW ones."
    )


# ---------------------------------------------------------------------------
# System prompt — the agent's identity and instructions
# ---------------------------------------------------------------------------

ORCHESTRATOR_SYSTEM_PROMPT = """You are LeadAgent, an AI-powered cold email prospecting assistant.

You guide users through:
1. DISCOVERY — Define ICP and find matching leads
2. SELECTION — Review, filter, and curate the lead pool
3. COPYWRITING — Generate outreach copy
4. CAMPAIGN SETUP — Configure campaign settings
5. LAUNCH — Review and launch

Current stage: {stage}

{context}

You have these tools:
- search_leads — Runs a NEW discovery search. Each call ADDS leads to the pool. The tool can auto-expand search breadth across multiple cycles when lead volume is too low. Use this when the user wants to find new prospects.
- list_leads — Returns the existing leads already in the pool. Use when the user wants to review, see, show, browse, or check their leads.
- filter_leads — Excludes leads from the pool by criteria. Use when the user wants to remove, drop, or filter out leads.
- get_lead_stats — Returns aggregate statistics about the lead pool.

Be concise, helpful, and action-oriented. After a search, summarize results. When users want to see their leads, use list_leads. When they want more leads, use search_leads. When they want to clean up, use filter_leads. Guide toward the next workflow step."""


# ---------------------------------------------------------------------------
# Routing output
# ---------------------------------------------------------------------------

@dataclass
class RoutingDecision:
    """Typed output from the orchestrator's routing logic."""
    intent: str
    stage: str
    next_action: str
    handoff_target: str  # agent type to hand off to
    stage_transition: str | None = None  # new stage if transition triggered
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentContext:
    """Pre-computed context shared by sync and streaming message processing."""
    routing: RoutingDecision
    user_msg: ProspectingMessage
    messages: list[dict[str, Any]]      # System prompt + history + user msg
    tools: list[dict[str, Any]]          # Stage-gated tool schemas
    tool_ctx: Any                        # ToolContext (imported lazily)
    resolved_model: str | None


# ---------------------------------------------------------------------------
# Orchestrator service
# ---------------------------------------------------------------------------

class OrchestratorService:
    """Coordinator that classifies, routes, and manages conversation flow."""

    def classify_intent(self, message: str, current_stage: str) -> str:
        """Classify user intent from message content using keyword matching.

        This is the fast, deterministic path. For ambiguous messages,
        classify_intent_llm() can be used as an upgrade.
        """
        message_lower = message.lower().strip()

        # Score each intent by keyword match count
        scores: dict[str, int] = {}
        for intent, keywords in INTENT_KEYWORDS.items():
            score = sum(1 for kw in keywords if kw in message_lower)
            if score > 0:
                scores[intent] = score

        if scores:
            best_intent = max(scores, key=scores.get)  # type: ignore[arg-type]
            return best_intent

        # No keyword match → default based on current stage
        stage_defaults: dict[str, str] = {
            JourneyStage.DISCOVERY: UserIntent.LEAD_GENERATION,
            JourneyStage.SELECTION: UserIntent.LEAD_SELECTION,
            JourneyStage.COPYWRITING: UserIntent.COPYWRITING,
            JourneyStage.CAMPAIGN_SETUP: UserIntent.CAMPAIGN_SETUP,
            JourneyStage.LAUNCH_READY: UserIntent.CAMPAIGN_LAUNCH,
            JourneyStage.LAUNCHED: UserIntent.GENERAL_QUESTION,
        }
        return stage_defaults.get(current_stage, UserIntent.GENERAL_QUESTION)

    async def classify_intent_llm(
        self, message: str, stage: str, available_tools: list[str],
    ) -> str:
        """Classify intent using a lightweight LLM call (20 tokens max).

        Falls back to keyword-based classify_intent on failure.

        Returns one of: stage_navigation, model_config, general_question, tool_action.
        - stage_navigation: user wants to go to a different stage
        - model_config: user wants to change AI model settings
        - general_question: user is asking a question (no action)
        - tool_action: user wants to do something → agent loop handles it
        """
        try:
            from app.utils.openrouter_client import chat_completion

            prompt = (
                "Classify this user message into one of:\n"
                "- stage_navigation: User wants to go to a different stage\n"
                "- model_config: User wants to change AI model settings\n"
                "- general_question: User is asking a question (no action needed)\n"
                "- tool_action: User wants to do something (let the agent loop handle it)\n"
                f"\nCurrent stage: {stage}\n"
                f"Available tools: {', '.join(available_tools)}\n"
                "\nRespond with ONLY the classification label."
            )

            response = await chat_completion(
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": message},
                ],
                temperature=0.0,
                max_tokens=20,
            )
            label = response.strip().lower().replace('"', "").replace("'", "")

            # Map LLM label back to UserIntent
            label_map = {
                "stage_navigation": UserIntent.STAGE_NAVIGATION,
                "model_config": UserIntent.MODEL_CONFIG,
                "general_question": UserIntent.GENERAL_QUESTION,
                "tool_action": None,  # None = let agent loop decide
            }
            if label in label_map:
                return label_map[label]  # type: ignore[return-value]

            # Unknown label → fall through to agent loop
            return None  # type: ignore[return-value]
        except Exception:
            logger.debug("LLM classifier failed, falling back to keyword matching")
            return self.classify_intent(message, stage)

    def route(self, message: str, current_stage: str) -> RoutingDecision:
        """Route a user message to the appropriate specialist agent."""
        intent = self.classify_intent(message, current_stage)
        handoff_target = INTENT_TO_AGENT.get(intent, "orchestrator")

        # Determine next action based on intent + stage
        next_action = self._determine_next_action(intent, current_stage)

        # Check if intent implies a stage transition
        stage_transition = self._check_stage_transition(intent, current_stage)

        return RoutingDecision(
            intent=intent,
            stage=current_stage,
            next_action=next_action,
            handoff_target=handoff_target,
            stage_transition=stage_transition,
        )

    def _determine_next_action(self, intent: str, current_stage: str) -> str:
        """Map intent + stage to a concrete next action."""
        action_map: dict[tuple[str, str], str] = {
            (UserIntent.LEAD_GENERATION, JourneyStage.DISCOVERY): "execute_discovery_run",
            (UserIntent.LEAD_GENERATION, JourneyStage.SELECTION): "restart_discovery",
            (UserIntent.LEAD_SELECTION, JourneyStage.SELECTION): "select_leads_for_import",
            (UserIntent.LEAD_SELECTION, JourneyStage.DISCOVERY): "transition_to_selection",
            (UserIntent.COPYWRITING, JourneyStage.COPYWRITING): "generate_copy_draft",
            (UserIntent.COPYWRITING, JourneyStage.SELECTION): "transition_to_copywriting",
            (UserIntent.CAMPAIGN_SETUP, JourneyStage.CAMPAIGN_SETUP): "configure_campaign",
            (UserIntent.CAMPAIGN_SETUP, JourneyStage.COPYWRITING): "transition_to_campaign_setup",
            (UserIntent.CAMPAIGN_LAUNCH, JourneyStage.LAUNCH_READY): "request_launch_approval",
            (UserIntent.CAMPAIGN_LAUNCH, JourneyStage.CAMPAIGN_SETUP): "transition_to_launch_ready",
        }

        action = action_map.get((intent, current_stage))
        if action:
            return action

        # Fallback: general response
        return "respond_to_query"

    def _check_stage_transition(self, intent: str, current_stage: str) -> str | None:
        """Check if the intent implies we should transition stages."""
        intent_stage_map: dict[str, str] = {
            UserIntent.LEAD_SELECTION: JourneyStage.SELECTION,
            UserIntent.COPYWRITING: JourneyStage.COPYWRITING,
            UserIntent.CAMPAIGN_SETUP: JourneyStage.CAMPAIGN_SETUP,
            UserIntent.CAMPAIGN_LAUNCH: JourneyStage.LAUNCH_READY,
        }

        target = intent_stage_map.get(intent)
        if target and target != current_stage:
            if JourneyStateMachine.can_transition(current_stage, target):
                return target

        return None

    async def _generate_llm_response(
        self,
        routing: RoutingDecision,
        user_message: str,
        conversation_history: list[dict[str, str]],
        context: str = "",
    ) -> str:
        """Generate an intelligent response using OpenRouter LLM (no tools)."""
        try:
            from app.utils.openrouter_client import chat_completion

            system_prompt = ORCHESTRATOR_SYSTEM_PROMPT.format(
                stage=routing.stage,
                context=context,
            )

            messages: list[dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
            ]

            # Add recent conversation history (last 10 messages for context)
            for msg in conversation_history[-10:]:
                messages.append(msg)

            # Add current user message
            messages.append({"role": "user", "content": user_message})

            response = await chat_completion(messages)
            return response

        except Exception as e:
            logger.warning("LLM call failed, using fallback: %s", str(e))
            return self._generate_fallback_response(routing)

    async def _run_with_tools(
        self,
        routing: RoutingDecision,
        user_message: str,
        conversation_history: list[dict[str, str]],
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> tuple[str, list[dict[str, Any]]]:
        """Generate a response using LLM tool-calling for lead discovery.

        Flow:
        1. Send user message + tool definitions to LLM.
        2. If LLM returns tool_calls, execute them and collect results.
        3. Send tool results back to LLM for the final response.

        Returns:
            (assistant_text, tool_results) where tool_results is a list of
            {"tool_name": str, "arguments": dict, "result": str} dicts.
        """
        from app.utils.openrouter_client import chat_completion, chat_completion_with_tools

        context = await build_conversation_context(db, conversation_id)
        system_prompt = ORCHESTRATOR_SYSTEM_PROMPT.format(
            stage=routing.stage,
            context=context,
        )

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
        ]
        for msg in conversation_history[-10:]:
            messages.append(msg)
        messages.append({"role": "user", "content": user_message})

        # Get stage-gated tool schemas from registry
        from app.services.prospecting.tool_registry import tool_registry
        import app.services.prospecting.tools  # noqa: F401
        tools = tool_registry.get_tools_for_stage(routing.stage)

        # First call: LLM may decide to invoke tools
        assistant_message = await chat_completion_with_tools(
            messages=messages,
            tools=tools,
        )

        tool_calls = assistant_message.get("tool_calls", [])

        if not tool_calls:
            # Model responded with text directly (no tool call)
            content = assistant_message.get("content", "")
            if not content:
                content = self._generate_fallback_response(routing)
            return content, []

        # Execute each tool call
        messages.append(assistant_message)  # include the tool_calls message
        tool_results: list[dict[str, Any]] = []

        for tc in tool_calls:
            fn = tc.get("function", {})
            tool_name = fn.get("name", "")
            try:
                arguments = json.loads(fn.get("arguments", "{}"))
            except json.JSONDecodeError:
                arguments = {}

            result_str = await self._handle_tool_call(
                tool_name=tool_name,
                arguments=arguments,
                db=db,
                workspace_id=workspace_id,
                conversation_id=conversation_id,
            )

            messages.append({
                "role": "tool",
                "tool_call_id": tc.get("id", ""),
                "content": result_str,
            })
            tool_results.append({
                "tool_name": tool_name,
                "arguments": arguments,
                "result": result_str,
            })

        # Second call: LLM generates the final user-facing response
        final_response = await chat_completion(messages)
        return final_response, tool_results

    async def _handle_tool_call(
        self,
        tool_name: str,
        arguments: dict[str, Any],
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> str:
        """Dispatch a tool call to the appropriate handler via the tool registry."""
        from app.services.prospecting.tool_registry import ToolContext, tool_registry

        ctx = ToolContext(db=db, workspace_id=workspace_id, conversation_id=conversation_id)
        return await tool_registry.execute(tool_name, arguments, ctx)

    async def _tool_search_leads(
        self,
        arguments: dict[str, Any],
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> str:
        """Run lead discovery and return compact metadata (not full lead objects).

        Returns JSON with: run_id, status, total_leads_found, sources breakdown,
        and sample company names — just enough for the LLM to summarize.
        Uses 2 DB queries (down from 3): source breakdown includes total count,
        and a separate DISTINCT query for company names.
        """
        icp_criteria = {k: v for k, v in arguments.items() if v}

        try:
            from app.services.prospecting.lead_discovery_service import lead_discovery_service

            run = await lead_discovery_service.create_run(
                db=db,
                workspace_id=workspace_id,
                conversation_id=conversation_id,
                icp_criteria=icp_criteria,
            )
            run = await lead_discovery_service.execute_run(
                db=db,
                run_id=run.id,
                workspace_id=workspace_id,
            )

            # Query 1: Source breakdown (also gives us total count)
            source_rows = (await db.execute(
                select(
                    ProspectingLead.source_name,
                    func.count(),
                ).where(
                    ProspectingLead.run_id == run.id,
                ).group_by(ProspectingLead.source_name)
            )).all()
            sources = {row[0]: row[1] for row in source_rows}
            lead_count = sum(sources.values())

            # Query 2: Unique company names (compact — no full lead objects)
            company_rows = (await db.execute(
                select(ProspectingLead.company).where(
                    ProspectingLead.run_id == run.id,
                    ProspectingLead.company.isnot(None),
                ).distinct().limit(10)
            )).all()
            companies = [r[0] for r in company_rows if r[0]]

            return json.dumps({
                "run_id": str(run.id),
                "status": run.status,
                "total_leads_found": lead_count,
                "sources": sources,
                "sample_companies": companies,
            })

        except Exception as e:
            logger.exception("Discovery run failed in tool call")
            return json.dumps({"error": str(e), "total_leads_found": 0})

    def _build_assistant_message(
        self,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        content: str,
        routing: RoutingDecision,
        *,
        model_used: str | None = None,
        loop_result: Any = None,
    ) -> ProspectingMessage:
        """Build a ProspectingMessage with routing metadata and telemetry."""
        metadata: dict[str, Any] = {
            "intent": routing.intent,
            "stage": routing.stage,
            "next_action": routing.next_action,
            "handoff_target": routing.handoff_target,
            "stage_transition": routing.stage_transition,
        }
        if loop_result:
            metadata["tool_calls"] = [
                {"tool": tc.tool_name, "args": tc.arguments}
                for tc in loop_result.tool_calls
            ]
            metadata["iterations"] = loop_result.iterations
            metadata["terminated_by"] = loop_result.terminated_by

        return ProspectingMessage(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            role="assistant",
            content=content,
            agent_type=routing.handoff_target,
            model_used=model_used,
            token_count=loop_result.total_tokens if loop_result else None,
            metadata_json=metadata,
        )

    def _generate_fallback_response(self, routing: RoutingDecision) -> str:
        """Generate a fallback response when LLM is unavailable."""
        responses: dict[str, str] = {
            "execute_discovery_run": "I'll start searching for leads matching your criteria. Setting up the discovery run now...",
            "restart_discovery": "Let me search for more leads with updated criteria.",
            "select_leads_for_import": "Please review the discovered leads and select which ones to import.",
            "transition_to_selection": "Your discovery run found leads. Let's review and select the best ones.",
            "generate_copy_draft": "I'll draft outreach copy for your selected segment. Working on it now...",
            "transition_to_copywriting": "Great selection! Should I draft outreach copy for these leads?",
            "configure_campaign": "Let's configure your campaign settings — sending schedule, accounts, and daily limits.",
            "transition_to_campaign_setup": "Copy looks good! Let's set up the campaign now.",
            "request_launch_approval": "Campaign is ready. Please confirm to launch.",
            "transition_to_launch_ready": "Configuration complete. Ready for your launch approval.",
            "respond_to_query": "How can I help with your outreach campaign?",
        }
        return responses.get(routing.next_action, "How can I help?")

    async def _prepare_agent_context(
        self,
        db: AsyncSession,
        conversation_id: uuid.UUID,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        content: str,
    ) -> AgentContext:
        """Shared setup for sync and streaming message processing.

        1. Load conversation (workspace-isolated).
        2. Classify intent (LLM + keyword fallback).
        3. Route to agent type.
        4. Apply stage transition via JourneyStateMachine.
        5. Persist user message.
        6. Load last 10 messages for history.
        7. Resolve model via model_router_service.
        8. Build conversation context + system prompt.
        9. Assemble messages list.
        10. Get stage-gated tools from registry.
        11. Return AgentContext.
        """
        from app.services.prospecting.tool_registry import ToolContext

        # Import tools to ensure they're registered
        import app.services.prospecting.tools  # noqa: F401
        from app.services.prospecting.tool_registry import tool_registry

        # Load conversation
        result = await db.execute(
            select(ProspectingConversation).where(
                ProspectingConversation.id == conversation_id,
                ProspectingConversation.workspace_id == workspace_id,
            )
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found in workspace")

        # Route — try LLM classifier first for better accuracy
        tool_names = tool_registry.get_tool_names_for_stage(conversation.stage)
        llm_intent = await self.classify_intent_llm(content, conversation.stage, tool_names)

        if llm_intent and llm_intent in (UserIntent.STAGE_NAVIGATION, UserIntent.MODEL_CONFIG):
            routing = self.route(content, conversation.stage)
            routing.intent = llm_intent
            routing.handoff_target = INTENT_TO_AGENT.get(llm_intent, "orchestrator")
        else:
            routing = self.route(content, conversation.stage)

        # Apply stage transition if warranted
        if routing.stage_transition:
            try:
                new_stage = JourneyStateMachine.transition(
                    conversation.stage, routing.stage_transition,
                )
                conversation.stage = new_stage
                routing.stage = new_stage
            except InvalidTransitionError:
                routing.stage_transition = None

        # Persist user message
        user_msg = ProspectingMessage(
            workspace_id=workspace_id,
            conversation_id=conversation_id,
            role="user",
            content=content,
            metadata_json={"classified_intent": routing.intent},
        )
        db.add(user_msg)
        await db.flush()

        # Load recent messages for conversation history
        msg_result = await db.execute(
            select(ProspectingMessage)
            .where(ProspectingMessage.conversation_id == conversation_id)
            .order_by(ProspectingMessage.created_at.desc())
            .limit(10)
        )
        recent_msgs = list(reversed(list(msg_result.scalars().all())))
        conversation_history = [
            {"role": msg.role, "content": msg.content}
            for msg in recent_msgs
            if msg.role in ("user", "assistant")
        ]

        # Resolve model via model router
        resolved_model = None
        try:
            from app.services.prospecting.model_router_service import model_router_service
            resolution = await model_router_service.resolve(
                db=db, workspace_id=workspace_id, agent_type="orchestrator",
            )
            resolved_model = resolution.model_id
        except Exception:
            logger.debug("Model router failed, using default model")

        # Build conversation context
        context = await build_conversation_context(db, conversation_id)

        # Build messages for the agent loop
        system_prompt = ORCHESTRATOR_SYSTEM_PROMPT.format(
            stage=routing.stage, context=context,
        )
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
        ]
        for msg in conversation_history[-10:]:
            messages.append(msg)
        messages.append({"role": "user", "content": content})

        # Get stage-gated tools
        tools = tool_registry.get_tools_for_stage(routing.stage)
        tool_ctx = ToolContext(
            db=db, workspace_id=workspace_id, conversation_id=conversation_id,
        )

        return AgentContext(
            routing=routing,
            user_msg=user_msg,
            messages=messages,
            tools=tools,
            tool_ctx=tool_ctx,
            resolved_model=resolved_model,
        )

    async def process_message(
        self,
        db: AsyncSession,
        conversation_id: uuid.UUID,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        content: str,
    ) -> tuple[RoutingDecision, ProspectingMessage, ProspectingMessage]:
        """Process a user message end-to-end using the iterative agent loop."""
        from app.services.prospecting.agent_loop import run_agent_loop
        from app.services.prospecting.tool_registry import tool_registry

        ctx = await self._prepare_agent_context(
            db, conversation_id, workspace_id, user_id, content,
        )

        try:
            loop_result = await run_agent_loop(
                messages=ctx.messages,
                tools=ctx.tools,
                tool_registry=tool_registry,
                ctx=ctx.tool_ctx,
                model=ctx.resolved_model,
            )
            assistant_content = loop_result.content

            # Extract ICP criteria from search_leads tool calls
            for tc in loop_result.tool_calls:
                if tc.tool_name == "search_leads":
                    ctx.routing.metadata["icp_criteria"] = tc.arguments

        except Exception:
            logger.exception("Agent loop failed, using fallback")
            loop_result = None
            assistant_content = self._generate_fallback_response(ctx.routing)

        assistant_msg = self._build_assistant_message(
            workspace_id, conversation_id, assistant_content, ctx.routing,
            model_used=ctx.resolved_model,
            loop_result=loop_result,
        )
        db.add(assistant_msg)
        await db.flush()

        return ctx.routing, ctx.user_msg, assistant_msg

    async def prepare_streaming(
        self,
        db: AsyncSession,
        conversation_id: uuid.UUID,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        content: str,
    ) -> tuple[AgentContext, Any]:
        """Set up streaming: shared context + enriched event stream.

        Returns (ctx, event_stream) where the caller is responsible for
        persisting the assistant message after consuming the stream.
        This avoids relying on async-generator cleanup for DB writes.
        """
        from app.services.prospecting.agent_loop import run_agent_loop_streaming
        from app.services.prospecting.tool_registry import tool_registry
        from app.services.prospecting.prompt_engine import prompt_engine

        ctx = await self._prepare_agent_context(
            db, conversation_id, workspace_id, user_id, content,
        )

        async def _enriched_stream():
            async for event in run_agent_loop_streaming(
                messages=ctx.messages,
                tools=ctx.tools,
                tool_registry=tool_registry,
                ctx=ctx.tool_ctx,
                model=ctx.resolved_model,
            ):
                event_name = event.get("event", "status")
                if event_name == "done":
                    data = event.get("data", {})
                    # Enrich done event with routing metadata
                    data["stage_transition"] = ctx.routing.stage_transition
                    lead_tools = {"list_leads", "search_leads", "filter_leads"}
                    tool_calls = data.get("tool_calls", [])
                    if any(tc.get("tool") in lead_tools for tc in tool_calls):
                        data["has_leads"] = True
                    if ctx.routing.stage_transition:
                        stage_prompt = prompt_engine.get_stage_prompt(ctx.routing.stage)
                        data["stage_prompt"] = {
                            "prompt_text": stage_prompt.prompt_text,
                            "suggested_actions": stage_prompt.suggested_actions,
                        }
                yield event

        return ctx, _enriched_stream()


orchestrator_service = OrchestratorService()
