#!/usr/bin/env python3
"""Host orchestration only: all Ruby, SQL and HTTP checks execute in Docker."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import sys
import time
import uuid
from cleanup import cleanup
from docker_task import Task
from acceptance_runtime import Acceptance, add_arguments
from adv815_runtime import run_expiry
from adv808_auth_attestation import AUTH_PIN, attest_with_controls
import attachment_runtime
import mox_runtime
import android_fixture


def source_hashes(root: Path, acceptance: bool = False) -> dict[str, str]:
    files = [root / "ops/compose.be02-test.yaml", root / "ops/ops820/bootstrap-gateway.sql"]
    folders = ["apps/server", "contracts", "ops/db", "ops/supabase/db", "ops/tests/be02", "ops/tests/be02-guards",
               "ops/mailserver"]
    if acceptance:
        files.extend([root / "ops/compose.acceptance-test.yaml", root / ".dockerignore"])
        if (root / "ops/compose.android-test.yaml").is_file():
            files.append(root / "ops/compose.android-test.yaml")
        folders.extend(["apps/web", "tests/acceptance", "ops/acceptance"])
    for folder in folders:
        files.extend(path for path in (root / folder).rglob("*") if path.is_file()
                     and not any(part in {"tmp", "log", "__pycache__", ".git", "node_modules", "dist"}
                                 for part in path.relative_to(root).parts)
                     and not path.name.startswith(".env"))
    return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(files)}


def finalize(task: Task, acceptance: bool, armed: bool, original: dict[str, str] | None,
             status: str, failure: str) -> tuple[str, str, bool]:
    # AIDEV-NOTE: Each finalization stage is independent so diagnostic I/O cannot strand runtime secrets.
    # Cleanup retains its own budget even after the test deadline or a caught interrupt.
    task.cleanup_mode = True
    task.deadline = time.monotonic() + 240
    errors: list[str] = []
    clean = False
    try:
        if not acceptance:
            services = ["db", "auth", "api", "worker"]
            if task.root / "ops/tests/be02/attachments.yaml" in task.compose_files:
                services.extend(sorted(attachment_runtime.SERVICES))
            task.compose("service-logs", ["logs", "--no-color", "--tail", "150", *services], 20)
    except Exception as error:
        try:
            task.write("service-log-capture-error.json", {"error": task.redact(str(error))})
        except Exception as write_error:
            errors.append(f"service log diagnostic write failed: {type(write_error).__name__}")
    try:
        clean = cleanup(task) if armed else True
    except Exception as error:
        errors.append("cleanup failed: " + task.redact(f"{type(error).__name__}: {error}"))
    finally:
        # AIDEV-NOTE: Cleanup evidence failure must never bypass deletion of the generated credential file.
        try:
            task.env_file.unlink(missing_ok=True)
        except Exception as error:
            clean = False
            errors.append("environment removal failed: " + task.redact(f"{type(error).__name__}: {error}"))
    try:
        after = source_hashes(task.root, acceptance)
        task.write("source.after.sha256.json", after)
        if original is not None and after != original:
            errors.append("source changed during execution")
    except Exception as error:
        errors.append(f"source verification failed: {type(error).__name__}")
    if errors:
        status = "FAILED"
    failure = task.redact("; ".join(part for part in [failure, *errors] if part))
    try:
        task.write("result.json", {"tests": status, "failure": failure, "cleanup_passed": clean,
                                   "finished_at": time.time(), "source_snapshot": "source.sha256.json"})
    except Exception:
        status = "FAILED"
        failure = "; ".join(part for part in [failure, "result evidence write failed"] if part)
        print("Result evidence write failed; run FAILED", flush=True)
    return status, failure, clean


def acceptance_before_http(task: Task, acceptance: Acceptance) -> None:
    # AIDEV-NOTE: Seed requires empty Auth; restore base origins before unchanged authenticated HTTP gates.
    base_files = list(task.compose_files)
    base_env = task.env_file.read_bytes()
    acceptance.run()
    task.compose_files[:] = base_files
    task.env_file.write_bytes(base_env)
    task.env_file.chmod(0o600)
    task.compose("base-restore-validate", ["config", "--quiet"])
    task.compose("base-restore-services", ["up", "-d", "--force-recreate", "--wait",
                 "--wait-timeout", "120", "auth", "api", "worker"], 160)
    task.runtime_credentials()
    task.wait_http()


def bootstrap_database_roles(task: Task) -> None:
    # AIDEV-NOTE: Privileged send/gateway roles and schemas must precede their restricted application migrations.
    for name, filename in (("bootstrap", "/ops/bootstrap.sql"), ("bootstrap-send", "/ops/bootstrap-send.sql"),
                           ("bootstrap-gateway", "/gateway-bootstrap.sql")):
        task.compose(name, ["run", "--rm", "--no-deps", "bootstrap", "-f", filename], 45)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--context", required=True, help="Explicit local Docker context")
    parser.add_argument("--expect-host", required=True, help="Exact hostname -s of reviewed fleet host")
    parser.add_argument("--server-image", help="Optional previously reviewed immutable sha256 image ID")
    parser.add_argument("--adv808-auth-policy", action="store_true", help="Separate disposable Auth policy proof")
    parser.add_argument("--adv815-expiry", action="store_true", help="Separate disposable real Auth expiry proof")
    parser.add_argument("--attachments", action="store_true", help="Real private Storage/scanner/download acceptance")
    parser.add_argument("--mox", action="store_true", help="Private real Mox/PostgreSQL worker acceptance")
    add_arguments(parser)
    android_fixture.add_arguments(parser)
    args = parser.parse_args()
    android_fixture.validate_arguments(args)
    web_fixture = args.acceptance or args.android_fixture
    if args.mox and (args.acceptance or args.adv808_auth_policy or args.adv815_expiry):
        parser.error("Mox requires its own disposable job")
    if args.attachments and (args.acceptance or args.adv808_auth_policy or args.adv815_expiry):
        parser.error("attachments require a separate disposable job")
    if args.adv815_expiry and (args.acceptance or args.adv808_auth_policy):
        parser.error("ADV815 requires its own disposable job; preserve GUI/policy queues")
    if args.adv808_auth_policy and args.acceptance:
        parser.error("ADV808 is a separate job; preserve the GUI acceptance queue")
    if args.acceptance_diagnostic and not args.acceptance:
        parser.error("diagnostic requires acceptance mode")
    if args.acceptance_case is not None and not (args.acceptance and args.acceptance_diagnostic):
        parser.error("focused case requires diagnostic acceptance mode")
    if sys.platform != "linux" or socket.gethostname().split(".")[0] != args.expect_host:
        raise RuntimeError("run only on the explicitly selected Linux fleet host")
    if any(os.environ.get(key) for key in ("DOCKER_HOST", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")):
        raise RuntimeError("ambient remote Docker configuration forbidden")
    if args.server_image and not re.fullmatch(r"sha256:[a-f0-9]{64}", args.server_image):
        raise RuntimeError("prebuilt server image must be a reviewed immutable ID")
    root = Path(__file__).resolve().parents[3]
    if any(char in str(root) for char in (":", ",", "\n", "\r", "$", "#", "'", '"', "\\")):
        raise RuntimeError("unsupported source path")
    os.umask(0o077)
    project = "be02-" + uuid.uuid4().hex
    evidence = root / "ops/local" / project
    evidence.mkdir(parents=True, mode=0o700)
    values = {key: secrets.token_hex(32) for key in ("POSTGRES_PASSWORD", "MIGRATOR_DB_PASSWORD", "API_DB_PASSWORD",
              "WORKER_DB_PASSWORD", "ATTACHMENT_GATEWAY_DB_PASSWORD", "SECRET_KEY_BASE", "BE02_FIXTURE_SIGNING_SECRET")}
    values["ELEVATEO_SESSION_KEY_BASE64"] = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
    task = Task(root, evidence, project, args.context, values)
    if args.adv808_auth_policy:
        task.compose_files.append(root / "ops/tests/be02/adv808_auth_profile.yaml")
    task.image = args.server_image or task.image
    env = {**values, "BE02_SOURCE": str(root), "BE02_PROJECT": project, "BE02_SERVER_IMAGE": task.image}
    task.env_file.write_text("".join(f"{key}={value}\n" for key, value in env.items()), encoding="utf-8")
    task.env_file.chmod(0o600)
    status, failure, clean, armed = "FAILED", "", False, False
    original: dict[str, str] | None = None
    print(f"BE02 project={project} evidence={evidence}", flush=True)

    def interrupted(signum: int, _frame: object) -> None:
        raise RuntimeError(f"interrupted by signal {signum}")

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    # AIDEV-NOTE: A disconnected foreground SSH session must finalize; detached fleet runs retain their TTL.
    signal.signal(signal.SIGHUP, interrupted)
    try:
        if args.attachments:
            attachment_runtime.configure(task)
        # AIDEV-NOTE: Source is mounted in runtime containers; reject local dotenv secrets before build or mount.
        for folder in ("apps/server", "contracts", "ops/tests/be02", "ops/tests/be02-guards",
                       "ops/mailserver",
                       *(["apps/web", "tests/acceptance", "ops/acceptance"] if web_fixture else [])):
            if any(path.is_file() and not path.name.endswith((".example", ".sample"))
                   for path in (root / folder).rglob(".env*")):
                raise RuntimeError("source mount contains a local dotenv file")
        acceptance = Acceptance(task, args) if args.acceptance else None
        android = android_fixture.AndroidFixture(task, args) if args.android_fixture else None
        original = source_hashes(root, web_fixture)
        task.write("source.sha256.json", original)
        task.write("run.json", {"project": project, "host": args.expect_host, "context": args.context,
                                "status": "RUNNING", "source": str(root), "started_at": time.time()})
        endpoint = task.docker("context", ["context", "inspect", args.context, "--format", "{{.Endpoints.docker.Host}}"]).strip()
        if endpoint != "unix:///var/run/docker.sock":
            raise RuntimeError("only local fleet Docker socket is allowed")
        task.docker("compose-version", ["compose", "version"])
        for kind, field in (("container", "{{.Names}}"), ("volume", "{{.Name}}"), ("network", "{{.Name}}")):
            names = task.docker("before-" + kind, [kind, "ls", "--format", field] + (["-a"] if kind == "container" else []))
            if any(project in name for name in names.splitlines()):
                raise RuntimeError("task namespace already exists")
        pins = sorted(set(re.findall(r"image: (\S+@sha256:[a-f0-9]{64})", (root / "ops/compose.be02-test.yaml").read_text())))
        for pin in pins:
            task.inspect("image", [pin])
        if args.attachments:
            attachment_runtime.preflight(task)
        if args.mox:
            mox_runtime.preflight(task)
        task.docker("space-before", ["system", "df"])
        task.write("host-space-before.json", {"free_bytes": os.statvfs(evidence).f_bavail * os.statvfs(evidence).f_frsize})
        builders = task.docker("builders-before", ["buildx", "ls", "--format", "json"])
        if any(json.loads(line).get("Name") == task.builder for line in builders.splitlines() if line.strip()):
            raise RuntimeError("task builder registration already exists")
        if task.docker("images-before", ["image", "ls", "-q", "--filter", "label=elevateo.be02.project=" + project]).strip():
            raise RuntimeError("task image already exists")
        armed = True
        task.compose("compose-validate", ["config", "--quiet"])
        task.compose("database-start", ["up", "-d", "--wait", "--wait-timeout", "120", "db", "mailpit"], 140)
        # AIDEV-NOTE: Run database-only guards before building Rails; rejected grants need no application image.
        task.compose("privilege-guards", ["run", "--rm", "--no-deps", "guards"], 120)
        bootstrap_database_roles(task)
        task.compose("auth-start", ["up", "-d", "--wait", "--wait-timeout", "120", "auth"], 140)
        if args.adv808_auth_policy:
            owned = [item for item in task.project_containers()
                     if item["Config"]["Labels"].get("com.docker.compose.service") == "auth"]
            if len(owned) != 1:
                raise RuntimeError("ADV808 requires exactly one owned Auth container")
            task.write("adv808-auth-profile.json", attest_with_controls(owned[0], task.inspect("image", [AUTH_PIN])[0], project))
        # AIDEV-NOTE: This phase validates actual Auth schema/types before granting exactly four columns.
        task.compose("auth-grants", ["run", "--rm", "--no-deps", "bootstrap", "-f", "/ops/bootstrap-auth-grants.sql"], 45)
        # AIDEV-NOTE: Probe real Auth catalog/locking after grants, before Rails creates application objects.
        task.compose("auth-rls-concurrency", ["run", "--rm", "--no-deps", "--entrypoint", "bash", "guards",
                                            "/workspace/ops/tests/be02-guards/auth-rls-concurrency.sh"], 120)
        if args.server_image:
            task.inspect("image", [task.image])
        else:
            print("Building bounded task image", flush=True)
            task.build()
        image = task.inspect("image", [task.image])[0]
        if image["Config"].get("Volumes"):
            raise RuntimeError("Rails image must not create anonymous volumes")
        task.write("server-image.json", {"id": image["Id"], "built_for_task": not bool(args.server_image)})
        task.compose("migrate", ["run", "--rm", "--no-deps", "migrate"], 90)
        # AIDEV-NOTE: Readiness is not authenticated HTTP acceptance; report every diagnostic skip.
        if args.acceptance_diagnostic or args.android_fixture:
            task.write("diagnostic-scope.json", {"mode": "ANDROID_FIXTURE" if args.android_fixture else "DIAGNOSTIC", "unexecuted_gates": ["Minitest", "Steep", "RuboCop", "http-acceptance", "worker-drain"],
                "authority": args.acceptance_dispatch_id, "full_acceptance": "NOT_RUN"})
        else:
            print("Running isolated Minitest suites and Steep", flush=True)
            # AIDEV-NOTE: The expanded inventory needs a bounded 30-minute aggregate; each suite still has its own timeout.
            task.compose("ruby-suites", ["run", "--rm", "--no-deps", "test"], 1800)
        if args.mox and args.attachments:
            task.compose("attachment-api-start", ["up", "-d", "api"], 30)
            task.runtime_credentials()
            task.wait_http()
            task.compose("attachment-services", ["up", "-d", "--no-deps", *sorted(attachment_runtime.SERVICES)], 45)
        if args.mox:
            mox_runtime.run(task, attachments=args.attachments)
        if acceptance:
            print("Running selected real-app acceptance lanes before HTTP fixtures", flush=True)
            acceptance_before_http(task, acceptance)
        if android:
            android.run()
            status = "FIXTURE_CLOSED"
        else:
            task.compose("api-start", ["up", "-d", "api"], 30)
            task.runtime_credentials()
            task.wait_http()
            if args.attachments:
                attachment_runtime.run(task)
            if not args.acceptance_diagnostic:
                print("Running real Auth/Mailpit/API HTTP acceptance", flush=True)
                task.compose("http-acceptance", ["run", "--rm", "--no-deps", "fixture"], 180)
            task.compose("worker-start", ["up", "-d", "worker"], 30)
            task.runtime_credentials()
            if not args.acceptance_diagnostic:
                task.compose("worker-drain", ["run", "--rm", "--no-deps", "fixture", "bundle", "exec", "ruby",
                                             "/workspace/ops/tests/be02/worker_check.rb"], 45)
            if args.adv808_auth_policy:
                task.compose("adv808-auth-policy", ["run", "--rm", "--no-deps", "fixture", "bundle", "exec", "ruby",
                             "/workspace/ops/tests/be02/adv808_auth_policy.rb"], 240)
            if not args.acceptance_diagnostic:
                task.compose("adv806-mailpit-entry", ["run", "--rm", "--no-deps", "fixture", "bundle", "exec", "ruby",
                             "/workspace/ops/tests/be02/adv806_mailpit_entry_test.rb"], 180)
            if args.adv815_expiry:
                run_expiry(task)
            status = "DIAGNOSTIC_COMPLETED" if args.acceptance_diagnostic else "PASSED"
        if source_hashes(root, web_fixture) != original:
            raise RuntimeError("source changed during execution; evidence cannot attest one snapshot")
    except Exception as error:
        failure = f"{type(error).__name__}: {error}"
    finally:
        status, failure, clean = finalize(task, web_fixture, armed, original, status, failure)
        try:
            task.docker("space-after", ["system", "df"])
            task.write("host-space-after.json", {"free_bytes": os.statvfs(evidence).f_bavail * os.statvfs(evidence).f_frsize})
        except Exception:
            print("Space measurement unavailable; cleanup.json remains authoritative", flush=True)
    print(f"tests={status} cleanup={'PASSED' if clean else 'FAILED'} evidence={evidence}", flush=True)
    return 0 if status in {"PASSED", "DIAGNOSTIC_COMPLETED", "FIXTURE_CLOSED"} and clean else 1


if __name__ == "__main__":
    sys.exit(main())
