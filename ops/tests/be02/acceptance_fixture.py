"""Shared real Auth seed lifecycle; browser and Android consumers remain separate."""
from __future__ import annotations
import hashlib
import stat
from pathlib import Path
from acceptance_cleanup import acceptance_owner, validate_container
from docker_task import Task


def start_service(task: Task, service: str) -> str:
    if any(item["Config"]["Labels"].get("com.docker.compose.service") == service
           for item in task.project_containers()):
        raise RuntimeError("acceptance service already exists; retain it for inspected final cleanup")
    task.compose("acceptance-create", ["create", service], 45, quiet=True)
    items = [item for item in task.project_containers()
             if item["Config"]["Labels"].get("com.docker.compose.service") == service]
    if len(items) != 1:
        raise RuntimeError("acceptance service identity missing or ambiguous")
    validate_container(task, items[0])
    identity: str = items[0]["Id"]
    task.docker("acceptance-start", ["container", "start", identity], quiet=True)
    return identity


def seed_application(task: Task, private: Path) -> None:
    # AIDEV-NOTE: Consumers stay stopped until seed exit zero and private manifest validation; failed seed is never retried.
    uid, gid = acceptance_owner(task)
    task.compose("acceptance-consumers-stop", ["stop", "-t", "10", "api", "worker"], 35, quiet=True)
    task.compose("acceptance-origin", ["up", "-d", "--no-deps", "--force-recreate", "--wait",
                 "--wait-timeout", "120", "auth"], 140, quiet=True)
    task.runtime_credentials()
    network = task.inspect("network", [task.project + "_isolated"])[0]
    if not network["Internal"] or network.get("Labels", {}).get("elevateo.be02.project") != task.project:
        raise RuntimeError("acceptance requires the task's internal network")
    seed = start_service(task, "acceptance-seed")
    if task.docker("acceptance-seed-wait", ["container", "wait", seed], 180).strip() != "0":
        raise RuntimeError("supported Auth seed did not complete")
    validate_container(task, task.inspect("container", [seed])[0])
    task.docker("acceptance-seed-remove", ["container", "rm", seed])
    for name in ("seed.json", "acceptance-credentials.json"):
        info = (private / name).lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_gid != gid
                or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or not 0 < info.st_size <= 65536):
            raise RuntimeError("seed output private-file contract mismatch")
    task.write("acceptance-seed.sha256.json", {"seed.json": hashlib.sha256((private / "seed.json").read_bytes()).hexdigest()})
