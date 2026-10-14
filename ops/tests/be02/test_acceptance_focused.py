"""Focused diagnostics bind a fresh fixture identity without weakening the full acceptance gate."""
from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import Mock

from acceptance_runtime import Acceptance, UNITS, add_arguments
from docker_task import Task


class FocusedAcceptanceTests(unittest.TestCase):
    def inventory(self, case_id: str | None, listed: str) -> tuple[Acceptance, Mock]:
        acceptance = Acceptance.__new__(Acceptance)
        acceptance.case_id = case_id
        task = Mock(spec=Task)
        task.docker.return_value = listed
        acceptance.task = task
        return acceptance, task

    def test_discovery_reporter_only_applies_to_listing(self) -> None:
        case_id = "SCN-DRAFT-003-P"
        acceptance, task = self.inventory(case_id,
            f"Listing tests:\n  draft-recovery.e2e.ts:14:1 › {case_id}\nTotal: 1 test in 1 file\n")
        command = ["node", "cli.js", "test", "--grep", case_id]
        acceptance.diagnostic_inventory("owned-browser", command)
        task.docker.assert_called_once_with("diagnostic-case-list", ["container", "exec", "owned-browser",
            *command, "--list", "--reporter=list"], 90)
        self.assertNotIn("--reporter=list", command)
        self.assertEqual(task.write.call_args.args[1]["cases"], [case_id])

    def test_discovery_rejects_suppressed_missing_extra_and_duplicate_cases(self) -> None:
        case_id = "SCN-DRAFT-003-P"
        for listed in ("Acceptance framework status: passed", "SCN-DRAFT-008-P",
                       f"{case_id}\n{case_id}", f"{case_id}\nSCN-AUTH-001-P"):
            with self.subTest(listed=listed):
                acceptance, task = self.inventory(case_id, listed)
                with self.assertRaisesRegex(RuntimeError, "diagnostic case inventory mismatch"):
                    acceptance.diagnostic_inventory("owned-browser", ["node", "cli.js", "test"])
                task.write.assert_not_called()

    def test_smoke_discovery_requires_all_four_unique_cases(self) -> None:
        cases = ["SCN-AUTH-001-P", "SCN-DRAFT-001-P", "SCN-GUI-006-P", "SCN-READ-002-P"]
        acceptance, task = self.inventory(None, "\n".join(cases))
        acceptance.diagnostic_inventory("owned-browser", ["node", "cli.js", "test"])
        self.assertEqual(task.write.call_args.args[1]["cases"], cases)
        task.write.reset_mock()
        task.docker.return_value = "\n".join(cases[:-1])
        with self.assertRaisesRegex(RuntimeError, "diagnostic case inventory mismatch"):
            acceptance.diagnostic_inventory("owned-browser", ["node", "cli.js", "test"])
        task.write.assert_not_called()

    def arguments(self, *extra: str) -> argparse.Namespace:
        parser = argparse.ArgumentParser()
        add_arguments(parser)
        return parser.parse_args(["--acceptance", "--acceptance-diagnostic", "--acceptance-lanes", "playwright",
            "--acceptance-browsers", "chromium", "--acceptance-dispatch-id", "focused-regression", *extra])

    def test_rejects_unbounded_or_ambiguous_selection_before_resource_access(self) -> None:
        for extra in (("--acceptance-case", ""), ("--acceptance-case", ".*"),
                      ("--acceptance-case", "SCN-DRAFT-003-P\n"),
                      ("--acceptance-case", "SCN-DRAFT-003-P", "--acceptance-browsers", "chromium,firefox"),
                      ("--acceptance-case", "SCN-DRAFT-003-P", "--acceptance-lanes", "puppeteer")):
            with self.subTest(extra=extra):
                task = Task(Path("/unavailable"), Path("/unavailable"), "uncreated", "default", {})
                with self.assertRaisesRegex(RuntimeError, "focused case requires"):
                    Acceptance(task, self.arguments(*extra))
                self.assertEqual(task.sequence, 0)
        args = self.arguments("--acceptance-case", "SCN-DRAFT-003-P")
        args.acceptance_diagnostic = False
        with self.assertRaisesRegex(RuntimeError, "focused case requires"):
            Acceptance(task, args)

    def test_fresh_case_identity_reaches_seed_environment_for_each_supported_engine(self) -> None:
        source = Path(__file__).resolve().parents[3]
        for engine in ("chromium", "firefox", "webkit"):
            with self.subTest(engine=engine), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                # AIDEV-NOTE: Constructor admission runs against owned immutable inputs; no Docker process is started.
                for name in (".dockerignore", "ops/acceptance/seccomp.json", "tests/acceptance/package-lock.json",
                             "ops/acceptance/browsers.Dockerfile", "ops/acceptance/web.Dockerfile", "apps/web/package-lock.json"):
                    destination = root / name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(source / name, destination)
                evidence = root / "evidence"
                evidence.mkdir()
                task = Task(root, evidence, "focused-fixture", "default", {})
                task.env_file.write_text("SYNTHETIC=only\n")
                acceptance = Acceptance(task, self.arguments("--acceptance-case", "SCN-DRAFT-003-P",
                    "--acceptance-browsers", engine))
                acceptance.environment(0)
                env = dict(line.split("=", 1) for line in task.env_file.read_text().splitlines())
                self.assertEqual(env["BE02_ACCEPTANCE_CASE_ID"], "SCN-DRAFT-003-P")
                self.assertEqual(env["BE02_ACCEPTANCE_RUN_ID"], "focused-fixture-0")
                self.assertEqual(env["BE02_ACCEPTANCE_BROWSER"], engine)
                self.assertEqual(acceptance.runs, [("playwright_real", engine)])
                self.assertTrue(acceptance.diagnostic)
                self.assertEqual(task.sequence, 0)

    def test_unit_inventory_includes_each_current_dependency_free_entrypoint_once(self) -> None:
        root = Path(__file__).resolve().parents[3] / "tests/acceptance"
        expected = [path.relative_to(root).as_posix().removesuffix(".ts")
                    for pattern in ("contracts/*.spec.ts", "proxy/*.spec.ts", "playwright/*.unit.spec.ts",
                                    "puppeteer/*.unit.spec.ts", "selenium/*.unit.spec.ts")
                    for path in root.glob(pattern)]
        self.assertEqual(sorted(UNITS), sorted(expected))


if __name__ == "__main__":
    unittest.main()
