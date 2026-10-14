"""One Soren-owned, bounded private observer invocation per real browser request frame."""
from __future__ import annotations

import json
from pathlib import Path
import stat
import threading
import time
from typing import Callable, Any


class ObserverBridge:
    # AIDEV-NOTE: The runner holds Soren's lease; this thread runs only a small readonly Ruby observer, never builds.
    def __init__(self, control: Path, invoke: Callable[[], None], uid: int, nonce: str) -> None:
        self.control, self.invoke, self.uid, self.nonce = control, invoke, uid, nonce

    def execute(self, browser_command: Callable[[], None], seconds: int) -> None:
        end = time.monotonic() + seconds
        stop = threading.Event()
        errors: list[str] = []
        seen: set[str] = set()

        def monitor() -> None:
            try:
                while not stop.is_set() and time.monotonic() < end:
                    path = self.control / "request.json"
                    try:
                        info = path.lstat()
                    except FileNotFoundError:
                        stop.wait(0.02)
                        continue
                    directory = self.control.lstat()
                    if (self.control.resolve() != self.control or not stat.S_ISDIR(directory.st_mode)
                            or directory.st_uid != self.uid or stat.S_IMODE(directory.st_mode) != 0o700
                            or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != self.uid
                            or stat.S_IMODE(info.st_mode) != 0o600 or not 0 < info.st_size <= 16384):
                        raise RuntimeError("observer private frame ownership invalid")
                    with path.open() as frame:
                        request: Any = json.load(frame)
                    if (not isinstance(request, dict) or set(request) != {
                            "schema_version", "request_id", "nonce", "draft_id", "operation_id", "phase"}
                            or request["schema_version"] != 1 or request["nonce"] != self.nonce
                            or request["phase"] not in {"before", "after"}
                            or not isinstance(request["request_id"], str) or request["request_id"] in seen
                            or len(seen) >= 64):
                        raise RuntimeError("observer frame binding invalid")
                    seen.add(request["request_id"])
                    self.invoke()
                    # Exact same frame must survive invocation; replacing it cannot acknowledge a different call.
                    if path.lstat().st_ino != info.st_ino:
                        raise RuntimeError("observer request replaced")
                    path.unlink()
                if time.monotonic() >= end and not stop.is_set():
                    raise RuntimeError("observer bridge deadline exceeded")
            except Exception:
                errors.append("observer bridge failed; raw diagnostics withheld")
                stop.set()

        worker = threading.Thread(target=monitor, name="qa404-observer", daemon=False)
        worker.start()
        try:
            browser_command()
        finally:
            stop.set()
            worker.join(timeout=35)
        if worker.is_alive():
            raise RuntimeError("observer invocation did not join; retain exact resources for inspected cleanup")
        if errors:
            raise RuntimeError(errors[0])
