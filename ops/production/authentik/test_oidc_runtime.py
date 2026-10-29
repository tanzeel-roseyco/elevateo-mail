"""Real GoTrue OIDC negative checks, confined to the task's disposable Docker network."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import subprocess
import unittest
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

AUTH = "http://auth:9999"
VERIFIER = "v" * 64


def encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_: object) -> None:
        return None


def request(path: str, body: dict[str, object] | None = None) -> tuple[int, str, bytes]:
    headers = {"Content-Type": "application/json"}
    req = Request(AUTH + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        response = build_opener(NoRedirect()).open(req, timeout=10)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers.get("Location", ""), response.read(65536)


class OidcRuntimeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if os.environ.get("ELEVATEO_OIDC_DISPOSABLE") != "yes":
            raise RuntimeError("disposable Docker authorization required")
        status, _, _ = request("/health")
        if status != 200:
            raise RuntimeError("disposable GoTrue fixture is not ready")

    def callback(self, mode: str, wrong_state: bool = False, provider: str = "custom:authentik") -> tuple[int, str, bytes]:
        challenge = encoded(hashlib.sha256(VERIFIER.encode()).digest())
        status, location, body = request("/authorize?" + urlencode({"provider": provider,
            "redirect_to": "http://client:3000", "code_challenge": challenge, "code_challenge_method": "s256"}))
        self.assertEqual(status, 302, body.decode())
        state = parse_qs(urlparse(location).query)["state"][0]
        return request("/callback?" + urlencode({"code": mode, "state": state + "x" if wrong_state else state}))

    def test_signed_happy_path_then_wrong_pkce_rejected(self) -> None:
        status, location, _ = self.callback("valid")
        self.assertIn(status, (302, 303))
        query = parse_qs(urlparse(location).query)
        self.assertIn("code", query, location)
        code = query["code"][0]
        # AIDEV-NOTE: Wrong verifier must fail before a correct exchange proves this is a usable positive control.
        status, _, body = request("/token?grant_type=pkce", {"auth_code": code, "code_verifier": "w" * 64})
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error_code"], "bad_code_verifier")
        status, _, body = request("/token?grant_type=pkce", {"auth_code": code, "code_verifier": VERIFIER})
        self.assertEqual(status, 200, body.decode()[:500])
        self.assertIn("access_token", json.loads(body))

    def test_unsigned_missing_wrong_signature_issuer_audience_and_state_deny(self) -> None:
        def sessions() -> int:
            result = subprocess.run(["psql", "-h", "db", "-U", "supabase_admin", "-d", "postgres",
                "-Atc", "SELECT count(*) FROM auth.sessions"], capture_output=True, text=True, check=True, timeout=10)
            return int(result.stdout.strip())
        before = sessions()
        self.assertGreater(before, 0, "signed positive control must have created a session")
        for mode, wrong_state in (("missing", False), ("signature", False), ("issuer", False),
                                  ("audience", False), ("valid", True)):
            with self.subTest(mode=mode, wrong_state=wrong_state):
                status, location, _ = self.callback(mode, wrong_state)
                self.assertIn(status, (302, 303), location)
                query = parse_qs(urlparse(location).query)
                self.assertEqual(query.get("error_code"), ["bad_oauth_state" if wrong_state else "unexpected_failure"])
                self.assertEqual(query.get("error_description"), ["OAuth state parameter is invalid" if wrong_state
                    else "Error getting user profile from external provider"])
                self.assertNotIn("code", query)
                self.assertNotIn("access_token", location)
                self.assertEqual(sessions(), before, "rejected callback must not create a persisted session")

    def test_userinfo_fallback_positive_control(self) -> None:
        # AIDEV-NOTE: An otherwise identical provider accepts missing tokens only when userinfo is advertised.
        status, location, _ = self.callback("missing", provider="custom:fallback")
        self.assertIn(status, (302, 303))
        query = parse_qs(urlparse(location).query)
        self.assertIn("code", query, location)
        status, _, body = request("/token?grant_type=pkce", {"auth_code": query["code"][0], "code_verifier": VERIFIER})
        self.assertEqual(status, 200, body.decode()[:500])
        self.assertIn("access_token", json.loads(body))


if __name__ == "__main__":
    unittest.main(verbosity=2)
