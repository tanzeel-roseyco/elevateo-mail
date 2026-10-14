"""Copy only application runtime secrets out of a disposable infrastructure env."""
from __future__ import annotations

import os
import pathlib
import sys

KEYS = frozenset({
    "MIGRATOR_DB_PASSWORD", "API_DB_PASSWORD", "WORKER_DB_PASSWORD",
    "SECRET_KEY_BASE", "ELEVATEO_SESSION_KEY_BASE64",
})


def create(source: pathlib.Path, destination: pathlib.Path) -> None:
    seen: dict[str, str] = {}
    for line in source.read_text(encoding="ascii").splitlines():
        key, separator, value = line.partition("=")
        if key in KEYS:
            if separator != "=" or not value or key in seen:
                raise ValueError("missing or duplicate runtime secret")
            seen[key] = value
    if set(seen) != KEYS:
        raise ValueError("missing runtime secret")
    # AIDEV-NOTE: no Auth signing/admin/service role key crosses the Rails runtime boundary.
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="ascii") as stream:
        stream.write("".join(f"{key}={seen[key]}\n" for key in sorted(KEYS)))


if __name__ == "__main__":
    try:
        create(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
    except (IndexError, OSError, UnicodeError, ValueError) as error:
        print(f"runtime environment creation failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print("PASS restricted application environment created")
