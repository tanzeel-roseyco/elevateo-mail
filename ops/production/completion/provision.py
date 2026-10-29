"""Operator-approved mailbox assignment and existing-ledger budget provisioning; dry-run by default."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from assignments import Assignment, identifier, load
from common import required, sql


def limit(name: str, default: int) -> int:
    value = os.environ.get(name, str(default))
    if not value.isdecimal() or not 1 <= int(value) <= default:
        raise ValueError(f"{name} must be within 1..{default}")
    return int(value)


def statement(items: list[Assignment], egress: str, mailbox_limit: int, user_limit: int) -> str:
    # AIDEV-NOTE: Only canonical UUIDs and restricted addresses enter these literals; no arbitrary CSV SQL survives.
    values = ",\n".join("(" + ",".join("'" + value + "'" for value in
        (item.organization_id, item.user_id, item.mailbox_id, item.address)) + ")" for item in items)
    template = Path(__file__).with_name("provision.sql").read_text(encoding="utf-8")
    return template.replace("__ASSIGNMENTS__", values).replace("__EGRESS__", egress).replace(
        "__MAILBOX_LIMIT__", str(mailbox_limit)).replace("__USER_LIMIT__", str(user_limit))


def provision(path: Path, apply: bool = False) -> int:
    items = load(path)
    egress = identifier(required("ELEVATEO_EGRESS_ID"))
    mailbox_limit = limit("ELEVATEO_MAILBOX_DAILY_SEND_LIMIT", 30)
    user_limit = limit("ELEVATEO_USER_DAILY_SEND_LIMIT", 300)
    if apply:
        if os.environ.get("ELEVATEO_PROVISIONING_ENABLED", "false") != "true":
            raise ValueError("provisioning remains disabled")
        sql(statement(items, egress, mailbox_limit, user_limit))
    return len(items)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.apply and args.dry_run:
        parser.error("choose apply or dry-run")
    try:
        count = provision(args.csv, args.apply)
        print(f"assignments={count} mode={'applied' if args.apply else 'dry-run'}")
    except (ValueError, RuntimeError, OSError):
        raise SystemExit("assignment provisioning rejected; no private details logged") from None
