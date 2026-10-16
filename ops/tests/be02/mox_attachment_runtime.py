"""Private service addresses for the real Mox attachment proof."""
from __future__ import annotations

import ipaddress
from pathlib import Path
from docker_task import Task

SERVICES = {"api", "auth", "mailpit", "storage", "clamav", "attachment-gateway"}


def prepare(task: Task, out: Path) -> tuple[list[tuple[Path, str, bool]], dict[str, str]]:
    # AIDEV-NOTE: Mox owns DNS in this namespace; map only inspected task services, never public resolvers.
    addresses: dict[str, str] = {}
    for item in task.project_containers():
        labels = item["Config"]["Labels"]
        service = labels.get("com.docker.compose.service")
        if service not in SERVICES:
            continue
        if labels.get("com.docker.compose.project") != task.project or service in addresses:
            raise RuntimeError("attachment fixture service ownership mismatch")
        raw = item["NetworkSettings"]["Networks"][task.project + "_isolated"]["IPAddress"]
        address = ipaddress.IPv4Address(raw)
        if not address.is_private or address.is_loopback or address.is_unspecified or address.is_link_local:
            raise RuntimeError("attachment fixture requires a private service address")
        addresses[service] = str(address)
    if set(addresses) != SERVICES:
        raise RuntimeError("attachment fixture services missing")
    hosts = out / "hosts"
    hosts.write_text("127.0.0.1 localhost\n" + "".join(f"{addresses[name]} {name}\n" for name in sorted(addresses)), encoding="ascii")
    hosts.chmod(0o600)
    return [(hosts, "/etc/hosts", True), (task.root / "ops/tests/be02", "/workspace/ops/tests/be02", True)], {
        "BE02_STORAGE_SERVICE": task.secrets["BE02_STORAGE_SERVICE"],
        "BE02_FIXTURE_SIGNING_SECRET": task.secrets["BE02_FIXTURE_SIGNING_SECRET"],
    }
