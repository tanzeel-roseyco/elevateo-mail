"""Ephemeral CONNECT-only egress proxy; no logs, credentials, arbitrary ports or private destinations."""
import ipaddress
import selectors
import signal
import socket
import socketserver
import sys
import threading
import time


def target(authority: str, allowed: set[str]) -> str:
    host, separator, port = authority.rpartition(":")
    if separator != ":" or port != "443" or host not in allowed:
        raise ValueError("destination denied")
    return host


def connect_public(host: str) -> socket.socket:
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
        raise ValueError("private destination denied")
    # AIDEV-NOTE: Connect the checked IP directly; a second hostname lookup would allow DNS rebinding.
    address = addresses[0]
    remote = socket.socket(address[0], socket.SOCK_STREAM)
    try:
        remote.settimeout(10)
        remote.connect(address[4])
        return remote
    except OSError:
        remote.close()
        raise


class Proxy(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True
    allowed: set[str] = set()
    slots = threading.BoundedSemaphore(32)

    def process_request(self, request: socket.socket, client_address: tuple[str, int]) -> None:
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request: socket.socket, client_address: tuple[str, int]) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

    def handle_error(self, request: socket.socket, client_address: tuple[str, int]) -> None:
        pass  # No exception text or HTTP headers enter Docker logs.


def read_header(client: socket.socket) -> bytes:
    # AIDEV-NOTE: A total deadline prevents one-byte keepalives from monopolizing every bounded proxy slot.
    deadline = time.monotonic() + 10
    header = bytearray()
    while not header.endswith(b"\r\n\r\n"):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError("header deadline exceeded")
        client.settimeout(remaining)
        value = client.recv(1)
        if not value or len(header) >= 8192:
            raise ValueError("invalid header")
        header.extend(value)
    client.settimeout(10)
    return bytes(header)


class Tunnel(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        client: socket.socket = self.request
        client.settimeout(10)
        try:
            header = read_header(client)
            method, authority, version = header.split(b"\r\n", 1)[0].decode("ascii").split(" ")
            if method != "CONNECT" or version not in ("HTTP/1.0", "HTTP/1.1"):
                raise ValueError("CONNECT required")
            host = target(authority, Proxy.allowed)
            with connect_public(host) as remote, selectors.DefaultSelector() as selector:
                client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                selector.register(client, selectors.EVENT_READ, remote)
                selector.register(remote, selectors.EVENT_READ, client)
                deadline = time.monotonic() + 300
                while time.monotonic() < deadline:
                    ready = selector.select(timeout=1)
                    for key, _mask in ready:
                        source: socket.socket = key.fileobj  # type: ignore[assignment]
                        data = source.recv(16384)
                        if not data:
                            return
                        key.data.sendall(data)
        except (OSError, ValueError, UnicodeError):
            return  # Deny by closing the tunnel; never return attacker-controlled error text.


if __name__ == "__main__":
    Proxy.allowed = set(sys.argv[1].split(","))
    signal.alarm(360)  # Survives a host crash for at most six minutes, without retaining credentials.
    with Proxy(("0.0.0.0", 8080), Tunnel) as server:
        server.serve_forever()
