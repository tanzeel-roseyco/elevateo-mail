#!/usr/bin/env python3
"""Docker-only staging refusal and exact original-code discrimination."""
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

# AIDEV-NOTE: Synthetic pins exercise real authentication and refusal; canonical files are never supplied.
class StageBoundaryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.source = self.root / "source"
        (self.source / "ops/tools").mkdir(parents=True)
        self.script = Path(__file__).with_name("be01-services-stage.py")
        spec = importlib.util.spec_from_file_location("stage", self.script)
        if spec is None or spec.loader is None:
            raise RuntimeError("stager module missing")
        self.stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.stage)
        payloads = {self.stage.PREFIX + name: b"fixture\n"
                    for name in self.stage.FILES - {"package.sha256"}}
        self.manifest = "".join(hashlib.sha256(data).hexdigest() + "  " + name + "\n"
                                for name, data in sorted(payloads.items())).encode("ascii")
        payloads[self.stage.PREFIX + "package.sha256"] = self.manifest
        self.archive = self.root / "fixture.tar"
        with tarfile.open(self.archive, "w") as tar:
            for name, data in payloads.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                tar.addfile(entry, io.BytesIO(data))
        self.archive_hash = hashlib.sha256(self.archive.read_bytes()).hexdigest()

    def invoke(self) -> None:
        with patch.object(self.stage, "ARCHIVE", self.archive_hash), \
             patch.object(self.stage, "MANIFEST", hashlib.sha256(self.manifest).hexdigest()), \
             patch.object(sys, "argv", ["stage", str(self.archive), str(self.source)]):
            self.stage.main()

    def snapshot(self) -> dict[str, tuple[int, bytes | None]]:
        return {str(path.relative_to(self.source)): (path.stat().st_mode,
                path.read_bytes() if path.is_file() else None)
                for path in [self.source, *self.source.rglob("*")]}

    def test_existing_target_refused_without_changes(self) -> None:
        target = self.source / self.stage.PREFIX
        target.mkdir(mode=0o700)
        (target / "checks.sh").write_bytes(b"preserve existing contents\n")
        before = self.snapshot()
        with self.assertRaises(FileExistsError):
            self.invoke()
        self.assertEqual(before, self.snapshot())

    def test_corrupted_archive_rejected_without_destination_mutation(self) -> None:
        (self.source / "sentinel").write_bytes(b"preserve unrelated source\n")
        before = self.snapshot()
        self.archive.write_bytes(self.archive.read_bytes() + b"corruption")
        with self.assertRaisesRegex(ValueError, "^outer archive hash mismatch$"):
            self.invoke()
        self.assertEqual(before, self.snapshot())
        self.assertFalse((self.source / self.stage.PREFIX).exists())

    def test_exact_original_fails_mode_oracle(self) -> None:
        repaired = self.script.read_bytes()
        added = (b"    # AIDEV-NOTE: Caller umask077 protects evidence; only this new source directory needs UID10001 traversal.\n"
                 b"    target.chmod(0o755)\n")
        self.assertEqual(1, repaired.count(added))
        original = repaired.replace(added, b"", 1)
        self.assertEqual("d3da6ca50e541fe23c741cf75c4deafde035411bcef15b0f905a660e9b60a52f",
                         hashlib.sha256(original).hexdigest())
        (self.root / self.script.name).write_bytes(original)
        regression = self.script.with_name("be01-services-stage-regression.py")
        copied = self.root / regression.name
        copied.write_bytes(regression.read_bytes())
        result = subprocess.run([sys.executable, "-B", str(copied)], capture_output=True,
                                text=True, timeout=15, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("AssertionError: 493 != 448", result.stderr)
        self.assertIn("Ran 1 test", result.stderr)
        self.assertIn("FAILED (failures=1)", result.stderr)

if __name__ == "__main__":
    unittest.main()
