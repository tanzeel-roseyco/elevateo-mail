"""Task-only browser privacy boundary regression without launching the application."""
from __future__ import annotations

import unittest

from acceptance_runtime import Acceptance


class FakeTask:
    def __init__(self, output: str = "0077 700 700 600") -> None:
        self.output = output
        self.commands: list[list[str]] = []
        self.receipts: list[tuple[str, dict[str, str]]] = []

    def docker(self, _phase: str, command: list[str], _seconds: int, *, quiet: bool) -> str:
        assert quiet
        self.commands.append(command)
        return self.output

    def write(self, name: str, value: dict[str, str]) -> None:
        self.receipts.append((name, value))


class PrivateOutputTest(unittest.TestCase):
    def acceptance(self, output: str) -> tuple[Acceptance, FakeTask]:
        task = FakeTask(output)
        acceptance = Acceptance.__new__(Acceptance)
        acceptance.task = task
        return acceptance, task

    def test_private_process_and_output_modes(self) -> None:
        acceptance, task = self.acceptance("0077 700 700 600\n")
        acceptance.private_output_preflight("owned-browser")
        command = task.commands[0]
        self.assertEqual(command[:6], ["container", "exec", "owned-browser", "sh", "-c",
                                       'umask 077; exec "$@"'])
        self.assertEqual(task.receipts[0][0], "acceptance-private-output-proof.json")
        self.assertEqual(task.receipts[0][1]["created_file_mode"], "0600")

    def test_rejects_public_output_directory(self) -> None:
        acceptance, task = self.acceptance("0077 755 700 600")
        with self.assertRaisesRegex(RuntimeError, "private output mode mismatch"):
            acceptance.private_output_preflight("owned-browser")
        self.assertEqual(task.receipts, [])

    def test_rejects_public_file_from_wrong_umask(self) -> None:
        acceptance, task = self.acceptance("0022 700 700 644")
        with self.assertRaisesRegex(RuntimeError, "private output mode mismatch"):
            acceptance.private_output_preflight("owned-browser")
        self.assertEqual(task.receipts, [])


if __name__ == "__main__":
    unittest.main()
