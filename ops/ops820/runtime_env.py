"""Copy only application runtime secrets out of a disposable infrastructure env."""
from __future__ import annotations

import os
import pathlib
import sys

ROLE_KEYS = {
    "migrator": frozenset({"MIGRATOR_DB_PASSWORD", "SECRET_KEY_BASE"}),
    "api": frozenset({"API_DB_PASSWORD", "SECRET_KEY_BASE", "ELEVATEO_SESSION_KEY_BASE64"}),
    "worker": frozenset({"WORKER_DB_PASSWORD", "SECRET_KEY_BASE", "ELEVATEO_SESSION_KEY_BASE64"}),
}
KEYS = frozenset().union(*ROLE_KEYS.values())


def create(source: pathlib.Path, destination: pathlib.Path, role: str) -> None:
    allowed = ROLE_KEYS.get(role)
    if allowed is None:
        raise ValueError("invalid runtime role")
    seen: dict[str, str] = {}
    auth_ports: list[str] = []
    for line in source.read_text(encoding="ascii").splitlines():
        key, separator, value = line.partition("=")
        if key == "AUTH_PORT":
            auth_ports.append(value)
        if key in allowed:
            if separator != "=" or not value or key in seen:
                raise ValueError("missing or duplicate runtime secret")
            seen[key] = value
    if set(seen) != allowed:
        raise ValueError("missing runtime secret")
    if role != "migrator":
        if auth_ports not in (["18310"], ["18320"]):
            raise ValueError("invalid disposable Auth port")
        seen["ELEVATEO_AUTH_JWT_ISSUER"] = f"http://127.0.0.1:{auth_ports[0]}"
    # AIDEV-NOTE: no Auth signing/admin/service role key crosses the Rails runtime boundary.
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="ascii") as stream:
        stream.write("".join(f"{key}={seen[key]}\n" for key in sorted(seen)))


if __name__ == "__main__":
    try:
        create(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3])
    except (IndexError, OSError, UnicodeError, ValueError) as error:
        print(f"runtime environment creation failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print("PASS restricted application environment created")
