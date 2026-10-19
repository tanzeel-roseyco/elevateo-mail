"""Regressions for the task-private attachment receipt boundary."""
import os
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import Mock, patch
import acceptance_attachments as subject

class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.task = SimpleNamespace(acceptance_private=root, attachment_browser=True,
            acceptance_uid=os.geteuid(), acceptance_gid=os.getegid(), project_containers=Mock(return_value=[]),
            docker=Mock(return_value=""))
        self.receipt = root / "qa816-attachments.json"
        self.receipt.write_text("{}")
        self.receipt.chmod(0o600)
        self.owner = patch.object(subject.acceptance_cleanup, "acceptance_owner", return_value=(os.geteuid(), os.getegid()))
        self.owner.start()
        self.addCleanup(self.owner.stop)

    def item(self):
        return {"Config": {"Labels": {"com.docker.compose.service": "acceptance-browser"}},
            "Mounts": [{"Type": "bind", "Source": str(self.receipt),
                "Destination": "/acceptance/qa816-attachments.json", "RW": False}]}

    def test_valid_receipt_delegates_all_remaining_policy(self):
        original = self.item()
        with patch.object(subject, "original_validate") as baseline:
            subject.validate(self.task, original)
            self.assertEqual(baseline.call_args.args[1]["Mounts"], [])
        self.assertEqual(len(original["Mounts"]), 1)

    def test_writable_or_wrong_source_mount_fails_before_baseline(self):
        for change in ({"RW": True}, {"Source": str(self.receipt.parent / "other")}):
            item = self.item()
            item["Mounts"][0].update(change)
            with patch.object(subject, "original_validate") as baseline:
                with self.assertRaises(RuntimeError):
                    subject.validate(self.task, item)
                baseline.assert_not_called()

    def test_public_symlink_and_oversized_receipts_are_rejected(self):
        self.receipt.chmod(0o644)
        with self.assertRaises(RuntimeError):
            subject.sidecar(self.task)
        self.receipt.chmod(0o600)
        self.receipt.write_bytes(b"x" * 4097)
        with self.assertRaises(RuntimeError):
            subject.sidecar(self.task)
        self.receipt.unlink()
        self.receipt.symlink_to("unrelated")
        with self.assertRaises(RuntimeError):
            subject.sidecar(self.task)

    def test_cleanup_preserves_receipt_with_consumer(self):
        self.task.project_containers.return_value = ["owned"]
        with self.assertRaises(RuntimeError):
            subject.private_files(self.task, [])
        self.assertTrue(self.receipt.exists())

    def test_cleanup_removes_only_validated_receipt_then_delegates(self):
        removed = []
        with patch.object(subject, "original_private") as baseline:
            subject.private_files(self.task, removed)
            baseline.assert_called_once_with(self.task, removed)
        self.assertFalse(self.receipt.exists())
        self.assertEqual(removed, ["private-file:" + str(self.receipt)])
