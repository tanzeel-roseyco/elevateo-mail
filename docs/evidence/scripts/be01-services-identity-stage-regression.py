#!/usr/bin/env python3
"""Docker-only direct tests of the frozen ten-file stager and real pinned archive."""
import hashlib
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
STAGER = ROOT / "be01-services-identity-stage.py"
ARCHIVE = ROOT / "be01-services-identity-review.tar"


# AIDEV-NOTE: Keep real pins; fixture success must authenticate the actual delivery archive, not patched constants.
class IdentityStageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.source = self.root / "source"
        (self.source / ".acceptance").mkdir(parents=True)
        self.target = self.source / ".acceptance/python-identity"
        self.sentinel = self.source / "canonical-sentinel"
        self.sentinel.write_bytes(b"preserve canonical source\n")
        self.assertEqual("082f2dee68ec408f34ff52766239e493eb3f01960e71026d0e55a0aae24f95b9",
                         hashlib.sha256(STAGER.read_bytes()).hexdigest())
        self.assertEqual("7f56a21b333828f05173ad0e1824f0d5c8c9d23a0f7a0cd0caca15358273a60f",
                         hashlib.sha256(ARCHIVE.read_bytes()).hexdigest())

    def invoke(self, archive: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, "-B", str(STAGER), str(archive), str(self.source)],
                              capture_output=True, text=True, timeout=10, check=False)

    def snapshot(self) -> dict[str, tuple[int, bytes | None]]:
        return {str(p.relative_to(self.source)): (stat.S_IMODE(p.stat().st_mode),
                p.read_bytes() if p.is_file() else None) for p in self.source.rglob("*")}

    def test_real_archive_under_private_umask(self) -> None:
        previous = os.umask(0o077)
        try:
            evidence = self.root / "private-evidence"
            evidence.mkdir()
            result = self.invoke(ARCHIVE)
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual(0o700, stat.S_IMODE(evidence.stat().st_mode))
            self.assertEqual(0o755, stat.S_IMODE(self.target.stat().st_mode))
            manifest = self.target / "be01-services-identity-package.sha256"
            entries = dict(line.split("  ", 1)[::-1] for line in manifest.read_text().splitlines())
            self.assertEqual(9, len(entries))
            self.assertEqual(set(entries) | {manifest.name}, {p.name for p in self.target.iterdir()})
            for name, digest in entries.items():
                self.assertEqual(digest, hashlib.sha256((self.target / name).read_bytes()).hexdigest())
            for path in self.target.iterdir():
                self.assertEqual(0o644, stat.S_IMODE(path.stat().st_mode))
            self.assertEqual(b"preserve canonical source\n", self.sentinel.read_bytes())
        finally:
            os.umask(previous)

    def test_existing_destination_is_preserved(self) -> None:
        self.target.mkdir()
        (self.target / "existing").write_bytes(b"do not replace")
        before = self.snapshot()
        result = self.invoke(ARCHIVE)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("FileExistsError", result.stderr)
        self.assertEqual(before, self.snapshot())

    def test_corrupted_archive_has_no_destination_mutation(self) -> None:
        damaged = self.root / "corrupted.tar"
        damaged.write_bytes(ARCHIVE.read_bytes() + b"corrupt")
        before = self.snapshot()
        result = self.invoke(damaged)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("outer archive hash mismatch", result.stderr)
        self.assertFalse(self.target.exists())
        self.assertEqual(before, self.snapshot())


if __name__ == "__main__":
    unittest.main()
