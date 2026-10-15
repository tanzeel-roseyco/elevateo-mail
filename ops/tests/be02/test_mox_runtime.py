"""Failure-path checks for the private Mox gate; run only in fleet Docker."""
from __future__ import annotations

import hashlib
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
