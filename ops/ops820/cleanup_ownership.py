"""Admit removal only for this disposable drill's exact Compose mounts and volumes."""
from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import sys
# AIDEV-NOTE: Any is confined to Docker's heterogeneous JSON; admission validates every consumed field.
from typing import Any

PROJECT_LABEL = "com.docker.compose.project"
VOLUMES = {"db-data", "db-config", "storage-data"}


def validate(project: str, root: Path, containers: list[dict[str, Any]],
             volumes: list[dict[str, Any]]) -> None:
    # AIDEV-NOTE: unknown mounts fail closed; persistent stacks must never qualify for drill cleanup.
    if not re.fullmatch(r"(?:ops820-source|ops402-restore)-[0-9]+-[0-9]+", project):
        raise ValueError("not a disposable drill project")
    expected = {f"{project}_{suffix}": suffix for suffix in VOLUMES}
    owned: set[str] = set()
    for volume in volumes:
        name = volume["Name"]
        labels = volume.get("Labels") or {}
        if (name not in expected or name in owned or labels.get(PROJECT_LABEL) != project
                or labels.get("com.docker.compose.volume") != expected[name]
                or volume.get("Driver") != "local" or volume.get("Options")):
            raise ValueError("unowned drill volume")
        owned.add(name)
    binds = {
        str(root / "ops/supabase/db/98-service-identities.sql"):
            "/docker-entrypoint-initdb.d/init-scripts/99-identities.sql",
        str(root / "ops/supabase/db/99-jwt.sql"):
            "/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql",
    }
    destinations = {"db-data": "/var/lib/postgresql/data",
                    "db-config": "/etc/postgresql-custom", "storage-data": "/var/lib/storage"}
    for container in containers:
        if (container["Config"].get("Labels") or {}).get(PROJECT_LABEL) != project:
            raise ValueError("unowned drill container")
        for mount in container["Mounts"]:
            kind = mount["Type"]
            if kind == "bind":
                source = mount["Source"]
                if (source not in binds or Path(source).is_symlink() or mount["RW"] is not False
                        or mount["Destination"] != binds[source]):
                    raise ValueError("unexpected drill bind mount")
            elif kind == "volume":
                name = mount["Name"]
                if name not in owned or mount["Destination"] != destinations[expected[name]]:
                    raise ValueError("unexpected drill volume mount")
            else:
                raise ValueError("unexpected drill mount type")


def docker(*args: str) -> str:
    result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=30, check=True)
    return result.stdout


def main(project: str, root: Path) -> None:
    ids = docker("ps", "-aq", "--filter", f"label={PROJECT_LABEL}={project}").split()
    names = docker("volume", "ls", "-q", "--filter", f"label={PROJECT_LABEL}={project}").split()
    # AIDEV-NOTE: Docker JSON is untrusted; shape/key/type failures deny cleanup without printing secrets.
    containers = json.loads(docker("container", "inspect", *ids)) if ids else []
    volumes = json.loads(docker("volume", "inspect", *names)) if names else []
    validate(project, root, containers, volumes)


if __name__ == "__main__":
    try:
        main(sys.argv[1], Path(sys.argv[2]).resolve(strict=True))
    except Exception:
        print("drill cleanup ownership check failed; resources retained", file=sys.stderr)
        raise SystemExit(1) from None
