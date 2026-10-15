"""Delete only inspected resources belonging to this exact isolated task."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable
from docker_task import SERVICES, Task
from acceptance_cleanup import private_files, observer_files, validate_container
import attachment_runtime


def cleanup(task: Task) -> bool:
    task.cleanup_mode = True
    errors: list[str] = []
    removed: list[str] = []

    def attempt(name: str, action: Callable[[], None]) -> None:
        try:
            action()
        except Exception as error:
            errors.append(f"{name}: {type(error).__name__}: {error}")

    def containers() -> None:
        owned = task.project_containers()
        if len(owned) > 14 + len(task.acceptance_mounts) + len(attachment_runtime.SERVICES):
            raise RuntimeError("unexpected task container count")
        # AIDEV-NOTE: Validate every mount before removing any container; unknown mounts fail closed.
        for item in owned:
            service = item["Config"]["Labels"].get("com.docker.compose.service")
            if service in task.acceptance_mounts:
                validate_container(task, item)
                continue
            if service in attachment_runtime.SERVICES:
                attachment_runtime.validate_container(task, item)
            elif service not in SERVICES or item["HostConfig"].get("PortBindings"):
                raise RuntimeError("unexpected service or published port")
            for mount in item["Mounts"]:
                if mount["Type"] == "bind":
                    path = Path(mount["Source"]).resolve()
                    allowed = {task.root / "apps/server", task.root / "contracts", task.root / "ops/tests/be02",
                               task.root / "ops/tests/be02-guards",
                               task.root / "ops/db", task.root / "ops/db/bootstrap.sql",
                               task.root / "ops/ops820/bootstrap-gateway.sql",
                               task.root / "ops/tests/be02/clamd.conf",
                               task.root / "ops/supabase/db/99-roles.sql",
                               task.root / "ops/supabase/db/99-jwt.sql"}
                    if path not in allowed or mount["RW"]:
                        raise RuntimeError("unknown or writable source mount")
                elif mount["Type"] == "volume":
                    destinations = {task.project + "_db-data": "/var/lib/postgresql/data",
                                    task.project + "_db-config": "/etc/postgresql-custom"}
                    if destinations.get(mount["Name"]) != mount["Destination"]:
                        raise RuntimeError("unexpected database volume")
                    volume = task.inspect("volume", [mount["Name"]])[0]
                    if volume.get("Labels", {}).get("elevateo.be02.project") != task.project:
                        raise RuntimeError("database volume ownership mismatch")
                elif mount["Type"] != "tmpfs":
                    raise RuntimeError("unexpected mount type")
        task.write("cleanup-mounts.json", [{"id": item["Id"], "mounts": item["Mounts"]} for item in owned])
        for item in owned:
            task.docker("remove-container", ["container", "rm", "-f", item["Id"]], 30)
            removed.append("container:" + item["Id"])

    def builder() -> None:
        ids = task.docker("find-builder", ["container", "ls", "-aq", "--filter", "name=^/" + task.builder_container + "$"]).split()
        for item in task.inspect("container", ids):
            if item["Name"] != "/" + task.builder_container or item["Image"] != task.buildkit_id:
                raise RuntimeError("builder identity mismatch")
            mounts = item["Mounts"]
            if len(mounts) != 1 or mounts[0].get("Name") != task.cache or mounts[0]["Destination"] != "/var/lib/buildkit":
                raise RuntimeError("builder cache mount mismatch")
            task.docker("remove-builder-container", ["container", "rm", "-f", item["Id"]], 30)
            removed.append("builder-container:" + item["Id"])
        registry = task.docker("builder-registry", ["buildx", "ls", "--format", "json"])
        entries = [json.loads(line) for line in registry.splitlines() if line.strip()]
        if any(item.get("Name") == task.builder for item in entries):
            task.docker("remove-builder-registration", ["buildx", "rm", "--keep-daemon", "--keep-state", task.builder])
            removed.append("builder:" + task.builder)

    def volumes() -> None:
        names = task.docker("owned-volumes", ["volume", "ls", "-q", "--filter", "label=elevateo.be02.project=" + task.project]).split()
        for volume in task.inspect("volume", names):
            name = volume["Name"]
            if name not in {task.cache, task.project + "_db-data", task.project + "_db-config"}:
                raise RuntimeError("unexpected owned volume")
            users = task.docker("volume-users", ["container", "ls", "-aq", "--filter", "volume=" + name]).split()
            if users:
                raise RuntimeError("volume still has consumers")
            task.docker("remove-volume", ["volume", "rm", name], 30)
            removed.append("volume:" + name)

    def networks() -> None:
        ids = task.docker("owned-networks", ["network", "ls", "-q", "--filter", "label=elevateo.be02.project=" + task.project]).split()
        for item in task.inspect("network", ids):
            if item["Name"] != task.project + "_isolated" or item.get("Containers"):
                raise RuntimeError("network ownership/consumers mismatch")
            task.docker("remove-network", ["network", "rm", item["Id"]])
            removed.append("network:" + item["Id"])

    def image() -> None:
        ids = task.docker("owned-images", ["image", "ls", "-q", "--filter", "label=elevateo.be02.project=" + task.project]).split()
        for item in task.inspect("image", list(set(ids))):
            tags = item.get("RepoTags") or []
            if any(tag not in task.owned_image_tags for tag in tags):
                raise RuntimeError("task image has a foreign tag")
            task.docker("remove-image", ["image", "rm", item["Id"]], 30)
            removed.append("image:" + item["Id"])

    for name, action in [("containers", containers), ("builder", builder), ("volumes", volumes),
                         ("networks", networks), ("image", image), ("private-files", lambda: private_files(task, removed)), ("observer-files", lambda: observer_files(task, removed))]:
        attempt(name, action)
    task.write("cleanup.json", {"removed": removed, "errors": errors, "shared_bases_retained": True})
    return not errors
