"""Exercise release admission without a Mac, credentials or a real build/signing command."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("macos-release.sh")


class MacReleaseAdmissionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.capture = self.root / "build-inputs"
        # AIDEV-NOTE: Cargo stops at admission; no bundle, keychain or external service is touched.
        stub = '''#!/bin/sh
case "${0##*/}" in
  uname) printf '%s\\n' "$TEST_OS" ;;
  security) printf '%s\\n' "$APPLE_SIGNING_IDENTITY" ;;
  rustup) printf '%s\\n' aarch64-apple-darwin x86_64-apple-darwin ;;
  cargo)
    printf '%s\\n' "$ELEVATEO_NATIVE_ARTIFACT" "$ELEVATEO_WEB_ORIGIN" "$*" > "$TEST_CAPTURE"
    exit 71 ;;
esac
'''
        for command in ("uname", "security", "rustup", "cargo", "xcodebuild", "xcrun", "shasum", "lipo", "codesign", "spctl"):
            path = self.root / command
            path.write_text(stub, encoding="utf-8")
            path.chmod(0o700)
        self.env = {
            "PATH": f"{self.root}:{os.defpath}",
            "TEST_OS": "Darwin", "TEST_CAPTURE": str(self.capture),
            "ELEVATEO_WEB_ORIGIN": "https://mail.company.org",
            "APPLE_SIGNING_IDENTITY": "Developer ID Application: Synthetic admission fixture",
            "APPLE_ID": "synthetic@example.invalid", "APPLE_PASSWORD": "fixture-not-a-credential",
            "APPLE_TEAM_ID": "FIXTURE",
        }

    def run_script(self) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["/bin/sh", str(SCRIPT)], env=self.env, capture_output=True, text=True, timeout=5, check=False)

    def test_mac_build_sets_launch_marker_even_after_fixture_build(self) -> None:
        for inherited in ("", "compile-only-fixture", "unsigned-candidate"):
            with self.subTest(inherited=inherited):
                self.env["ELEVATEO_NATIVE_ARTIFACT"] = inherited
                result = self.run_script()
                self.assertEqual(71, result.returncode, result.stderr)
                self.assertEqual([
                    "unsigned-candidate", "https://mail.company.org",
                    "tauri build --target universal-apple-darwin --bundles dmg -- --locked",
                ], self.capture.read_text(encoding="utf-8").splitlines())

    def test_non_mac_stops_before_cargo(self) -> None:
        self.env["TEST_OS"] = "Linux"
        result = self.run_script()
        self.assertEqual(2, result.returncode)
        self.assertIn("requires a macOS runner", result.stderr)
        self.assertFalse(self.capture.exists())

    def test_missing_signing_input_stops_before_cargo(self) -> None:
        del self.env["APPLE_PASSWORD"]
        result = self.run_script()
        self.assertEqual(2, result.returncode)
        self.assertIn("missing APPLE_PASSWORD", result.stderr)
        self.assertFalse(self.capture.exists())


if __name__ == "__main__":
    unittest.main()
