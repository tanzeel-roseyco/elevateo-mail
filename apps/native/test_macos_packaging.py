"""Preflight-only checks; run only in Soren's fleet Docker lease."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("macos-release.sh")


class MacPackagingPreflightTest(unittest.TestCase):
    def invoke(self, mode: str, origin: str, pretend_mac: bool = False) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            if pretend_mac:
                stub = path / "uname"
                stub.write_text("#!/bin/sh\nprintf 'Darwin\\n'\n")
                stub.chmod(0o700)
            environment = {"PATH": f"{directory}:{os.environ['PATH']}", "ELEVATEO_WEB_ORIGIN": origin}
            return subprocess.run(["/bin/sh", str(SCRIPT), mode], env=environment,
                                  capture_output=True, text=True, check=False)

    def test_linux_denies_candidate_before_build(self):
        result = self.invoke("--unsigned-candidate", "https://mail.company.org")
        self.assertEqual(2, result.returncode)
        self.assertIn("requires a macOS runner", result.stderr)

    def test_invalid_origin_denied_on_candidate_path(self):
        result = self.invoke("--unsigned-candidate", "http://mail.company.org", pretend_mac=True)
        self.assertEqual(2, result.returncode)
        self.assertIn("requires a public exact HTTPS origin", result.stderr)

    def test_placeholder_origin_denied_before_toolchain(self):
        result = self.invoke("--unsigned-candidate", "https://mail.example.com", pretend_mac=True)
        self.assertEqual(2, result.returncode)
        self.assertIn("placeholder origin refused", result.stderr)

    def test_terminal_dns_dots_denied_on_both_paths(self):
        for mode in ("--unsigned-candidate", ""):
            for host in ("mail.example.com.", "mail.invalid..", "MAIL.EXAMPLE.COM."):
                with self.subTest(mode=mode, host=host):
                    result = self.invoke(mode, f"https://{host}", pretend_mac=True)
                    self.assertEqual(2, result.returncode)
                    self.assertIn("trailing-dot origin refused", result.stderr)

    def test_valid_candidate_origin_needs_toolchain_not_signing_identity(self):
        result = self.invoke("--unsigned-candidate", "https://mail.company.org", pretend_mac=True)
        self.assertEqual(2, result.returncode)
        self.assertIn("missing tool: xcodebuild", result.stderr)
        self.assertNotIn("APPLE_SIGNING_IDENTITY", result.stderr)

    def test_release_still_requires_signing_before_toolchain(self):
        result = self.invoke("", "https://mail.company.org", pretend_mac=True)
        self.assertEqual(2, result.returncode)
        self.assertIn("missing APPLE_SIGNING_IDENTITY", result.stderr)


if __name__ == "__main__":
    unittest.main()
