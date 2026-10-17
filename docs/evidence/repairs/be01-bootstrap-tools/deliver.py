"""Authenticate and extract the frozen local packet; does not invoke Docker or SSH."""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile


def main() -> None:
    # AIDEV-NOTE: The external review.sha256 must be authenticated before trusting this script or delivery.json.
    if len(sys.argv) != 4:
        raise SystemExit("usage: deliver.py ARCHIVE DELIVERY_JSON NEW_ABSOLUTE_DIRECTORY")
    archive, manifest, destination = map(Path, sys.argv[1:])
    metadata = json.loads(manifest.read_text(encoding="utf-8"))
    data = archive.read_bytes()
    if hashlib.sha256(data).hexdigest() != metadata["archive_sha256"]:
        raise ValueError("archive hash mismatch")
    if not destination.is_absolute() or destination != destination.resolve() or destination.exists():
        raise ValueError("destination must be a fresh canonical absolute path")
    expected = {row["path"]: row for row in metadata["members"]}
    if len(expected) != len(metadata["members"]) or len(expected) > 200:
        raise ValueError("invalid member count")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as bundle:
        members = bundle.getmembers()
        if len(members) != len(expected) or {item.name for item in members} != set(expected):
            raise ValueError("member set mismatch")
        contents: dict[str, bytes] = {}
        for member in members:
            path = PurePosixPath(member.name)
            if (not member.isfile() or path.is_absolute() or ".." in path.parts
                    or str(path) != member.name or "\\" in member.name or member.mode != 0o644):
                raise ValueError("unsafe archive member")
            stream = bundle.extractfile(member)
            if stream is None:
                raise ValueError("missing member data")
            content = stream.read()
            row = expected[member.name]
            if len(content) != row["bytes"] or hashlib.sha256(content).hexdigest() != row["sha256"]:
                raise ValueError("member authentication failed")
            contents[member.name] = content
    # No extractall: validated regular bytes only, into a new tree, without changing existing ancestor modes.
    destination.mkdir(mode=0o755)
    destination.chmod(0o755)
    for name, content in contents.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        parent = target.parent
        while parent != destination:
            parent.chmod(0o755)
            parent = parent.parent
        with target.open("xb") as output:
            output.write(content)
        target.chmod(0o644)
    print(f"authenticated_members={len(contents)} source={destination}")


if __name__ == "__main__":
    main()
