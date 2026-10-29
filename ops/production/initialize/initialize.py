"""Held-by-default, forward-only operator entrypoint; execute in an approved private runner."""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Mapping

from admission import Tenant, approve, require, source_digest

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def environment(values: Mapping[str, str], phase: str) -> dict[str, str]:
    # AIDEV-NOTE: Never inherit PGOPTIONS, Ruby preload flags, service tokens or provider credentials into this authority.
    env = {"PATH": "/usr/local/bundle/bin:/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp",
           "GEM_HOME": "/usr/local/bundle", "BUNDLE_PATH": "/usr/local/bundle", "BUNDLE_DEPLOYMENT": "0",
           "PGHOST": "db", "PGDATABASE": "postgres", "PGUSER": "supabase_admin", "PGPORT": "5432",
           "PGCONNECT_TIMEOUT": "10", "PGAPPNAME": "elevateo-reviewed-initialize",
           "PGOPTIONS": "-c lock_timeout=5s -c statement_timeout=120s",
           "RAILS_ENV": "production", "ELEVATEO_MODE": "production", "ELEVATEO_PROCESS": "migrate",
           "ELEVATEO_DB_HOST": "db", "ELEVATEO_DB_NAME": "postgres", "ELEVATEO_DB_ROLE": "elevateo_migrator",
           "ELEVATEO_DB_POOL": "1", "ELEVATEO_OUTBOUND_HOLD": "true", "ELEVATEO_OUTBOUND_MODE": "held",
           "ELEVATEO_SEND_API_ENABLED": "false", "ELEVATEO_AUTH_URL": "http://auth:9999",
           "ELEVATEO_STORAGE_URL": "http://storage:5000", "ELEVATEO_MAILPIT_URL": "http://mailpit:8025",
           "ELEVATEO_SMTP_HOST": "mailpit", "ELEVATEO_SMTP_PORT": "1025"}
    keys = ["PGPASSWORD"]
    if phase == "schema":
        keys += ["MIGRATOR_DB_PASSWORD", "API_DB_PASSWORD", "WORKER_DB_PASSWORD",
                 "ATTACHMENT_GATEWAY_DB_PASSWORD", "SECRET_KEY_BASE"]
    for key in keys:
        value = values.get(key, "")
        require(32 <= len(value.encode()) <= 4096 and "\0" not in value and "\n" not in value and "\r" not in value,
                "missing or invalid protected setting: " + key)
        env[key] = value
    if phase == "schema":
        require(len(env["SECRET_KEY_BASE"].encode()) >= 64, "Rails secret must have at least 64 bytes")
    return env


def run(command: list[str], env: dict[str, str], cwd: Path) -> None:
    # AIDEV-NOTE: SQL/bootstrap diagnostics can contain credentials or identity data; never echo captured process output.
    try:
        result = subprocess.run(command, env=env, cwd=cwd, capture_output=True, timeout=1800, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError("initializer process unavailable/timed out; inspect database state before retry") from error
    require(result.returncode == 0, "initializer step failed; partial schema may exist; root must inspect before retry")


def execute(phase: str, env: dict[str, str], tenant: Tenant | None) -> None:
    psql = ["psql", "-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-q", "-f"]
    run(psql + [str(HERE / "preflight.sql")], env, ROOT)
    if phase == "schema":
        for relative in ("ops/db/bootstrap.sql", "ops/db/bootstrap-send.sql", "ops/db/bootstrap-auth-grants.sql",
                         "ops/ops820/bootstrap-gateway.sql"):
            run(psql + [str(ROOT / relative)], env, ROOT)
        # Only the reviewed forward migration task; never load schema, reset, seed or invoke the disposable test runner.
        migration_env = {k: v for k, v in env.items() if not k.startswith("PG") and k != "ATTACHMENT_GATEWAY_DB_PASSWORD"}
        for key in ("API_DB_PASSWORD", "WORKER_DB_PASSWORD"):
            migration_env.pop(key, None)
        run(["bundle", "exec", "rails", "db:migrate"], migration_env, ROOT / "apps/server")
    else:
        require(tenant is not None, "tenant required")
        env.update({"INIT_" + k.upper(): v for k, v in tenant.__dict__.items()})
        run(psql + [str(HERE / "tenant.sql")], env, ROOT)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["schema", "tenant"])
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--gate", type=Path)
    for field in ("organization-id", "user-id", "name", "role", "receipt", "subject"):
        parser.add_argument("--" + field)
    args = parser.parse_args()
    try:
        tenant = Tenant.parse({k: v for k, v in vars(args).items() if isinstance(v, str)}) if args.phase == "tenant" else None
        print("source_sha256=" + source_digest(ROOT))
        if not args.apply:
            print("HELD: offline plan only; no connection, bootstrap, migration or tenant writes")
            return 0
        require(args.gate is not None, "--apply requires an independently accepted backup/restore/review gate")
        approve(args.gate, ROOT, args.phase, tenant)
        execute(args.phase, environment(os.environ, args.phase), tenant)
        print("Completed requested held initialization phase; runtime acceptance remains separate")
        return 0
    except (ValueError, RuntimeError, OSError) as error:
        print("Initialization refused: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
