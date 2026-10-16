"""Private certificate lifecycle regressions; execute only in the fleet Docker allocation."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock
from android_certificates import copy_certificates, remove_certificates


class AndroidCertificatesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir(mode=0o700)
        self.target = self.root / "android-tls"
        self.task = Mock(evidence=self.root, android_tls=self.target, acceptance_uid=os.geteuid(), acceptance_gid=os.getegid())
        self.task.project_containers.return_value = []
        self.task.docker.return_value = ""
        for name in ("ca.pem", "server.pem", "server.key", "ca-signing.key"):
            path = self.source / name
            path.write_bytes(name.encode())
            path.chmod(0o600)
        self.digest = hashlib.sha256(b"ca.pem").hexdigest()

    def test_copy_then_cleanup_preserves_source_and_excludes_ca_signer(self) -> None:
        copy_certificates(self.task, self.source, self.digest)
        self.assertEqual({p.name for p in self.target.iterdir()}, {"ca.pem", "server.pem", "server.key"})
        self.assertEqual((self.target / "server.key").stat().st_mode & 0o777, 0o600)
        removed: list[str] = []
        remove_certificates(self.task, removed)
        self.assertEqual(len(removed), 4)
        self.assertFalse(self.target.exists())
        self.assertEqual((self.source / "ca-signing.key").read_bytes(), b"ca-signing.key")

    def test_wrong_ca_and_public_private_key_rejected_before_copy(self) -> None:
        with self.assertRaises(RuntimeError):
            copy_certificates(self.task, self.source, "0" * 64)
        (self.source / "server.key").chmod(0o644)
        with self.assertRaises(RuntimeError):
            copy_certificates(self.task, self.source, self.digest)
        self.assertFalse(self.target.exists())

    def test_symlink_source_and_fifo_never_follow_or_block(self) -> None:
        path = self.source / "ca.pem"
        path.unlink()
        path.symlink_to(self.source / "server.pem")
        with self.assertRaises(OSError):
            copy_certificates(self.task, self.source, self.digest)
        path.unlink()
        os.mkfifo(path, 0o600)
        # AIDEV-NOTE: A subprocess timeout makes a blocking-open regression fail instead of hanging the test runner.
        code = ("import os;from pathlib import Path;from unittest.mock import Mock;"
                "from android_certificates import copy_certificates;"
                "import sys;t=Mock(evidence=Path(sys.argv[1]),android_tls=Path(sys.argv[1])/'android-tls',"
                "acceptance_uid=os.geteuid(),acceptance_gid=os.getegid());"
                "copy_certificates(t,Path(sys.argv[2]),sys.argv[3])")
        result = subprocess.run([sys.executable, "-c", code, str(self.root), str(self.source), self.digest],
                                cwd=Path(__file__).parent, capture_output=True, text=True, timeout=3, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("certificate file contract mismatch", result.stderr)
        self.assertFalse(self.target.exists())

    def test_cleanup_refuses_consumers_unknown_entries_and_changed_mode(self) -> None:
        copy_certificates(self.task, self.source, self.digest)
        for state in ("consumer", "unknown", "mode"):
            with self.subTest(state=state):
                self.task.docker.return_value = "other-container" if state == "consumer" else ""
                if state == "unknown":
                    (self.target / "unknown").write_bytes(b"retain")
                if state == "mode":
                    (self.target / "server.key").chmod(0o644)
                with self.assertRaises(RuntimeError):
                    remove_certificates(self.task, [])
                self.assertTrue((self.target / "ca.pem").exists())
                if state == "unknown":
                    (self.target / "unknown").unlink()
        (self.target / "server.key").chmod(0o600)
        remove_certificates(self.task, [])

    def test_partial_empty_setup_is_removable(self) -> None:
        self.target.mkdir(mode=0o700)
        remove_certificates(self.task, [])
        self.assertFalse(self.target.exists())


if __name__ == "__main__":
    unittest.main()
