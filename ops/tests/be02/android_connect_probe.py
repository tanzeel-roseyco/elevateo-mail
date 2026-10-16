"""One-shot UNIX or emulator-loopback CONNECT/TLS witness; run only inside the bounded fleet probe container."""
from __future__ import annotations
import http.client
from pathlib import Path
import signal
import socket
import sys
import ssl
import time

HOST = "elevateo.qa.internal"
CA = Path("/run/android-tls/ca.pem")


class UnixHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, context: ssl.SSLContext) -> None:
        super().__init__(HOST, 443, timeout=2, context=context)
        self.tls_context = context

    def connect(self) -> None:
        # AIDEV-NOTE: CONNECT still validates the fixed TLS hostname; only the transport changes to the owned socket.
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.settimeout(2)
        self.sock.connect("/relay/edge.sock")
        self._tunnel()
        self.sock = self.tls_context.wrap_socket(self.sock, server_hostname=HOST)


def probe(certificate: Path = CA, port: int = 19443, unix: bool = False) -> None:
    # AIDEV-NOTE: The emulator uses loopback; the fixture probe enters the same CONNECT service through UNIX.
    context = ssl.create_default_context(cafile=str(certificate))
    connection = UnixHTTPSConnection(context) if unix else http.client.HTTPSConnection("127.0.0.1", port, timeout=2, context=context)
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


def main(unix: bool = False) -> int:
    # AIDEV-NOTE: A wall-clock alarm bounds slow headers as well as socket inactivity; no response content is logged.
    signal.signal(signal.SIGALRM, expired)
    end = time.monotonic() + 60
    while time.monotonic() < end:
        signal.setitimer(signal.ITIMER_REAL, min(3, max(0.001, end - time.monotonic())))
        try:
            probe(unix=unix)
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
    if sys.argv[1:] not in ([], ["--unix"]):
        raise RuntimeError("Only the fixed UNIX probe option is supported")
    raise SystemExit(main(unix=sys.argv[1:] == ["--unix"]))
