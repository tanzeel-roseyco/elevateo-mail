#!/usr/bin/env python3
"""Authenticate ten regular archive entries before additive canonical staging."""
import hashlib
import os
from pathlib import Path
import sys
import tarfile

# AIDEV-NOTE: Never extract archive paths; copy authenticated bytes into a newly created exact directory.
ARCHIVE = "7f56a21b333828f05173ad0e1824f0d5c8c9d23a0f7a0cd0caca15358273a60f"
MANIFEST = "30ceb63297e634da4791bb3bc6803587dedf950281da58ce7dd2d1bf77a3541e"
PREFIX = ""
FILES = {"be01-services-stage.py", "be01-services-stage-regression.py", "be01-services-stage-boundary.py", "be01-services-python-identity.jq", "be01-services-python-identity-regression.sh", "be01-services-python-manifest.json", "be01-services-python.sha256", "be01-services-python-run.sh", "be01-services-identity-parent.sh", "be01-services-identity-package.sha256"}

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
        if len(members) != 10 or {m.name for m in members} != {PREFIX + f for f in FILES}:
            raise ValueError("archive exact allowlist/duplicate mismatch")
        blobs: dict[str, bytes] = {}
        for member in members:
            if not member.isreg() or member.linkname or member.size > 100_000:
                raise ValueError("nonregular/link/oversized archive entry")
            stream = tar.extractfile(member)
            if stream is None:
                raise ValueError("missing archive payload")
            blobs[member.name] = stream.read()
    if digest(blobs[PREFIX + "be01-services-identity-package.sha256"]) != MANIFEST:
        raise ValueError("manifest pin mismatch")
    entries: dict[str, str] = {}
    for line in blobs[PREFIX + "be01-services-identity-package.sha256"].decode("ascii").splitlines():
        expected, path = line.split("  ", 1)
        if path in entries or len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
            raise ValueError("invalid manifest")
        entries[path] = expected
        if path not in FILES - {"be01-services-identity-package.sha256"}:
            raise ValueError("unexpected manifest path")
        payload = blobs[path]
        if digest(payload) != expected:
            raise ValueError("dependency hash mismatch: " + path)
    if {PREFIX + f for f in FILES - {"be01-services-identity-package.sha256"}} - entries.keys():
        raise ValueError("unauthenticated payload")
    for path in (source, source / ".acceptance"):
        if path.is_symlink() or not path.is_dir():
            raise ValueError("unsafe staging ancestor")
    target = source / ".acceptance/python-identity"
    target.mkdir(mode=0o755, exist_ok=False)
    # AIDEV-NOTE: Caller umask077 protects evidence; only this new source directory needs UID10001 traversal.
    target.chmod(0o755)
    # Exclusive creation rejects retries; retain partial staging for inspection on any failure.
    for path, payload in blobs.items():
        destination = target / Path(path).name
        with destination.open("xb") as output:
            output.write(payload)
        os.chmod(destination, 0o644)
    print("authenticated ten-file additive staging complete")

if __name__ == "__main__":
    main()
