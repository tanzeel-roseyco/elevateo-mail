"""Encrypted off-host backup and deliberately isolated, authority-fenced restore."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
from typing import Iterator
import uuid

from common import compose, private_material, required, run, sql
from volume_backup import VOLUMES, archive_volume, config, contents, digest, restore_volume, snapshot


@contextmanager
def exclusive(path: Path | None = None) -> Iterator[None]:
    # AIDEV-NOTE: Deployment supplies validated config; CLI recovery shares the same lock through its environment.
    path = path if path is not None else Path(required("ELEVATEO_OPERATIONS_LOCK"))
    if not path.is_absolute() or path.is_symlink():
        raise ValueError("absolute regular operations lock required")
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    if not stat.S_ISREG(os.fstat(descriptor).st_mode):
        os.close(descriptor)
        raise ValueError("regular operations lock required")
    with os.fdopen(descriptor, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def transfer(local: Path, name: str, download: bool = False) -> None:
    host, directory = required("ELEVATEO_BACKUP_SSH_HOST"), required("ELEVATEO_BACKUP_REMOTE_DIR")
    if not re.fullmatch(r"[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+", host) or not re.fullmatch(r"/[a-zA-Z0-9_/-]+", directory):
        raise ValueError("restricted off-host SSH destination required")
    if host.split("@")[1] in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("off-host backup destination required")
    known = Path(required("ELEVATEO_BACKUP_KNOWN_HOSTS"))
    if not known.is_file():
        raise ValueError("pinned known_hosts required")
    remote = f"{directory}/{name}"
    if any(c in str(local) for c in '\n\r"\\'):
        raise ValueError("unsafe temporary path")
    batch = f'get "{remote}" "{local}"\n' if download else f'put "{local}" "{remote}"\n'
    with private_material("ELEVATEO_BACKUP_SSH_KEY_BASE64") as identity:
        run(["sftp", "-q", "-b", "-", "-i", str(identity), "-oBatchMode=yes", "-oStrictHostKeyChecking=yes",
             f"-oUserKnownHostsFile={known}", host], batch.encode(), timeout=3600)


def backup(directory: Path) -> str:
    recipient = required("ELEVATEO_BACKUP_AGE_RECIPIENT")
    if not re.fullmatch(r"age1[a-z0-9]{58}", recipient):
        raise ValueError("age recipient required")
    directory.mkdir(mode=0o700)
    snapshot(directory)
    bundle, encrypted = directory / "snapshot.tar", directory / "snapshot.tar.age"
    with tarfile.open(bundle, "w") as archive:
        for name in ["manifest.json", *(f"{v}.tar" for v in sorted(VOLUMES))]:
            archive.add(directory / name, arcname=name, recursive=False)
    run(["age", "-r", recipient, "-o", str(encrypted), str(bundle)], timeout=3600)
    name = f"elevateo-{uuid.uuid4()}.tar.age"
    transfer(encrypted, name)
    downloaded = directory / "readback.age"
    transfer(downloaded, name, True)
    if digest(downloaded) != digest(encrypted):
        raise RuntimeError("off-host ciphertext readback mismatch")
    return name


def unpack(bundle: Path, directory: Path) -> dict[str, object]:
    expected = {"manifest.json", *(f"{v}.tar" for v in VOLUMES)}
    with tarfile.open(bundle, "r:") as archive:
        entries = archive.getmembers()
        if len(entries) != len(expected) or {entry.name for entry in entries} != expected:
            raise ValueError("snapshot member mismatch")
        for entry in entries:
            if not entry.isfile() or entry.size < 0 or (entry.name == "manifest.json" and entry.size > 16384):
                raise ValueError("snapshot member type rejected")
            # AIDEV-NOTE: Fixed flat names and exclusive writes avoid tar metadata/path handling on Python 3.11.
            directory.mkdir(mode=0o700, exist_ok=True)
            source = archive.extractfile(entry)
            if source is None:
                raise ValueError("snapshot member unreadable")
            with source, (directory / entry.name).open("xb") as target:
                shutil.copyfileobj(source, target)
    manifest: dict[str, object] = json.loads((directory / "manifest.json").read_text())
    if not isinstance(manifest, dict):
        raise ValueError("snapshot manifest object required")
    checksums = manifest.get("sha256")
    if manifest.get("version") != 1 or not isinstance(checksums, dict) or set(checksums) != VOLUMES:
        raise ValueError("snapshot manifest mismatch")
    for key in VOLUMES:
        if checksums[key] != digest(directory / f"{key}.tar"):
            raise ValueError("snapshot checksum mismatch")
    return manifest


def restore(encrypted: Path, directory: Path) -> None:
    definition = config(isolated=True)
    project = compose()[3]
    if not project.startswith("elevateo-restore-") or run(compose() + ["ps", "-a", "-q"]).strip():
        raise ValueError("fresh restore project required")
    existing = set(run(["docker", "volume", "ls", "-q"]).decode().splitlines())
    if any(f"{project}_{key}" in existing for key in VOLUMES):
        raise ValueError("restore refuses existing volumes")
    directory.mkdir(mode=0o700)
    bundle = directory / "snapshot.tar"
    with private_material("ELEVATEO_BACKUP_AGE_IDENTITY_BASE64") as identity:
        run(["age", "-d", "-i", str(identity), "-o", str(bundle), str(encrypted)], timeout=3600)
    manifest = unpack(bundle, directory)
    images = {name: service["image"] for name, service in definition["services"].items()}
    if manifest.get("images") != images or manifest.get("source_revision") != required("ELEVATEO_SOURCE_REVISION"):
        raise ValueError("restore requires original image roster and source revision")
    expected = {key: contents(directory / f"{key}.tar") for key in VOLUMES}
    # AIDEV-NOTE: New volumes only; interrupted restore remains isolated for inspection and is never auto-deleted.
    for key in sorted(VOLUMES):
        volume = f"{project}_{key}"
        run(["docker", "volume", "create", "--label", f"com.docker.compose.project={project}",
             "--label", f"com.docker.compose.volume={key}", volume])
        restore_volume(volume, directory / f"{key}.tar")
        readback = directory / f"{key}.readback.tar"
        archive_volume(volume, readback)
        if contents(readback) != expected[key]:
            raise RuntimeError("restored volume readback mismatch")
    try:
        run(compose() + ["up", "-d", "--no-deps", "--wait", "--wait-timeout", "180", "db"], timeout=240)
        sql(Path(__file__).with_name("restore_fence.sql").read_text())
        sql(Path(__file__).resolve().parents[2].joinpath("ops820/post_restore.sql").read_text())
    finally:
        run(compose() + ["stop", "--timeout", "60", "db"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["backup", "restore"])
    parser.add_argument("--snapshot", type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        with exclusive(), tempfile.TemporaryDirectory(prefix="elevateo-recovery-") as temporary:
            root = Path(temporary) / "private"
            if args.action == "backup":
                print("verified off-host backup: " + backup(root))
            elif args.snapshot:
                restore(args.snapshot, root)
                print("restore fenced; isolated volumes retained; services stopped")
            else:
                raise ValueError("snapshot required")
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError):
        raise SystemExit("recovery operation rejected; private details withheld") from None
