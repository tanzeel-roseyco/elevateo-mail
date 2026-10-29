"""Real HTTP/SQL/Mox application chain on the final gate's isolated network."""
from __future__ import annotations

import ipaddress
import json
import uuid
import time

from docker_task import Task


def run(task: Task, image: str) -> None:
    network = task.project + "_isolated"
    if task.inspect("network", [network])[0].get("Internal") is not True:
        raise RuntimeError("app-chain requires an internal network")
    addresses: dict[str, str] = {}
    for service in ("db", "api", "auth", "mailpit"):
        identifier = task.compose("chain-service", ["ps", "-q", service]).strip()
        item = task.inspect("container", [identifier])[0]
        addresses[service] = str(ipaddress.IPv4Address(item["NetworkSettings"]["Networks"][network]["IPAddress"]))
    # AIDEV-NOTE: Dispatch controls require canonical UUID epochs; arbitrary hex correctly remains held.
    epoch = str(uuid.uuid4())
    control = task.evidence / "app-chain-control.json"
    control.write_text(json.dumps({"epoch": epoch, "outbound_held": True}), encoding="ascii")
    overlay = task.evidence / "app-chain.compose.json"
    # AIDEV-NOTE: Boot adapter proves historical HTTP/SQL/SMTP/IMAP composition, not production Authentik admission.
    overlay.write_text(json.dumps({"services": {"api": {"environment": {
        "ELEVATEO_COOKIE_SECURE": "true", "ELEVATEO_BROWSER_ORIGIN": "https://mail.elevateoco.com",
        "ELEVATEO_OUTBOUND_MODE": "held", "BE02_ISOLATED_APP_CHAIN": "1",
        "ELEVATEO_SEND_API_ENABLED": "true", "ELEVATEO_SEND_CONTROL_PATH": "/tmp/chain-control.json"},
        "volumes": [{"type": "bind", "source": str(control), "target": "/tmp/chain-control.json",
                     "read_only": True}, {"type": "bind",
                     "source": str(task.root / "ops/tests/completion/app_chain_boot.rb"),
                     "target": "/tmp/app-chain-boot.rb", "read_only": True}],
        "command": ["bundle", "exec", "ruby", "/tmp/app-chain-boot.rb"]}}}), encoding="utf-8")
    task.compose_files.append(overlay)
    task.compose("chain-api", ["up", "-d", "--no-deps", "api"], 45)
    task.wait_http()
    identifier = task.compose("chain-api-id", ["ps", "-q", "api"]).strip()
    addresses["api"] = str(ipaddress.IPv4Address(task.inspect("container", [identifier])[0]
        ["NetworkSettings"]["Networks"][network]["IPAddress"]))
    values = {"BE02_MOX_APP_CHAIN": "1", "BE02_TASK_DATABASE_NAME": "postgres",
              "BE02_MOX_CONTROL_EPOCH": epoch, "BE02_MOX_PROTOCOL_DIRECTORY": "/private/runtime",
              "SSL_CERT_FILE": "/private/runtime/ca.pem",
              "BE02_FIXTURE_SIGNING_SECRET": task.secrets["BE02_FIXTURE_SIGNING_SECRET"]}
    for role, key in (("ADMIN", "POSTGRES_PASSWORD"), ("API", "API_DB_PASSWORD"), ("WORKER", "WORKER_DB_PASSWORD")):
        user = "supabase_admin" if role == "ADMIN" else "elevateo_" + role.lower()
        values[f"BE02_{role}_DATABASE_URL"] = f"postgres://{user}:{task.secrets[key]}@{addresses['db']}:5432/postgres"
    private = task.evidence / ".env.app-chain"
    private.write_text("".join(f"{key}={value}\n" for key, value in values.items()), encoding="ascii")
    private.chmod(0o600)
    name = task.project + "-app-chain"
    created = False
    try:
        mounts: list[str] = []
        for relative in ("ops/selfhosted-mail", "ops/tests/be02", "apps/server/test/support/launch_mailflows"):
            directory = task.root / relative
            if any(p.is_file() and not p.name.endswith((".example", ".sample")) for p in directory.rglob(".env*")):
                raise RuntimeError("dotenv secret found in app-chain source mount")
            mounts += ["--mount", f"type=bind,source={directory},target=/source/{relative},readonly"]
        # AIDEV-NOTE: Ruby runs from /app; mount the reviewed oracle there as well as the protocol script source path.
        mounts += ["--mount", f"type=bind,source={task.root / 'apps/server/test/support/launch_mailflows'},target=/app/test/support/launch_mailflows,readonly"]
        hosts = [part for host, address in addresses.items() for part in ("--add-host", f"{host}:{address}")]
        # AIDEV-NOTE: Secrets and Mox data live only in tmpfs; fixture logs never enter Docker logs or host evidence.
        script = ("from pathlib import Path; import os; "
                  "f=os.open('/private/fixture.log',os.O_WRONLY|os.O_CREAT,0o600); "
                  "os.dup2(f,1); os.dup2(f,2); "
                  "os.execv('/usr/bin/python3',['python3','/source/apps/server/test/support/launch_mailflows/protocol.py'])")
        task.docker("chain-create", ["create", "--name", name, "--network", network,
            "--label", f"com.docker.compose.project={task.project}", "--read-only", "--memory", "1g",
            "--pids-limit", "128", "--dns", "127.0.0.1", "--tmpfs", "/private:rw,nosuid,size=512m,mode=755",
            "--tmpfs", "/tmp:rw,nosuid,size=128m,mode=1777", "--env-file", str(private),
            *mounts, *hosts,
            "--add-host", "mail.dispatch.company.com:127.0.0.1",
            "--add-host", "mail.second.company.com:127.0.0.1",
            "--entrypoint", "python3", image, "-c", script])
        created = True
        task.docker("chain-start", ["start", name])
        deadline = time.monotonic() + 90
        while True:
            ready = task.docker("chain-ready", ["exec", name, "python3", "-c",
                "from pathlib import Path; print(Path('/private/runtime/ready').is_file())"]).strip()
            if ready == "True":
                break
            if time.monotonic() >= deadline:
                raise RuntimeError("app-chain fixture readiness timed out")
            time.sleep(0.2)
        task.docker("mox-app-chain", ["exec", "--user", "10001:10001", "--workdir", "/app", name,
            "bundle", "exec", "ruby", "test/support/launch_mailflows/app_chain_test.rb",
            "--name", "test_real_smtp_ingestion_inbox_and_authorized_reply"], 150)
        task.docker("chain-done", ["exec", name, "touch", "/private/runtime/done"])
        if task.docker("chain-wait", ["wait", name], 30).strip() != "0":
            raise RuntimeError("app-chain fixture teardown failed")
    finally:
        try:
            if created:
                task.docker("chain-remove", ["rm", "-f", name], 30)
        finally:
            private.unlink(missing_ok=True)
