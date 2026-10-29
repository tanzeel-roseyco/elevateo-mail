"""Exercise log decoding through a real child process without a Docker socket."""
from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "be02"))
from docker_task import Task


class DockerTaskOutputTest(unittest.TestCase):
    def run_output(self, payload: bytes, status: int = 0) -> tuple[str, str]:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            executable = root / "docker"
            # AIDEV-NOTE: A fake CLI emits actual bytes so platform decoding and evidence redaction both execute.
            executable.write_text("#!" + sys.executable + "\nimport os\nos.write(1," + repr(payload)
                                  + ")\nraise SystemExit(" + str(status) + ")\n", encoding="utf-8")
            executable.chmod(0o700)
            task = Task(root, root, "fixture", "fixture", {"secret": "synthetic-secret-value-only"})
            with patch.dict(os.environ, {"PATH": folder + os.pathsep + os.environ.get("PATH", "")}):
                output = task.docker("output", ["version"], required=False)
            return output, (root / "001-output.log").read_text(encoding="utf-8")

    def test_utf8_is_preserved_and_credentials_are_redacted(self) -> None:
        output, evidence = self.run_output("\u2713 synthetic-secret-value-only\n".encode("utf-8"))
        self.assertIn("\u2713", output)
        self.assertIn("\u2713 [REDACTED]", evidence)
        self.assertNotIn("synthetic-secret-value-only", evidence)

    def test_invalid_utf8_does_not_discard_remaining_output(self) -> None:
        output, evidence = self.run_output(b"before\xffafter\n")
        self.assertEqual("before\ufffdafter\n", output)
        self.assertIn("before\ufffdafter", evidence)

    def test_failed_command_keeps_decoded_diagnostics(self) -> None:
        _, evidence = self.run_output("failure \u2713\n".encode("utf-8"), status=7)
        self.assertIn("failure \u2713", evidence)
        self.assertIn("exit=7", evidence)
