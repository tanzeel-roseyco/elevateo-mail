"""Offline admission for a task-owned paired Supabase snapshot."""
from __future__ import annotations

import hashlib
import pathlib
import re
import sys

FILES = ("database.dump", "globals.sql", "objects.tar", "credentials.env")
LINE = re.compile(r"([0-9a-f]{64})  ([A-Za-z0-9.]+)\Z")


def verify(directory: pathlib.Path) -> dict[str, str]:
    # AIDEV-NOTE: manifests are local operator inputs; reject paths and extras before reading secrets.
    if not directory.is_dir() or directory.is_symlink():
        raise ValueError("snapshot must be a real directory")
    lines = (directory / "SHA256SUMS").read_text(encoding="ascii").splitlines()
    entries: dict[str, str] = {}
    for line in lines:
        match = LINE.fullmatch(line)
        if match is None or match[2] not in FILES or match[2] in entries:
            raise ValueError("invalid or duplicate manifest entry")
        entries[match[2]] = match[1]
    if set(entries) != set(FILES):
        raise ValueError("incomplete paired snapshot")
    for name, expected in entries.items():
        path = directory / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"missing or linked artifact: {name}")
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        if digest.hexdigest() != expected:
            raise ValueError(f"checksum mismatch: {name}")
    return entries


if __name__ == "__main__":
    try:
        manifest = verify(pathlib.Path(sys.argv[1]))
    except (IndexError, OSError, UnicodeError, ValueError) as error:
        print(f"snapshot admission FAILED: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    for filename, digest in manifest.items():
        print(f"{filename} {digest}")
