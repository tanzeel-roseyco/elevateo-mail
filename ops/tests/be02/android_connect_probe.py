"""One-shot host-loopback CONNECT/TLS witness; run only inside the bounded fleet probe container."""
from __future__ import annotations
import http.client
from pathlib import Path
import signal
import ssl
import time

HOST = "elevateo.qa.internal"
CA = Path("/run/android-tls/ca.pem")


def probe(certificate: Path = CA, port: int = 19443) -> None:
    # AIDEV-NOTE: set_tunnel preserves the QA hostname for certificate/SNI checks while TCP uses host loopback.
    context = ssl.create_default_context(cafile=str(certificate))
    connection = http.client.HTTPSConnection("127.0.0.1", port, timeout=2, context=context)
    try:
        connection.set_tunnel(HOST, 443, headers={"Host": HOST + ":443"})
        connection.request("GET", "/", headers={"Host": HOST, "Connection": "close"})
        response = connection.getresponse()
        if response.status != 200 or response.getheader("Content-Type", "").split(";")[0].strip() != "text/html":
            raise RuntimeError("Android CONNECT response mismatch")
    finally:
        connection.close()


def expired(_signum: int, _frame: object) -> None:
    raise TimeoutError("Android CONNECT deadline exceeded")


def main() -> int:
    # AIDEV-NOTE: A wall-clock alarm bounds slow headers as well as socket inactivity; no response content is logged.
    signal.signal(signal.SIGALRM, expired)
    end = time.monotonic() + 60
    while time.monotonic() < end:
        signal.setitimer(signal.ITIMER_REAL, min(3, max(0.001, end - time.monotonic())))
        try:
            probe()
            return 0
        except (OSError, http.client.HTTPException, RuntimeError):
            # AIDEV-NOTE: Startup failures retry only until the deadline, then fail with a content-free diagnostic.
            pass
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
        time.sleep(min(0.5, max(0, end - time.monotonic())))
    print("READINESS:android_connect:failed", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
