"""Regression tests for apps/ios/signing-helpers.sh (review findings P12-1, P12-2). They run on
Linux with a stubbed `security` that records calls; no keychain, Xcode or credential is touched."""
import os
import plistlib
import subprocess
import tempfile
import unittest
from pathlib import Path

HELPERS = Path(__file__).with_name("signing-helpers.sh")

# Stub `security`: `list-keychains -d user` prints the current list from $STATE; with `-s` it
# replaces that list (or fails when $FAIL_SET is set). Every call is appended to $CALLS.
SECURITY_STUB = """#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS"
if [ "$1" = list-keychains ] && [ "$4" = "-s" ]; then
  [ -n "$FAIL_SET" ] && exit 1
  shift 4
  : > "$STATE"
  for k in "$@"; do printf '    "%s"\\n' "$k" >> "$STATE"; done
  exit 0
fi
if [ "$1" = list-keychains ]; then cat "$STATE"; exit 0; fi
exit 0
"""


class SigningHelpersTest(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        stub = self.root / "security"
        stub.write_text(SECURITY_STUB, encoding="utf-8")
        stub.chmod(0o700)
        self.state = self.root / "state"
        self.state.write_text('    "/Users/me/login.keychain-db"\n    "/Library/Org/team.keychain"\n', encoding="utf-8")
        self.env = {"PATH": f"{self.root}:{os.defpath}", "STATE": str(self.state), "CALLS": str(self.root / "calls")}

    def run_helpers(self, script: str, **extra: str) -> subprocess.CompletedProcess[str]:
        env = {**self.env, **extra}
        return subprocess.run(["bash", "-c", f'set -euo pipefail; source "{HELPERS}"; {script}'],
                              env=env, capture_output=True, text=True, timeout=30, check=False)

    def search_list(self) -> list[str]:
        return [line.strip().strip('"') for line in self.state.read_text(encoding="utf-8").splitlines() if line.strip()]

    # Happy path: the build keychain is added in front of, not instead of, the user's keychains,
    # and the original list comes back afterwards.
    def test_build_keychain_is_prepended_and_original_list_restored(self) -> None:
        saved = self.root / "saved"
        result = self.run_helpers(
            f'current_keychain_search_list > "{saved}"; prepend_build_keychain /tmp/build.keychain-db "{saved}"; '
            f'cp "{self.state}" "{self.root}/during"; restore_keychain_search_list "{saved}"')
        self.assertEqual(0, result.returncode, result.stderr)
        during = [line.strip().strip('"') for line in (self.root / "during").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(["/tmp/build.keychain-db", "/Users/me/login.keychain-db", "/Library/Org/team.keychain"], during)
        self.assertEqual(["/Users/me/login.keychain-db", "/Library/Org/team.keychain"], self.search_list())

    # Failure path: a restore that fails is reported and returns non-zero instead of being ignored.
    def test_failed_restore_is_reported(self) -> None:
        saved = self.root / "saved"
        saved.write_text("/Users/me/login.keychain-db\n", encoding="utf-8")
        result = self.run_helpers(f'restore_keychain_search_list "{saved}"', FAIL_SET="1")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("could not restore the original keychain search list", result.stderr)

    # Regression (P12-2): manual export maps the bundle id to the imported distribution profile.
    def test_export_options_map_bundle_to_profile(self) -> None:
        out = self.root / "ExportOptions.plist"
        result = self.run_helpers(f'write_export_options "{out}" TEAM123 co.elevateo.mail.ios 1234-ABCD')
        self.assertEqual(0, result.returncode, result.stderr)
        options = plistlib.loads(out.read_bytes())
        self.assertEqual("manual", options["signingStyle"])
        self.assertEqual("TEAM123", options["teamID"])
        self.assertEqual({"co.elevateo.mail.ios": "1234-ABCD"}, options["provisioningProfiles"])


if __name__ == "__main__":
    unittest.main()
