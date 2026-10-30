#!/usr/bin/env python3
"""Authenticate six regular archive entries before additive canonical staging."""
import hashlib
import os
from pathlib import Path
import sys
import tarfile

# AIDEV-NOTE: Never extract archive paths; copy authenticated bytes into a newly created exact directory.
ARCHIVE = "ab611aff1b4d5ff029d25a0b62dff12e81a5f004ba12438fb38ddf1ea5deac1d"
MANIFEST = "844af34c43800bb45fe65fb23299e1c7a36083b923c60d735d1cc2883ec07e0f"
PREFIX = "ops/tools/be01-services-tools/"
FILES = {"Dockerfile", "checks.sh", "parent-run.sh", "preflight.sh", "run-container.sh", "package.sha256"}

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def main() -> None:
    archive, source = map(Path, sys.argv[1:])
    if not source.is_absolute() or source.resolve() != source:
        raise ValueError("canonical source must be an absolute resolved path")
    data = archive.read_bytes()
    if digest(data) != ARCHIVE:
        raise ValueError("outer archive hash mismatch")
    import io
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as tar:
        members = tar.getmembers()
        if len(members) != 6 or {m.name for m in members} != {PREFIX + f for f in FILES}:
            raise ValueError("archive exact allowlist/duplicate mismatch")
        blobs: dict[str, bytes] = {}
        for member in members:
            if not member.isreg() or member.linkname or member.size > 100_000:
                raise ValueError("nonregular/link/oversized archive entry")
            stream = tar.extractfile(member)
            if stream is None:
                raise ValueError("missing archive payload")
            blobs[member.name] = stream.read()
    if digest(blobs[PREFIX + "package.sha256"]) != MANIFEST:
        raise ValueError("manifest pin mismatch")
    entries: dict[str, str] = {}
    for line in blobs[PREFIX + "package.sha256"].decode("ascii").splitlines():
        expected, path = line.split("  ", 1)
        if path in entries or len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
            raise ValueError("invalid manifest")
        entries[path] = expected
        payload = blobs[path] if path in blobs else (source / path).read_bytes()
        if digest(payload) != expected:
            raise ValueError("dependency hash mismatch: " + path)
    if {PREFIX + f for f in FILES - {"package.sha256"}} - entries.keys():
        raise ValueError("unauthenticated payload")
    for path in (source / "ops", source / "ops/tools"):
        if path.is_symlink() or not path.is_dir():
            raise ValueError("unsafe staging ancestor")
    target = source / PREFIX
    target.mkdir(mode=0o755, exist_ok=False)
    # AIDEV-NOTE: Caller umask077 protects evidence; only this new source directory needs UID10001 traversal.
    target.chmod(0o755)
    # Exclusive creation rejects retries; retain partial staging for inspection on any failure.
    for path, payload in blobs.items():
        destination = target / Path(path).name
        with destination.open("xb") as output:
            output.write(payload)
        os.chmod(destination, 0o644)
    print("authenticated six-file additive staging complete")

if __name__ == "__main__":
    main()
