"""Cold, cross-volume snapshots: all project writers are stopped before the first archive."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile
from typing import Any

from common import compose, helper_image, required, run

VOLUMES = {"db-data", "db-config", "storage-data", "mox-config", "mox-data", "mox-tls"}


def digest(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def config(isolated: bool = False) -> dict[str, Any]:
    # AIDEV-NOTE: Any is confined to Compose's extensible JSON boundary; relevant persistence fields are checked below.
    # AIDEV-NOTE: Compose interpolation includes secrets; this value stays in memory and never enters manifests/logs.
    value: dict[str, Any] = json.loads(run(compose() + ["config", "--format", "json"]))
    if set(value.get("volumes", {})) != VOLUMES or not value.get("services", {}).get("db"):
        raise ValueError("complete six-volume data plane required")
    project = compose()[3]
    for key, volume in value["volumes"].items():
        if volume.get("name") != f"{project}_{key}" or volume.get("external", False):
            raise ValueError("project-owned named volumes required")
    for service in value["services"].values():
        for mount in service.get("volumes", []):
            if not mount.get("read_only", False) and (mount.get("type") != "volume" or mount.get("source") not in VOLUMES):
                raise ValueError("untracked writable persistence prevents backup")
        if isolated and service.get("ports"):
            raise ValueError("restore Compose must not publish ports")
        if isolated and service.get("network_mode"):
            raise ValueError("restore Compose must not bypass isolated networks")
    if isolated and (not value.get("networks") or any(not n.get("internal", False) or n.get("external", False)
                                                    for n in value["networks"].values())):
        raise ValueError("restore requires internal isolated networks")
    return value


def volume_command(volume: str, write: bool = False) -> list[str]:
    mode = "" if write else ",readonly"
    return ["docker", "run", "--rm", "-i", "--network", "none", "--entrypoint", "tar",
            "--mount", f"type=volume,source={volume},target=/data{mode}", helper_image()]


def archive_volume(volume: str, target: Path) -> None:
    with target.open("xb") as output:
        result = subprocess.run(volume_command(volume) + ["-cpf", "-", "-C", "/data", "."],
                                stdout=output, stderr=subprocess.DEVNULL, timeout=3600, check=False)
    if result.returncode:
        raise RuntimeError("volume archive failed")


def restore_volume(volume: str, source: Path) -> None:
    with source.open("rb") as data:
        result = subprocess.run(volume_command(volume, True) + ["-xpf", "-", "-C", "/data"],
                                stdin=data, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                timeout=3600, check=False)
    if result.returncode:
        raise RuntimeError("fresh volume restore failed")


def contents(path: Path) -> dict[str, tuple[int, int, int, str, str]]:
    result: dict[str, tuple[int, int, int, str, str]] = {}
    with tarfile.open(path, "r:") as archive:
        for item in archive:
            if item.name.startswith("/") or ".." in Path(item.name).parts or item.name in result:
                raise ValueError("unsafe volume archive path")
            if item.issym() or item.islnk():
                if item.linkname.startswith("/") or ".." in Path(item.linkname).parts:
                    raise ValueError("external archive link rejected")
            elif not item.isfile() and not item.isdir():
                raise ValueError("special files cannot be restored")
            content = archive.extractfile(item) if item.isfile() else None
            checksum = hashlib.file_digest(content, "sha256").hexdigest() if content else ""
            result[item.name] = (item.mode, item.uid, item.gid, item.linkname, checksum)
    return result


def snapshot(target: Path) -> dict[str, object]:
    definition = config()
    revision = required("ELEVATEO_SOURCE_REVISION")
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("exact deployment source revision required")
    running = run(compose() + ["ps", "--status", "running", "--services"]).decode().splitlines()
    if "db" not in running:
        raise ValueError("healthy running database required before backup")
    # AIDEV-NOTE: Docker auto-creates absent volume mounts; reject missing state before an empty archive can look valid.
    existing = set(run(["docker", "volume", "ls", "-q"]).decode().splitlines())
    if any(definition["volumes"][key]["name"] not in existing for key in VOLUMES):
        raise ValueError("all snapshot volumes must already exist")
    # AIDEV-NOTE: Cold stop closes import/upload/provider boundaries, then cleanly flushes PostgreSQL and Mox.
    try:
        run(compose() + ["stop", "--timeout", "120"], timeout=300)
        if run(compose() + ["ps", "--status", "running", "-q"]).strip():
            raise RuntimeError("writer barrier not established")
        for key in sorted(VOLUMES):
            volume = definition["volumes"][key]["name"]
            if run(["docker", "ps", "-q", "--filter", f"volume={volume}"]).strip():
                raise RuntimeError("volume has an external writer")
            archive_volume(volume, target / f"{key}.tar")
        manifest: dict[str, object] = {
            "version": 1, "source_revision": revision,
            "images": {name: service["image"] for name, service in definition["services"].items()},
            "sha256": {key: digest(target / f"{key}.tar") for key in sorted(VOLUMES)},
            "barrier": "all-project-services-stopped", "restore": "isolated-held-reconciliation-required"}
        (target / "manifest.json").write_text(json.dumps(manifest, sort_keys=True), encoding="utf-8")
        return manifest
    finally:
        if running:
            run(compose() + ["start", *running], timeout=300)
