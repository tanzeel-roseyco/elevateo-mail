"""Failure-path checks for the private Mox gate; run only in fleet Docker."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import mox_runtime


class MoxRuntimeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.task = SimpleNamespace(root=root, evidence=root, project="be02-synthetic", image="test:server",
                                    deadline=100.0, redact=lambda value: value.replace("private-value", "[redacted]"),
                                    docker=Mock(return_value=""), inspect=Mock(), write=Mock())

    def fixture(self) -> mox_runtime.WorkerFixture:
        fixture = mox_runtime.WorkerFixture(self.task)
        fixture.out.mkdir()
        fixture.env.write_text("private-value")
        (fixture.out / "fixture-credentials.json").write_text("private-value")
        return fixture

    def assert_private_files_removed(self, fixture: mox_runtime.WorkerFixture) -> None:
        self.assertFalse(fixture.env.exists())
        self.assertFalse((fixture.out / "fixture-credentials.json").exists())

    def test_binary_mismatch_fails_before_docker(self) -> None:
        binary = self.task.root / "mox"
        binary.write_bytes(b"wrong artifact")
        with patch.object(mox_runtime, "MOX", binary), self.assertRaisesRegex(RuntimeError, "reviewed binary"):
            mox_runtime.preflight(self.task)
        self.task.inspect.assert_not_called()
        self.task.docker.assert_not_called()

    def test_binary_match_checks_pinned_image(self) -> None:
        binary = self.task.root / "mox"
        binary.write_bytes(b"fixture artifact")
        with patch.object(mox_runtime, "MOX", binary), patch.object(
                mox_runtime, "MOX_SHA256", hashlib.sha256(binary.read_bytes()).hexdigest()):
            mox_runtime.preflight(self.task)
        self.task.inspect.assert_called_once_with("image", [mox_runtime.PYTHON])

    def test_client_stages_run_in_order_and_stop_on_either_suite_failure(self) -> None:
        fixture = mox_runtime.WorkerFixture(self.task)
        self.task.inspect.return_value = [{"Id": "sha256:owned"}]
        fixture.create(fixture.client, self.task.image, [], [])
        command = self.task.docker.call_args.args[1][-1]
        bundle = self.task.root / "bundle"
        bundle.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\n'
                          'case "$*" in *"$FAIL_STAGE"*) exit 9;; esac\nexit 0\n')
        bundle.chmod(0o700)
        calls = self.task.root / "calls"
        for fail, count, status in (("app_compatibility.rb", 1, 9),
                                     ("worker_composition.rb", 2, 9), ("never-match", 3, 0)):
            with self.subTest(fail=fail):
                calls.unlink(missing_ok=True)
                result = subprocess.run(["bash", "-c", command], check=False, capture_output=True,
                    env={**os.environ, "PATH": str(self.task.root) + os.pathsep + os.environ["PATH"],
                         "CALLS": str(calls), "FAIL_STAGE": fail}, timeout=5)
                stages = calls.read_text().splitlines()
                self.assertEqual(result.returncode, status)
                self.assertEqual(len(stages), count)
                self.assertEqual(stages[0], "exec ruby /mailserver/tests/app_compatibility.rb")
                if count > 1:
                    self.assertEqual(stages[1], "exec ruby /mailserver/tests/worker_composition.rb")
                if count > 2:
                    self.assertTrue(stages[2].startswith("exec rubocop --lint "))
                    self.assertIn("/mailserver/tests/app_compatibility.rb", stages[2])
                    self.assertIn("/mailserver/tests/inbound_rejection_proof.rb", stages[2])

    def test_attachment_stage_stops_before_lint_on_failure(self) -> None:
        fixture = mox_runtime.WorkerFixture(self.task, attachments=True)
        self.task.inspect.return_value = [{"Id": "sha256:owned"}]
        fixture.create(fixture.client, self.task.image, [], [])
        command = self.task.docker.call_args.args[1][-1]
        bundle = self.task.root / "bundle"
        bundle.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\n'
                          'case "$*" in *"$FAIL_STAGE"*) exit 9;; esac\nexit 0\n')
        bundle.chmod(0o700)
        calls = self.task.root / "calls"
        for fail, count, status in (("app_compatibility.rb", 1, 9), ("worker_composition.rb", 2, 9),
                                     ("attachment_ingress.rb", 3, 9), ("never-match", 4, 0)):
            with self.subTest(fail=fail):
                calls.unlink(missing_ok=True)
                result = subprocess.run(["bash", "-c", command], check=False, capture_output=True,
                    env={**os.environ, "PATH": str(self.task.root) + os.pathsep + os.environ["PATH"],
                         "CALLS": str(calls), "FAIL_STAGE": fail}, timeout=5)
                stages = calls.read_text().splitlines()
                self.assertEqual(result.returncode, status)
                self.assertEqual(len(stages), count)
                if count > 2:
                    self.assertEqual(stages[2], "exec ruby /mailserver/tests/attachment_ingress.rb")
                if count > 3:
                    self.assertTrue(stages[3].startswith("exec rubocop --lint "))
                    for target in ("attachment_ingress.rb", "attachment_support.rb", "attachment_http_test.rb"):
                        self.assertIn(target, stages[3])

    def test_run_propagates_attachment_mode_and_cleans(self) -> None:
        with patch.object(mox_runtime, "WorkerFixture") as constructor:
            mox_runtime.run(self.task, attachments=True)
            constructor.assert_called_once_with(self.task, attachments=True)
            constructor.return_value.cleanup.assert_called_once_with()

    def test_prepare_failure_cleans_the_actual_partially_started_fixture(self) -> None:
        fixture = mox_runtime.WorkerFixture(self.task, attachments=True)
        self.task.secrets = {key: "synthetic" for key in (
            "POSTGRES_PASSWORD", "MIGRATOR_DB_PASSWORD", "API_DB_PASSWORD", "WORKER_DB_PASSWORD")}
        self.task.project_containers = Mock(return_value=[{"Config": {"Labels": {
            "com.docker.compose.service": "db"}}, "NetworkSettings": {"Networks": {
            self.task.project + "_isolated": {"IPAddress": "172.22.0.2"}}}}])
        def inspect(kind: str, names: list[str]) -> list[dict[str, object]]:
            if kind == "network":
                return [{"Internal": True}]
            if kind == "image":
                return [{"Id": "sha256:owned"}]
            image, mounts = fixture.expected[fixture.server]
            return [{"Image": image, "Config": {"Labels": {"elevateo.mail1018.project": self.task.project}},
                     "Mounts": [{"Type": "bind", "Source": src, "Destination": dst, "RW": rw}
                                for src, dst, rw in mounts]}]
        def docker(stage: str, *args: object, **kwargs: object) -> str:
            if stage == "mox-start":
                (fixture.out / "ready").write_text("ready")
                (fixture.out / "fixture-credentials.json").write_text(json.dumps({
                    address: "synthetic-password" for address in (
                        "outreach000@send.test", "seed000@seed.test", "seed001@seed.test")}))
            return fixture.server if stage == "mox-owned-names" else ""
        self.task.inspect.side_effect = inspect
        self.task.docker.side_effect = docker
        with patch.object(mox_runtime, "WorkerFixture", return_value=fixture):
            with self.assertRaisesRegex(RuntimeError, "attachment fixture services missing"):
                mox_runtime.run(self.task, attachments=True)
        self.assertIn("mox-remove", [call.args[0] for call in self.task.docker.call_args_list])
        self.assertEqual(set(fixture.expected), {fixture.server})
        self.assertTrue(self.task.write.call_args.args[1]["passed"])
        self.assert_private_files_removed(fixture)
        self.assertEqual(self.task.deadline, 100)

    def test_external_network_is_rejected_before_container_creation(self) -> None:
        self.task.inspect.return_value = [{"Internal": False}]
        with self.assertRaisesRegex(RuntimeError, "internal fixture network"):
            mox_runtime.WorkerFixture(self.task).run()
        self.task.docker.assert_not_called()

    def test_success_always_cleans_and_restores_deadline(self) -> None:
        with patch.object(mox_runtime, "WorkerFixture") as constructor:
            constructor.return_value.cleanup.side_effect = lambda: self.assertGreater(self.task.deadline, 100)
            mox_runtime.run(self.task)
            constructor.return_value.run.assert_called_once_with()
            constructor.return_value.cleanup.assert_called_once_with()
        self.assertEqual(self.task.deadline, 100)

    def test_failure_preserves_redacted_primary_and_cleanup_errors(self) -> None:
        with patch.object(mox_runtime, "WorkerFixture") as constructor:
            constructor.return_value.run.side_effect = RuntimeError("private-value run failed")
            constructor.return_value.cleanup.side_effect = RuntimeError("private-value cleanup failed")
            with self.assertRaisesRegex(RuntimeError, r"\[redacted\] run failed.*\[redacted\] cleanup failed"):
                mox_runtime.run(self.task)
            constructor.return_value.cleanup.assert_called_once_with()
        self.assertEqual(self.task.deadline, 100)

    def test_inventory_failure_still_removes_private_files(self) -> None:
        fixture = self.fixture()
        self.task.docker.side_effect = RuntimeError("daemon unavailable")
        with self.assertRaisesRegex(RuntimeError, "cleanup incomplete"):
            fixture.cleanup()
        self.assert_private_files_removed(fixture)
        self.assertFalse(self.task.write.call_args.args[1]["passed"])

    def owned_container(self, fixture: mox_runtime.WorkerFixture) -> dict[str, object]:
        return {"Image": "sha256:owned", "Config": {"Labels": {"elevateo.mail1018.project": self.task.project}},
                "Mounts": [{"Type": "bind", "Source": str(fixture.root), "Destination": "/mailserver", "RW": False}]}

    def test_cleanup_refuses_changed_identity_or_mounts(self) -> None:
        fixture = self.fixture()
        fixture.expected[fixture.server] = "sha256:owned", {(str(fixture.root), "/mailserver", False)}
        for field in ("image", "label", "mount", "volume"):
            with self.subTest(field=field):
                self.task.docker.reset_mock()
                self.task.docker.side_effect = lambda name, *args, **kwargs: fixture.server if name == "mox-owned-names" else ""
                item = self.owned_container(fixture)
                if field == "image":
                    item["Image"] = "sha256:foreign"
                elif field == "label":
                    item["Config"] = {"Labels": {"elevateo.mail1018.project": "foreign"}}
                elif field == "mount":
                    item["Mounts"] = []
                else:
                    item["Mounts"].append({"Type": "volume"})
                self.task.inspect.return_value = [item]
                with self.assertRaisesRegex(RuntimeError, "cleanup incomplete"):
                    fixture.cleanup()
                self.assertNotIn("mox-remove", [call.args[0] for call in self.task.docker.call_args_list])
        self.assert_private_files_removed(fixture)

    def test_cleanup_removes_only_exact_owned_names(self) -> None:
        fixture = self.fixture()
        for name in (fixture.server, fixture.client):
            fixture.expected[name] = "sha256:owned", {(str(fixture.root), "/mailserver", False)}
        self.task.inspect.return_value = [self.owned_container(fixture)]
        # AIDEV-NOTE: An unrelated container in the same daemon must remain untouched.
        self.task.docker.side_effect = lambda name, *args, **kwargs: (
            "\n".join((fixture.server, fixture.client, "shared-database")) if name == "mox-owned-names" else "")
        fixture.cleanup()
        removals = [call.args[1] for call in self.task.docker.call_args_list if call.args[0] == "mox-remove"]
        self.assertEqual(removals, [["rm", "-f", fixture.client], ["rm", "-f", fixture.server]])
        self.assert_private_files_removed(fixture)
        self.assertTrue(self.task.write.call_args.args[1]["passed"])


if __name__ == "__main__":
    unittest.main()
