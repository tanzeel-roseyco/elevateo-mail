"""Derive one private gateway process environment from a disposable test stack."""
from __future__ import annotations

import base64
import binascii
import os
import pathlib
import re
import sys

REQUIRED = frozenset({"STACK_ID", "OPS820_TASK_OWNED", "ATTACHMENT_GATEWAY_DB_PASSWORD",
                      "ATTACHMENT_GATEWAY_HMAC_KEY_BASE64", "SERVICE_ROLE_KEY"})


def create(source: pathlib.Path, destination: pathlib.Path) -> None:
    if not source.is_absolute() or not destination.is_absolute() or source.is_symlink():
        raise ValueError("absolute private paths required")
    found: dict[str, str] = {}
    for line in source.read_text(encoding="ascii").splitlines():
        key, separator, value = line.partition("=")
        if key in REQUIRED:
            if separator != "=" or not value or key in found:
                raise ValueError("missing or duplicate gateway input")
            found[key] = value
    if set(found) != REQUIRED or found["STACK_ID"] != "elevateo-mail-test" or found["OPS820_TASK_OWNED"] != "1":
        raise ValueError("disposable gateway inputs required")
    password = found["ATTACHMENT_GATEWAY_DB_PASSWORD"]
    if not re.fullmatch(r"[a-f0-9]{64}", password):
        raise ValueError("invalid disposable gateway password")
    try:
        hmac_key = base64.b64decode(found["ATTACHMENT_GATEWAY_HMAC_KEY_BASE64"], validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("invalid gateway HMAC key") from error
    if len(hmac_key) != 32 or not 32 <= len(found["SERVICE_ROLE_KEY"]) <= 4096:
        raise ValueError("invalid gateway private token")
    values = {
        "ELEVATEO_PROCESS": "attachment_gateway",
        "ELEVATEO_DB_NAME": "postgres",
        "ELEVATEO_ATTACHMENT_GATEWAY_DATABASE_URL":
            f"postgres://elevateo_attachment_gateway:{password}@db:5432/postgres",
        "ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64": found["ATTACHMENT_GATEWAY_HMAC_KEY_BASE64"],
        "ELEVATEO_STORAGE_URL": "http://storage:5000",
        "ELEVATEO_ATTACHMENT_BUCKET": "ops820-attachments",
        "ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN": found["SERVICE_ROLE_KEY"],
        "ELEVATEO_SEND_API_ENABLED": "false",
        "ELEVATEO_OUTBOUND_HOLD": "true",
    }
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="ascii") as stream:
        stream.write("".join(f"{key}={value}\n" for key, value in values.items()))


if __name__ == "__main__":
    try:
        create(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
    except (IndexError, OSError, UnicodeError, ValueError) as error:
        print(f"gateway environment creation failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print("PASS restricted test gateway environment created")
