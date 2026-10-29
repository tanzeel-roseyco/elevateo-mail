"""Offline launch admission report. Never provisions, connects, schedules, or changes runtime policy."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import TypedDict
from uuid import UUID

DOMAINS = {"mail.roseyco.com", "mail.flooda.co", "mail.bluepillar.co", "outreach.elevateoco.com", "mail.boltloop.co"}
FIELDS = {"company_signup_enabled", "organization_id", "verified_owner_id", "authorized_sender_user_id",
          "authorized_sender_mailbox_id", "outbound_hold", "daily_mailbox_limit", "mailbox_quota_bytes",
          "mailboxes", "available_storage_bytes", "storage_overhead_bytes", "warmup_enabled",
          "warmup_cost_approved", "warmup_daily_plan"}


class Report(TypedDict):
    ready_for_root_review: bool
    holds: list[str]
    payload_capacity_bytes: int
    runtime_enforcement_verified: bool


def identity(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = UUID(value)
        return parsed.int != 0 and str(parsed) == value
    except ValueError:
        return False


def review(value: object) -> Report:
    # AIDEV-NOTE: This is a plan, not enforcement; unresolved trusted identity evidence always remains a root gate.
    if not isinstance(value, dict) or set(value) != FIELDS:
        raise ValueError("exact launch plan fields required")
    if any(value[key] is not False for key in ("company_signup_enabled", "warmup_enabled", "warmup_cost_approved")):
        raise ValueError("signup and warmup must remain disabled; cost approval is a separate root gate")
    if value["outbound_hold"] is not True:
        raise ValueError("outbound hold required")
    limit = value["daily_mailbox_limit"]
    if (type(limit) is not int or not 1 <= limit <= 30
            or type(value["mailbox_quota_bytes"]) is not int or value["mailbox_quota_bytes"] != 2_000_000_000):
        raise ValueError("maximum 30/day and exactly 2GB decimal mailbox quota required")
    days = value["warmup_daily_plan"]
    if not isinstance(days, list) or len(days) != 14 or any(type(n) is not int or not 1 <= n <= limit for n in days):
        raise ValueError("14 disabled warmup days within the mailbox cap required")
    if days != sorted(days):
        raise ValueError("warmup plan must not regress")
    boxes = value["mailboxes"]
    if not isinstance(boxes, list) or len(boxes) > 120:
        raise ValueError("at most 120 separate mailbox addresses required")
    seen: set[str] = set()
    domains: set[str] = set()
    for address in boxes:
        if not isinstance(address, str) or not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,63}@[a-z0-9.]+", address):
            raise ValueError("canonical mailbox address required")
        domain = address.split("@", 1)[1]
        local = address.split("@", 1)[0]
        if ".." in local or local.endswith("."):
            raise ValueError("mailbox local part cannot contain empty dot segments")
        if domain not in DOMAINS or address in seen:
            raise ValueError("unique mailboxes on exact approved dedicated subdomains required")
        seen.add(address)
        domains.add(domain)
    holds = ["Root must attest exact Tanzeel Authentik subject and verified company identity, mailbox ownership and tenant from trusted records",
             "Transport must prove sender allowlist, atomic daily quota, consent and suppression enforcement",
             "No live sending, DNS/root MX change, provisioning or warmup authorized by this report"]
    for key in ("organization_id", "verified_owner_id", "authorized_sender_user_id", "authorized_sender_mailbox_id"):
        if value[key] is None:
            holds.append("Missing " + key)
        elif not identity(value[key]):
            raise ValueError("canonical nonzero UUID required: " + key)
    if value["authorized_sender_user_id"] != value["verified_owner_id"]:
        raise ValueError("authorized sender must be the explicitly verified owner")
    if len(seen) != 120 or domains != DOMAINS:
        holds.append("Need approved 120-address allocation across all five subdomains")
    available, overhead = value["available_storage_bytes"], value["storage_overhead_bytes"]
    if available is None or overhead is None:
        holds.append("Need measured available capacity and approved positive storage/backup overhead budget")
    elif type(available) is not int or type(overhead) is not int or overhead <= 0 or available < 240_000_000_000 + overhead:
        raise ValueError("insufficient measured storage capacity plus overhead")
    return {"ready_for_root_review": len(holds) == 3, "holds": holds,
            "payload_capacity_bytes": 240_000_000_000, "runtime_enforcement_verified": False}


def unique_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate plan field")
        result[key] = value
    return result


def main() -> None:
    if len(sys.argv) != 2:
        raise ValueError("usage: plan.py PLAN.json")
    raw = Path(sys.argv[1]).read_bytes()
    if len(raw) > 131_072:
        raise ValueError("plan too large")
    print(json.dumps(review(json.loads(raw, object_pairs_hook=unique_pairs)), indent=2))


if __name__ == "__main__":
    main()
