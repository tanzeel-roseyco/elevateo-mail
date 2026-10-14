"""Manifest tool-failure cases; Soren runs them in fleet Docker only."""

import unittest
from unittest.mock import patch

from verify_manifest_tree import require_no_view_filter, verify_manifest_tree


class VerifyManifestTreeTest(unittest.TestCase):
    def test_accepts_successful_nonempty_tree_without_view(self) -> None:
        require_no_view_filter(0, "E: manifest (line=1)\n  E: application (line=2)\n")

    def test_rejects_view_callback(self) -> None:
        with self.assertRaises(ValueError):
            require_no_view_filter(
                0,
                'E: manifest (line=1)\n  E: application (line=2)\n'
                '    E: action android.intent.action.VIEW\n',
            )

    def test_rejects_tool_failure_and_empty_output(self) -> None:
        with self.assertRaises(ValueError):
            require_no_view_filter(1, "")
        with self.assertRaises(ValueError):
            require_no_view_filter(0, "")
        with patch("verify_manifest_tree.subprocess.run", side_effect=OSError("missing")):
            with self.assertRaises(ValueError):
                verify_manifest_tree("/missing/aapt", "fixture.apk")

    def test_rejects_zero_exit_usage_and_diagnostic_output(self) -> None:
        with self.assertRaises(ValueError):
            require_no_view_filter(0, "usage: aapt dump xmltree FILE\n")
        with self.assertRaises(ValueError):
            require_no_view_filter(
                0,
                "E: manifest (line=1)\n  E: application (line=2)\n",
                "warning: malformed resource\n",
            )


if __name__ == "__main__":
    unittest.main()
