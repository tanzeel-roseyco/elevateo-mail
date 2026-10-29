"""Exercise release admission and the dry-run command plan without a Mac, credentials or a real
build/signing command. The signed path is stubbed; cargo stops the run at step `build`."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("macos-release.sh")

FULL_CREDENTIALS = {
    "APPLE_SIGNING_IDENTITY": "Developer ID Application: Synthetic admission fixture",
    "APPLE_TEAM_ID": "FIXTURE",
    "APPLE_ID": "synthetic@example.invalid",
    "APPLE_PASSWORD": "fixture-not-a-credential",
    "TAURI_SIGNING_PRIVATE_KEY": "fixture-not-a-key",
    "ELEVATEO_UPDATER_PUBKEY": "fixture-public-key",
}


class MacReleaseTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.capture = self.root / "build-inputs"
        # AIDEV-NOTE: cargo stops at admission; no bundle, keychain or external service is touched.
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
            "TEST_OS": "Darwin",
            "TEST_CAPTURE": str(self.capture),
            "ELEVATEO_WEB_ORIGIN": "https://mail.company.org",
        }

    def run_script(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["/bin/sh", str(SCRIPT), *args], env=self.env, capture_output=True, text=True, timeout=30, check=False)

    # Happy path: no credentials at all is an explicit, successful unsigned dry run.
    def test_no_credentials_is_an_unsigned_dry_run_that_passes(self) -> None:
        result = self.run_script()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("UNSIGNED DRY RUN", result.stdout)
        self.assertFalse(self.capture.exists())  # no build command ran

    # Failure path: some credentials but not all must stop before any build or signing.
    def test_partial_credentials_fail_with_the_missing_names(self) -> None:
        self.env["APPLE_SIGNING_IDENTITY"] = FULL_CREDENTIALS["APPLE_SIGNING_IDENTITY"]
        result = self.run_script()
        self.assertEqual(2, result.returncode)
        self.assertIn("partial credentials", result.stderr)
        self.assertIn("TAURI_SIGNING_PRIVATE_KEY", result.stderr)
        self.assertFalse(self.capture.exists())

    def test_partial_notarization_api_key_trio_fails(self) -> None:
        self.env.update(FULL_CREDENTIALS)
        del self.env["APPLE_ID"], self.env["APPLE_PASSWORD"]
        self.env["APPLE_API_KEY"] = "/tmp/fixture.p8"
        result = self.run_script()
        self.assertEqual(2, result.returncode)
        self.assertIn("missing APPLE_API_KEY_ID", result.stderr)

    # Full env in --dry-run prints the signed plan: codesign, then notarytool, then stapler.
    def test_full_env_dry_run_prints_codesign_notarytool_stapler_in_order(self) -> None:
        self.env.update(FULL_CREDENTIALS)
        result = self.run_script("--dry-run")
        self.assertEqual(0, result.returncode, result.stderr)
        codesign = result.stdout.index("codesign --verify")
        notarize = result.stdout.index("notarytool submit")
        staple = result.stdout.index("stapler staple")
        self.assertLess(codesign, notarize)
        self.assertLess(notarize, staple)
        # Credential values never appear in dry-run output; placeholders do.
        self.assertNotIn("fixture-not-a-credential", result.stdout)
        self.assertIn("$APPLE_PASSWORD", result.stdout)
        self.assertFalse(self.capture.exists())

    def test_signed_run_sets_launch_marker_and_locked_build(self) -> None:
        self.env.update(FULL_CREDENTIALS)
        for inherited in ("", "compile-only-fixture", "unsigned-candidate"):
            with self.subTest(inherited=inherited):
                self.env["ELEVATEO_NATIVE_ARTIFACT"] = inherited
                result = self.run_script()
                self.assertEqual(71, result.returncode, result.stderr)
                self.assertEqual([
                    "unsigned-candidate", "https://mail.company.org",
                    "tauri build --target universal-apple-darwin --bundles dmg,app -- --locked",
                ], self.capture.read_text(encoding="utf-8").splitlines())

    def test_non_mac_without_dry_run_stops_before_cargo(self) -> None:
        self.env.update(FULL_CREDENTIALS)
        self.env["TEST_OS"] = "Linux"
        result = self.run_script()
        self.assertEqual(2, result.returncode)
        self.assertIn("requires a macOS runner", result.stderr)
        self.assertFalse(self.capture.exists())

    # Regression (P15): a missing python3 used to skip validation and still report success.
    def test_missing_python3_fails_before_validation_or_build(self) -> None:
        self.env.update(FULL_CREDENTIALS)
        restricted = self.root / "no-python"
        restricted.mkdir()
        for directory in os.defpath.split(os.pathsep):
            if not directory or not os.path.isdir(directory):
                continue
            for name in os.listdir(directory):
                target = restricted / name
                if name.startswith("python") or target.exists():
                    continue
                target.symlink_to(Path(directory) / name)
        self.env["PATH"] = f"{self.root}:{restricted}"
        for args in ((), ("--dry-run",)):
            result = self.run_script(*args)
            self.assertEqual(2, result.returncode, result.stdout)
            self.assertIn("requires python3", result.stderr)
            self.assertNotIn("configuration validated", result.stdout)
            self.assertFalse(self.capture.exists())

    def test_arm64_arch_selects_the_aarch64_target(self) -> None:
        self.env.update(FULL_CREDENTIALS)
        result = self.run_script("--dry-run", "--arch", "arm64")
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("--target aarch64-apple-darwin", result.stdout)


if __name__ == "__main__":
    unittest.main()
