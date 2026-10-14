"""Fleet Docker regression: orchestration admission and actual shell suite discovery."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest
from unittest.mock import Mock
from run import bootstrap_database_roles


class SendRunnerTest(unittest.TestCase):
    def test_bootstrap_order_and_fail_closed(self) -> None:
        task = Mock()
        bootstrap_database_roles(task)
        self.assertEqual([call.args for call in task.compose.call_args_list], [
            ("bootstrap", ["run", "--rm", "--no-deps", "bootstrap", "-f", "/ops/bootstrap.sql"], 45),
            ("bootstrap-send", ["run", "--rm", "--no-deps", "bootstrap", "-f", "/ops/bootstrap-send.sql"], 45)])
        task = Mock()
        task.compose.side_effect = RuntimeError("base rejected")
        with self.assertRaises(RuntimeError):
            bootstrap_database_roles(task)
        self.assertEqual(task.compose.call_count, 1)
        task = Mock()
        task.compose.side_effect = [None, RuntimeError("send rejected")]
        with self.assertRaises(RuntimeError):
            bootstrap_database_roles(task)

    def run_suites(self, missing: bool = False, failed: bool = False) -> tuple[int, list[str]]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            required = "session_database auth_entry auth_client auth_revocations session_lifecycle mailbox_reads thread_database thread_reads adv807_refresh_process".split()
            names = ["test/be_02/" + name + "_test.rb" for name in required]
            names += ["test/requests/drafts_test.rb"]
            names += ["test/sends/" + name + "_test.rb" for name in
                      ("approval_database", "schema_database", "approval_faults_database", "approval_races_database", "send_api_reads")]
            for name in names:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.touch()
            if missing:
                (root / "test/sends/schema_database_test.rb").unlink()
            binary = root / "bin"
            binary.mkdir()
            bundle = binary / "bundle"
            bundle.write_text('#!/bin/bash\nprintf "%s\\n" "$*" >> "$CALL_LOG"\n[[ "$*" != "$FAIL_COMMAND" ]]\n')
            bundle.chmod(0o700)
            log = root / "calls"
            env = {**os.environ, "PATH": str(binary) + ":" + os.environ["PATH"],
                   "CALL_LOG": str(log), "FAIL_COMMAND": "exec ruby test/sends/approval_database_test.rb" if failed else "none"}
            result = subprocess.run(["bash", str(Path(__file__).with_name("test-suites.sh"))],
                                    cwd=root, env=env, capture_output=True, text=True, timeout=20)
            return result.returncode, log.read_text().splitlines() if log.exists() else []

    def test_new_suites_admitted_with_existing_suites(self) -> None:
        code, calls = self.run_suites()
        self.assertEqual(code, 0)
        self.assertIn("exec ruby test/requests/drafts_test.rb", calls)
        self.assertIn("exec ruby test/sends/send_api_reads_test.rb", calls)
        self.assertEqual(sum("exec ruby test/sends/" in call for call in calls), 5)

    def test_missing_send_suite_rejects_before_execution(self) -> None:
        self.assertEqual(self.run_suites(missing=True), (1, []))

    def test_send_failure_cannot_be_hidden_by_later_success(self) -> None:
        code, calls = self.run_suites(failed=True)
        self.assertEqual(code, 1)
        self.assertIn("exec ruby test/sends/schema_database_test.rb", calls)
        self.assertIn("exec steep check", calls)


if __name__ == "__main__":
    unittest.main()
