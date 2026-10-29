"""Explicit final local-Docker backend gate; never deploys or connects to a fleet."""
from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "ops/tests/be02"))
from docker_task import RUBY, Task  # noqa: E402


def configure(task: Task) -> None:
    values = {**task.secrets, "BE02_SOURCE": ROOT.as_posix(), "BE02_PROJECT": task.project,
              "BE02_SERVER_IMAGE": task.image, "BE02_TASK_DATABASE_NAME": "postgres"}
    roles = {"ADMIN": ("supabase_admin", "POSTGRES_PASSWORD"),
             "MIGRATOR": ("elevateo_migrator", "MIGRATOR_DB_PASSWORD"),
             "API": ("elevateo_api", "API_DB_PASSWORD"), "WORKER": ("elevateo_worker", "WORKER_DB_PASSWORD")}
    extra: dict[str, str] = {"SEND811_MAILPIT_PROTOCOL": "true"}
    for prefix in ("ATT823", "OUT804"):
        extra[prefix + "_TASK_DATABASE_NAME"] = "postgres"
        for role, (login, key) in roles.items():
            extra[f"{prefix}_{role}_DATABASE_URL"] = f"postgresql://{login}:{values[key]}@db:5432/postgres"
    values.update(extra)
    # AIDEV-NOTE: Single-quoted dotenv values preserve Windows drive paths and spaces without interpolation.
    if any("'" in value or "\n" in value or "\r" in value for value in values.values()):
        raise RuntimeError("unsafe dotenv input")
    task.env_file.write_text("".join(f"{key}='{value}'\n" for key, value in values.items()), encoding="utf-8")
    task.env_file.chmod(0o600)
    seed = task.evidence / "postgres-config"
    seed.mkdir()
    database_image = re.search(r"image: (supabase/postgres:[^\s@]+@sha256:[a-f0-9]{64})(?=\s|$)",
                               (ROOT / "ops/compose.be02-test.yaml").read_text())
    if database_image is None:
        raise RuntimeError("pinned database image missing")
    task.docker("pull-database-seed-image", ["pull", database_image[1]], 600)
    # AIDEV-NOTE: tmpfs does not auto-copy packaged config like named volumes; preserve mandatory Supabase includes.
    task.docker("seed-database-config", ["run", "--rm", "--pull", "never", "--network", "none", "--entrypoint", "sh",
        "--mount", f"type=bind,source={seed},target=/seed", database_image[1],
        "-c", "cp -a /etc/postgresql-custom/. /seed/"], 60)
    override = {"services": {
        "db": {"entrypoint": ["sh", "-c", "cp -a /fixture-config/. /etc/postgresql-custom/ && chown -R postgres:postgres /etc/postgresql-custom && exec docker-entrypoint.sh \"$@\"", "--"],
               "volumes": [{"type": "tmpfs", "target": target,
                             "tmpfs": {"size": 536870912}} for target in
                            ("/var/lib/postgresql/data", "/etc/postgresql-custom")] +
                           [{"type": "bind", "source": str(seed), "target": "/fixture-config", "read_only": True}]},
        "test": {"environment": {key: "${" + key + "}" for key in extra}},
        "migrate": {"environment": {"BE02_TASK_DATABASE_NAME": "postgres",
            "BE02_ADMIN_DATABASE_URL": "postgresql://supabase_admin:${POSTGRES_PASSWORD}@db:5432/postgres"}}}}
    # Compose merges mounts by target, replacing only database storage; SQL source mounts remain read-only.
    path = task.evidence / "local.compose.json"
    path.write_text(json.dumps(override), encoding="utf-8")
    task.compose_files.append(path)


def run_suites(task: Task, mox_image: str) -> None:
    task.compose("database-start", ["up", "-d", "--wait", "--wait-timeout", "120", "db", "mailpit"], 150)
    task.compose("privilege-guards", ["run", "--rm", "--no-deps", "guards"], 150)
    for name in ("bootstrap", "bootstrap-send"):
        task.compose(name, ["run", "--rm", "--no-deps", "bootstrap", "-f", f"/ops/{name}.sql"], 60)
    task.compose("gateway-bootstrap", ["run", "--rm", "--no-deps", "bootstrap", "-f", "/gateway-bootstrap.sql"], 60)
    task.compose("auth-start", ["up", "-d", "--wait", "--wait-timeout", "120", "auth"], 150)
    task.compose("auth-grants", ["run", "--rm", "--no-deps", "bootstrap", "-f", "/ops/bootstrap-auth-grants.sql"], 60)
    task.compose("auth-concurrency", ["run", "--rm", "--no-deps", "--entrypoint", "bash", "guards",
                                     "/workspace/ops/tests/be02-guards/auth-rls-concurrency.sh"], 150)
    task.compose("migrate", ["run", "--rm", "--no-deps", "migrate"], 180)
    failures: list[str] = []
    commands = [("standard-suite-types-lint", "test", [], 3600)]
    for suite in ("attachment_gateway/authority_database", "attachments/database", "campaigns/database",
                  "send_worker/mailpit_protocol"):
        commands.append((suite.replace("/", "-"), "test", ["bundle", "exec", "ruby", f"test/{suite}_test.rb"], 180))
    for suite in ("attachment_gateway/migration_acl", "administration/assignment_member_options_migration",
                  "administration/organization_access_migration", "campaigns/rollback_migration"):
        commands.append((suite.replace("/", "-"), "migrate", ["bundle", "exec", "ruby", f"test/{suite}_test.rb"], 180))
    for name, service, command, seconds in commands:
        try:
            task.compose(name, ["run", "--rm", "--no-deps", service, *command], seconds)
        except RuntimeError:
            failures.append(name)
    task.compose("api-start", ["up", "-d", "api"], 45)
    task.runtime_credentials()
    task.wait_http()
    from local_app_chain import run as run_app_chain
    task.docker("app-chain-boot-admission", ["run", "--rm", "--network", "none",
        "--mount", f"type=bind,source={ROOT / 'ops/tests/completion/app_chain_boot.rb'},target=/fixture/app_chain_boot.rb,readonly",
        "--mount", f"type=bind,source={ROOT / 'ops/tests/completion/app_chain_boot_test.rb'},target=/fixture/app_chain_boot_test.rb,readonly",
        task.image, "bundle", "exec", "ruby", "/fixture/app_chain_boot_test.rb"], 60)
    # AIDEV-NOTE: HTTP acceptance retains sessions; the self-cleaning chain must run first, with no worker racing it.
    original_files = list(task.compose_files)
    try:
        run_app_chain(task, mox_image)
    finally:
        task.compose_files[:] = original_files
    # Restore the normal API command/environment before exercising the independent HTTP/worker fixture.
    task.compose("restore-api-after-chain", ["up", "-d", "--no-deps", "api"], 45)
    task.runtime_credentials()
    task.wait_http()
    task.compose("http-acceptance", ["run", "--rm", "--no-deps", "fixture"], 240)
    task.compose("worker-start", ["up", "-d", "worker"], 45)
    task.runtime_credentials()
    for name, file in (("worker-drain", "worker_check.rb"), ("mailpit-entry", "adv806_mailpit_entry_test.rb")):
        task.compose(name, ["run", "--rm", "--no-deps", "fixture", "bundle", "exec", "ruby",
                            "/workspace/ops/tests/be02/" + file], 240)
    # AIDEV-NOTE: Wire suite is deferred by test-suites.sh so its six HTTP requests execute exactly once, offline.
    offline = ["run", "--rm", "--network", "none", "--label", f"com.docker.compose.project={task.project}",
               "--mount", f"type=bind,source={ROOT / 'contracts'},target=/workspace/contracts,readonly",
               "--mount", f"type=bind,source={ROOT / 'apps/server/config'},target=/workspace/apps/server/config,readonly"]
    for name, source in (("contracts-v1", "/workspace/contracts/v1/tests/send_contract_test.rb"),
                         ("contracts-v2", "/workspace/contracts/v2/contract_test.rb"),
                         ("contracts-completion", "/workspace/contracts/v2/completion_contract_test.rb"),
                         ("resend-wire-six-calls", "test/send_worker/resend_wire_test.rb")):
        try:
            task.docker(name, [*offline, task.image, "bundle", "exec", "ruby", source], 120)
        except RuntimeError:
            failures.append(name)
    if failures:
        raise RuntimeError("failed gates: " + ", ".join(failures))



def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute-final-gate", action="store_true", required=True)
    parser.add_argument("--context", default="desktop-linux")
    parser.add_argument("--server-image", help="existing local immutable image ID; caller owns final build cleanup")
    parser.add_argument("--mox-image", required=True, help="immutable local Dockerfile.mox image ID")
    args = parser.parse_args()
    if args.server_image and not re.fullmatch(r"sha256:[a-f0-9]{64}", args.server_image):
        parser.error("existing server image must be an immutable local image ID")
    if any(os.environ.get(key) for key in ("DOCKER_HOST", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")):
        parser.error("unset Docker endpoint overrides; the selected context must be local")
    evidence = Path(tempfile.mkdtemp(prefix="elevateo-local-backend-"))
    evidence.chmod(0o700)
    credentials = {key: secrets.token_hex(32) for key in ("POSTGRES_PASSWORD", "MIGRATOR_DB_PASSWORD",
        "API_DB_PASSWORD", "WORKER_DB_PASSWORD", "ATTACHMENT_GATEWAY_DB_PASSWORD", "SECRET_KEY_BASE",
        "BE02_FIXTURE_SIGNING_SECRET")}
    credentials["ELEVATEO_SESSION_KEY_BASE64"] = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
    task = Task(ROOT, evidence, "elevateo-final-" + secrets.token_hex(6), args.context, credentials)
    if args.server_image:
        task.image = args.server_image
    task.deadline = time.monotonic() + 9000
    armed = built = False
    failure = ""
    try:
        context = json.loads(task.docker("context", ["context", "inspect", args.context]))[0]
        endpoint = context["Endpoints"]["docker"]["Host"]
        if not endpoint.startswith(("npipe://", "unix:///")):
            raise RuntimeError("only a local Docker socket is allowed")
        for folder in ("apps/server", "contracts", "ops/tests/be02", "ops/tests/be02-guards", "ops/production"):
            if any(p.is_file() and not p.name.endswith((".example", ".sample")) for p in (ROOT / folder).rglob(".env*")):
                raise RuntimeError("dotenv secrets found in a source mount")
        configure(task)
        task.compose("validate-compose", ["config", "--quiet"])
        images = set(re.findall(r"image: ([^\s]+@sha256:[0-9a-f]{64})", (ROOT / "ops/compose.be02-test.yaml").read_text()))
        for image in sorted(images | {RUBY}):
            task.docker("pull-pinned-image", ["pull", image], 600)
        if args.server_image:
            task.inspect("image", [args.server_image])
        else:
            built = True
            task.docker("build-server", ["build", "--pull=false", "-t", task.image, str(ROOT / "apps/server")], 1800)
        armed = True
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", args.mox_image):
            raise RuntimeError("Mox image must be an immutable local image ID")
        task.inspect("image", [args.mox_image])
        run_suites(task, args.mox_image)
    except (RuntimeError, OSError, ValueError, KeyError, IndexError, KeyboardInterrupt) as error:
        failure = task.redact(str(error)) or "interrupted"
    finally:
        # AIDEV-NOTE: No down -v or volume prune: the database uses tmpfs, unexpected persistent mounts are retained.
        task.deadline = time.monotonic() + 1800
        if armed:
            if failure:
                # AIDEV-NOTE: Capture bounded redacted service errors before removing ephemeral failed containers.
                try:
                    task.compose("failure-service-logs", ["logs", "--no-color", "--tail", "80", "db", "auth", "api"], 30)
                except (RuntimeError, OSError):
                    failure += "; service logs unavailable"
            try:
                mounts = [mount.get("Name") for container in task.project_containers()
                          for mount in container.get("Mounts", []) if mount.get("Type") == "volume"]
                task.write("retained-volumes.json", mounts)
                task.compose("cleanup-project", ["down", "--remove-orphans", "--timeout", "10"], 90)
            except (RuntimeError, OSError) as error:
                failure += "; cleanup: " + task.redact(str(error))
        if built:
            for name, command in (("builder-prune", ["builder", "prune", "-a", "-f"]),
                                  ("image-prune", ["image", "prune", "-a", "-f"]),
                                  ("repull-pinned-ruby", ["pull", RUBY])):
                try:
                    task.docker(name, command, 600)
                except (RuntimeError, OSError) as error:
                    failure += "; cleanup: " + task.redact(str(error))
        task.env_file.unlink(missing_ok=True)
        task.write("result.json", {"status": "FAILED" if failure else "PASSED", "failure": failure,
            "separate_gates": ["historical BE01 R1 fixture", "MCP", "native bridge", "restore drill"]})
    print(f"{'FAILED' if failure else 'PASSED'} evidence={evidence}")
    return 1 if failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
