"""Canonicalize one equivalent pg_dump spelling for comparison-only fingerprints."""
from __future__ import annotations
import sys


def normalize_dump(value: str) -> str:
    # AIDEV-NOTE: Restoring BETWEEN expands its AND group; only this exact redundant filename group is flattened.
    grouped = "(((octet_length(filename) >= 1) AND (octet_length(filename) <= 255)) AND"
    flat = "((octet_length(filename) >= 1) AND (octet_length(filename) <= 255) AND"
    return "".join(
        line.replace(grouped, flat) if 'CONSTRAINT attachment_stage_operations_filename_check CHECK' in line else line
        for line in value.splitlines(keepends=True)
    )


if __name__ == "__main__":
    sys.stdout.write(normalize_dump(sys.stdin.read()))
