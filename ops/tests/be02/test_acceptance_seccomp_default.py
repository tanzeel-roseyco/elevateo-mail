"""Keep the default CLI admission digest bound to the reviewed, shipped sandbox policy."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import unittest

from acceptance_runtime import add_arguments


class SeccompDefaultTests(unittest.TestCase):
    def test_default_admits_shipped_policy_but_rejects_changed_bytes(self) -> None:
        parser = argparse.ArgumentParser()
        add_arguments(parser)
        expected = parser.parse_args([]).acceptance_seccomp_sha256
        policy = Path(__file__).resolve().parents[3] / "ops/acceptance/seccomp.json"
        shipped = policy.read_bytes()
        # AIDEV-NOTE: Test the CLI default against the actual file, not another copy of its digest.
        self.assertEqual(expected, hashlib.sha256(shipped).hexdigest())
        for altered in (b"", b'{"defaultAction":"SCMP_ACT_ALLOW"}', shipped + b"\n"):
            with self.subTest(altered_length=len(altered)):
                self.assertNotEqual(expected, hashlib.sha256(altered).hexdigest())


if __name__ == "__main__":
    unittest.main()
