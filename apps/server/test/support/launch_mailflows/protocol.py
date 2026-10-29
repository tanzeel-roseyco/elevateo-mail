"""Synthetic Mox fixture: network-none, loopback DNS, owner-only generated credentials."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0, "/source/ops/selfhosted-mail")
import runtime_fixture
import runtime_protocol
from runtime_dns import FixtureDNS

ROOT = Path("/private/runtime")
IDS = ("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222")


def provision() -> None:
    entries: list[dict[str, str | int]] = []
    identities: list[str] = []
    for index, account_id in enumerate(IDS):
        username, password = runtime_protocol.credentials(index)
        identities.append(username)
        result = subprocess.run(
            ["/release/mox", "-config", str(ROOT / "config/mox.conf"), "setaccountpassword", username],
            input=(password + "\n").encode(), capture_output=True, timeout=60, cwd=ROOT, check=False)
        if result.returncode:
            # AIDEV-NOTE: Never emit credential-bearing provision diagnostics into Docker logs.
            raise RuntimeError("fixture account provision failed")
        for protocol in ("smtp", "imap"):
            entries.append(dict(account_id=account_id, organization_id=IDS[0], mailbox_id=IDS[0],
                                credential_ref=f"secret:protocol-{index}", credential_version=1,
                                protocol=protocol, username=username, password=password))
    payloads: tuple[tuple[str, object], ...] = (
        ("bundle.json", dict(format_version=1, entries=entries)), ("identities.json", identities))
    for filename, value in payloads:
        path = ROOT / filename
        path.write_text(json.dumps(value), encoding="utf-8")
        path.chmod(0o600)
        os.chown(path, 10001, 10001)


def main() -> None:
    runtime_fixture.ROOT = ROOT
    runtime_protocol.ROOT = ROOT
    os.chown("/private", 0, 0)
    os.chmod("/private", 0o755)
    ca = runtime_fixture.configure()
    dns = FixtureDNS()
    dns.start()
    process: subprocess.Popen[bytes] | None = None
    primary: Exception | None = None
    cleanup_errors: list[str] = []
    try:
        process = runtime_fixture.start(ROOT)
        # AIDEV-NOTE: Parent binds IMAP before the unprivileged worker creates its control socket.
        deadline = time.monotonic() + 30
        while not (ROOT / "data/ctl").is_socket():
            if process.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError("Mox control readiness failed")
            time.sleep(0.1)
        provision()
        ROOT.chmod(0o755)
        ca.chmod(0o644)
        (ROOT / "ready").touch()
        deadline = time.monotonic() + 180
        while not (ROOT / "done").exists() and time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError("Mox exited during protocol test")
            time.sleep(0.2)
    except Exception as error:
        primary = error
    finally:
        # AIDEV-NOTE: Independent finalizers preserve the first fixture error and still release process/DNS resources.
        try:
            if (ROOT / "server.log").exists():
                print((ROOT / "server.log").read_text(encoding="utf-8"), flush=True)
        except Exception as error:
            cleanup_errors.append(type(error).__name__)
        try:
            if process is not None:
                runtime_fixture.stop(process)
        except Exception as error:
            cleanup_errors.append(type(error).__name__)
        try:
            dns.close()
        except Exception as error:
            cleanup_errors.append(type(error).__name__)
    if cleanup_errors:
        print("Fixture cleanup errors: " + ", ".join(cleanup_errors), file=sys.stderr, flush=True)
    if primary is not None:
        raise primary
    if cleanup_errors:
        raise RuntimeError("fixture cleanup failed")


if __name__ == "__main__":
    main()
