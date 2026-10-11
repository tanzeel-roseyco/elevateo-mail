"""search_leads tool — runs lead discovery from ICP criteria."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select, func

from app.models.prospecting import ProspectingLead
from app.services.prospecting.tool_registry import ToolContext, tool_registry

logger = logging.getLogger(__name__)

SEARCH_LEADS_SCHEMA = {
    "type": "function",
    "function": {
        "name": "search_leads",
        "description": (
            "Search for NEW leads matching the user's Ideal Customer Profile. "
            "Results ADD to the existing lead pool (additive). "
            "Returns a compact summary with total count, source breakdown, "
            "and sample company names. Call this when the user wants to FIND "
            "or DISCOVER new prospects. Do NOT call this for reviewing or "
            "viewing existing leads — use list_leads instead."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "industry": {
                    "type": "string",
                    "description": "Target industry or vertical (e.g. 'SaaS', 'Healthcare')",
                },
                "role": {
                    "type": "string",
                    "description": "Target job title or role (e.g. 'CTO', 'Marketing Director')",
                },
                "location": {
                    "type": "string",
                    "description": "Geographic target (e.g. 'San Francisco', 'United States')",
                },
                "company_size": {
                    "type": "string",
                    "description": "Company size (e.g. 'startup', 'SMB', '50-200 employees')",
                },
                "company_type": {
                    "type": "string",
                    "description": "Type of company (e.g. 'B2B', 'agency', 'e-commerce')",
                },
                "keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Additional search keywords",
                },
                "query": {
                    "type": "string",
                    "description": "Free-text search query describing who to find",
                },
                "target_min_leads": {
                    "type": "integer",
                    "description": (
                        "Optional minimum number of leads to aim for in this search. "
                        "If omitted, the tool estimates a target from query specificity."
                    ),
                },
                "max_cycles": {
                    "type": "integer",
                    "description": (
                        "Maximum discovery cycles to run while trying to hit the lead target "
                        "(1-5, default 3)."
                    ),
                },
                "auto_expand": {
                    "type": "boolean",
                    "description": (
                        "If true (default), the tool keeps searching with broadened criteria "
                        "until target is met or max_cycles is reached."
                    ),
                },
            },
            "required": ["query"],
        },
    },
}


ROLE_HINTS = {
    "ceo", "cto", "cfo", "coo", "vp", "director", "manager", "head",
    "founder", "owner", "partner", "broker", "advisor", "agent",
}


def _parse_int(value: Any, *, default: int, min_value: int, max_value: int) -> int:
    """Parse an integer argument safely with bounds."""
    if value is None:
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(min_value, min(max_value, parsed))


def _looks_role_targeted(icp_criteria: dict[str, Any]) -> bool:
    """Heuristic: determine if the search is narrow by role/title."""
    role = str(icp_criteria.get("role", "")).lower().strip()
    title = str(icp_criteria.get("title", "")).lower().strip()
    if role or title:
        return True

    query = str(icp_criteria.get("query", "")).lower()
    return any(token in query for token in ROLE_HINTS)


def _estimate_target_min_leads(icp_criteria: dict[str, Any]) -> int:
    """Estimate a reasonable lead target for this search breadth."""
    has_role = _looks_role_targeted(icp_criteria)
    has_location = bool(icp_criteria.get("location"))
    has_company_size = bool(icp_criteria.get("company_size"))
    has_industry = bool(icp_criteria.get("industry"))
    has_company_type = bool(icp_criteria.get("company_type"))

    # Very narrow searches should accept smaller lead pools.
    if has_role and (has_location or has_company_size):
        return 8
    if has_role:
        return 5

    # Broader firmographic queries should aim higher.
    if has_industry and (has_location or has_company_type):
        return 20
    if has_industry or has_company_type:
        return 30

    # Generic free-text discovery defaults to higher volume.
    return 25


def _build_cycle_criteria(base: dict[str, Any], cycle_index: int) -> dict[str, Any]:
    """Broaden criteria slightly on each cycle to increase candidate volume."""
    criteria = dict(base)

    if cycle_index <= 0:
        return criteria

    # Progressively relax strict filters.
    if cycle_index >= 1:
        criteria.pop("company_size", None)
    if cycle_index >= 2:
        criteria.pop("location", None)
    if cycle_index >= 3:
        criteria.pop("role", None)

    # Add progressively broader query suffixes to diversify result sets.
    suffixes = [
        "directory OR list OR association",
        "\"team\" OR \"leadership\" OR \"contact\"",
        "\"about us\" OR \"our people\" OR \"executive\"",
        "\"linkedin\" OR \"company profile\"",
    ]
    suffix = suffixes[min(cycle_index - 1, len(suffixes) - 1)]

    query = str(criteria.get("query", "")).strip()
    if query:
        criteria["query"] = f"({query}) {suffix}"
    else:
        parts = [
            str(criteria.get("industry", "")).strip(),
            str(criteria.get("company_type", "")).strip(),
            suffix,
        ]
        criteria["query"] = " ".join(part for part in parts if part).strip()

    return criteria


def _summarize_target_profile(icp_criteria: dict[str, Any]) -> dict[str, Any]:
    """Create an explicit target profile summary the agent can reason about."""
    keywords_raw = icp_criteria.get("keywords", [])
    if isinstance(keywords_raw, list):
        keywords = [str(k).strip() for k in keywords_raw if str(k).strip()]
    elif keywords_raw:
        keywords = [str(keywords_raw).strip()]
    else:
        keywords = []

    profile = {
        "industry": icp_criteria.get("industry"),
        "role": icp_criteria.get("role") or icp_criteria.get("title"),
        "location": icp_criteria.get("location"),
        "company_size": icp_criteria.get("company_size"),
        "company_type": icp_criteria.get("company_type"),
        "query": icp_criteria.get("query"),
        "keywords": keywords,
        "is_role_targeted": _looks_role_targeted(icp_criteria),
        "specificity": "high" if _looks_role_targeted(icp_criteria) else "medium",
    }
    return profile


def _build_discovery_plan(
    icp_criteria: dict[str, Any],
    *,
    target_min_leads: int,
    max_cycles: int,
    auto_expand: bool,
) -> dict[str, Any]:
    """Build the full plan first, then execute against the planned cycles."""
    planned_cycles = max_cycles if auto_expand else 1
    cycles: list[dict[str, Any]] = []

    for cycle_idx in range(planned_cycles):
        criteria = _build_cycle_criteria(icp_criteria, cycle_idx)
        if cycle_idx == 0:
            strategy = "strict_icp_match"
        elif cycle_idx == 1:
            strategy = "relax_firmographic_constraints"
        elif cycle_idx == 2:
            strategy = "relax_geo_constraints"
        else:
            strategy = "broaden_persona_constraints"

        cycles.append({
            "cycle": cycle_idx + 1,
            "strategy": strategy,
            "criteria": criteria,
        })

    return {
        "objective": "discover_new_leads",
        "target_profile": _summarize_target_profile(icp_criteria),
        "target_min_leads": target_min_leads,
        "auto_expand": auto_expand,
        "max_cycles": max_cycles,
        "planned_cycles": len(cycles),
        "execution_policy": {
            "stop_when_target_met": True,
            "stop_on_no_momentum_after_broadening": True,
        },
        "cycles": cycles,
    }


async def handle_search_leads(args: dict[str, Any], ctx: ToolContext) -> str:
    """Run discovery, looping until lead target is met or cycles are exhausted."""
    control_keys = {"target_min_leads", "max_cycles", "auto_expand"}
    icp_criteria = {
        k: v for k, v in args.items()
        if k not in control_keys and v not in (None, "", [])
    }

    auto_expand = bool(args.get("auto_expand", True))
    max_cycles = _parse_int(args.get("max_cycles"), default=3, min_value=1, max_value=5)
    target_override = args.get("target_min_leads")
    target_min_leads = (
        _parse_int(target_override, default=0, min_value=1, max_value=250)
        if target_override is not None
        else _estimate_target_min_leads(icp_criteria)
    )
    discovery_plan = _build_discovery_plan(
        icp_criteria,
        target_min_leads=target_min_leads,
        max_cycles=max_cycles,
        auto_expand=auto_expand,
    )

    try:
        from app.services.prospecting.lead_discovery_service import lead_discovery_service

        run_ids: list[str] = []
        per_cycle: list[dict[str, Any]] = []
        aggregate_sources: dict[str, int] = {}
        companies: list[str] = []
        seen_companies: set[str] = set()
        total_leads_found = 0
        run = None

        for cycle in discovery_plan["cycles"]:
            cycle_index = int(cycle["cycle"]) - 1
            cycle_criteria = cycle["criteria"]

            run = await lead_discovery_service.create_run(
                db=ctx.db,
                workspace_id=ctx.workspace_id,
                conversation_id=ctx.conversation_id,
                icp_criteria=cycle_criteria,
            )
            run = await lead_discovery_service.execute_run(
                db=ctx.db,
                run_id=run.id,
                workspace_id=ctx.workspace_id,
            )
            run_ids.append(str(run.id))

            # Query 1: source breakdown for this run
            source_rows = (await ctx.db.execute(
                select(
                    ProspectingLead.source_name,
                    func.count(),
                ).where(
                    ProspectingLead.run_id == run.id,
                ).group_by(ProspectingLead.source_name)
            )).all()
            run_sources = {row[0]: row[1] for row in source_rows}
            run_lead_count = sum(run_sources.values())
            total_leads_found += run_lead_count

            for source_name, count in run_sources.items():
                key = source_name or "unknown"
                aggregate_sources[key] = aggregate_sources.get(key, 0) + count

            # Query 2: sample companies from this run
            company_rows = (await ctx.db.execute(
                select(ProspectingLead.company).where(
                    ProspectingLead.run_id == run.id,
                    ProspectingLead.company.isnot(None),
                ).distinct().limit(10)
            )).all()
            for row in company_rows:
                company = row[0]
                if not company:
                    continue
                key = company.strip().lower()
                if key in seen_companies:
                    continue
                seen_companies.add(key)
                companies.append(company)
                if len(companies) >= 20:
                    break

            per_cycle.append({
                "cycle": cycle["cycle"],
                "strategy": cycle["strategy"],
                "run_id": str(run.id),
                "leads_found": run_lead_count,
                "criteria_used": cycle_criteria,
            })

            if total_leads_found >= target_min_leads:
                break
            if not auto_expand:
                break
            # Stop early if no momentum in a broadened cycle.
            if run_lead_count == 0 and cycle_index >= 1:
                break

        met_target = total_leads_found >= target_min_leads

        return json.dumps({
            "run_id": run_ids[-1] if run_ids else None,
            "run_ids": run_ids,
            "status": run.status if run else "failed",
            "total_leads_found": total_leads_found,
            "target_min_leads": target_min_leads,
            "met_target": met_target,
            "auto_expanded": len(run_ids) > 1,
            "cycles_executed": len(run_ids),
            "sources": aggregate_sources,
            "sample_companies": companies[:12],
            "discovery_plan": discovery_plan,
            "cycle_breakdown": per_cycle,
            "recommendation": (
                "Lead target met."
                if met_target
                else "Lead target not met. Consider relaxing constraints or trying adjacent roles/regions."
            ),
        })

    except Exception as e:
        logger.exception("Discovery run failed in tool call")
        return json.dumps({"error": str(e), "total_leads_found": 0})


# Register with the global registry
tool_registry.register(
    name="search_leads",
    schema=SEARCH_LEADS_SCHEMA,
    handler=handle_search_leads,
    stages={"DISCOVERY", "SELECTION"},
)
