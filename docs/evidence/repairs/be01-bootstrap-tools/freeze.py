"""Local file packaging only: no test, shell, network or Docker invocation."""
from __future__ import annotations

import difflib
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import tarfile

ROOT = Path(__file__).resolve().parents[4]
PACKET = Path(__file__).resolve().parent
PREFIX = PACKET.relative_to(ROOT).as_posix()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write(name: str, content: str) -> None:
    (PACKET / name).write_bytes(content.encode("utf-8"))


def main() -> None:
    # AIDEV-NOTE: Repin only explicitly changed adapter files; inherited source pins remain authoritative.
    changed = ("parent.sh", "fixture-run.sh", "status-regression.sh")
    for name in changed:
        path = PACKET / name
        path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n"))
    manifest = PACKET / "package.sha256"
    pins: dict[str, str] = {}
    for line in manifest.read_text().splitlines():
        sha, path = line.split("  ", 1)
        pins[path] = sha
    for name in changed:
        pins[f"{PREFIX}/{name}"] = digest((PACKET / name).read_bytes())
    write("package.sha256", "".join(f"{sha}  {path}\n" for path, sha in pins.items()))
    payload: dict[str, bytes] = {}
    origins: dict[str, dict[str, str | bool]] = {}

    def add(path: str, expected: str | None = None) -> None:
        relative = PurePosixPath(path)
        if relative.is_absolute() or ".." in relative.parts or "\\" in path:
            raise ValueError(f"unsafe source path: {path}")
        source = ROOT / path
        if source.is_symlink() or not source.resolve().is_relative_to(ROOT):
            raise ValueError(f"source link escapes workspace: {path}")
        raw = source.read_bytes()
        data = raw
        if expected and digest(data) != expected:
            data = raw.replace(b"\r\n", b"\n")
            if digest(data) != expected:
                raise ValueError(f"pinned source mismatch: {path}")
        if path in payload:
            if payload[path] != data:
                raise ValueError(f"conflicting source pins: {path}")
            return
        payload[path] = data
        origins[path] = {"workspace_sha256": digest(raw), "delivery_lf_normalized": data != raw}
        if path.endswith(".sha256"):
            for line in data.decode("utf-8").splitlines():
                match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
                if not match:
                    raise ValueError(f"malformed manifest: {path}")
                child = match[2]
                if path.endswith("/fixture.sha256"):
                    child = str(relative.parent / child)
                add(child, match[1])

    add(f"{PREFIX}/package.sha256")
    add("ops/tests/fleet02-egress-source.sha256", "03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b")
    # AIDEV-NOTE: Carry the C1 regression in both payload and review roots; runtime remains coordinator-owned.
    for name in ("inventory.sh", "invoke.sh", "invoke-regression.sh", "reconcile.sh", "RUNBOOK.md"):
        add(f"{PREFIX}/{name}")
    payload["payload.sha256"] = "".join(f"{digest(data)}  {path}\n" for path, data in sorted(payload.items())).encode()
    write("payload.sha256", payload["payload.sha256"].decode("utf-8"))
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for path, data in sorted(payload.items()):
            member = tarfile.TarInfo(path)
            member.size = len(data); member.mode = 0o644; member.mtime = 0
            archive.addfile(member, io.BytesIO(data))
    archive_data = output.getvalue()
    archive_hash = digest(archive_data)
    archive_name = f"packet-{archive_hash}.tar"
    archive_path = PACKET / archive_name
    if archive_path.exists() and archive_path.read_bytes() != archive_data:
        raise ValueError("existing immutable archive differs")
    if not archive_path.exists():
        archive_path.write_bytes(archive_data)
    members = [{"path": path, "sha256": digest(data), "bytes": len(data),
                "lines": len(data.splitlines()), "mode": "0644", **origins.get(path, {})}
               for path, data in sorted(payload.items())]
    write("delivery.json", json.dumps({"status": "STATIC_ONLY_NOT_RUN", "archive": archive_name,
          "archive_sha256": archive_hash, "members": members}, indent=2) + "\n")
    parent = (PACKET / "parent.sh").read_text()
    old_parent = "\n".join(line for line in parent.splitlines() if line not in (
        "# AIDEV-NOTE: Check status precedence with fake daemon failures inside the pinned, socket-free Ruby container.",
        "phase=status-regression",
        "run_container -c 'timeout -k 2s 40s bash /src/docs/evidence/repairs/be01-bootstrap-tools/status-regression.sh'")) + "\n"
    fixture = (PACKET / "fixture-run.sh").read_text()
    old_fixture = fixture.split('  finish_fixture "$status"')[0] + (
        "  printf 'test_exit=%s\\n' \"$status\" > \"$evidence/fixture.status\"\n"
        '  docker inspect "$run_id" > "$evidence/fixture.after.json"\n  owned_run\n  return "$status"\n}\n')
    before = {"parent.sh": (old_parent, "22c6f91e9458157dd5bb632375ae74fea229d9bee054edc027e6218c200a1b8a"),
              "fixture-run.sh": (old_fixture, "4572143c0124b2840d648b097e33c5c8e98b9204426d62783dadd4b87e43b89e")}
    patches: list[str] = []
    for name, (old, pin) in before.items():
        if digest(old.encode()) != pin:
            raise ValueError(f"review baseline reconstruction mismatch: {name}")
        patches.extend(difflib.unified_diff(old.splitlines(True), (PACKET / name).read_text().splitlines(True),
                       fromfile=f"reviewed/{name}", tofile=f"candidate/{name}"))
    write("changes.patch", "".join(patches))
    review = ["parent.sh", "fixture-run.sh", "status-regression.sh", "inventory.sh", "invoke.sh",
              "invoke-regression.sh", "reconcile.sh", "deliver.py", "freeze.py", "RUNBOOK.md", "package.sha256",
              "delivery.json", "payload.sha256", "changes.patch", archive_name]
    write("review.sha256", "".join(f"{digest((PACKET / name).read_bytes())}  {name}\n" for name in review))
    write("review-lines.tsv", "path\tlines\tsha256\n" + "".join(
        f"{name}\t{len((PACKET / name).read_bytes().splitlines())}\t{digest((PACKET / name).read_bytes())}\n"
        for name in review if not name.endswith(".tar")))
    print(json.dumps({"archive": archive_name, "members": len(members), "bytes": len(archive_data),
                      "review_sha256": digest((PACKET / "review.sha256").read_bytes())}))


if __name__ == "__main__":
    main()
