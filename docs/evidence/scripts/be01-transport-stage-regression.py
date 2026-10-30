#!/usr/bin/env python3
"""Docker-only real seven-member staging checks; /src and /delivery are read-only."""
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tarfile
import tempfile
from typing import BinaryIO, Protocol, cast
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "be01-transport-stage.py"
ARCHIVE = HERE / "be01-transport-check-8a9613df.tar"
MODULE = "ops/tools/be01-transport-check"
CANONICAL = "ops/tests/fleet02-egress-source.sha256"


class Stager(Protocol):
    def main(self) -> None: ...


class TransportStageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "source"
        self.root.mkdir()
        self.payload: dict[str, bytes] = {}
        with tarfile.open(ARCHIVE, "r:") as archive:
            for member in archive.getmembers():
                stream = archive.extractfile(member)
                if stream is None:
                    raise ValueError("missing regular member")
                self.payload[member.name] = stream.read()
        pins = self.payload[MODULE + "/package.sha256"].decode("ascii").splitlines()
        self.inherited = {line.split("  ")[1] for line in pins} - self.payload.keys()
        names = self.inherited | {line.split("  ")[1] for line in (Path("/src") / CANONICAL).read_text().splitlines()}
        for name in names:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((Path("/src") / name).read_bytes())
        for directory in [self.root, *(p for p in self.root.rglob("*") if p.is_dir())]:
            directory.chmod(0o755)

    def snapshot(self) -> dict[str, tuple[int, bytes | str | None]]:
        return {str(p.relative_to(self.root)): (p.lstat().st_mode,
                os.readlink(p) if p.is_symlink() else p.read_bytes() if p.is_file() else None)
                for p in [self.root, *self.root.rglob("*")]}

    def invoke(self, archive: Path = ARCHIVE) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, "-B", str(SCRIPT), str(self.root), str(archive)],
                              capture_output=True, text=True, check=False, timeout=30)

    def test_success_bytes_modes_private_umask(self) -> None:
        before = self.snapshot()
        old = os.umask(0o077)
        try:
            result = self.invoke()
        finally:
            os.umask(old)
        self.assertEqual(0, result.returncode, result.stderr)
        after = self.snapshot()
        self.assertEqual(before, {name: after[name] for name in before})
        self.assertEqual(set(self.payload) | {MODULE}, set(after) - set(before))
        self.assertEqual(0o755, stat.S_IMODE((self.root / MODULE).stat().st_mode))
        for name, content in self.payload.items():
            self.assertEqual(content, (self.root / name).read_bytes())
            self.assertEqual(0o644, stat.S_IMODE((self.root / name).stat().st_mode))

    def test_corrupt_archive_no_writes(self) -> None:
        bad = self.root.parent / "bad.tar"
        bad.write_bytes(ARCHIVE.read_bytes() + b"corrupt")
        before = self.snapshot()
        result = self.invoke(bad)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("archive hash mismatch", result.stderr)
        self.assertEqual(before, self.snapshot())

    def test_each_inherited_dependency_no_writes(self) -> None:
        for name in sorted(self.inherited):
            with self.subTest(name=name):
                target = self.root / name
                original = target.read_bytes()
                target.write_bytes(original + b"corrupt")
                before = self.snapshot()
                result = self.invoke()
                self.assertNotEqual(0, result.returncode)
                self.assertIn("pin: " + name, result.stderr)
                self.assertEqual(before, self.snapshot())
                target.write_bytes(original)

    def test_existing_and_dangling_targets_no_writes(self) -> None:
        for name in (MODULE, "docs/evidence/scripts/be01-capability-volume-transport.sh"):
            for dangling in (False, True):
                with self.subTest(name=name, dangling=dangling):
                    target = self.root / name
                    if dangling:
                        target.symlink_to(self.root.parent / "absent")
                    else:
                        target.write_bytes(b"keep existing contents")
                    before = self.snapshot()
                    result = self.invoke()
                    self.assertNotEqual(0, result.returncode)
                    self.assertIn("existing target:", result.stderr)
                    self.assertEqual(before, self.snapshot())
                    target.unlink()

    def test_mid_write_preserved_and_retry_refused(self) -> None:
        spec = importlib.util.spec_from_file_location("transport_stage", SCRIPT)
        if spec is None or spec.loader is None:
            raise ValueError("module unavailable")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        stager = cast(Stager, module)
        ordered = sorted(set(self.payload) - {MODULE + "/package.sha256"})
        victim = self.root / ordered[1]
        original_open = Path.open
        # AIDEV-NOTE: Inject into the actual second exclusive write, after bytes hit disk; never patch hash gates.
        def open_fault(path: Path, mode: str = "r") -> BinaryIO:
            handle = cast(BinaryIO, original_open(path, mode))
            if path == victim and mode == "xb":
                from unittest.mock import MagicMock
                proxy = MagicMock(wraps=handle)
                proxy.__enter__.return_value = proxy
                proxy.__exit__.side_effect = lambda *unused: handle.close()
                def partial(content: bytes) -> int:
                    handle.write(content[:7])
                    handle.flush()
                    raise OSError("injected mid-write")
                proxy.write.side_effect = partial
                return cast(BinaryIO, proxy)
            return handle
        before = self.snapshot()
        with patch.object(Path, "open", open_fault), patch.object(sys, "argv", [str(SCRIPT), str(self.root), str(ARCHIVE)]):
            with self.assertRaisesRegex(OSError, "injected mid-write"):
                stager.main()
        after = self.snapshot()
        self.assertEqual(before, {name: after[name] for name in before})
        self.assertEqual(self.payload[ordered[0]], (self.root / ordered[0]).read_bytes())
        self.assertEqual(self.payload[ordered[1]][:7], victim.read_bytes())
        self.assertFalse((self.root / MODULE / "package.sha256").exists())
        retry = self.invoke()
        self.assertNotEqual(0, retry.returncode)
        self.assertIn("existing target:", retry.stderr)
        self.assertEqual(after, self.snapshot())


if __name__ == "__main__":
    unittest.main()
