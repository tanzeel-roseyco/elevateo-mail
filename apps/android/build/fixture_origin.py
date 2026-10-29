"""HTTPS fixture origin and CONNECT-only proxy for the Android emulator acceptance lane.

The emulator is started with an HTTP proxy pointing at this process. The proxy admits only
CONNECT elevateo.qa.internal:443 and tunnels it to the local HTTPS server, which serves the
built apps/web fixture bundle. The APK's packaged network-security-config trusts the synthetic
QA CA for exactly that host, so nothing else can be reached from the privileged WebView.
"""
# AIDEV-NOTE: Policy functions are pure and tested in test_acceptance_results.py; socket glue is not.
from __future__ import annotations

import argparse
import http.server
import socket
import ssl
import threading
from pathlib import Path

QA_HOST = "elevateo.qa.internal"
QA_PORT = 443
SCENARIOS = ("unauthenticated", "authenticated")
# The fixture entry reads its script from the hash once per document load (fixtureMain.tsx).
SCENARIO_HASH = {
    "unauthenticated": "#/fixtures?getSession=unauthenticated",
    "authenticated": "",
}


def connect_target_allowed(target: str) -> bool:
    """Only the exact QA host and HTTPS port may be tunnelled; everything else is denied."""
    host, separator, port = target.rpartition(":")
    if not separator or not port.isdigit():
        return False
    return host.lower() == QA_HOST and int(port) == QA_PORT


def bootstrap_html(scenario: str) -> str:
    """'/' answer: a same-origin hop into the fixture entry with the scenario's gateway script."""
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown acceptance scenario: {scenario}")
    target = "/dev-fixtures.html" + SCENARIO_HASH[scenario]
    # location.replace keeps the bootstrap out of WebView history so Back cannot land on it.
    return (
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<title>Elevateo QA fixture origin</title></head><body>"
        f"<script>location.replace({target!r})</script>"
        f"<noscript><a href=\"{target}\">Open fixtures</a></noscript></body></html>"
    )


def resolve_dist_path(dist: Path, request_path: str) -> Path | None:
    """Maps a URL path onto the fixture dist directory; traversal outside it returns None."""
    candidate = request_path.split("?", 1)[0].split("#", 1)[0].lstrip("/")
    if not candidate:
        return None
    resolved = (dist / candidate).resolve()
    dist_root = dist.resolve()
    if dist_root not in resolved.parents and resolved != dist_root:
        return None
    return resolved if resolved.is_file() else None


CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".png": "image/png",
    ".woff2": "font/woff2",
}


class FixtureHandler(http.server.BaseHTTPRequestHandler):
    dist: Path
    scenario: str

    def do_GET(self) -> None:  # noqa: N802 - http.server contract
        if self.path.split("?", 1)[0] in ("/", "/index.html"):
            body = bootstrap_html(self.scenario).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        target = resolve_dist_path(self.dist, self.path)
        if target is None:
            self.send_error(404, "not part of the fixture bundle")
            return
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(target.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        print("fixture-origin:", format % args, flush=True)


class ConnectProxyHandler(http.server.BaseHTTPRequestHandler):
    https_port: int

    def do_CONNECT(self) -> None:  # noqa: N802 - http.server contract
        if not connect_target_allowed(self.path):
            self.send_error(403, "destination not permitted by the QA proxy")
            return
        try:
            upstream = socket.create_connection(("127.0.0.1", self.https_port), timeout=30)
        except OSError:
            self.send_error(502, "fixture origin unreachable")
            return
        self.send_response(200, "Connection Established")
        self.end_headers()
        self._pump(self.connection, upstream)

    def _pump(self, client: socket.socket, upstream: socket.socket) -> None:
        # AIDEV-NOTE: Half-close preserved both ways so TLS close_notify and tail bytes survive.
        def one_way(source: socket.socket, sink: socket.socket) -> None:
            try:
                while chunk := source.recv(65536):
                    sink.sendall(chunk)
            except OSError:
                pass
            finally:
                try:
                    sink.shutdown(socket.SHUT_WR)
                except OSError:
                    pass

        back = threading.Thread(target=one_way, args=(upstream, client), daemon=True)
        back.start()
        one_way(client, upstream)
        back.join(timeout=60)

    def log_message(self, format: str, *args: object) -> None:
        print("qa-proxy:", format % args, flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dist", required=True, type=Path, help="built apps/web fixture bundle")
    parser.add_argument("--cert", required=True, type=Path, help="QA server certificate (PEM)")
    parser.add_argument("--key", required=True, type=Path, help="QA server private key (PEM)")
    parser.add_argument("--scenario", required=True, choices=SCENARIOS)
    parser.add_argument("--https-port", type=int, default=8443)
    parser.add_argument("--proxy-port", type=int, default=8080)
    args = parser.parse_args()
    if not (args.dist / "dev-fixtures.html").is_file():
        raise SystemExit("fixture dist must contain dev-fixtures.html (vite build --mode fixtures)")

    handler = type("BoundFixtureHandler", (FixtureHandler,), {"dist": args.dist, "scenario": args.scenario})
    https_server = http.server.ThreadingHTTPServer(("127.0.0.1", args.https_port), handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=args.cert, keyfile=args.key)
    https_server.socket = context.wrap_socket(https_server.socket, server_side=True)
    threading.Thread(target=https_server.serve_forever, daemon=True).start()

    proxy = type("BoundProxyHandler", (ConnectProxyHandler,), {"https_port": args.https_port})
    proxy_server = http.server.ThreadingHTTPServer(("127.0.0.1", args.proxy_port), proxy)
    print(f"fixture origin ready: scenario={args.scenario} https=127.0.0.1:{args.https_port} "
          f"proxy=127.0.0.1:{args.proxy_port}", flush=True)
    proxy_server.serve_forever()


if __name__ == "__main__":
    main()
