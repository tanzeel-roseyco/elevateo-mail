#!/usr/bin/env python3
"""Deterministic Resend-compatible stub for the fleet-only integration recipe."""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MESSAGES: dict[str, str] = {}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 - stdlib callback name
        if self.path != "/emails":
            self.reply(404, {"message": "not found"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        key = self.headers.get("Idempotency-Key", "")
        if not key or not all(name in payload for name in ("from", "to", "subject", "text")):
            self.reply(400, {"message": "invalid request"})
            return
        provider_id = MESSAGES.setdefault(key, f"stub_{len(MESSAGES) + 1}")
        self.reply(200, {"id": provider_id})

    def do_GET(self) -> None:  # noqa: N802 - stdlib callback name
        provider_id = self.path.removeprefix("/emails/")
        if provider_id not in MESSAGES.values():
            self.reply(404, {"message": "not found"})
            return
        self.reply(200, {"id": provider_id, "last_event": "delivered"})

    def reply(self, status: int, body: dict[str, str]) -> None:
        encoded = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, _format: str, *_args: object) -> None:
        return


if __name__ == "__main__":
    port = int(os.environ.get("RESEND_STUB_PORT", "8788"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
