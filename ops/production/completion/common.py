"""Bounded, secret-silent process boundary for privileged offline operations."""
from __future__ import annotations

import os
import base64
from contextlib import contextmanager
from pathlib import Path
import re
import subprocess
import tempfile
from typing import Iterator


def required(name: str) -> str:
    value = os.environ.get(name, "")
    if not value or "\x00" in value or "\n" in value:
        raise ValueError(f"missing or invalid {name}")
    return value


def run(args: list[str], data: bytes | None = None, timeout: int = 300) -> bytes:
    # AIDEV-NOTE: Neither argv nor child stderr is logged; providers and psql can echo credential-bearing inputs.
    try:
        result = subprocess.run(args, input=data, capture_output=True, timeout=timeout, check=False)
    except subprocess.SubprocessError:
        raise RuntimeError("operation timed out; private child output withheld") from None
    if result.returncode:
        raise RuntimeError("operation failed; private child output withheld")
    return result.stdout


def compose() -> list[str]:
    paths = [Path(value) for value in required("COMPOSE_FILE").split(os.pathsep)]
    project = required("COMPOSE_PROJECT_NAME")
    if any(not path.is_absolute() or not path.is_file() for path in paths) or not re.fullmatch(r"[a-z][a-z0-9_-]{1,60}", project):
        raise ValueError("absolute Compose file and bounded project required")
    return ["docker", "compose", "-p", project, *(part for path in paths for part in ("-f", str(path)))]


@contextmanager
def private_material(variable: str) -> Iterator[Path]:
    # AIDEV-NOTE: CLI-only secrets originate in env, exist only in a private temporary file, and never enter argv.
    data = base64.b64decode(required(variable), validate=True)
    if not 32 <= len(data) <= 65536 or b"\x00" in data:
        raise ValueError("bounded private credential required")
    with tempfile.TemporaryDirectory(prefix="elevateo-secret-") as directory:
        path = Path(directory) / "credential"
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
        yield path


def sql(statement: str) -> bytes:
    return run(compose() + ["exec", "-T", "db", "psql", "-X", "-q", "-U", "supabase_admin",
                           "-d", "postgres", "-v", "ON_ERROR_STOP=1"], statement.encode())


def helper_image() -> str:
    image = required("ELEVATEO_BACKUP_HELPER_IMAGE")
    if not re.fullmatch(r"[a-zA-Z0-9./:_-]+@sha256:[0-9a-f]{64}", image):
        raise ValueError("digest-pinned helper image required")
    return image
