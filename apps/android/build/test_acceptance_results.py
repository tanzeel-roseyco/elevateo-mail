"""Tests for the acceptance-result parser and the fixture-origin policy functions."""
import json
import tempfile
import unittest
from pathlib import Path

import os
import subprocess

from acceptance_results import (
    CaseResult,
    classify_external_link,
    dump_contains_text,
    focused_package,
    parse_case_lines,
    signed_in_view,
    write_results,
)
from fixture_origin import bootstrap_html, connect_target_allowed, resolve_dist_path

DUMP = (
    '<?xml version="1.0"?><hierarchy rotation="0">'
    '<node text="" content-desc=""><node text="Continue with single sign-on" content-desc="" />'
    '<node text="" content-desc="Open navigation" /></node></hierarchy>'
)
DUMPSYS = (
    "  ResumedActivity: ActivityRecord{1a2b u0 com.elevateo.mail.qa/.MainActivity t42}\n"
    "  mResumedActivity: ActivityRecord{1a2b u0 com.elevateo.mail.qa/.MainActivity t42}\n"
)


class DumpTextTest(unittest.TestCase):
    def test_finds_text_and_content_desc_case_insensitively(self) -> None:
        self.assertTrue(dump_contains_text(DUMP, "single sign-on"))
        self.assertTrue(dump_contains_text(DUMP, "OPEN NAVIGATION"))

    def test_absent_text_is_not_found(self) -> None:
        self.assertFalse(dump_contains_text(DUMP, "Compose"))

    def test_malformed_dump_raises(self) -> None:
        with self.assertRaises(ValueError):
            dump_contains_text("<hierarchy", "anything")


class FocusedPackageTest(unittest.TestCase):
    def test_extracts_resumed_package(self) -> None:
        self.assertEqual(focused_package(DUMPSYS), "com.elevateo.mail.qa")

    def test_missing_resumed_activity_raises(self) -> None:
        with self.assertRaises(ValueError):
            focused_package("nothing resumed here\n")

    def test_resumed_line_without_component_raises(self) -> None:
        with self.assertRaises(ValueError):
            focused_package("mResumedActivity: ActivityRecord{broken}\n")


class ResultsRecordTest(unittest.TestCase):
    def test_write_results_reports_summary_and_exit_code(self) -> None:
        cases = [
            CaseResult("install", "PASS", "adb install succeeded"),
            CaseResult("upgrade", "NOT_RUN", "needs a signed release candidate"),
        ]
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / "results.json"
            self.assertEqual(write_results(out, cases, {"apk_sha256": "abc"}), 0)
            record = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(record["summary"], {"PASS": 1, "FAIL": 0, "NOT_RUN": 1})
        self.assertEqual(record["metadata"]["apk_sha256"], "abc")
        self.assertEqual(record["cases"][1]["detail"], "needs a signed release candidate")

    def test_any_failure_yields_nonzero(self) -> None:
        cases = [CaseResult("offline", "FAIL", "no offline banner in dump")]
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(write_results(Path(directory) / "r.json", cases, {}), 1)

    def test_not_run_without_reason_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            CaseResult("keyboard", "NOT_RUN", "  ")

    def test_unknown_status_and_empty_record_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            CaseResult("x", "SKIPPED", "detail")
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                write_results(Path(directory) / "r.json", [], {})

    def test_parse_case_lines_round_trip_and_malformed_line(self) -> None:
        cases = parse_case_lines("install\tPASS\tok\n\nlaunch\tFAIL\tno sign-in\textra detail\n")
        self.assertEqual([case.name for case in cases], ["install", "launch"])
        self.assertEqual(cases[1].detail, "no sign-in\textra detail")
        with self.assertRaises(ValueError):
            parse_case_lines("only-two-fields\tPASS\n")


class FixtureOriginPolicyTest(unittest.TestCase):
    def test_only_the_exact_qa_host_and_port_connects(self) -> None:
        self.assertTrue(connect_target_allowed("elevateo.qa.internal:443"))
        self.assertTrue(connect_target_allowed("ELEVATEO.QA.INTERNAL:443"))

    def test_other_destinations_are_denied(self) -> None:
        for target in ("elevateo.qa.internal:80", "evil.example:443",
                       "sub.elevateo.qa.internal:443", "elevateo.qa.internal", ":443"):
            self.assertFalse(connect_target_allowed(target), target)

    def test_bootstrap_scenarios_and_unknown_scenario(self) -> None:
        self.assertIn("getSession=unauthenticated", bootstrap_html("unauthenticated"))
        self.assertIn("/dev-fixtures.html", bootstrap_html("authenticated"))
        self.assertNotIn("getSession", bootstrap_html("authenticated"))
        with self.assertRaises(ValueError):
            bootstrap_html("logged-out")

    def test_dist_paths_cannot_escape_the_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            dist = Path(directory) / "dist"
            dist.mkdir()
            (dist / "dev-fixtures.html").write_text("<!doctype html>", encoding="utf-8")
            (Path(directory) / "secret.txt").write_text("outside", encoding="utf-8")
            inside = resolve_dist_path(dist, "/dev-fixtures.html?cache=1")
            self.assertEqual(inside, (dist / "dev-fixtures.html").resolve())
            self.assertIsNone(resolve_dist_path(dist, "/../secret.txt"))
            self.assertIsNone(resolve_dist_path(dist, "/missing.js"))
            self.assertIsNone(resolve_dist_path(dist, "/"))



def _dump(*labels: str) -> str:
    nodes = "".join(f'<node text="{label}" content-desc="" />' for label in labels)
    return f'<?xml version="1.0"?><hierarchy rotation="0"><node text="" content-desc="">{nodes}</node></hierarchy>'


class SignedInViewTest(unittest.TestCase):
    def test_signed_in_shell_is_recognised(self) -> None:
        self.assertTrue(signed_in_view(_dump("Development fixtures", "Open navigation", "Account menu")))

    # Regression (P02-3): the fixture notice alone, or the sign-in screen, is not an authenticated view.
    def test_notice_only_or_sign_in_view_fails(self) -> None:
        self.assertFalse(signed_in_view(_dump("Development fixtures")))
        self.assertFalse(signed_in_view(_dump("Development fixtures", "Continue with single sign-on")))
        self.assertFalse(signed_in_view(_dump("Open navigation", "Account menu", "Continue with single sign-on")))


class ExternalLinkTest(unittest.TestCase):
    def test_link_resolved_elsewhere_passes(self) -> None:
        status, detail = classify_external_link(True, "com.elevateo.mail.qa", "com.android.chrome")
        self.assertEqual("PASS", status)
        self.assertIn("com.android.chrome", detail)

    # Regression (P02-2): a failed launch or unknown focus never produces PASS.
    def test_missing_evidence_is_not_run(self) -> None:
        self.assertEqual("NOT_RUN", classify_external_link(False, "com.elevateo.mail.qa", "com.android.chrome")[0])
        self.assertEqual("NOT_RUN", classify_external_link(True, "com.elevateo.mail.qa", None)[0])

    def test_captured_link_fails(self) -> None:
        self.assertEqual("FAIL", classify_external_link(True, "com.elevateo.mail.qa", "com.elevateo.mail.qa")[0])


SIGNING = Path(__file__).with_name("release-signing.sh")


class ReleaseSigningTest(unittest.TestCase):
    """Regression (P01-1): keystore material never outlives sign_release_apk, on any exit path."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.tools = self.root / "tools"
        self.tools.mkdir()
        self.tmp = self.root / "tmp"
        self.tmp.mkdir()
        self.apk = self.root / "artifacts" / "app.apk"
        self.apk.parent.mkdir()
        self.apk.write_bytes(b"apk")

    def run_signing(self, keystore_b64: str, apksigner_exit: int) -> subprocess.CompletedProcess[str]:
        stub = self.tools / "apksigner"
        # Records the keystore's mode and location so the test can check them after cleanup.
        stub.write_text(f'#!/bin/sh\nstat -c %a "$3" > "{self.root}/mode"\necho "$3" > "{self.root}/where"\nexit {apksigner_exit}\n',
                        encoding="utf-8")
        stub.chmod(0o700)
        env = {
            "PATH": os.defpath, "TMPDIR": str(self.tmp),
            "ELEVATEO_ANDROID_KEYSTORE_BASE64": keystore_b64, "ELEVATEO_ANDROID_KEYSTORE_PASSWORD": "pw",
            "ELEVATEO_ANDROID_KEY_ALIAS": "alias", "ELEVATEO_ANDROID_KEY_PASSWORD": "pw",
        }
        return subprocess.run(["bash", "-c", f'source "{SIGNING}"; sign_release_apk "{self.apk}" "{self.tools}"'],
                              env=env, capture_output=True, text=True, timeout=30, check=False)

    def assert_no_key_material(self) -> None:
        self.assertEqual([], list(self.tmp.iterdir()), "private signing dir must be removed")
        self.assertEqual(["app.apk"], [p.name for p in self.apk.parent.iterdir()])

    def test_successful_signing_uses_a_private_keystore_and_removes_it(self) -> None:
        result = self.run_signing("a2V5c3RvcmU=", 0)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual("600", (self.root / "mode").read_text(encoding="utf-8").strip())
        self.assertTrue((self.root / "where").read_text(encoding="utf-8").startswith(str(self.tmp)))
        self.assert_no_key_material()

    def test_apksigner_failure_still_removes_the_keystore(self) -> None:
        result = self.run_signing("a2V5c3RvcmU=", 1)
        self.assertNotEqual(0, result.returncode)
        self.assert_no_key_material()

    def test_invalid_base64_still_removes_the_keystore(self) -> None:
        result = self.run_signing("%%%not-base64%%%", 0)
        self.assertNotEqual(0, result.returncode)
        self.assert_no_key_material()


if __name__ == "__main__":
    unittest.main()
