#!/usr/bin/env python3
"""Authenticate the fixed seven-member delivery; preserve partial writes on any failure."""
import hashlib
import io
import os
from pathlib import Path
import stat
import subprocess
import sys
import tarfile

ARCHIVE = "0dde1cfc01484f32020e6c4f5ee8b91f76b614075c1bb1bb7abd323fdc336c54"
PACKAGE = "8a9613df9d49c86a4f05748a75365a51b0cac7d60e406d30efb2598103fb40a7"
MODULE = "ops/tools/be01-transport-check"
MANIFEST = MODULE + "/package.sha256"
MEMBERS = {MODULE + "/" + name for name in (
    "parent-run.sh", "checks.sh", "run-container.sh", "dependency-regression.sh", "package.sha256"
)} | {"docs/evidence/scripts/be01-capability-volume-transport" + suffix
     for suffix in (".sh", "-regression.sh")}
INHERITED = {"ops/tools/be01-services-tools/Dockerfile", "ops/tools/be01-services-tools/checks.sh",
             "ops/tools/lane-c-synthetic/cleanup.sh", "docs/evidence/scripts/be-01-r1-fleet02-resources.sh",
             "ops/tests/fleet02-egress-source.sha256"}


def require(value: bool, message: str) -> None:
    if not value:
        raise ValueError(message)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe(path: Path, root: Path, regular: bool = False) -> None:
    # AIDEV-NOTE: Host ancestors need symlink safety; only bind-visible directories need other-execute.
    for item in reversed((path, *path.parents)):
        mode = item.lstat().st_mode
        require(not stat.S_ISLNK(mode), "symlink: " + str(item))
        if item != path or not regular:
            require(stat.S_ISDIR(mode), "not directory: " + str(item))
            if item == root or root in item.parents:
                require(bool(mode & stat.S_IXOTH), "untraversable bind directory: " + str(item))
        else:
            require(stat.S_ISREG(mode), "not regular: " + str(item))


def main() -> None:
    root, archive = Path(sys.argv[1]), Path(sys.argv[2])
    require(root.is_absolute() and str(root) == os.path.abspath(root), "absolute canonical root required")
    safe(root, root)
    require(archive.is_file() and not archive.is_symlink(), "regular archive required")
    raw = archive.read_bytes()
    require(digest(raw) == ARCHIVE, "archive hash mismatch")
    payload: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:") as bundle:
        entries = bundle.getmembers()
        require(len(entries) == 7 and {m.name for m in entries} == MEMBERS, "member set mismatch")
        for entry in entries:
            require(entry.isfile() and not entry.issym() and not entry.islnk(), "nonregular member")
            stream = bundle.extractfile(entry)
            require(stream is not None, "unreadable member")
            if stream is None:
                raise ValueError("missing member")
            payload[entry.name] = stream.read()
    require(digest(payload[MANIFEST]) == PACKAGE, "manifest hash mismatch")
    pins: dict[str, str] = {}
    for line in payload[MANIFEST].decode("ascii").splitlines():
        sha, name = line.split("  ")
        require(name not in pins and len(sha) == 64 and all(c in "0123456789abcdef" for c in sha), "bad pin")
        pins[name] = sha
    require(set(pins) == (MEMBERS - {MANIFEST}) | INHERITED, "dependency set mismatch")
    for name, sha in pins.items():
        if name not in payload:
            safe(root / name, root, regular=True)
        require(digest(payload[name] if name in payload else (root / name).read_bytes()) == sha, "pin: " + name)
    subprocess.run(["sha256sum", "-c", "--quiet", "ops/tests/fleet02-egress-source.sha256"],
                   cwd=root, check=True, timeout=60)
    targets = [root / MODULE] + [root / name for name in MEMBERS if not name.startswith(MODULE + "/")]
    for target in targets:
        safe(target.parent, root)
        require(not os.path.lexists(target), "existing target: " + str(target))
    # AIDEV-NOTE: Exclusive filesystem lease required; never roll back or overwrite uncertain partial state.
    (root / MODULE).mkdir(mode=0o755)
    (root / MODULE).chmod(0o755)
    for name in sorted(MEMBERS - {MANIFEST}) + [MANIFEST]:
        with (root / name).open("xb") as output:
            output.write(payload[name])
            os.fchmod(output.fileno(), 0o644)
    for name in MEMBERS:
        require((root / name).read_bytes() == payload[name], "staged bytes: " + name)
        require(stat.S_IMODE((root / name).stat().st_mode) == 0o644, "staged mode: " + name)
    subprocess.run(["sha256sum", "-c", "--quiet", MANIFEST], cwd=root, check=True, timeout=60)
    print("SEVEN_FILE_STAGE_PASS")


if __name__ == "__main__":
    main()
