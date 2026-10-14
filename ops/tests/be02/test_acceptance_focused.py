"""Focused diagnostics bind a fresh fixture identity without weakening the full acceptance gate."""
from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import tempfile
import unittest

from acceptance_runtime import Acceptance, UNITS, add_arguments
from docker_task import Task


class FocusedAcceptanceTests(unittest.TestCase):
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
