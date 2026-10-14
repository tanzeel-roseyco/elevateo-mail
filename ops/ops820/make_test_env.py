"""Create a fresh private, task-owned Supabase Compose environment."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import sys
import time


def make(path: pathlib.Path) -> None:
    if not path.is_absolute():
        raise ValueError("output path must be absolute")
    key = secrets.token_hex(32)

    def token(role: str) -> str:
        def encode(value: dict[str, object]) -> bytes:
            return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=")

        message = encode({"alg": "HS256", "typ": "JWT"}) + b"." + encode(
            {"role": role, "iss": "supabase", "iat": int(time.time()), "exp": int(time.time()) + 86400}
        )
        signature = base64.urlsafe_b64encode(hmac.new(key.encode(), message, hashlib.sha256).digest()).rstrip(b"=")
        return (message + b"." + signature).decode()

    values = {
        "STACK_ID": "elevateo-mail-test",
        "OPS820_TASK_OWNED": "1",
        "POSTGRES_PASSWORD": secrets.token_hex(32),
        "AUTH_DB_PASSWORD": secrets.token_hex(32),
        "REST_DB_PASSWORD": secrets.token_hex(32),
        "STORAGE_DB_PASSWORD": secrets.token_hex(32),
        "MIGRATOR_DB_PASSWORD": secrets.token_hex(32),
        "API_DB_PASSWORD": secrets.token_hex(32),
        "WORKER_DB_PASSWORD": secrets.token_hex(32),
        "SECRET_KEY_BASE": secrets.token_hex(64),
        "ELEVATEO_SESSION_KEY_BASE64": base64.b64encode(secrets.token_bytes(32)).decode(),
        "JWT_SECRET": key,
        "ANON_KEY": token("anon"),
        "SERVICE_ROLE_KEY": token("service_role"),
        "AUTH_PORT": "18320",
        "REST_PORT": "18321",
        "STORAGE_PORT": "18322",
    }
    # AIDEV-NOTE: exclusive create and 0600 mode prevent a leaked or overwritten secret file.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="ascii") as stream:
        stream.write("".join(f"{key}={value}\n" for key, value in values.items()))


if __name__ == "__main__":
    try:
        make(pathlib.Path(sys.argv[1]))
    except (IndexError, OSError, ValueError) as error:
        print(f"private environment creation failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print("PASS fresh task-owned test environment created")
