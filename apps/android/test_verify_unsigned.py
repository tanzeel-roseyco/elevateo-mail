"""Signer diagnostic failures; Soren executes these in fleet Docker only."""

import unittest
from unittest.mock import patch

from verify_unsigned import UNSIGNED_DIAGNOSTIC, require_unsigned, verify_unsigned


class VerifyUnsignedTest(unittest.TestCase):
    def test_accepts_only_known_missing_signature_diagnostic(self) -> None:
        require_unsigned(1, "", UNSIGNED_DIAGNOSTIC + "\n")

    def test_rejects_signed_apk(self) -> None:
        with self.assertRaises(ValueError):
            require_unsigned(0, "Verifies\n", "")

    def test_rejects_tool_failure(self) -> None:
        with self.assertRaises(ValueError):
            require_unsigned(127, "", "apksigner: command not found\n")
        with patch("verify_unsigned.subprocess.run", side_effect=OSError("missing")):
            with self.assertRaises(ValueError):
                verify_unsigned("/missing/apksigner", "fixture.apk")

    def test_rejects_corrupt_apk(self) -> None:
        with self.assertRaises(ValueError):
            require_unsigned(1, "", "DOES NOT VERIFY\nERROR: APK integrity check failed\n")


if __name__ == "__main__":
    unittest.main()
