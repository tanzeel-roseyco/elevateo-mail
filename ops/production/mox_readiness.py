"""Bounded protocol readiness with no authentication, message submission or mailbox reads."""
from __future__ import annotations

import ipaddress
import os
import socket
import ssl
import time


def prefix(connection: socket.socket, expected: bytes) -> None:
    # AIDEV-NOTE: TCP may split greeting prefixes; one absolute deadline bounds even byte-at-a-time peers.
    deadline = time.monotonic() + 2
    received = b""
    while len(received) < len(expected):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("greeting timed out")
        connection.settimeout(remaining)
        chunk = connection.recv(len(expected) - len(received))
        if not chunk:
            raise ValueError("listener closed before greeting")
        received += chunk
    if received != expected:
        raise ValueError("unexpected listener greeting")


def check() -> None:
    address = str(ipaddress.IPv4Address(os.environ["ELEVATEO_MOX_IPV4"]))
    hostname = os.environ["ELEVATEO_MOX_HOSTNAME"]
    # AIDEV-NOTE: Verify deployed certificate and live greetings; config parsing alone cannot prove listener readiness.
    context = ssl.create_default_context()
    with socket.create_connection((address, 993), timeout=2) as raw:
        with context.wrap_socket(raw, server_hostname=hostname) as secure:
            prefix(secure, b"* OK")
    for port in (25, 587):
        with socket.create_connection((address, port), timeout=2) as connection:
            prefix(connection, b"220")


if __name__ == "__main__":
    try:
        check()
    except (OSError, ValueError, KeyError):
        raise SystemExit("Mox readiness failed") from None
