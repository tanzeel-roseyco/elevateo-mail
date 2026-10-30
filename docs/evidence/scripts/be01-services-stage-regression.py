#!/usr/bin/env python3
"""Docker-only regression: authenticated staging under the real caller's private umask."""
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import stat
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

# AIDEV-NOTE: Exercise real staging with synthetic authenticated bytes, without touching canonical sources.
class StagePermissionsTest(unittest.TestCase):
    def test_private_umask_preserves_evidence_and_allows_source_traversal(self) -> None:
        spec = importlib.util.spec_from_file_location("stage", Path(__file__).with_name("be01-services-stage.py"))
        if spec is None or spec.loader is None:
            raise RuntimeError("stager module missing")
        stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stage)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            source = root / "source"
            (source / "ops/tools").mkdir(parents=True)
            payloads = {stage.PREFIX + name: b"fixture\n" for name in stage.FILES - {"package.sha256"}}
            manifest = "".join(hashlib.sha256(data).hexdigest() + "  " + name + "\n"
                               for name, data in sorted(payloads.items())).encode("ascii")
            payloads[stage.PREFIX + "package.sha256"] = manifest
            archive = root / "fixture.tar"
            with tarfile.open(archive, "w") as tar:
                for name, data in payloads.items():
                    entry = tarfile.TarInfo(name)
                    entry.size = len(data)
                    tar.addfile(entry, io.BytesIO(data))
            old_umask = os.umask(0o077)
            try:
                evidence = root / "private-evidence"
                evidence.mkdir(mode=0o777)
                with patch.object(stage, "ARCHIVE", hashlib.sha256(archive.read_bytes()).hexdigest()), \
                     patch.object(stage, "MANIFEST", hashlib.sha256(manifest).hexdigest()), \
                     patch.object(sys, "argv", ["stage", str(archive), str(source)]):
                    stage.main()
                target = source / stage.PREFIX
                self.assertEqual(0o755, stat.S_IMODE(target.stat().st_mode))
                self.assertEqual(0o700, stat.S_IMODE(evidence.stat().st_mode))
                self.assertEqual(stage.FILES, {path.name for path in target.iterdir()})
                for name, data in payloads.items():
                    path = target / Path(name).name
                    self.assertEqual(0o644, stat.S_IMODE(path.stat().st_mode))
                    self.assertEqual(data, path.read_bytes())
                self.assertEqual(0o077, os.umask(0o077))
            finally:
                os.umask(old_umask)

if __name__ == "__main__":
    unittest.main()
