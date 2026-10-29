"""One strict admission boundary shared by Mox initialization and PostgreSQL provisioning."""
from __future__ import annotations

import csv
from dataclasses import dataclass
import io
from pathlib import Path
import re
import uuid


@dataclass(frozen=True)
class Assignment:
    organization_id: str
    user_id: str
    mailbox_id: str
    address: str


def identifier(value: str) -> str:
    parsed = uuid.UUID(value)
    if str(parsed) != value or parsed.int == 0:
        raise ValueError("canonical nonzero UUID required")
    return value


def load(path: Path) -> list[Assignment]:
    # AIDEV-NOTE: Validate the entire batch before generating configuration or opening a database transaction.
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 131072:
        raise ValueError("bounded regular assignments CSV required")
    reader = csv.DictReader(io.StringIO(path.read_text(encoding="utf-8")))
    fields = ["organization_id", "user_id", "mailbox_id", "address"]
    if reader.fieldnames != fields:
        raise ValueError("assignments CSV header mismatch")
    result: list[Assignment] = []
    addresses: set[str] = set()
    mailboxes: set[str] = set()
    for row in reader:
        if set(row) != set(fields) or any(not isinstance(row[field], str) for field in fields):
            raise ValueError("invalid assignment row")
        address = row["address"]
        if len(address) > 254 or not re.fullmatch(r"[a-z0-9]+(?:[._-][a-z0-9]+)*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,63}", address):
            raise ValueError("canonical mailbox address required")
        local, domain = address.split("@")
        if any(len(label) > 63 for label in domain.split(".")):
            raise ValueError("mailbox domain label exceeds DNS limit")
        if len(local) > 64 or address in addresses or row["mailbox_id"] in mailboxes:
            raise ValueError("duplicate or oversized assignment")
        item = Assignment(*(identifier(row[field]) for field in fields[:3]), address)
        result.append(item)
        addresses.add(address)
        mailboxes.add(item.mailbox_id)
        if len(result) > 1000:
            raise ValueError("assignment batch exceeds 1000")
    if not result:
        raise ValueError("empty assignments batch")
    return result
