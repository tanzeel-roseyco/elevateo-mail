"""Final local Docker gate for the historical two-migration BE01 R1 authority contract."""
from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import shutil
import tempfile
import time

from local_backend import ROOT, Task, configure


def historical_override(task: Task) -> None:
    migrations = task.evidence / "historical-migrations"
    migrations.mkdir()
    # AIDEV-NOTE: Later migrations deliberately replace this authority model; R1 needs its own exact schema.
    for name in ("20261012000001_create_app_foundation.rb", "20261012000002_restrict_api_read_membership.rb"):
        shutil.copyfile(ROOT / "apps/server/db/migrate" / name, migrations / name)
    override = {"services": {
        "migrate": {"volumes": [{"type": "bind", "source": migrations.as_posix(),
                                   "target": "/workspace/apps/server/db/migrate", "read_only": True}]},
        "bootstrap": {"volumes": [{"type": "bind", "source": (ROOT / "ops/tests/db-fixtures.sql").as_posix(),
                                     "target": "/historical-fixtures.sql", "read_only": True}]}}}
    path = task.evidence / "historical.compose.json"
    path.write_text(json.dumps(override), encoding="utf-8")
    task.compose_files.append(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute-final-gate", action="store_true", required=True)
    parser.add_argument("--context", default="desktop-linux")
    parser.add_argument("--server-image", required=True)
    args = parser.parse_args()
    if any(os.environ.get(key) for key in ("DOCKER_HOST", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")):
        parser.error("unset Docker endpoint overrides")
    evidence = Path(tempfile.mkdtemp(prefix="elevateo-historical-evidence-"))
    evidence.chmod(0o700)
    values = {key: secrets.token_hex(32) for key in ("POSTGRES_PASSWORD", "MIGRATOR_DB_PASSWORD", "API_DB_PASSWORD",
        "WORKER_DB_PASSWORD", "ATTACHMENT_GATEWAY_DB_PASSWORD", "SECRET_KEY_BASE", "BE02_FIXTURE_SIGNING_SECRET")}
    values["ELEVATEO_SESSION_KEY_BASE64"] = base64.b64encode(secrets.token_bytes(32)).decode()
    task = Task(ROOT, evidence, "elevateo-r1-" + secrets.token_hex(6), args.context, values)
    task.image = args.server_image
    task.deadline = time.monotonic() + 1200
    armed = False
    failure = ""
    try:
        context = json.loads(task.docker("context", ["context", "inspect", args.context]))[0]
        if not context["Endpoints"]["docker"]["Host"].startswith(("npipe://", "unix:///")):
            raise RuntimeError("local Docker socket required")
        task.inspect("image", [task.image])
        for folder in ("apps/server", "contracts", "ops/tests"):
            if any(path.is_file() and not path.name.endswith((".example", ".sample"))
                   for path in (ROOT / folder).rglob(".env*")):
                raise RuntimeError("dotenv secrets found in source mount")
        configure(task)
        historical_override(task)
        armed = True
        task.compose("db-start", ["up", "-d", "--wait", "--wait-timeout", "120", "db"], 150)
        task.compose("bootstrap", ["run", "--rm", "--no-deps", "bootstrap", "-f", "/ops/bootstrap.sql"], 60)
        task.compose("historical-migrate", ["run", "--rm", "--no-deps", "migrate"], 180)
        task.compose("historical-fixtures", ["run", "--rm", "--no-deps", "bootstrap", "-f", "/historical-fixtures.sql"], 60)
        for pool in ("1", "5"):
            task.compose("api-pool-" + pool, ["run", "--rm", "--no-deps", "-e", "ELEVATEO_DB_POOL=" + pool,
                "api", "bundle", "exec", "ruby", "test/be_01_r1/tenancy_test.rb"], 180)
        task.compose("worker-authority", ["run", "--rm", "--no-deps", "worker", "bundle", "exec", "ruby",
                                        "test/be_01_r1/worker_role_test.rb"], 180)
    except (RuntimeError, OSError, ValueError, KeyError, IndexError, KeyboardInterrupt) as error:
        failure = task.redact(str(error)) or "interrupted"
    finally:
        task.deadline = time.monotonic() + 180
        if armed:
            try:
                # AIDEV-NOTE: Database uses tmpfs; unexpected named volumes are retained rather than deleted.
                task.write("mounts-before-cleanup.json", [{"Name": item.get("Name"), "Mounts": item.get("Mounts")}
                                                        for item in task.project_containers()])
            except (RuntimeError, OSError) as error:
                failure += "; mount inspection: " + task.redact(str(error))
            try:
                task.compose("cleanup", ["down", "--remove-orphans", "--timeout", "30"], 90)
            except (RuntimeError, OSError) as error:
                failure += "; cleanup: " + task.redact(str(error))
        task.env_file.unlink(missing_ok=True)
        task.write("result.json", {"status": "FAILED" if failure else "PASSED", "failure": failure})
    print(f"{'FAILED' if failure else 'PASSED'} evidence={evidence}")
    return 1 if failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
