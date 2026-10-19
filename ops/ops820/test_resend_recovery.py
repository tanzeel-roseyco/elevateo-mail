"""Recovery verifier rejects corrupted bytes and accidentally public restored buckets."""
from __future__ import annotations
import contextlib
import io
import json
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch

MODULE = Path(__file__).with_name("resend-recovery-object.py")

class RecoveryObjectTest(unittest.TestCase):
    def verify(self, public: bool, body: bytes) -> None:
        responses = [io.BytesIO(json.dumps({"public": public}).encode()), io.BytesIO(body)]
        with patch("sys.argv", [str(MODULE), "verify"]), patch.dict("os.environ", {"SERVICE_ROLE_KEY": "synthetic"}), \
             patch("urllib.request.urlopen", side_effect=responses), contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(MODULE), run_name="__main__")

    def test_exact_private_bytes_pass(self) -> None:
        self.verify(False, b"ops1040-private-draft-marker")

    def test_corrupted_restored_bytes_fail(self) -> None:
        with self.assertRaisesRegex(ValueError, "private draft recovery mismatch"):
            self.verify(False, b"corrupted")

    def test_public_restored_bucket_fails(self) -> None:
        with self.assertRaisesRegex(ValueError, "private draft recovery mismatch"):
            self.verify(True, b"ops1040-private-draft-marker")

if __name__ == "__main__":
    unittest.main()
