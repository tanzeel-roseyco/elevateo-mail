"""Copy and remove only disposable APK-bound QA TLS material; never copy the CA signing key."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import stat
from acceptance_cleanup import acceptance_owner
from docker_task import Task

NAMES = {"ca.pem", "server.pem", "server.key"}


def copy_certificates(task: Task, source: Path, ca_sha256: str) -> None:
    uid, gid = acceptance_owner(task)
    target = task.android_tls
    if target != task.evidence / "android-tls" or target.resolve() != target:
        raise RuntimeError("unregistered Android certificate destination")
    info = source.lstat()
    if (source.resolve() != source or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != uid or info.st_gid != gid or stat.S_IMODE(info.st_mode) & 0o022):
        raise RuntimeError("Android certificate source ownership invalid")
    material: dict[str, bytes] = {}
    for name in sorted(NAMES):
        # AIDEV-NOTE: Read each bounded regular file with nofollow/nonblocking open before allocating output.
        with open(source / name, "rb", opener=lambda path, flags: os.open(path, flags | os.O_NOFOLLOW | os.O_NONBLOCK)) as stream:
            info = os.fstat(stream.fileno())
            modes = {0o600} if name == "server.key" else {0o600, 0o644}
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_gid != gid
                    or stat.S_IMODE(info.st_mode) not in modes or info.st_nlink != 1 or not 0 < info.st_size <= 16384):
                raise RuntimeError("Android certificate file contract mismatch")
            value = stream.read(16385)
            if len(value) != info.st_size:
                raise RuntimeError("Android certificate changed while reading")
            material[name] = value
    if hashlib.sha256(material["ca.pem"]).hexdigest() != ca_sha256:
        raise RuntimeError("Android public CA differs from the approved APK")
    target.mkdir(mode=0o700)
    for name, value in material.items():
        with (target / name).open("xb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(value)
    task.write("android-tls-public.json", {"ca_sha256": ca_sha256,
        "server_sha256": hashlib.sha256(material["server.pem"]).hexdigest(), "ca_signing_key_copied": False})


def remove_certificates(task: Task, removed: list[str]) -> None:
    target = task.android_tls
    if target is None:
        return
    try:
        info = target.lstat()
    except FileNotFoundError:
        return
    uid, gid = acceptance_owner(task)
    if (target != task.evidence / "android-tls" or target.resolve() != target or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != uid or info.st_gid != gid or stat.S_IMODE(info.st_mode) != 0o700):
        raise RuntimeError("Android certificate directory ownership mismatch")
    # AIDEV-NOTE: Reject all consumers and unknown entries before any deletion; partial setup is still removable.
    if task.project_containers():
        raise RuntimeError("Android certificate containers remain")
    entries = list(target.iterdir())
    for path in [target, *entries]:
        if task.docker("android-certificate-users", ["container", "ls", "-aq", "--filter", "volume=" + str(path)]).strip():
            raise RuntimeError("Android certificate has another consumer")
    for path in entries:
        info = path.lstat()
        if (path.name not in NAMES or not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_gid != gid
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
            raise RuntimeError("unexpected Android certificate entry")
    for path in entries:
        path.unlink()
        removed.append("android-certificate:" + str(path))
    target.rmdir()
    removed.append("android-certificate-directory:" + str(target))
