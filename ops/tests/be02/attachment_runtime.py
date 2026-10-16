"""Opt-in real attachment acceptance on the existing disposable, internal BE02 network."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from docker_task import Task

PINS = {
    "attachment-rest": "postgrest/postgrest:v14.17@sha256:c9dc201e555f5d8e37e7f39cdd4df0229774996e213bfd7de8d10ac609030f2c",
    "storage": "supabase/storage-api:v1.74.0@sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85",
    "clamav": "clamav/clamav@sha256:705e0723f02fc13bf6e5e8a8e13a8c44420acf5e7ed06dfa2197081da00c7a73",
}
SERVICES = {*PINS, "attachment-gateway"}


def token(key: str, role: str) -> str:
    def encode(value: object) -> str:
        return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=").decode()
    issued = int(time.time())
    body = encode({"alg": "HS256", "typ": "JWT"}) + "." + encode(
        {"role": role, "iss": "supabase", "iat": issued, "exp": issued + 3600})
    signature = hmac.new(key.encode(), body.encode(), hashlib.sha256).digest()
    return body + "." + base64.urlsafe_b64encode(signature).rstrip(b"=").decode()


def configure(task: Task) -> None:
    # AIDEV-NOTE: Only the fixture/private gateway receive Storage authority; Rails receives the HMAC alone.
    key = task.secrets["BE02_FIXTURE_SIGNING_SECRET"]
    values = {"BE02_STORAGE_ANON": token(key, "anon"), "BE02_STORAGE_SERVICE": token(key, "service_role"),
              "ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64": base64.b64encode(secrets.token_bytes(32)).decode()}
    task.secrets.update(values)
    with task.env_file.open("a", encoding="ascii") as stream:
        stream.write("".join(f"{name}={value}\n" for name, value in values.items()))
    task.env_file.chmod(0o600)
    task.compose_files.append(task.root / "ops/tests/be02/attachments.yaml")


def preflight(task: Task) -> None:
    # AIDEV-NOTE: Image acquisition/ownership belongs to the caller; this profile never pulls shared bases.
    for pin in PINS.values():
        task.inspect("image", [pin])


def run(task: Task) -> None:
    task.compose("attachment-services", ["up", "-d", "--no-deps", *sorted(SERVICES)], 45)
    task.compose("attachment-acceptance", ["run", "--rm", "--no-deps", "fixture", "bundle", "exec", "ruby",
                  "/workspace/ops/tests/be02/attachment_http_test.rb"], 240)
    # AIDEV-NOTE: Exercise the shipped process only after HTTP acceptance; each failure stops later evidence.
    task.compose("attachment-scanner-acceptance", ["run", "--rm", "--no-deps", "fixture", "bundle", "exec", "ruby",
                  "/workspace/ops/tests/be02/attachment_scanner_test.rb"], 240)
    task.compose("attachment-fixture-lint", ["run", "--rm", "--no-deps", "fixture", "bundle", "exec", "rubocop",
                  "--lint", "--format", "simple", "/workspace/ops/tests/be02/scanner_process.rb",
                  "/workspace/ops/tests/be02/attachment_scanner_test.rb", "/workspace/ops/tests/be02/scanner_event_test.rb"], 90)


def validate_container(task: Task, item: dict[str, Any]) -> None:
    # AIDEV-NOTE: Docker inspect is heterogeneous; validate its boundary before deleting private service storage.
    service = item["Config"]["Labels"].get("com.docker.compose.service")
    expected = task.image if service == "attachment-gateway" else PINS.get(service)
    if not expected or item["Config"]["Image"] != expected or item["HostConfig"].get("PortBindings"):
        raise RuntimeError("attachment service identity mismatch")
    if not item["HostConfig"].get("ReadonlyRootfs"):
        raise RuntimeError("attachment service requires a read-only root")
    for mount in item["Mounts"]:
        if mount["Type"] == "volume":
            raise RuntimeError("attachment profile cannot own persistent volumes")
