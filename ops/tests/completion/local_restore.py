"""Final local Docker restore drill; source and restored volumes are retained, never deleted."""
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
from docker_task import Task  # noqa: E402

VOLUMES = {"db-data", "db-config", "storage-data", "mox-config", "mox-data", "mox-tls"}


def prepare(task: Task, helper: str) -> dict[str, object]:
    override = task.evidence / "seed.compose.json"
    override.write_text(json.dumps({"services": {"test": {"volumes": [{"type": "bind",
        "source": str(ROOT / "ops/tests/completion"), "target": "/fixture", "read_only": True}]},
        "migrate": {"environment": {"BE02_TASK_DATABASE_NAME": "postgres",
            "BE02_ADMIN_DATABASE_URL": "postgresql://supabase_admin:${POSTGRES_PASSWORD}@db:5432/postgres"}}}}), encoding="utf-8")
    task.compose_files.append(override)
    task.compose("db-start", ["up", "-d", "--wait", "--wait-timeout", "120", "db"], 150)
    for file in ("/ops/bootstrap.sql", "/ops/bootstrap-send.sql", "/gateway-bootstrap.sql"):
        task.compose("bootstrap", ["run", "--rm", "--no-deps", "bootstrap", "-f", file], 60)
    task.compose("auth-start", ["up", "-d", "--wait", "--wait-timeout", "120", "auth"], 150)
    task.compose("auth-grants", ["run", "--rm", "--no-deps", "bootstrap", "-f", "/ops/bootstrap-auth-grants.sql"], 60)
    task.compose("migrate", ["run", "--rm", "--no-deps", "migrate"], 180)
    task.compose("seed", ["run", "--rm", "--no-deps", "test", "bundle", "exec", "ruby", "/fixture/restore_seed.rb"], 180)
    definition = json.loads(task.compose("private-config", ["config", "--format", "json"], quiet=False))
    db = definition["services"]["db"]
    # AIDEV-NOTE: Initialized database no longer needs host SQL binds; portable snapshots have no host-path coupling.
    db["volumes"] = [mount for mount in db["volumes"] if mount["type"] == "volume"]
    db.pop("container_name", None)
    task.compose("stop-setup", ["down", "--remove-orphans", "--timeout", "30"], 90)
    for key in sorted(VOLUMES - {"db-data", "db-config"}):
        volume = task.project + "_" + key
        task.docker("volume-create", ["volume", "create", "--label", "com.docker.compose.project=" + task.project,
                                      "--label", "com.docker.compose.volume=" + key, volume])
        # Distinct real bytes prove all four non-DB archives survive encryption, extraction and readback.
        task.docker("volume-marker", ["run", "--rm", "--network", "none", "--mount",
            f"type=volume,source={volume},target=/data", "--entrypoint", "sh", helper, "-c",
            'printf "%s\\n" "$1" > /data/restore-drill-marker', "marker", key])
    return {"services": {"db": db}, "volumes": {key: {} for key in sorted(VOLUMES)},
            "networks": {"isolated": {"internal": True}}}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute-final-gate", action="store_true", required=True)
    parser.add_argument("--context", default="desktop-linux")
    parser.add_argument("--server-image", required=True)
    parser.add_argument("--operations-image", required=True)
    parser.add_argument("--helper-image", required=True)
    parser.add_argument("--revision", required=True)
    args = parser.parse_args()
    digest = r"[A-Za-z0-9./:_-]+@sha256:[a-f0-9]{64}"
    if not re.fullmatch(digest, args.helper_image) or not re.fullmatch(r"[a-f0-9]{40}", args.revision):
        parser.error("digest-pinned helper and exact source revision required")
    if any(os.environ.get(key) for key in ("DOCKER_HOST", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")):
        parser.error("unset Docker endpoint overrides")
    evidence = Path(tempfile.mkdtemp(prefix="elevateo-restore-evidence-"))
    evidence.chmod(0o700)
    suffix = secrets.token_hex(6)
    values = {key: secrets.token_hex(32) for key in ("POSTGRES_PASSWORD", "MIGRATOR_DB_PASSWORD", "API_DB_PASSWORD",
        "WORKER_DB_PASSWORD", "ATTACHMENT_GATEWAY_DB_PASSWORD", "SECRET_KEY_BASE", "BE02_FIXTURE_SIGNING_SECRET")}
    values["ELEVATEO_SESSION_KEY_BASE64"] = base64.b64encode(secrets.token_bytes(32)).decode()
    task = Task(ROOT, evidence, "elevateo-drill-" + suffix, args.context, values)
    task.image = args.server_image
    task.deadline = time.monotonic() + 7200
    restore_project = "elevateo-restore-" + suffix
    driver_name = task.project + "-driver"
    source = evidence / "source.json"
    target = evidence / "target.json"
    failure = ""
    armed = False
    try:
        context = json.loads(task.docker("context", ["context", "inspect", args.context]))[0]
        if not context["Endpoints"]["docker"]["Host"].startswith(("npipe://", "unix:///")):
            raise RuntimeError("local Docker socket required")
        for image in (args.server_image, args.operations_image, args.helper_image):
            task.inspect("image", [image])
        for folder in ("apps/server", "contracts", "ops/tests"):
            if any(path.is_file() and not path.name.endswith((".example", ".sample"))
                   for path in (ROOT / folder).rglob(".env*")):
                raise RuntimeError("dotenv secrets found in a source mount")
        env = {**values, "BE02_SOURCE": ROOT.as_posix(), "BE02_PROJECT": task.project, "BE02_SERVER_IMAGE": task.image}
        if any("\n" in value or "\r" in value or "'" in value for value in env.values()):
            raise ValueError("unsafe environment value")
        task.env_file.write_text("".join(f"{key}='{value}'\n" for key, value in env.items()), encoding="utf-8")
        task.env_file.chmod(0o600)
        armed = True
        definition = prepare(task, args.helper_image)
        # JSON stays private: the database environment contains only this drill's ephemeral password.
        for path in (source, target):
            path.write_text(json.dumps(definition), encoding="utf-8")
            path.chmod(0o600)
        task.compose_files = [source]
        task.compose("source-start", ["up", "-d", "--wait", "--wait-timeout", "120", "db"], 150)
        driver_env = evidence / "driver.env"
        driver_env.write_text("\n".join([
            "COMPOSE_FILE=/fixture/source.json", "COMPOSE_PROJECT_NAME=" + task.project,
            "ELEVATEO_DRILL_RESTORE_COMPOSE_FILE=/fixture/target.json",
            "ELEVATEO_DRILL_RESTORE_PROJECT=" + restore_project,
            "ELEVATEO_OPERATIONS_LOCK=/tmp/drill.lock", "ELEVATEO_SOURCE_REVISION=" + args.revision,
            "ELEVATEO_BACKUP_HELPER_IMAGE=" + args.helper_image]) + "\n", encoding="utf-8")
        task.docker("actual-encrypted-restore", ["run", "--rm", "--name", driver_name,
            "--label", "com.docker.compose.project=" + task.project, "--network", "none", "--env-file", str(driver_env),
            "--mount", f"type=bind,source={evidence},target=/fixture,readonly",
            "--mount", "type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock",
            args.operations_image, "/ops/production/completion/restore_drill.py"], 3600)
    except (RuntimeError, OSError, ValueError, KeyError, IndexError, KeyboardInterrupt) as error:
        failure = task.redact(str(error)) or "interrupted"
    finally:
        task.deadline = time.monotonic() + 600
        if armed:
            # AIDEV-NOTE: A timed-out Docker client does not stop its container; stop the trusted driver first.
            try:
                task.docker("stop-driver", ["rm", "-f", driver_name], required=False)
            except (RuntimeError, OSError) as error:
                failure += "; driver cleanup: " + task.redact(str(error))
            for project, compose_file in ((task.project, source), (restore_project, target)):
                try:
                    if compose_file.exists():
                        task.docker("stop-drill", ["compose", "-p", project, "-f", str(compose_file),
                                                  "down", "--remove-orphans", "--timeout", "30"], 90)
                    elif project == task.project:
                        task.compose("stop-failed-setup", ["down", "--remove-orphans", "--timeout", "30"], 90)
                except (RuntimeError, OSError) as error:
                    failure += "; cleanup: " + task.redact(str(error))
        task.env_file.unlink(missing_ok=True)
        source.unlink(missing_ok=True)
        target.unlink(missing_ok=True)
        task.write("result.json", {"status": "FAILED" if failure else "PASSED", "failure": failure,
            "retained_volume_candidates": [project + "_" + key for project in (task.project, restore_project) for key in sorted(VOLUMES)]})
    print(f"{'FAILED' if failure else 'PASSED'} evidence={evidence}; fixture volumes retained")
    return 1 if failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
