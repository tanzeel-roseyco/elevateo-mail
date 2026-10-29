"""Real TLS parsing tests, executed only within the final Docker gate."""
from __future__ import annotations

import base64
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from initialize_mox import tls_material


class TlsTests(unittest.TestCase):
    # AIDEV-NOTE: Ephemeral test-only keys prove the actual SSL parser rejects garbage and mismatched credentials.
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        for name in ("one", "two"):
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                            "-subj", "/CN=mx.mail.example.net", "-keyout", str(root / f"{name}.key"),
                            "-out", str(root / f"{name}.crt")], check=True, capture_output=True, timeout=30)
        self.cert = (root / "one.crt").read_bytes()
        self.key = (root / "one.key").read_bytes()
        self.other_key = (root / "two.key").read_bytes()

    def material(self, cert: bytes, key: bytes) -> dict[str, bytes]:
        with patch.dict(os.environ, {
            "ELEVATEO_MOX_TLS_CERT_BASE64": base64.b64encode(cert).decode(),
            "ELEVATEO_MOX_TLS_KEY_BASE64": base64.b64encode(key).decode(),
        }):
            return tls_material()

    def test_matching_credentials(self) -> None:
        self.assertEqual(self.material(self.cert, self.key), {"fullchain.pem": self.cert, "privkey.pem": self.key})

    def test_mismatched_key(self) -> None:
        with self.assertRaises(ValueError):
            self.material(self.cert, self.other_key)

    def test_marker_only_certificate(self) -> None:
        with self.assertRaises(ValueError):
            self.material(b"-----BEGIN CERTIFICATE-----\n" + b"A" * 80 + b"\n-----END CERTIFICATE-----", self.key)


if __name__ == "__main__":
    unittest.main()
