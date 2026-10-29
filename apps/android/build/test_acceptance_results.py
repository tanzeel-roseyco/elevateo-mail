"""Tests for the acceptance-result parser and the fixture-origin policy functions."""
import json
import tempfile
import unittest
from pathlib import Path

from acceptance_results import (
    CaseResult,
    dump_contains_text,
    focused_package,
    parse_case_lines,
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
    def test_finds_text_and_content_desc_case_insensitively(self):
        self.assertTrue(dump_contains_text(DUMP, "single sign-on"))
        self.assertTrue(dump_contains_text(DUMP, "OPEN NAVIGATION"))

    def test_absent_text_is_not_found(self):
        self.assertFalse(dump_contains_text(DUMP, "Compose"))

    def test_malformed_dump_raises(self):
        with self.assertRaises(ValueError):
            dump_contains_text("<hierarchy", "anything")


class FocusedPackageTest(unittest.TestCase):
    def test_extracts_resumed_package(self):
        self.assertEqual(focused_package(DUMPSYS), "com.elevateo.mail.qa")

    def test_missing_resumed_activity_raises(self):
        with self.assertRaises(ValueError):
            focused_package("nothing resumed here\n")

    def test_resumed_line_without_component_raises(self):
        with self.assertRaises(ValueError):
            focused_package("mResumedActivity: ActivityRecord{broken}\n")


class ResultsRecordTest(unittest.TestCase):
    def test_write_results_reports_summary_and_exit_code(self):
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

    def test_any_failure_yields_nonzero(self):
        cases = [CaseResult("offline", "FAIL", "no offline banner in dump")]
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(write_results(Path(directory) / "r.json", cases, {}), 1)

    def test_not_run_without_reason_is_rejected(self):
        with self.assertRaises(ValueError):
            CaseResult("keyboard", "NOT_RUN", "  ")

    def test_unknown_status_and_empty_record_are_rejected(self):
        with self.assertRaises(ValueError):
            CaseResult("x", "SKIPPED", "detail")
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                write_results(Path(directory) / "r.json", [], {})

    def test_parse_case_lines_round_trip_and_malformed_line(self):
        cases = parse_case_lines("install\tPASS\tok\n\nlaunch\tFAIL\tno sign-in\textra detail\n")
        self.assertEqual([case.name for case in cases], ["install", "launch"])
        self.assertEqual(cases[1].detail, "no sign-in\textra detail")
        with self.assertRaises(ValueError):
            parse_case_lines("only-two-fields\tPASS\n")


class FixtureOriginPolicyTest(unittest.TestCase):
    def test_only_the_exact_qa_host_and_port_connects(self):
        self.assertTrue(connect_target_allowed("elevateo.qa.internal:443"))
        self.assertTrue(connect_target_allowed("ELEVATEO.QA.INTERNAL:443"))

    def test_other_destinations_are_denied(self):
        for target in ("elevateo.qa.internal:80", "evil.example:443",
                       "sub.elevateo.qa.internal:443", "elevateo.qa.internal", ":443"):
            self.assertFalse(connect_target_allowed(target), target)

    def test_bootstrap_scenarios_and_unknown_scenario(self):
        self.assertIn("getSession=unauthenticated", bootstrap_html("unauthenticated"))
        self.assertIn("/dev-fixtures.html", bootstrap_html("authenticated"))
        self.assertNotIn("getSession", bootstrap_html("authenticated"))
        with self.assertRaises(ValueError):
            bootstrap_html("logged-out")

    def test_dist_paths_cannot_escape_the_bundle(self):
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


if __name__ == "__main__":
    unittest.main()
