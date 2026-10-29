"""Real archive checks plus mocked process boundaries; the acceptance restore drill uses a real isolated DB."""
from __future__ import annotations

import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

import recovery
import volume_backup
from volume_backup import VOLUMES, contents, digest


def volume(path: Path, name: str = "./sample", data: bytes = b"restored message") -> None:
    with tarfile.open(path, "w") as archive:
        entry = tarfile.TarInfo(name)
        entry.size, entry.mode, entry.uid, entry.gid = len(data), 0o600, 1000, 1000
        archive.addfile(entry, io.BytesIO(data))


class RecoveryTests(unittest.TestCase):
    # AIDEV-NOTE: Real tar bytes exercise corruption/path validation without mistaking subprocess mocks for a restore drill.
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def bundle(self, corrupt: bool = False) -> Path:
        for key in VOLUMES:
            volume(self.root / f"{key}.tar")
        manifest = {"version": 1, "sha256": {key: digest(self.root / f"{key}.tar") for key in VOLUMES}}
        if corrupt:
            manifest["sha256"]["db-data"] = "wrong"
        (self.root / "manifest.json").write_text(json.dumps(manifest))
        path = self.root / "snapshot.tar"
        with tarfile.open(path, "w") as archive:
            for name in ["manifest.json", *(f"{key}.tar" for key in VOLUMES)]:
                archive.add(self.root / name, arcname=name)
        return path

    def test_valid_bundle_round_trip(self) -> None:
        target = self.root / "restored"
        target.mkdir()
        self.assertEqual(recovery.unpack(self.bundle(), target)["version"], 1)
        for key in VOLUMES:
            self.assertEqual(contents(target / f"{key}.tar"), contents(self.root / f"{key}.tar"))

    def test_existing_destination_is_never_overwritten(self) -> None:
        source = self.bundle()
        target = self.root / "restored"
        target.mkdir()
        sentinel = target / "manifest.json"
        sentinel.write_text("preserve")
        with self.assertRaises(FileExistsError):
            recovery.unpack(source, target)
        self.assertEqual(sentinel.read_text(), "preserve")

    def test_checksum_corruption_rejected(self) -> None:
        with self.assertRaises(ValueError):
            recovery.unpack(self.bundle(True), self.root / "restored")

    def test_nonobject_manifest_rejected(self) -> None:
        source = self.bundle()
        (self.root / "manifest.json").write_text("null")
        with tarfile.open(source, "w") as archive:
            for name in ["manifest.json", *(f"{key}.tar" for key in VOLUMES)]:
                archive.add(self.root / name, arcname=name)
        with self.assertRaises(ValueError):
            recovery.unpack(source, self.root / "restored")

    def test_outer_traversal_rejected(self) -> None:
        path = self.root / "bad.tar"
        volume(path, "../escape")
        with self.assertRaises(ValueError):
            recovery.unpack(path, self.root / "restored")

    def test_inner_traversal_rejected(self) -> None:
        path = self.root / "bad.tar"
        volume(path, "../../escape")
        with self.assertRaises(ValueError):
            contents(path)

    def test_special_file_rejected(self) -> None:
        path = self.root / "bad.tar"
        with tarfile.open(path, "w") as archive:
            entry = tarfile.TarInfo("device")
            entry.type = tarfile.CHRTYPE
            archive.addfile(entry)
        with self.assertRaises(ValueError):
            contents(path)

    def test_barrier_failure_restarts_prior_services(self) -> None:
        commands: list[list[str]] = []
        def process(args: list[str], **kwargs: object) -> bytes:
            commands.append(args)
            if args[:3] == ["docker", "volume", "ls"]:
                return "\n".join(VOLUMES).encode()
            if args[-1] == "--services":
                return b"db\nlaunch-worker\n"
            if args[-1] == "-q":
                return b"still-running"
            return b""
        definition = {"volumes": {key: {"name": key} for key in VOLUMES}}
        with patch.dict(os.environ, {"ELEVATEO_SOURCE_REVISION": "a" * 40}), patch("volume_backup.config", return_value=definition), \
             patch("volume_backup.compose", return_value=["compose"]), patch("volume_backup.run", side_effect=process), \
             patch("volume_backup.archive_volume") as archive:
            with self.assertRaises(RuntimeError):
                volume_backup.snapshot(self.root)
            archive.assert_not_called()
        self.assertEqual(commands[-1], ["compose", "start", "db", "launch-worker"])

    def test_missing_volume_rejected_before_stopping_writers(self) -> None:
        definition = {"volumes": {key: {"name": key} for key in VOLUMES}}
        with patch.dict(os.environ, {"ELEVATEO_SOURCE_REVISION": "a" * 40}), \
             patch("volume_backup.config", return_value=definition), patch("volume_backup.compose", return_value=["compose"]), \
             patch("volume_backup.run", side_effect=[b"db\n", b"db-data\n"]) as process, \
             patch("volume_backup.archive_volume") as archive:
            with self.assertRaises(ValueError):
                volume_backup.snapshot(self.root)
            archive.assert_not_called()
            self.assertEqual(process.call_count, 2)

    def test_restore_refuses_existing_project_before_decrypt(self) -> None:
        with patch("recovery.config", return_value={}), \
             patch("recovery.compose", return_value=["docker", "compose", "-p", "elevateo-restore-test"]), \
             patch("recovery.run", return_value=b"existing-container") as process:
            with self.assertRaises(ValueError):
                recovery.restore(self.root / "snapshot.age", self.root / "restore")
            self.assertEqual(process.call_count, 1)

    def test_backup_refuses_invalid_recipient_before_stopping_services(self) -> None:
        with patch.dict(os.environ, {"ELEVATEO_BACKUP_AGE_RECIPIENT": "bad"}), patch("recovery.snapshot") as snapshot:
            with self.assertRaises(ValueError):
                recovery.backup(self.root / "backup")
            snapshot.assert_not_called()

    def test_explicit_operations_lock_excludes_second_owner_and_releases(self) -> None:
        path = self.root / "operations.lock"
        with recovery.exclusive(path):
            with self.assertRaises(BlockingIOError), recovery.exclusive(path):
                self.fail("second operation acquired the barrier")
        with recovery.exclusive(path):
            self.assertTrue(path.is_file())

    def test_operations_lock_rejects_relative_and_symlink_paths(self) -> None:
        target = self.root / "target"
        target.touch()
        link = self.root / "link"
        link.symlink_to(target)
        for path in (Path("relative.lock"), link):
            with self.subTest(path=path), self.assertRaises(ValueError), recovery.exclusive(path):
                self.fail("unsafe lock path admitted")


if __name__ == "__main__":
    unittest.main()
