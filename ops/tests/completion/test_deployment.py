"""Admission tests never run Docker or access a provider."""
from __future__ import annotations

import base64
from contextlib import redirect_stdout
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "production"))
import deployment
import deployment_settings as settings


def token(secret: str, role: str, **claims: object) -> str:
    def encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).decode().rstrip("=")
    body = encode(b'{"alg":"HS256"}') + "." + encode(json.dumps({"role": role, **claims}).encode())
    return body + "." + encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())


class DeploymentTest(unittest.TestCase):
    def setUp(self) -> None:
        # AIDEV-NOTE: Deployment admission isolates TLS parsing; test_tls.py exercises real PEM parsing and key matching.
        tls_parser = patch("initialize_mox.ssl.SSLContext.load_cert_chain")
        tls_parser.start()
        self.addCleanup(tls_parser.stop)
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.csv = Path(self.directory.name) / "assignments.csv"
        self.csv.write_text("organization_id,user_id,mailbox_id,address\n"
                            "11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222,"
                            "33333333-3333-4333-8333-333333333333,owner@mail.example.net\n", encoding="utf-8")
        self.env = {name: "fixture" for name in settings.REQUIRED}
        self.env.update({name: "fixture/image@sha256:" + "a" * 64 for name in settings.IMAGES})
        self.env.update({name: str(i) + "x" * 40 for i, name in enumerate(settings.PASSWORDS)})
        self.env.update(SECRET_KEY_BASE="s" * 64, JWT_SECRET="j" * 32,
                        ELEVATEO_OPERATIONS_LOCK=str(Path(self.directory.name) / "operations.lock"),
                        ELEVATEO_AUTHENTIK_ISSUER="https://id.example.net/application/o/mail/",
                        ELEVATEO_AUTHENTIK_GROUP="44444444-4444-4444-8444-444444444444",
                        ELEVATEO_EGRESS_ID="55555555-5555-4555-8555-555555555555",
                        ELEVATEO_AUTHENTIK_API_TOKEN="t" * 32, ELEVATEO_MCP_HTTP_HOST="mcp.example.net",
                        ELEVATEO_ATTACHMENT_BUCKET="attachments", ELEVATEO_MOX_HOSTNAME="mx.mail.example.net",
                        ELEVATEO_MOX_IPV4="188.40.237.70", ELEVATEO_MAIL_DOMAINS="mail.example.net",
                        ELEVATEO_WORKSPACE_DOMAINS="workspace.example.net", ELEVATEO_APPROVED_ASSIGNMENTS=str(self.csv))
        for name in ("ELEVATEO_SESSION_KEY_BASE64", "ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64"):
            self.env[name] = base64.b64encode(b"k" * 32).decode()
        for name, label in (("ELEVATEO_MOX_TLS_CERT_BASE64", "CERTIFICATE"),
                            ("ELEVATEO_MOX_TLS_KEY_BASE64", "PRIVATE KEY")):
            self.env[name] = base64.b64encode((f"-----BEGIN {label}-----\n" + "A" * 80 +
                                              f"\n-----END {label}-----\n").encode()).decode()
        for name, role in (("ANON_KEY", "anon"), ("SERVICE_ROLE_KEY", "service_role")):
            self.env[name] = token(self.env["JWT_SECRET"], role, exp=int(time.time()) + 3600)

    def test_valid_dry_run_has_no_subprocess_and_restores_environment(self) -> None:
        before = dict(os.environ)
        with patch.object(deployment.subprocess, "run") as run, redirect_stdout(io.StringIO()) as output:
            deployment.deploy(self.env, True)
        run.assert_not_called()
        self.assertIn("DRY RUN", output.getvalue())
        self.assertEqual(before, dict(os.environ))

    def test_every_missing_required_value_refuses_before_subprocess(self) -> None:
        with patch.object(deployment.subprocess, "run") as run:
            for name in settings.REQUIRED:
                with self.subTest(name=name), self.assertRaises(settings.AdmissionError):
                    deployment.deploy({**self.env, name: ""}, True)
            run.assert_not_called()

    def test_malformed_csv_refuses_before_subprocess(self) -> None:
        self.csv.write_text("wrong,header\nsecret,marker\n", encoding="utf-8")
        before = dict(os.environ)
        with patch.object(deployment.subprocess, "run") as run, self.assertRaises(settings.AdmissionError):
            deployment.deploy(self.env, False)
        run.assert_not_called()
        self.assertEqual(before, dict(os.environ))

    def test_invalid_mox_configuration_and_tls_refuse_before_subprocess(self) -> None:
        for name, value in (("ELEVATEO_MOX_IPV4", "127.0.0.1"), ("ELEVATEO_MAIL_DOMAINS", "other.example.net"),
                            ("ELEVATEO_MOX_TLS_CERT_BASE64", "not-base64")):
            with self.subTest(name=name), patch.object(deployment.subprocess, "run") as run:
                with self.assertRaises(settings.AdmissionError):
                    deployment.deploy({**self.env, name: value}, False)
                run.assert_not_called()

    def test_malformed_issuer_errors_do_not_echo_values(self) -> None:
        for issuer in ("https://id.example.net:secret-marker/application/o/mail/", "https://[secret-marker"):
            with self.assertRaises(settings.AdmissionError) as caught:
                settings.validate({**self.env, "ELEVATEO_AUTHENTIK_ISSUER": issuer})
            self.assertNotIn("secret-marker", str(caught.exception))

    def test_jwt_lifetimes_reject_missing_expiration_bool_noninteger_and_future_nbf(self) -> None:
        now = int(time.time())
        for claims in ({}, {"exp": now - 1}, {"exp": True}, {"exp": float("inf")},
                       {"exp": now + 1000.0}, {"exp": now + 3600, "nbf": now + 3600},
                       {"exp": now + 3600, "nbf": False}):
            with self.subTest(claims=claims), self.assertRaises(settings.AdmissionError):
                settings.validate({**self.env, "ANON_KEY": token(self.env["JWT_SECRET"], "anon", **claims)})
        self.env["ANON_KEY"] = token(self.env["JWT_SECRET"], "anon", exp=now + 3600, nbf=now - 1)
        settings.validate(self.env)

    def test_bucket_matches_private_storage_boundary(self) -> None:
        for bucket in ("a", "ab", "private_bucket", "x" * 64):
            with self.subTest(bucket=bucket), self.assertRaises(settings.AdmissionError):
                settings.validate({**self.env, "ELEVATEO_ATTACHMENT_BUCKET": bucket})
        settings.validate({**self.env, "ELEVATEO_ATTACHMENT_BUCKET": "private-attachments"})

    def test_helper_image_must_be_pinned(self) -> None:
        with self.assertRaises(settings.AdmissionError):
            settings.validate({**self.env, "ELEVATEO_BACKUP_HELPER_IMAGE": "fixture:latest"})

    def test_invalid_budgets_refuse_before_subprocess(self) -> None:
        for name, value in (("ELEVATEO_MAILBOX_DAILY_SEND_LIMIT", "31"), ("ELEVATEO_USER_DAILY_SEND_LIMIT", "301"),
                            ("ELEVATEO_USER_DAILY_SEND_LIMIT", "0"), ("ELEVATEO_USER_DAILY_SEND_LIMIT", "many")):
            with self.subTest(name=name, value=value), patch.object(deployment.subprocess, "run") as run:
                with self.assertRaises(settings.AdmissionError):
                    deployment.deploy({**self.env, name: value}, True)
                run.assert_not_called()

    def test_relative_operations_lock_refuses_before_subprocess(self) -> None:
        with patch.object(deployment.subprocess, "run") as run, self.assertRaises(settings.AdmissionError):
            deployment.deploy({**self.env, "ELEVATEO_OPERATIONS_LOCK": "relative.lock"}, True)
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
