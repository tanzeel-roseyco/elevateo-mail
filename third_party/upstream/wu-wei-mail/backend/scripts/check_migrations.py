#!/usr/bin/env python
"""CI migration safety check.

Validates:
  1. Alembic has exactly one head (no unmerged branches).
  2. The full migration graph can be traversed (offline SQL generation).

Usage:
    python -m scripts.check_migrations          # from backend/
    python backend/scripts/check_migrations.py   # from project root

Exit codes:
    0 — all checks pass
    1 — multiple heads detected or graph traversal failed
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )


def check_single_head() -> bool:
    result = run([sys.executable, "-m", "alembic", "heads"])
    if result.returncode != 0:
        print(f"FAIL: alembic heads returned exit code {result.returncode}")
        print(result.stderr)
        return False

    heads = [line.strip() for line in result.stdout.strip().splitlines() if line.strip()]
    if len(heads) != 1:
        print(f"FAIL: expected 1 head, found {len(heads)}:")
        for h in heads:
            print(f"  - {h}")
        return False

    print(f"OK: single head — {heads[0]}")
    return True


def check_graph_traversal() -> bool:
    result = run([sys.executable, "-m", "alembic", "upgrade", "head", "--sql"])
    if result.returncode != 0:
        print("FAIL: offline SQL generation failed")
        print(result.stderr)
        return False

    print("OK: full upgrade path generates valid SQL")
    return True


def main() -> int:
    print("=== Migration Safety Check ===\n")
    ok = True
    ok = check_single_head() and ok
    ok = check_graph_traversal() and ok
    print()
    if ok:
        print("All migration checks passed.")
    else:
        print("Migration checks FAILED — fix before merging.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
