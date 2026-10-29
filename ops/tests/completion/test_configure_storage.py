"""Storage initializer contract without network calls."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "production"))
import configure_storage as storage


class StorageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.env = {"ELEVATEO_ATTACHMENT_BUCKET": "attachments", "SERVICE_ROLE_KEY": "x" * 40}
        self.private = {"id": "attachments", "public": False}

    def test_creates_and_reads_back_private_bucket(self) -> None:
        for missing in ((404, {}), (400, {"code": "NoSuchBucket"}), (400, {"statusCode": "404"})):
            with patch.object(storage, "request", side_effect=[missing, (200, {}), (200, self.private)]) as call:
                storage.configure(self.env)
            self.assertEqual({"id": "attachments", "name": "attachments", "public": False}, call.call_args_list[1].args[3])

    def test_existing_private_bucket_requires_no_mutation(self) -> None:
        with patch.object(storage, "request", return_value=(200, self.private)) as call:
            storage.configure(self.env)
        self.assertEqual(1, call.call_count)

    def test_public_or_wrong_bucket_rejected_without_mutation(self) -> None:
        for metadata in ({"id": "attachments", "public": True}, {"id": "other", "public": False}, None):
            with patch.object(storage, "request", return_value=(200, metadata)) as call:
                with self.assertRaises(storage.StorageError):
                    storage.configure(self.env)
                self.assertEqual(1, call.call_count)

    def test_failed_creation_and_conflicting_race_rejected(self) -> None:
        for responses in ([(404, {}), (500, {})], [(404, {}), (409, {}), (200, {"id": "attachments", "public": True})]):
            with patch.object(storage, "request", side_effect=responses), self.assertRaises(storage.StorageError):
                storage.configure(self.env)

    def test_invalid_configuration_never_calls_storage(self) -> None:
        for overrides in ({"ELEVATEO_ATTACHMENT_BUCKET": "../escape"}, {"SERVICE_ROLE_KEY": ""}, {"SERVICE_ROLE_KEY": "x" * 40 + "\r\n"}):
            with patch.object(storage, "request") as call, self.assertRaises(storage.StorageError):
                storage.configure({**self.env, **overrides})
            call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
