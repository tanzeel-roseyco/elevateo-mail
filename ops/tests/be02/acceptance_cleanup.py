"""Exact acceptance resource boundaries, shared by pre-start checks and final cleanup."""
from __future__ import annotations

import json
from pathlib import Path
import stat
from typing import Any
from docker_task import Task


# AIDEV-NOTE: Any represents Docker's heterogeneous inspect boundary; policy fields are validated below.
def validate_policy(task: Task, service: str, host: dict[str, Any]) -> None:
    # AIDEV-NOTE: These ceilings mirror frozen Compose, including inherited seed limits and uncapped Rails tmpfs.
    memory, cpus, pids = {"acceptance-observer": (128 * 1024**2, 1_000_000_000, 64),
                          "acceptance-observer-setup": (768 * 1024**2, 1_000_000_000, 256),
                          "acceptance-web": (128 * 1024**2, 1_000_000_000, 64),
                          "android-web": (128 * 1024**2, 1_000_000_000, 64),
                          "android-connect": (128 * 1024**2, 1_000_000_000, 64),
                          "android-probe": (128 * 1024**2, 1_000_000_000, 64),
                          "acceptance-invitation": (768 * 1024**2, 1_000_000_000, 256),
                          "acceptance-seed": (768 * 1024**2, 1_000_000_000, 256),
                          "acceptance-browser": (3 * 1024**3, 2_000_000_000, 512),
                          "selenium": (3 * 1024**3, 2_000_000_000, 512)}[service]
    for key, ceiling in (("Memory", memory), ("NanoCpus", cpus), ("PidsLimit", pids)):
        value = host.get(key)
        if type(value) is not int or value != ceiling:
            raise RuntimeError("acceptance service resource ceiling mismatch")
    uid, gid = acceptance_owner(task)
    tmpfs = {} if service in {"acceptance-web", "android-web", "android-connect", "android-probe"} else {"/tmp": "rw,nosuid,nodev,size=512m,mode=1777"}
    if service in {"acceptance-seed", "acceptance-invitation", "acceptance-observer-setup"}:
        tmpfs.update({f"/workspace/apps/server/{name}": f"uid={uid},gid={gid},mode=1770"
                      for name in ("tmp", "log")})
    if (host.get("Tmpfs") or {}) != tmpfs:
        raise RuntimeError("acceptance tmpfs policy mismatch")
    options = host.get("SecurityOpt")
    if not isinstance(options, list) or any(not isinstance(value, str) for value in options):
        raise RuntimeError("acceptance security options missing")
    browser = service in {"acceptance-browser", "selenium"}
    # AIDEV-NOTE: Docker 29.7.2 fleet inspect preserves Compose's colon form; never infer truth from the prefix.
    if options.count("no-new-privileges:true") != 1 or len(options) != (2 if browser else 1):
        raise RuntimeError("acceptance privilege boundary mismatch")
    if browser:
        policies = [value.removeprefix("seccomp=") for value in options if value.startswith("seccomp=")]
        approved = getattr(task, "acceptance_seccomp", None)
        if (host.get("ShmSize") != 1024**3 or len(policies) != 1 or not isinstance(approved, dict)
                or json.loads(policies[0]) != approved):
            raise RuntimeError("browser sandbox policy mismatch")


def acceptance_owner(task: Task) -> tuple[int, int]:
    # AIDEV-NOTE: Never infer ownership at deletion time or revert to the image's unrelated default UID.
    uid, gid = getattr(task, "acceptance_uid", None), getattr(task, "acceptance_gid", None)
    if type(uid) is not int or type(gid) is not int or uid <= 0 or gid <= 0:
        raise RuntimeError("acceptance requires recorded nonzero host UID/GID")
    return uid, gid


# AIDEV-NOTE: Docker's heterogeneous inspect objects are checked before start and again before removal.
def validate_container(task: Task, item: dict[str, Any]) -> None:
    service = item["Config"]["Labels"].get("com.docker.compose.service")
    if service not in task.acceptance_mounts:
        raise RuntimeError("unregistered acceptance service")
    host, config = item["HostConfig"], item["Config"]
    uid, gid = acceptance_owner(task)
    expected_user = {"acceptance-web": "10001:10001", "selenium": "1200:1201"}.get(service, f"{uid}:{gid}")
    # AIDEV-NOTE: Android enters through a mounted UNIX socket; every acceptance service remains unpublished.
    ports: dict[str, object] = {}
    network = "none" if service == "android-probe" else task.project + "_isolated"
    # AIDEV-NOTE: The offline probe gets only code, the public CA and the fixed socket mount.
    if service == "android-probe" and (config.get("Cmd") != ["python3", "-I", "-B", "/probe.py", "--unix"] or config.get("Entrypoint")):
        raise RuntimeError("Android probe command mismatch")
    if (config["User"] != expected_user or not host["ReadonlyRootfs"] or host.get("Privileged")
            or host.get("CapAdd") or "ALL" not in host.get("CapDrop", []) or (host.get("PortBindings") or {}) != ports
            or host.get("NetworkMode") != network
            or host.get("LogConfig", {}).get("Type") != "none"):
        raise RuntimeError("acceptance container isolation mismatch")
    if service.startswith("android-") and any((item.get("NetworkSettings", {}).get("Ports") or {}).values()):
        raise RuntimeError("Android service has an unexpected published port")
    if item["Image"] != task.acceptance_images[service]:
        raise RuntimeError("acceptance image identity mismatch")
    validate_policy(task, service, host)
    binds = {(Path(mount["Source"]).resolve(), mount["Destination"], mount["RW"])
             for mount in item["Mounts"] if mount["Type"] == "bind"}
    expected = task.acceptance_mounts[service]
    if (not binds <= expected or (service != "acceptance-browser" and binds != expected)
            or (service == "acceptance-browser" and (len(binds) != 5
                or len([entry for entry in binds if entry[1] == "/output" and entry[2]]) != 1))):
        raise RuntimeError("unregistered acceptance bind mount")
    if any(mount["Type"] not in {"bind", "tmpfs"} for mount in item["Mounts"]):
        raise RuntimeError("acceptance containers cannot own volumes")
    if service not in {"acceptance-seed", "acceptance-invitation", "acceptance-observer-setup"}:
        environment = dict(entry.split("=", 1) for entry in config.get("Env", []))
        # AIDEV-NOTE: Pinned Grid embeds public Supervisor/TLS defaults; our direct Java bypasses those scripts.
        if service == "selenium":
            for key, value in {"SE_SUPERVISORD_UNIX_SERVER_PASSWORD": "secret",
                               "SE_JAVA_SSL_TRUST_STORE_PASSWORD": "/opt/selenium/secrets/server.pass"}.items():
                if environment.get(key) == value:
                    del environment[key]
        forbidden = ("PASSWORD", "SECRET", "SIGNING", "DATABASE_URL", "SERVICE_ROLE", "SESSION_KEY", "JWT")
        if any(any(word in key for word in forbidden) for key in environment):
            raise RuntimeError("privileged credential in browser/proxy/Grid environment")
        if any(secret in value for secret in task.secrets.values() for value in environment.values()):
            raise RuntimeError("fixture secret crossed acceptance runtime boundary")


def private_files(task: Task, removed: list[str]) -> None:
    directory = task.acceptance_private
    if directory is None:
        return
    try:
        info = directory.lstat()
    except FileNotFoundError:
        return
    # AIDEV-NOTE: Retain files on uncertain recorded ownership/consumers; never recurse or follow symlinks.
    uid, gid = acceptance_owner(task)
    if directory != task.evidence / "acceptance-private" or directory.resolve() != directory:
        raise RuntimeError("private directory identity mismatch")
    if task.project_containers():
        raise RuntimeError("private seed still has potential consumers")
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_gid != gid
            or stat.S_IMODE(info.st_mode) != 0o700):
        raise RuntimeError("private directory ownership mismatch")
    entries = list(directory.iterdir())
    for path in [directory, *entries]:
        if task.docker("private-file-users", ["container", "ls", "-aq", "--filter", "volume=" + str(path)]).strip():
            raise RuntimeError("private seed has another container consumer")
    # AIDEV-NOTE: A killed atomic publisher can leave only this exact final/tmp hardlink pair, never outside links.
    final, temporary = directory / "acceptance-invitation.json", directory / "acceptance-invitation.tmp"
    paired: set[Path] = set()
    if final in entries and temporary in entries:
        left, right = final.lstat(), temporary.lstat()
        if (left.st_dev, left.st_ino, left.st_nlink) == (right.st_dev, right.st_ino, 2):
            paired = {final, temporary}
    for path in entries:
        info = path.lstat()
        if (path.name not in {"seed.json", "acceptance-credentials.json", "acceptance-invitation.json", "acceptance-invitation.tmp"} or not stat.S_ISREG(info.st_mode)
                or info.st_nlink != (2 if path in paired else 1) or info.st_uid != uid or info.st_gid != gid
                or stat.S_IMODE(info.st_mode) != 0o600):
            raise RuntimeError("unexpected private seed entry")
    for path in entries:
        path.unlink()
        removed.append("private-file:" + str(path))
    directory.rmdir()
    removed.append("private-directory:" + str(directory))


def observer_files(task: Task, removed: list[str]) -> None:
    if not task.acceptance_mounts:
        return
    uid, gid = acceptance_owner(task)
    if task.project_containers():
        raise RuntimeError("observer files still have consumers")
    for name, allowed in {
        "observer-config": {"role.json"},
        "observer-control": {"binding.json", "request.tmp", "request.json", "result.tmp", "result.json"},
    }.items():
        directory = task.evidence / name
        if not directory.exists():
            continue
        info = directory.lstat()
        if (directory.resolve() != directory or not stat.S_ISDIR(info.st_mode) or info.st_uid != uid
                or info.st_gid != gid or stat.S_IMODE(info.st_mode) != 0o700):
            raise RuntimeError("observer directory identity invalid")
        entries = list(directory.iterdir())
        for path in [directory, *entries]:
            if task.docker("observer-file-users", ["container", "ls", "-aq", "--filter", "volume=" + str(path)]).strip():
                raise RuntimeError("observer files have another consumer")
        for path in entries:
            info = path.lstat()
            if (path.name not in allowed or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != uid
                    or info.st_gid != gid or stat.S_IMODE(info.st_mode) != 0o600):
                raise RuntimeError("unexpected observer private file")
        for path in entries:
            path.unlink()
            removed.append("observer-file:" + str(path))
        directory.rmdir()
        removed.append("observer-directory:" + str(directory))
