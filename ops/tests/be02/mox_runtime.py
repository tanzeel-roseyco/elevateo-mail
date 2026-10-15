"""Private Mox namespace and real Rails client for the composition gate; no host ports."""
from __future__ import annotations

import ipaddress
import hashlib
import json
from pathlib import Path
import time
from docker_task import Task

PYTHON = "python:3.12.9@sha256:48a11b7ba705fd53bf15248d1f94d36c39549903c5d59edcfa2f3f84126e7b44"
MOX = Path("/home/tanzeel/elevateo-mail-completion-20261015/control/mail1017/release/mox")
MOX_SHA256 = "29f054f2b2bc0f191b22576ffbd95fbe74901dae31ac749058c7efb8f61e547c"


def preflight(task: Task) -> None:
    with MOX.open("rb") as binary:
        digest = hashlib.file_digest(binary, "sha256").hexdigest()
    if digest != MOX_SHA256:
        raise RuntimeError("Mox release artifact does not match the reviewed binary")
    task.inspect("image", [PYTHON])


def run(task: Task) -> None:
    fixture = WorkerFixture(task)
    failures: list[str] = []
    try:
        fixture.run()
    except Exception as error:
        failures.append(task.redact(f"{type(error).__name__}: {error}"))
    finally:
        # AIDEV-NOTE: Release the shared network before Compose cleanup, including after the main deadline expires.
        deadline = task.deadline
        task.deadline = max(deadline, time.monotonic() + 90)
        try:
            fixture.cleanup()
        except Exception as error:
            failures.append(task.redact(f"Mox cleanup {type(error).__name__}: {error}"))
        finally:
            task.deadline = deadline
    if failures:
        raise RuntimeError("; ".join(failures))


class WorkerFixture:
    # AIDEV-NOTE: These two containers are separate from Compose; validate their exact identity/mounts before removal.
    def __init__(self, task: Task) -> None:
        self.task = task
        self.out = task.evidence / "mox"
        self.root = task.root / "ops/mailserver"
        self.server, self.client = task.project + "-mox", task.project + "-mox-client"
        self.expected: dict[str, tuple[str, set[tuple[str, str, bool]]]] = {}
        self.env = self.out / ".env.client"

    def create(self, name: str, image: str, mounts: list[tuple[Path, str, bool]], arguments: list[str]) -> None:
        image_id = self.task.inspect("image", [image])[0]["Id"]
        expected = {(str(source), destination, not readonly) for source, destination, readonly in mounts}
        self.expected[name] = image_id, expected
        args = ["create", "--name", name, "--label", "elevateo.mail1018.project=" + self.task.project]
        for source, destination, readonly in mounts:
            args += ["--mount", f"type=bind,src={source},dst={destination}" + (",readonly" if readonly else "")]
        self.task.docker("mox-create", [*args, *arguments, image, *(
            ["/mailserver/tests/app_fixture.py"] if name == self.server else
            ["-c", "bundle exec ruby /mailserver/tests/worker_composition.rb && "
             "bundle exec rubocop --lint --format simple "
             "/mailserver/tests/worker_composition.rb /mailserver/tests/worker_inbox.rb"])])

    def run(self) -> None:
        self.out.mkdir(mode=0o700)
        resolver = self.out / "resolv.conf"
        resolver.write_text("nameserver 127.0.0.1\noptions timeout:1 attempts:1\n", encoding="ascii")
        network = self.task.inspect("network", [self.task.project + "_isolated"])[0]
        if network.get("Internal") is not True:
            raise RuntimeError("Mox composition requires an internal fixture network")
        self.create(self.server, PYTHON, [(self.root, "/mailserver", True), (MOX, "/release/mox", True),
            (self.out, "/evidence", False), (resolver, "/etc/resolv.conf", True)], [
            "--network", self.task.project + "_isolated", "--read-only", "--cap-drop", "ALL",
            *[part for cap in ("CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE", "NET_BIND_SERVICE", "FOWNER", "KILL")
              for part in ("--cap-add", cap)], "--security-opt", "no-new-privileges", "--memory", "1g",
            "--cpus", "2", "--pids-limit", "128", "--tmpfs", "/tmp:rw,nosuid,size=536870912,mode=1777",
            "-e", "PYTHONDONTWRITEBYTECODE=1", "-e", "GOMEMLIMIT=256MiB", "-e", "GOMAXPROCS=2", "--entrypoint", "python"])
        self.task.docker("mox-start", ["start", self.server])
        end = time.monotonic() + 60
        while not (self.out / "ready").exists():
            if time.monotonic() >= end or not self.task.inspect("container", [self.server])[0]["State"]["Running"]:
                raise RuntimeError("Mox fixture did not become ready")
            time.sleep(0.5)
        passwords = json.loads((self.out / "fixture-credentials.json").read_text())
        if not isinstance(passwords, dict) or set(passwords) != {"outreach000@send.test", "seed000@seed.test"}:
            raise RuntimeError("unexpected synthetic Mox identities")
        if not all(isinstance(value, str) and 16 <= len(value) <= 256 for value in passwords.values()):
            raise RuntimeError("invalid synthetic Mox credentials")
        self.task.secrets.update({"mox:" + key: value for key, value in passwords.items()})
        databases = [item for item in self.task.project_containers()
                     if item["Config"]["Labels"].get("com.docker.compose.service") == "db"]
        if len(databases) != 1:
            raise RuntimeError("expected exactly one fixture database")
        address = str(ipaddress.IPv4Address(databases[0]["NetworkSettings"]["Networks"]
                                           [self.task.project + "_isolated"]["IPAddress"]))
        # AIDEV-NOTE: Mox owns private loopback DNS; use the inspected fixture DB IPv4 address, never external DNS.
        roles = {"ADMIN": ("supabase_admin", "POSTGRES_PASSWORD"), "MIGRATOR": ("elevateo_migrator", "MIGRATOR_DB_PASSWORD"),
                 "API": ("elevateo_api", "API_DB_PASSWORD"), "WORKER": ("elevateo_worker", "WORKER_DB_PASSWORD")}
        values = {"BE02_TASK_DATABASE_NAME": "postgres", "HOME": "/tmp", "RUBOCOP_CACHE_ROOT": "/tmp/rubocop"}
        for key, (role, secret) in roles.items():
            values["BE02_" + key + "_DATABASE_URL"] = f"postgres://{role}:{self.task.secrets[secret]}@{address}:5432/postgres"
        self.env.write_text("".join(f"{key}={value}\n" for key, value in values.items()), encoding="ascii")
        self.env.chmod(0o600)
        self.create(self.client, self.task.image, [(self.task.root / "apps/server", "/workspace/apps/server", True),
            (self.task.root / "contracts", "/workspace/contracts", True), (self.root, "/mailserver", True),
            (self.out, "/evidence", True)], ["--network", "container:" + self.server,
            "--read-only", "--user", "0", "--cap-drop", "ALL", "--cap-add", "DAC_READ_SEARCH",
            "--security-opt", "no-new-privileges", "--memory", "1g", "--cpus", "1", "--pids-limit", "64",
            "--tmpfs", "/tmp:rw,nosuid,size=134217728", "--env-file", str(self.env),
            "--workdir", "/workspace/apps/server", "--entrypoint", "bash"])
        self.task.docker("mox-composition", ["start", "-a", self.client], 150)
        if self.task.inspect("container", [self.client])[0]["State"]["ExitCode"] != 0:
            raise RuntimeError("Mox composition tests failed")
        (self.out / "finished").write_text("finished\n", encoding="ascii")
        if self.task.docker("mox-finished", ["wait", self.server], 30).strip() != "0":
            raise RuntimeError("Mox fixture did not finish cleanly")

    def cleanup(self) -> None:
        failures: list[str] = []
        try:
            names = self.task.docker("mox-owned-names", ["ps", "-a", "--format", "{{.Names}}"]).splitlines()
        except Exception as error:
            failures.append("inventory: " + type(error).__name__)
            names = []
        for name in (self.client, self.server):
            if name not in names:
                continue
            try:
                item = self.task.inspect("container", [name])[0]
                image, mounts = self.expected[name]
                actual = {(entry["Source"], entry["Destination"], entry["RW"])
                          for entry in item["Mounts"] if entry["Type"] == "bind"}
                if (item["Image"] != image or item["Config"]["Labels"].get("elevateo.mail1018.project") != self.task.project
                        or actual != mounts or any(entry["Type"] not in {"bind", "tmpfs"} for entry in item["Mounts"])):
                    raise RuntimeError("identity or mount mismatch")
                self.task.docker("mox-logs", ["logs", "--tail", "100", name], required=False)
                self.task.docker("mox-remove", ["rm", "-f", name])
            except Exception as error:
                failures.append(name + ": " + type(error).__name__)
        for path in (self.env, self.out / "fixture-credentials.json"):
            try:
                path.unlink(missing_ok=True)
            except OSError as error:
                failures.append("private fixture file: " + type(error).__name__)
        try:
            remaining = self.task.docker("mox-remaining", ["ps", "-aq", "--filter", "label=elevateo.mail1018.project=" + self.task.project])
        except Exception as error:
            failures.append("remaining inventory: " + type(error).__name__)
            remaining = "unverified"
        self.task.write("mox-cleanup.json", {"passed": not failures and not remaining.strip(), "errors": failures})
        if failures or remaining.strip():
            raise RuntimeError("Mox fixture cleanup incomplete")
