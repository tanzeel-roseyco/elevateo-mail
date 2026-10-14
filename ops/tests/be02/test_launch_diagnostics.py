"""Synthetic subprocess regressions; never invoke Docker or an application."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from docker_task import Task


class LaunchDiagnosticsTest(unittest.TestCase):
    def exercise(self, result, *, diagnostic=True):
        with tempfile.TemporaryDirectory() as directory:
            evidence = Path(directory)
            task = Task(evidence, evidence, "synthetic", "synthetic", {"KEY": "synthetic-secret-value"})
            with patch("docker_task.subprocess.run") as run:
                if isinstance(result, Exception):
                    run.side_effect = result
                else:
                    run.return_value = result
                try:
                    task.docker("preflight", ["version"], 90, quiet=True,
                                diagnostic_stderr=diagnostic)
                except RuntimeError:
                    pass
                return (evidence / "001-preflight.log").read_text(), run.call_args.kwargs

    def test_failure_keeps_redacted_stderr_and_discards_stdout(self):
        result = subprocess.CompletedProcess([], 1, None,
            "namespace denied\nsynthetic-secret-value\nAuthorization: private\n")
        log, options = self.exercise(result)
        self.assertIn("namespace denied", log)
        self.assertIn("exit=1", log)
        self.assertNotIn("synthetic-secret-value", log)
        self.assertNotIn("Authorization: private", log)
        self.assertEqual(options["stdout"], subprocess.DEVNULL)
        self.assertEqual(options["stderr"], subprocess.PIPE)

    def test_timeout_preserves_bytes_stderr_without_stdout(self):
        error = subprocess.TimeoutExpired([], 90, output=b"private stdout",
            stderr=b"launch stalled\nsynthetic-secret-value\n\xff")
        log, _ = self.exercise(error)
        self.assertIn("launch stalled", log)
        self.assertIn("TIMEOUT; container cleanup required", log)
        self.assertNotIn("private stdout", log)
        self.assertNotIn("synthetic-secret-value", log)

    def test_empty_timeout_and_quiet_success(self):
        log, _ = self.exercise(subprocess.TimeoutExpired([], 90))
        self.assertIn("TIMEOUT", log)
        log, options = self.exercise(subprocess.CompletedProcess([], 0, None, None), diagnostic=False)
        self.assertIn("exit=0", log)
        self.assertEqual(options["stderr"], subprocess.DEVNULL)


if __name__ == "__main__":
    unittest.main()
