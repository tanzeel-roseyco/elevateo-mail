"""Disposable OIDC adversary; never deploy or connect to a real identity provider."""
from __future__ import annotations

import base64
import json
import os
import subprocess
import ssl
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

ISSUER = "https://idp:8443"
KEY = Path("/tmp/oidc-test-key.pem")


def encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def token(mode: str) -> str:
    claims: dict[str, object] = {"iss": ISSUER, "aud": "fixture-client", "sub": "fixture-subject",
        "email": "sentinel@elevateoco.com", "email_verified": True,
        "iat": int(time.time()), "exp": int(time.time()) + 120}
    if mode == "issuer":
        claims["iss"] = "http://wrong-issuer.invalid"
    if mode == "audience":
        claims["aud"] = "wrong-client"
    signing_input = (encoded(json.dumps({"alg": "RS256", "kid": "fixture"}).encode()) + "." +
                     encoded(json.dumps(claims).encode())).encode()
    signed = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(KEY)], input=signing_input,
                            capture_output=True, check=True).stdout
    if mode == "signature":
        signed = bytes([signed[0] ^ 1]) + signed[1:]
    return signing_input.decode() + "." + encoded(signed)


class Handler(BaseHTTPRequestHandler):
    # AIDEV-NOTE: Strict discovery omits userinfo; fallback discovery proves the unsafe alternative is usable.
    def respond(self, body: dict[str, object], status: int = 200) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        if self.path in ("/discovery", "/discovery-fallback"):
            document: dict[str, object] = {"issuer": ISSUER, "authorization_endpoint": ISSUER + "/authorize",
                "token_endpoint": ISSUER + "/token", "jwks_uri": ISSUER + "/jwks",
                "id_token_signing_alg_values_supported": ["RS256"], "response_types_supported": ["code"],
                "subject_types_supported": ["public"]}
            if self.path == "/discovery-fallback":
                document["issuer"] = ISSUER + "/fallback"
                document["userinfo_endpoint"] = ISSUER + "/userinfo"
            self.respond(document)
        elif self.path == "/jwks":
            modulus = subprocess.run(["openssl", "rsa", "-in", str(KEY), "-noout", "-modulus"],
                                     capture_output=True, text=True, check=True).stdout.strip().split("=", 1)[1]
            self.respond({"keys": [{"kty": "RSA", "kid": "fixture", "use": "sig", "alg": "RS256",
                                    "n": encoded(bytes.fromhex(modulus)), "e": "AQAB"}]})
        elif self.path == "/userinfo":
            self.respond({"sub": "fixture-subject", "email": "sentinel@elevateoco.com", "email_verified": True})
        else:
            self.respond({"error": "not_found"}, 404)

    def do_POST(self) -> None:
        if self.path != "/token":
            self.respond({"error": "not_found"}, 404)
            return
        body = self.rfile.read(min(int(self.headers.get("Content-Length", "0")), 8192)).decode()
        mode = parse_qs(body).get("code", ["missing"])[0]
        response: dict[str, object] = {"access_token": "disposable", "token_type": "Bearer", "expires_in": 120}
        if mode != "missing":
            response["id_token"] = token(mode)
        self.respond(response)

    def log_message(self, *_: object) -> None:
        pass


if __name__ == "__main__":
    if os.environ.get("ELEVATEO_OIDC_DISPOSABLE") != "yes":
        raise RuntimeError("isolated disposable fixture authorization required")
    subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048",
                    "-out", str(KEY)], check=True, capture_output=True)
    subprocess.run(["openssl", "req", "-new", "-x509", "-key", str(KEY), "-days", "1",
                    "-subj", "/CN=idp", "-addext", "subjectAltName=DNS:idp", "-out", "/tmp/oidc-test-cert.pem"],
                   check=True, capture_output=True)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain("/tmp/oidc-test-cert.pem", str(KEY))
    server = ThreadingHTTPServer(("0.0.0.0", 8443), Handler)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    server.serve_forever()
