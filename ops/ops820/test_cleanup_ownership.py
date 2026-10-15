"""No Docker mutation: exercise the exact mount/volume admission before drill cleanup."""
from __future__ import annotations

import copy
from pathlib import Path
import unittest
from unittest.mock import patch

import cleanup_ownership as ownership


class CleanupOwnershipTest(unittest.TestCase):
    def setUp(self) -> None:
        self.project = "ops820-source-123-456"
        self.root = Path("/tmp/owned-source")
        self.volumes = [{"Name": f"{self.project}_{name}", "Driver": "local", "Options": None,
                         "Labels": {ownership.PROJECT_LABEL: self.project,
                                    "com.docker.compose.volume": name}}
                        for name in sorted(ownership.VOLUMES)]
        self.container = {"Config": {"Labels": {ownership.PROJECT_LABEL: self.project}}, "Mounts": [
            {"Type": "bind", "Source": str(self.root / "ops/supabase/db/99-jwt.sql"),
             "Destination": "/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql", "RW": False},
            {"Type": "volume", "Name": f"{self.project}_db-data", "RW": True,
             "Destination": "/var/lib/postgresql/data"},
        ]}

    def test_owned_and_empty_partial_startup(self) -> None:
        ownership.validate(self.project, self.root, [self.container], self.volumes)
        ownership.validate(self.project, self.root, [], [])
        ownership.validate("ops402-restore-123-456", self.root, [], [])

    def test_persistent_project_denied(self) -> None:
        for project in ("elevateo-mail-test", "elevateo-mail-live", "ops820-source-123-456-extra", ""):
            with self.subTest(project=project), self.assertRaises(ValueError):
                ownership.validate(project, self.root, [], [])

    def test_mount_changes_denied(self) -> None:
        changes = [(0, "Source", "/home/tanzeel/persistent.sql"), (0, "RW", True),
                   (0, "Destination", "/etc/other"), (0, "Type", "tmpfs"),
                   (1, "Name", "live_db-data"), (1, "Destination", "/shared")]
        for index, key, value in changes:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                container = copy.deepcopy(self.container)
                container["Mounts"][index][key] = value
                ownership.validate(self.project, self.root, [container], self.volumes)

    def test_symlink_and_foreign_container_denied(self) -> None:
        with patch.object(Path, "is_symlink", return_value=True), self.assertRaises(ValueError):
            ownership.validate(self.project, self.root, [self.container], self.volumes)
        self.container["Config"]["Labels"][ownership.PROJECT_LABEL] = "foreign"
        with self.assertRaises(ValueError):
            ownership.validate(self.project, self.root, [self.container], self.volumes)

    def test_volume_ownership_and_driver_denied(self) -> None:
        for key, value in (("Name", "foreign"), ("Driver", "nfs"),
                           ("Options", {"device": "/shared"}), ("Labels", {})):
            with self.subTest(key=key), self.assertRaises(ValueError):
                volumes = copy.deepcopy(self.volumes)
                volumes[0][key] = value
                ownership.validate(self.project, self.root, [self.container], volumes)
        with self.assertRaises(ValueError):
            ownership.validate(self.project, self.root, [self.container], [])
        with self.assertRaises(ValueError):
            ownership.validate(self.project, self.root, [], self.volumes + [self.volumes[0]])

    def test_inventory_failure_propagates(self) -> None:
        with patch.object(ownership, "docker", side_effect=RuntimeError("unavailable")), self.assertRaises(RuntimeError):
            ownership.main(self.project, self.root)


if __name__ == "__main__":
    unittest.main()
