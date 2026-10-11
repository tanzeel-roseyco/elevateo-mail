"""Sequence-to-Workflow converter -- one-click migration of legacy campaigns."""

import uuid
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.sequence import Sequence
from app.models.step import Step
from app.models.variant import Variant

logger = logging.getLogger(__name__)


class SequenceToWorkflowConverter:

    async def convert(
        self,
        db: AsyncSession,
        campaign_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Convert a campaign's sequence into canonical workflow JSON."""
        # Load campaign
        result = await db.execute(
            select(Campaign).where(
                Campaign.id == campaign_id,
                Campaign.workspace_id == workspace_id,
            )
        )
        campaign = result.scalar_one_or_none()
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Load sequence (first one)
        seq_result = await db.execute(
            select(Sequence)
            .where(Sequence.campaign_id == campaign_id)
            .order_by(Sequence.order)
        )
        sequence = seq_result.scalars().first()
        if not sequence:
            raise ValueError("Campaign has no sequence")

        # Load steps
        steps_result = await db.execute(
            select(Step)
            .where(Step.sequence_id == sequence.id)
            .order_by(Step.order)
        )
        steps = list(steps_result.scalars().all())
        if not steps:
            raise ValueError("Sequence has no steps")

        # Load variants for each step (first variant each)
        step_variants: dict[uuid.UUID, Variant] = {}
        for step in steps:
            var_result = await db.execute(
                select(Variant)
                .where(Variant.step_id == step.id)
                .order_by(Variant.name)
            )
            variants = list(var_result.scalars().all())
            if variants:
                step_variants[step.id] = variants[0]

        # Build workflow JSON
        nodes: list[dict[str, Any]] = []
        connections: list[dict[str, Any]] = []
        y_pos = 120
        y_step = 160

        # Trigger node
        trigger_id = "n_trigger"
        nodes.append({
            "id": trigger_id,
            "type": "trigger_manual",
            "name": "Start",
            "position": {"x": 300, "y": y_pos},
            "config": {},
        })
        prev_node_id = trigger_id
        y_pos += y_step

        for i, step in enumerate(steps):
            variant = step_variants.get(step.id)

            # Email send node
            email_id = f"n_email_{i + 1}"
            email_config: dict[str, Any] = {
                "subject_override": variant.subject if variant else f"Step {i + 1}",
                "body_override": variant.body if variant else "",
                "track_opens": campaign.track_opens,
                "track_clicks": campaign.track_clicks,
            }
            nodes.append({
                "id": email_id,
                "type": "email_send",
                "name": f"Email Step {i + 1}" + (f" ({variant.name})" if variant else ""),
                "position": {"x": 300, "y": y_pos},
                "config": email_config,
            })
            connections.append({
                "from": prev_node_id,
                "to": email_id,
                "condition": "always",
                "order": 1,
            })
            prev_node_id = email_id
            y_pos += y_step

            # Wait node (if not last step or if stop_on_reply)
            is_last = i == len(steps) - 1

            if not is_last or campaign.stop_on_reply:
                wait_id = f"n_wait_{i + 1}"
                wait_days = step.wait_days if not is_last else 3  # Default 3 days for final reply check
                nodes.append({
                    "id": wait_id,
                    "type": "wait",
                    "name": f"Wait {wait_days}d",
                    "position": {"x": 300, "y": y_pos},
                    "config": {"days": wait_days, "hours": 0, "minutes": 0},
                })
                connections.append({
                    "from": prev_node_id,
                    "to": wait_id,
                    "condition": "always",
                    "order": 1,
                })
                prev_node_id = wait_id
                y_pos += y_step

                # If stop_on_reply: add condition check after wait
                if campaign.stop_on_reply:
                    if_id = f"n_if_replied_{i + 1}"
                    nodes.append({
                        "id": if_id,
                        "type": "if",
                        "name": "Replied?",
                        "position": {"x": 300, "y": y_pos},
                        "config": {"condition": "email_replied"},
                    })
                    connections.append({
                        "from": prev_node_id,
                        "to": if_id,
                        "condition": "always",
                        "order": 1,
                    })

                    # Yes branch -> end(replied)
                    end_replied_id = f"n_end_replied_{i + 1}"
                    nodes.append({
                        "id": end_replied_id,
                        "type": "end",
                        "name": "Replied",
                        "position": {"x": 550, "y": y_pos},
                        "config": {"result": "replied", "final_status": "completed"},
                    })
                    connections.append({
                        "from": if_id,
                        "to": end_replied_id,
                        "condition": "yes",
                        "order": 1,
                    })

                    # No branch -> continue
                    prev_node_id = if_id
                    y_pos += y_step

        # Final end node
        end_id = "n_end"
        nodes.append({
            "id": end_id,
            "type": "end",
            "name": "Completed",
            "position": {"x": 300, "y": y_pos},
            "config": {"result": "completed"},
        })
        # Connect from if (no branch) or from last email/wait
        if campaign.stop_on_reply and connections:
            connections.append({
                "from": prev_node_id,
                "to": end_id,
                "condition": "no",
                "order": 2,
            })
        else:
            connections.append({
                "from": prev_node_id,
                "to": end_id,
                "condition": "always",
                "order": 1,
            })

        return {
            "schema_version": 1,
            "workflow_version": 1,
            "meta": {
                "name": f"{campaign.name} (Workflow)",
                "description": "Auto-converted from campaign sequence",
                "tags": ["converted"],
            },
            "settings": {
                "timezone": campaign.timezone or "UTC",
                "prevent_same_day_cross_channel_touch": True,
                "max_node_executions_per_lead": 100,
            },
            "nodes": nodes,
            "connections": connections,
            "variables": {},
            "credentials_refs": {},
            "canvas_notes": [],
            "trigger_policies": {
                "dedupe_window_minutes": 10,
                "max_catch_up_runs": 3,
            },
        }


sequence_converter = SequenceToWorkflowConverter()
