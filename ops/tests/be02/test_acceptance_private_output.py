"""Task-only browser privacy boundary regression without launching the application."""
from __future__ import annotations

import unittest
from pathlib import Path
import subprocess
import tempfile

from acceptance_runtime import Acceptance


class FakeTask:
    def __init__(self, rejected: bool = False) -> None:
        self.rejected = rejected
        self.commands: list[list[str]] = []
        self.receipts: list[tuple[str, dict[str, str]]] = []

    def docker(self, _phase: str, command: list[str], _seconds: int, *, quiet: bool) -> str:
        assert quiet
        self.commands.append(command)
        if self.rejected:
            raise RuntimeError("acceptance-exec failed")
        # AIDEV-NOTE: Task.docker quiet mode returns no stdout, including successful probe output.
        return ""

    def write(self, name: str, value: dict[str, str]) -> None:
        self.receipts.append((name, value))


class PrivateOutputTest(unittest.TestCase):
    def acceptance(self, rejected: bool = False) -> tuple[Acceptance, FakeTask]:
        task = FakeTask(rejected)
        acceptance = Acceptance.__new__(Acceptance)
        acceptance.task = task
        return acceptance, task

    def test_private_process_and_output_modes(self) -> None:
        acceptance, task = self.acceptance()
        acceptance.private_output_preflight("owned-browser")
        command = task.commands[0]
        self.assertEqual(command[:6], ["container", "exec", "owned-browser", "sh", "-c",
                                       'umask 077; exec "$@"'])
        self.assertEqual(task.receipts[0][0], "acceptance-private-output-proof.json")
        self.assertEqual(task.receipts[0][1]["created_file_mode"], "0600")

    def test_probe_failure_never_writes_pass_receipt(self) -> None:
        acceptance, task = self.acceptance(rejected=True)
        with self.assertRaisesRegex(RuntimeError, "acceptance-exec failed"):
            acceptance.private_output_preflight("owned-browser")
        self.assertEqual(task.receipts, [])

    def run_real_probe(self, root: Path, umask: str = "077") -> subprocess.CompletedProcess[str]:
        return subprocess.run(["sh", "-c", 'umask "$1"; shift; exec "$@"', "private-proof", umask, "node",
            "--input-type=module", "-e", Acceptance.private_output_program(), "--", str(root)],
            text=True, capture_output=True, check=False)

    def test_real_exclusive_private_file_creation(self) -> None:
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent) / "output"
            root.mkdir(mode=0o700)
            (root / "native-private").mkdir(mode=0o700)
            result = self.run_real_probe(root)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "0077 700 700 600")
            self.assertFalse((root / "native-private" / ".qa815-umask-proof").exists())

    def test_real_public_directories_or_wrong_umask_fail_and_remove_probe(self) -> None:
        for root_mode, private_mode, umask in ((0o755, 0o700, "077"), (0o700, 0o755, "077"),
                                                (0o700, 0o700, "022")):
            with self.subTest(root_mode=root_mode, private_mode=private_mode, umask=umask):
                with tempfile.TemporaryDirectory() as parent:
                    root = Path(parent) / "output"
                    root.mkdir(mode=0o700)
                    private = root / "native-private"
                    private.mkdir(mode=0o700)
                    root.chmod(root_mode)
                    private.chmod(private_mode)
                    result = self.run_real_probe(root, umask)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("Browser private output mode mismatch", result.stderr)
                    self.assertEqual(result.stdout, "")
                    self.assertFalse((private / ".qa815-umask-proof").exists())

    def test_real_existing_symlink_does_not_change_target(self) -> None:
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent) / "output"
            private = root / "native-private"
            root.mkdir(mode=0o700)
            private.mkdir(mode=0o700)
            target = Path(parent) / "existing-target"
            target.write_text("preserve")
            proof = private / ".qa815-umask-proof"
            proof.symlink_to(target)
            result = self.run_real_probe(root)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_text(), "preserve")
            self.assertTrue(proof.is_symlink())

    def test_real_dangling_symlink_does_not_create_target(self) -> None:
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent) / "output"
            private = root / "native-private"
            root.mkdir(mode=0o700)
            private.mkdir(mode=0o700)
            target = Path(parent) / "not-created"
            proof = private / ".qa815-umask-proof"
            proof.symlink_to(target)
            result = self.run_real_probe(root)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(target.exists())
            self.assertTrue(proof.is_symlink())


if __name__ == "__main__":
    unittest.main()
