import hashlib
import pathlib
import tempfile
import unittest

from verify_snapshot import FILES, verify


class SnapshotAdmissionTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = pathlib.Path(self.temp.name)
        entries = []
        for name in FILES:
            payload = name.encode()
            (self.path / name).write_bytes(payload)
            entries.append(f"{hashlib.sha256(payload).hexdigest()}  {name}")
        (self.path / "SHA256SUMS").write_text("\n".join(entries) + "\n")

    def test_complete_pair(self):
        self.assertEqual(set(verify(self.path)), set(FILES))

    def test_corrupt_artifact(self):
        (self.path / "database.dump").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            verify(self.path)

    def test_manifest_path_injection(self):
        manifest = self.path / "SHA256SUMS"
        manifest.write_text(manifest.read_text() + "0" * 64 + "  ../outside\n")
        with self.assertRaisesRegex(ValueError, "invalid"):
            verify(self.path)


if __name__ == "__main__":
    unittest.main()
