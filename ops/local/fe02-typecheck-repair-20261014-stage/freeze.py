"""Metadata-only FE02 C/D freeze. Never executes application or container code."""
from __future__ import annotations

import difflib
import gzip
import hashlib
import io
import json
import shutil
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

STAGE = Path(__file__).resolve().parent
SOURCE = Path(r"C:\Users\Tanzeel\Code and projects\Elevateo Mail - Fable FE01 R1")
BASELINE = SOURCE / "coverage/fe02-unit-20261012-222622-8f7ac20b9c19"
EXPECTED_BASELINE = "d89c126d7184e3a53ba0dca4af3dd50abd32a0dc4080aa1461531b1273b32284"
EXPECTED_HEAD = "284aa71d20015b2b9b6a2f00beec9fa3087efe91"
EXPECTED_RUNNER = "dcaa2bc92d76c26a896f9737ba7c099a65da2c077b2ec018e488b60effbcc597"
EXPECTED_DOCKERFILE = "73861610a354eb5a9198f3ecb89f9978935ba0d5312ad74879bafeec5b80193b"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(SOURCE), *args], text=True).strip()


def allowed(name: str) -> bool:
    parts = PurePosixPath(name).parts
    blocked = {"node_modules", "dist", "coverage", ".vite", ".results", "test-results", "playwright-report", ".git"}
    return not any(p in blocked for p in parts) and not any(
        p.startswith(".env") or p.lower().endswith((".log", ".pem", ".key", ".p12", ".pfx"))
        or "credential" in p.lower() or "secret" in p.lower() for p in parts
    )


def live_files() -> dict[str, bytes]:
    names = subprocess.check_output(
        ["rg", "--files", "-uu", "apps/web", "contracts/v1"], cwd=SOURCE, text=True
    ).splitlines()
    result: dict[str, bytes] = {}
    for name in sorted(n.replace("\\", "/") for n in names):
        if not allowed(name):
            continue
        path = SOURCE / name
        if path.is_symlink():
            raise RuntimeError(f"Unexpected symlink: {name}")
        result[name] = path.read_bytes()
    return result


def write_json(name: str, value: object) -> None:
    (STAGE / name).write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if (STAGE / "payload").exists():
        raise RuntimeError("Freeze is write-once; create a new stage instead of overwriting evidence")
    if git("rev-parse", "HEAD") != EXPECTED_HEAD or git("branch", "--show-current") != "review/ultra/frontend-reader":
        raise RuntimeError("Unexpected source branch or HEAD")
    baseline_bytes = (BASELINE / "context.tar.gz").read_bytes()
    if sha(baseline_bytes) != EXPECTED_BASELINE:
        raise RuntimeError("Accepted A/B archive hash mismatch")
    old: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(baseline_bytes), mode="r:gz") as archive:
        for member in archive.getmembers():
            name = member.name.removeprefix("./")
            if member.isdir():
                continue
            if not member.isfile() or name.startswith("/") or ".." in PurePosixPath(name).parts or name in old:
                raise RuntimeError(f"Unsafe/duplicate baseline member: {name}")
            stream = archive.extractfile(member)
            if stream is None:
                raise RuntimeError(f"Unreadable baseline member: {name}")
            old[name] = stream.read()
    baseline_manifest = (BASELINE / "manifest.sha256").read_text(encoding="utf-8-sig")
    old_expected = {line[66:].removeprefix("./"): line[:64] for line in baseline_manifest.splitlines() if line}
    if {name: sha(data) for name, data in old.items()} != old_expected:
        raise RuntimeError("A/B manifest and archive file set/hash mismatch")
    current = live_files()
    manifest = "".join(f"{sha(data)}  {name}\n" for name, data in current.items())
    for name, data in current.items():
        dest = STAGE / "payload" / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    with (STAGE / "context.tar.gz").open("wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode="w", format=tarfile.PAX_FORMAT) as archive:
                for name, data in current.items():
                    entry = tarfile.TarInfo(name)
                    entry.size, entry.mode, entry.mtime = len(data), 0o644, 0
                    archive.addfile(entry, io.BytesIO(data))
    # AIDEV-NOTE: Rehash live inputs immediately after archive closure; fail on both content and file-set drift.
    live_after = live_files()
    frozen_hashes = {name: sha(data) for name, data in current.items()}
    after_hashes = {name: sha(data) for name, data in live_after.items()}
    drift = sorted(name for name in frozen_hashes.keys() | after_hashes.keys() if frozen_hashes.get(name) != after_hashes.get(name))
    write_json("live-rehash.json", {"checkedAt": datetime.now(timezone.utc).isoformat(), "drift": drift, "files": len(after_hashes)})
    if drift:
        raise RuntimeError(f"Source drift: {drift}")
    archive_hash = sha((STAGE / "context.tar.gz").read_bytes())
    (STAGE / "manifest.sha256").write_text(manifest, encoding="utf-8", newline="\n")
    (STAGE / "context.tar.gz.sha256").write_text(f"{archive_hash}  context.tar.gz\n", encoding="utf-8")
    (STAGE / "file-list.txt").write_text("\n".join(current) + "\n", encoding="utf-8")
    runner_dir = STAGE / "runner"
    runner_dir.mkdir()
    runner_hashes: dict[str, str] = {}
    for name in ["run-fleet-02.sh", "validation.Dockerfile", "README.md", "probes.sh", "make-snapshot.sh"]:
        data = (SOURCE / "scripts/fleet-02-validation-20261012" / name).read_bytes()
        (runner_dir / name).write_bytes(data)
        runner_hashes[name] = sha(data)
    if runner_hashes["run-fleet-02.sh"] != EXPECTED_RUNNER or runner_hashes["validation.Dockerfile"] != EXPECTED_DOCKERFILE:
        raise RuntimeError("Full accepted runner identity mismatch")
    diffs: list[str] = []
    changes: list[dict[str, object]] = []
    for name in sorted(old.keys() | current.keys()):
        before, after = old.get(name), current.get(name)
        if before == after:
            continue
        before_lines = before.decode("utf-8-sig").splitlines() if before is not None else []
        after_lines = after.decode("utf-8-sig").splitlines() if after is not None else []
        hunks = []
        for tag, i, j, k, l in difflib.SequenceMatcher(None, before_lines, after_lines, autojunk=False).get_opcodes():
            if tag != "equal":
                hunks.append({"kind": tag, "old": [i + 1, j], "new": [k + 1, l]})
        changes.append({"path": name, "status": "added" if before is None else "deleted" if after is None else "modified",
                        "oldSha256": sha(before) if before is not None else None,
                        "sha256": sha(after) if after is not None else None,
                        "oldLines": len(before_lines), "lines": len(after_lines), "hunks": hunks})
        diffs.extend(difflib.unified_diff(before_lines, after_lines, fromfile="A-B/" + name, tofile="C-D/" + name, n=0, lineterm=""))
    (STAGE / "cd-only.diff").write_text("\n".join(diffs) + "\n", encoding="utf-8")
    write_json("changes.json", changes)
    write_json("metadata.json", {
        "frozenAt": datetime.now(timezone.utc).isoformat(), "source": str(SOURCE), "head": EXPECTED_HEAD,
        "branch": git("branch", "--show-current"), "sourceStatus": git("status", "--porcelain=v1"),
        "files": len(current), "archiveBytes": (STAGE / "context.tar.gz").stat().st_size,
        "archiveSha256": archive_hash, "manifestSha256": sha(manifest.encode()),
        "baselineArchiveSha256": EXPECTED_BASELINE, "baselineFiles": len(old),
        "changedFiles": len(changes), "addedFiles": sum(c["status"] == "added" for c in changes),
        "runnerHashes": runner_hashes, "drift": drift, "runtime": "NOT_RUN",
        "exclusions": [".env*", "credentials/secrets/key files", "node_modules", "dist", "coverage", ".vite", "e2e/.results", "logs"],
        "fileHashes": frozen_hashes,
    })
    print(json.dumps({"stage": str(STAGE), "files": len(current), "changedFiles": len(changes), "archiveSha256": archive_hash,
                      "manifestSha256": sha(manifest.encode()), "drift": drift, "runtime": "NOT_RUN"}, indent=2))


if __name__ == "__main__":
    main()
