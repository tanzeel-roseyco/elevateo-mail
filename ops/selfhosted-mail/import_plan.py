"""Bind the approved 120-row CSV to explicit operator-verified domains, offline."""
from __future__ import annotations

import csv
import json
from pathlib import Path
import sys

from generate import write
from validation import load, validate


def bind(csv_path: Path, settings: Path, destination: Path) -> None:
    # AIDEV-NOTE: Domain assignment is explicit per localpart; never infer brands from people's names.
    raw = load(settings)
    assignments = raw.pop('assignments', None)
    with csv_path.open(newline='', encoding='utf-8-sig') as source:
        rows = list(csv.DictReader(source))
    if len(rows) != 120 or not isinstance(assignments, dict):
        raise ValueError('120 source rows and explicit assignments required')
    locals_ = [row['LocalPart'] for row in rows]
    if len(set(locals_)) != 120 or set(assignments) != set(locals_):
        raise ValueError('assignments must exactly match 120 distinct source localparts')
    if any(row['Domain'] != 'UNASSIGNED' or row['Status'] != 'PLANNED_NOT_PROVISIONED' for row in rows):
        raise ValueError('expected unprovisioned approved planning source')
    raw['accounts'] = [f'{local}@{assignments[local]}' for local in locals_]
    plan = validate(raw)
    write(destination, json.dumps(plan, indent=2) + '\n')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('usage: import_plan.py APPROVED_CSV PRIVATE_SETTINGS NEW_MANIFEST')
    bind(*(Path(arg) for arg in sys.argv[1:]))
