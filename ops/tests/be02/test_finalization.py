"""Docker-only stdlib fault injection for the runner's actual finalization path."""
from __future__ import annotations

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import run
from docker_task import Task


class FinalizationTest(unittest.TestCase):
    # AIDEV-NOTE: Use real private-file I/O and Task redaction; replace only external work and injected faults.
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.secret = "fixture-secret-for-redaction-only"
        self.task = Task(self.root, self.root, "fixture", "unused", {"SECRET": self.secret})
        self.task.env_file.write_text(self.secret, encoding="utf-8")
        self.snapshot = {"fixture": "unchanged"}
        self.cleanup = patch.object(run, "cleanup", return_value=True).start()
        self.compose = patch.object(self.task, "compose", return_value="").start()
        self.hashes = patch.object(run, "source_hashes", return_value=self.snapshot).start()
        self.addCleanup(patch.stopall)

    def finish(self, status: str = "PASSED", failure: str = "", armed: bool = True) -> tuple[str, str, bool]:
        output = io.StringIO()
        with redirect_stdout(output):
            result = run.finalize(self.task, False, armed, self.snapshot, status, failure)
        self.assertNotIn(self.secret, output.getvalue())
        self.assertNotIn(self.secret, result[1])
        for path in self.root.glob("*.json"):
            self.assertNotIn(self.secret, path.read_text(encoding="utf-8"))
        return result

    def result(self) -> dict[str, object]:
        return json.loads((self.root / "result.json").read_text(encoding="utf-8"))

    def test_success(self) -> None:
        self.assertEqual(self.finish(), ("PASSED", "", True))
        self.assertFalse(self.task.env_file.exists())
        self.cleanup.assert_called_once_with(self.task)
        self.assertTrue(self.task.cleanup_mode)
        self.assertEqual(self.result()["tests"], "PASSED")
        self.assertIs(self.result()["cleanup_passed"], True)

    def test_cleanup_raise_preserves_original_failure_and_unlinks(self) -> None:
        self.cleanup.side_effect = OSError("cleanup " + self.secret)
        status, failure, clean = self.finish("FAILED", "original assertion failed " + self.secret)
        self.assertEqual(status, "FAILED")
        self.assertFalse(clean)
        self.assertTrue(failure.startswith("original assertion failed [REDACTED]"))
        self.assertIn("cleanup failed: OSError", failure)
        self.assertFalse(self.task.env_file.exists())
        self.assertIs(self.result()["cleanup_passed"], False)
        self.assertEqual(self.result()["failure"], failure)
        self.hashes.assert_called_once_with(self.root, False)

    def test_cleanup_raise_turns_test_success_into_failure(self) -> None:
        self.cleanup.side_effect = OSError(self.secret)
        status, _, clean = self.finish()
        self.assertEqual(status, "FAILED")
        self.assertFalse(clean)
        self.assertFalse(self.task.env_file.exists())
        self.assertEqual(self.result()["tests"], "FAILED")

    def test_unlink_failure_fails_and_still_writes_result(self) -> None:
        with patch.object(Path, "unlink", side_effect=PermissionError(self.secret)) as unlink:
            status, failure, clean = self.finish()
        unlink.assert_called_once_with(missing_ok=True)
        self.assertEqual(status, "FAILED")
        self.assertFalse(clean)
        self.assertIn("environment removal failed: PermissionError", failure)
        self.assertTrue(self.task.env_file.exists())
        self.assertIs(self.result()["cleanup_passed"], False)
        self.assertEqual(self.result()["tests"], "FAILED")

    def test_diagnostic_write_failure_cannot_skip_cleanup_or_result(self) -> None:
        self.compose.side_effect = RuntimeError(self.secret)
        write = self.task.write

        def fail_diagnostic(name: str, data: object) -> None:
            if name == "service-log-capture-error.json":
                raise OSError(self.secret)
            write(name, data)

        with patch.object(self.task, "write", side_effect=fail_diagnostic):
            status, failure, clean = self.finish("FAILED", "original assertion failed")
        self.assertEqual(status, "FAILED")
        self.assertTrue(clean)
        self.assertTrue(failure.startswith("original assertion failed;"))
        self.assertIn("service log diagnostic write failed: OSError", failure)
        self.cleanup.assert_called_once_with(self.task)
        self.assertFalse(self.task.env_file.exists())
        self.assertEqual(self.result()["failure"], failure)

    def test_source_evidence_write_failure_still_attempts_result(self) -> None:
        write = self.task.write

        def fail_source(name: str, data: object) -> None:
            if name == "source.after.sha256.json":
                raise OSError(self.secret)
            write(name, data)

        with patch.object(self.task, "write", side_effect=fail_source):
            status, failure, clean = self.finish()
        self.assertEqual(status, "FAILED")
        self.assertTrue(clean)
        self.assertIn("source verification failed: OSError", failure)
        self.assertFalse(self.task.env_file.exists())
        self.assertEqual(self.result()["tests"], "FAILED")

    def test_result_write_failure_fails_without_printing_exception(self) -> None:
        with patch.object(self.task, "write", side_effect=OSError(self.secret)) as write:
            status, failure, clean = self.finish()
        self.assertEqual(status, "FAILED")
        self.assertTrue(clean)
        self.assertIn("result evidence write failed", failure)
        self.assertFalse(self.task.env_file.exists())
        self.assertEqual([call.args[0] for call in write.call_args_list],
                         ["source.after.sha256.json", "result.json"])

    def test_only_result_write_failure_changes_success_to_failure(self) -> None:
        # AIDEV-NOTE: Let source evidence succeed so its failure cannot mask the result-only FAILED transition.
        original_write = self.task.write

        def fail_result(name: str, data: object) -> None:
            if name == "result.json":
                raise OSError(self.secret)
            original_write(name, data)

        with patch.object(self.task, "write", side_effect=fail_result):
            status, failure, clean = self.finish()
        self.assertEqual(status, "FAILED")
        self.assertEqual(failure, "result evidence write failed")
        self.assertTrue(clean)
        self.assertEqual(json.loads((self.root / "source.after.sha256.json").read_text()), self.snapshot)
        self.assertFalse((self.root / "result.json").exists())
        self.assertFalse(self.task.env_file.exists())
        self.cleanup.assert_called_once_with(self.task)

    def test_cleanup_false_cannot_pass_overall(self) -> None:
        self.cleanup.return_value = False
        status, _, clean = self.finish()
        self.assertFalse(status == "PASSED" and clean)
        self.assertIs(self.result()["cleanup_passed"], False)
        self.assertFalse(self.task.env_file.exists())

    def test_unarmed_still_unlinks(self) -> None:
        self.assertEqual(self.finish(armed=False), ("PASSED", "", True))
        self.cleanup.assert_not_called()
        self.assertFalse(self.task.env_file.exists())


if __name__ == "__main__":
    unittest.main()
