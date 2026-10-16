"""Ownership, address and sequencing regressions for combined private mail attachment proof."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

import mox_attachment_runtime as runtime


class MoxAttachmentRuntimeTest(unittest.TestCase):
    def setUp(self) -> None:
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.items = [{"Config": {"Labels": {"com.docker.compose.project": "fixture",
                      "com.docker.compose.service": service}}, "NetworkSettings": {"Networks": {
                      "fixture_isolated": {"IPAddress": f"172.22.0.{index}"}}}}
                      for index, service in enumerate(sorted(runtime.SERVICES), 2)]
        self.task = SimpleNamespace(root=self.root, project="fixture", project_containers=Mock(return_value=self.items),
                                   secrets={"BE02_STORAGE_SERVICE": "synthetic-storage",
                                            "BE02_FIXTURE_SIGNING_SECRET": "synthetic-signing"})

    def test_only_inspected_private_services_are_mapped_readonly(self) -> None:
        mounts, env = runtime.prepare(self.task, self.root)
        self.assertEqual(mounts, [(self.root / "hosts", "/etc/hosts", True),
                                 (self.root / "ops/tests/be02", "/workspace/ops/tests/be02", True)])
        hosts = (self.root / "hosts").read_text().splitlines()
        self.assertEqual(hosts[0], "127.0.0.1 localhost")
        self.assertEqual(hosts[1:], [f"172.22.0.{index} {service}"
                                    for index, service in enumerate(sorted(runtime.SERVICES), 2)])
        self.assertEqual((self.root / "hosts").stat().st_mode & 0o7777, 0o600)
        self.assertEqual(env, self.task.secrets)
        self.assertNotIn("synthetic-storage", "\n".join(hosts))

    def test_missing_duplicate_and_foreign_services_fail_before_writing(self) -> None:
        for mode in ("missing", "duplicate", "foreign", "wrong-network"):
            with self.subTest(mode=mode):
                items = deepcopy(self.items)
                if mode == "missing":
                    items.pop()
                elif mode == "duplicate":
                    items.append(deepcopy(items[0]))
                elif mode == "foreign":
                    items[0]["Config"]["Labels"]["com.docker.compose.project"] = "someone-else"
                else:
                    items[0]["NetworkSettings"]["Networks"] = {"external": {"IPAddress": "172.22.0.2"}}
                self.task.project_containers.return_value = items
                with self.assertRaises((RuntimeError, KeyError)):
                    runtime.prepare(self.task, self.root)
                self.assertFalse((self.root / "hosts").exists())

    def test_unsafe_or_invalid_addresses_fail_before_writing(self) -> None:
        for address in ("8.8.8.8", "127.0.0.1", "0.0.0.0", "169.254.1.2", "::1", "bad\napi", ""):
            with self.subTest(address=address):
                items = deepcopy(self.items)
                items[0]["NetworkSettings"]["Networks"]["fixture_isolated"]["IPAddress"] = address
                self.task.project_containers.return_value = items
                with self.assertRaises((RuntimeError, ValueError)):
                    runtime.prepare(self.task, self.root)
                self.assertFalse((self.root / "hosts").exists())

    def test_unrelated_service_is_not_added_to_hosts(self) -> None:
        unrelated = deepcopy(self.items[0])
        unrelated["Config"]["Labels"]["com.docker.compose.service"] = "unrelated"
        self.items.append(unrelated)
        runtime.prepare(self.task, self.root)
        self.assertNotIn("unrelated", (self.root / "hosts").read_text())


if __name__ == "__main__":
    unittest.main()
