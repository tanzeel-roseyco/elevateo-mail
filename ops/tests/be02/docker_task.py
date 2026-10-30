"""Bounded Docker commands and private evidence for one BE02 project."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import time
from typing import Any

BUILDKIT = "moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea"
RUBY = "ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2"
SERVICES = {"db", "bootstrap", "guards", "mailpit", "auth", "migrate", "api", "worker", "test", "fixture"}


class Task:
    # AIDEV-NOTE: Never persist raw inspect/config output: both contain generated credentials.
    def __init__(self, root: Path, evidence: Path, project: str, context: str, secrets: dict[str, str]) -> None:
        self.root, self.evidence, self.project, self.context = root, evidence, project, context
        self.secrets = secrets
        self.env_file = evidence / ".env.runtime"
        self.builder = project + "-builder"
        self.builder_container = "buildx_buildkit_" + self.builder + "0"
        self.cache = self.builder_container + "_state"
        self.image = project + ":server"
        self.owned_image_tags = {self.image}
        self.compose_files = [root / "ops/compose.be02-test.yaml"]
        self.acceptance_mounts: dict[str, set[tuple[Path, str, bool]]] = {}
        self.acceptance_images: dict[str, str] = {}
        self.acceptance_private: Path | None = None
        self.buildkit_id = ""
        self.deadline = time.monotonic() + 1800
        self.cleanup_mode = False
        self.sequence = 0

    def redact(self, value: str) -> str:
        for secret in sorted(self.secrets.values(), key=len, reverse=True):
            if len(secret) >= 16:
                value = value.replace(secret, "[REDACTED]")
        value = re.sub(r"(?im)^.*(?:authorization:|set-cookie:|password|token_hash|access_token|refresh_token|[?&]token=).*$",
                       "[credential-bearing line redacted]", value)
        return re.sub(r"[A-Za-z0-9_+/=-]{32,}(?:\.[A-Za-z0-9_+/=-]+)*", "[opaque value redacted]", value)

    def write(self, name: str, data: object) -> None:
        (self.evidence / name).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    def docker(self, name: str, args: list[str], seconds: int = 20, required: bool = True,
               quiet: bool = False) -> str:
        remaining = int(self.deadline - time.monotonic())
        if remaining < 1:
            raise RuntimeError("whole-run deadline exceeded")
        bound = min(seconds, remaining)
        self.sequence += 1
        log = self.evidence / f"{self.sequence:03d}-{name}.log"
        env = {key: val for key, val in os.environ.items() if not key.startswith("COMPOSE_")
               and key not in self.secrets and not key.startswith(("BE02_", "ACCEPTANCE_"))}
        env["DOCKER_CONTEXT"] = self.context
        started = time.monotonic()
        try:
            result = subprocess.run(["docker", "--context", self.context, *args], env=env,
                                    stdout=subprocess.DEVNULL if quiet else subprocess.PIPE,
                                    stderr=subprocess.DEVNULL if quiet else subprocess.PIPE,
                                    text=True, timeout=bound, check=False)
        except subprocess.TimeoutExpired as error:
            # AIDEV-NOTE: A killed CLI can leave its container running; final cleanup discovers by exact project.
            log.write_text("TIMEOUT; container cleanup required\n", encoding="utf-8")
            raise RuntimeError(f"{name} exceeded {bound}s") from error
        # AIDEV-NOTE: Browser errors can contain cookies/passwords; discard native output before it reaches disk.
        log.write_text(self.redact((result.stdout or "") + (result.stderr or "")) +
                       f"\nexit={result.returncode} seconds={time.monotonic() - started:.2f}\n", encoding="utf-8")
        if required and result.returncode:
            raise RuntimeError(f"{name} failed; see {log.name}")
        return result.stdout or ""

    def compose(self, name: str, args: list[str], seconds: int = 30, quiet: bool = False) -> str:
        files = [arg for path in self.compose_files for arg in ("-f", str(path))]
        return self.docker(name, ["compose", "--project-name", self.project, "--env-file", str(self.env_file),
                                  *files, *args], seconds, quiet=quiet)

    # AIDEV-NOTE: Docker inspect JSON is a platform-defined heterogeneous object, validated at each use below.
    def inspect(self, kind: str, names: list[str]) -> list[dict[str, Any]]:
        if not names:
            return []
        return json.loads(self.docker("inspect-" + kind, [kind, "inspect", *names]))

    def project_containers(self) -> list[dict[str, Any]]:
        ids = self.docker("owned-containers", ["container", "ls", "-aq", "--filter",
                          "label=com.docker.compose.project=" + self.project]).split()
        return self.inspect("container", ids)

    def ensure_builder(self) -> None:
        if self.buildkit_id:
            return
        self.buildkit_id = self.inspect("image", [BUILDKIT])[0]["Id"]
        self.docker("create-cache", ["volume", "create", "--label", "elevateo.be02.project=" + self.project, self.cache])
        self.docker("create-builder", ["buildx", "create", "--name", self.builder, "--driver", "docker-container",
                    "--driver-opt", f"image={BUILDKIT},restart-policy=no,memory=2g,cpu-period=100000,cpu-quota=200000"])
        self.docker("bootstrap-builder", ["buildx", "inspect", self.builder, "--bootstrap"], 120)

    def build(self) -> None:
        self.inspect("image", [RUBY])
        self.ensure_builder()
        self.docker("build", ["buildx", "build", "--builder", self.builder, "--load", "--progress", "plain",
                    "--label", "elevateo.be02.project=" + self.project, "--tag", self.image,
                    str(self.root / "apps/server")], 720)

    def runtime_credentials(self) -> None:
        for item in self.project_containers():
            service = item["Config"]["Labels"].get("com.docker.compose.service")
            if service not in {"api", "worker"}:
                continue
            names = {entry.split("=", 1)[0] for entry in item["Config"]["Env"]}
            forbidden = {"JWT_SECRET", "GOTRUE_JWT_SECRET", "BE02_FIXTURE_SIGNING_SECRET", "POSTGRES_PASSWORD",
                         "MIGRATOR_DB_PASSWORD", "BE02_ADMIN_DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY"}
            forbidden.add("WORKER_DB_PASSWORD" if service == "api" else "API_DB_PASSWORD")
            if names & forbidden:
                raise RuntimeError(f"{service} received forbidden credentials")

    def wait_http(self) -> None:
        # Real Rails process health; fixture helper retries only readiness, never failed acceptance assertions.
        self.compose("api-readiness", ["run", "--rm", "--no-deps", "fixture", "bundle", "exec", "ruby",
                     "/workspace/ops/tests/be02/http_support.rb"], 65)
