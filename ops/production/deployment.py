"""One-command, forward-only production assembly. No build, send, DNS or cloud mutation."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
from deployment_settings import AdmissionError, validate

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "completion"))
from assignments import load  # noqa: E402
from initialize_mox import configuration, tls_material  # noqa: E402
from provision import limit  # noqa: E402


def preflight(env: dict[str, str], csv: Path) -> None:
    # AIDEV-NOTE: This single-threaded CLI restores ambient env even on failure; validators see only supplied values.
    previous = dict(os.environ)
    try:
        os.environ.clear()
        os.environ.update(env)
        configuration(load(csv))
        tls_material()
        limit("ELEVATEO_MAILBOX_DAILY_SEND_LIMIT", 30)
        limit("ELEVATEO_USER_DAILY_SEND_LIMIT", 300)
        lock = Path(env.get("ELEVATEO_OPERATIONS_LOCK", ""))
        if not lock.is_absolute() or lock.is_symlink():
            raise ValueError("absolute private operations lock required")
    except (ValueError, OSError, RuntimeError):
        raise AdmissionError("invalid assignments or Mox configuration") from None
    finally:
        os.environ.clear()
        os.environ.update(previous)


def run(arguments: list[str], env: dict[str, str], input_text: str | None = None) -> None:
    # AIDEV-NOTE: Docker/SQL diagnostics can contain secrets; only the stage name reaches operator output.
    result = subprocess.run(arguments, env=env, input=input_text, text=True, capture_output=True, timeout=1800)
    if result.returncode:
        raise AdmissionError("deployment stage failed; inspect private service health before retry")


def deploy(env: dict[str, str], dry_run: bool) -> None:
    validate(env)
    csv = Path(env["ELEVATEO_APPROVED_ASSIGNMENTS"])
    if not csv.is_absolute() or not csv.is_file() or csv.is_symlink():
        raise AdmissionError("approved assignments must be an absolute regular CSV")
    preflight(env, csv)
    # AIDEV-NOTE: Project identity is fixed; external networks and arbitrary Compose overrides are never inherited.
    env = {key: value for key, value in env.items() if not key.startswith("COMPOSE_")}
    files = [str(HERE / "compose.yaml")]
    if env.get("ELEVATEO_OUTBOUND_MODE") == "resend":
        files.append(str(HERE / "compose.resend.yaml"))
    env.update(COMPOSE_FILE=os.pathsep.join(files), COMPOSE_PROJECT_NAME="elevateo-production", COMPOSE_DISABLE_ENV_FILE="1")
    compose = ["docker", "compose", "--project-directory", str(HERE)]
    if dry_run:
        print("VALIDATED: database/auth bootstrap, migrations, private OIDC registration, Mox initialization, held services")
        print("DRY RUN: no Docker, provider, provisioning or deployment mutation")
        return
    # AIDEV-NOTE: Deploy shares the cold-backup barrier; it cannot restart writers during a snapshot.
    from recovery import exclusive
    with exclusive(Path(env["ELEVATEO_OPERATIONS_LOCK"])):
        run(compose + ["config", "--quiet"], env)
        run(compose + ["up", "-d", "--wait", "db", "auth", "rest", "storage", "mailpit"], env)
        for script in ("/bootstrap/bootstrap.sql", "/bootstrap/bootstrap-send.sql", "/bootstrap/bootstrap-auth-grants.sql", "/bootstrap-gateway.sql"):
            run(compose + ["exec", "-T", "db", "psql", "-X", "-U", "supabase_admin", "-d", "postgres",
                           "-v", "ON_ERROR_STOP=1", "-q", "-f", script], env)
        run(compose + ["run", "--rm", "--no-deps", "migrate"], env)
        run(compose + ["run", "--rm", "--no-deps", "configure-auth"], env)
        run(compose + ["run", "--rm", "--no-deps", "configure-storage"], env)
        run(compose + ["stop", "mox"], env)
        run([sys.executable, str(HERE / "completion/initialize_mox.py"), "--csv", str(csv)], env)
        run([sys.executable, str(HERE / "completion/provision.py"), "--csv", str(csv)] +
            (["--apply"] if env.get("ELEVATEO_PROVISIONING_ENABLED") == "true" else []), env)
        run(compose + ["up", "-d", "--wait"], env)
        print("Production services started with outbound hold; no mail was submitted by deployment.")


def main() -> None:
    if sys.argv[1:] not in ([], ["--dry-run"]):
        raise SystemExit("usage: deploy.sh [--dry-run]")
    try:
        deploy(dict(os.environ), sys.argv[1:] == ["--dry-run"])
    except (AdmissionError, ValueError, RuntimeError, OSError, subprocess.TimeoutExpired):
        raise SystemExit("Deployment refused or failed; required configuration/health must be corrected. No secret diagnostics emitted.") from None


if __name__ == "__main__":
    main()
