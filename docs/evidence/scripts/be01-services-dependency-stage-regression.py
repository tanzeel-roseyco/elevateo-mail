#!/usr/bin/env python3
"""Docker-only tests using the real frozen archive and read-only canonical /src."""
import hashlib
import importlib.util
import os
from pathlib import Path
import stat
import subprocess
import sys
import tarfile
import tempfile
from typing import Protocol, cast
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "be01-services-dependency-stage.py"
ARCHIVE = HERE / "be01-services-dependencies-review.tar"
ALLOWLIST = HERE / "be01-services-dependency-stage.sha256"
ADAPTER = "ops/tools/be01-services"
FIXTURES = "ops/tests/be01-services"


class Stager(Protocol):
    def stage(self, archive: Path, allowlist: Path, root: Path) -> None: ...


# AIDEV-NOTE: Real archive/manifest pins stay unchanged; /src is copied, never staged or modified by these tests.
class DependencyStageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.root.chmod(0o755)
        self.source = self.root / "source"
        (self.source / "ops/tools").mkdir(parents=True)
        (self.source / "ops/tests").mkdir(parents=True)
        source_manifest = "ops/tests/fleet02-egress-source.sha256"
        names = {source_manifest}
        names.update(line.split("  ", 1)[1] for line in (Path("/src") / source_manifest).read_text().splitlines())
        with tarfile.open(ARCHIVE, "r:") as archive:
            member = archive.extractfile(ADAPTER + "/dependencies.sha256")
            if member is None:
                raise RuntimeError("dependency manifest missing")
            names.update(line.split("  ", 1)[1] for line in member.read().decode("ascii").splitlines()
                         if not line.endswith("  " + FIXTURES + "/package.sha256"))
        for name in names:
            target = self.source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((Path("/src") / name).read_bytes())
        for directory in [self.source, *(p for p in self.source.rglob("*") if p.is_dir())]:
            directory.chmod(0o755)
        self.expected = dict(line.split("  ", 1)[::-1] for line in ALLOWLIST.read_text().splitlines())

    def invoke(self, archive: Path = ARCHIVE) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, "-B", str(SCRIPT), str(archive), str(ALLOWLIST), str(self.source)],
                              capture_output=True, text=True, timeout=20, check=False)

    def snapshot(self) -> dict[str, tuple[int, bytes | str | None]]:
        return {str(p.relative_to(self.source)): (p.lstat().st_mode,
                os.readlink(p) if p.is_symlink() else p.read_bytes() if p.is_file() else None)
                for p in [self.source, *self.source.rglob("*")]}

    def test_authenticated_private_umask_happy_path(self) -> None:
        before = self.snapshot()
        previous = os.umask(0o077)
        try:
            evidence = self.root / "private-evidence"
            evidence.mkdir()
            result = self.invoke()
        finally:
            os.umask(previous)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(0o700, stat.S_IMODE(evidence.stat().st_mode))
        after = self.snapshot()
        self.assertEqual(before, {name: after[name] for name in before})
        self.assertEqual(set(self.expected) | {ADAPTER, FIXTURES}, set(after) - set(before))
        for prefix in (ADAPTER, FIXTURES):
            self.assertEqual(0o755, stat.S_IMODE((self.source / prefix).stat().st_mode))
        for name, digest in self.expected.items():
            self.assertEqual(digest, hashlib.sha256((self.source / name).read_bytes()).hexdigest())
            self.assertEqual(0o644, stat.S_IMODE((self.source / name).stat().st_mode))

    def test_existing_second_target_preserves_both(self) -> None:
        target = self.source / FIXTURES
        target.mkdir()
        (target / "keep").write_bytes(b"existing contents")
        before = self.snapshot()
        result = self.invoke()
        self.assertNotEqual(0, result.returncode)
        self.assertIn("FileExistsError", result.stderr)
        self.assertEqual(before, self.snapshot())

    def test_dangling_target_refused(self) -> None:
        (self.source / ADAPTER).symlink_to(self.root / "missing", target_is_directory=True)
        before = self.snapshot()
        result = self.invoke()
        self.assertNotEqual(0, result.returncode)
        self.assertIn("FileExistsError", result.stderr)
        self.assertEqual(before, self.snapshot())

    def test_corrupt_external_dependency_refused(self) -> None:
        (self.source / "ops/tests/fleet02-egress-compose.sh").write_bytes(b"corrupted dependency")
        before = self.snapshot()
        result = self.invoke()
        self.assertNotEqual(0, result.returncode)
        self.assertIn("hash mismatch", result.stderr)
        self.assertEqual(before, self.snapshot())

    def test_corrupt_archive_refused(self) -> None:
        archive = self.root / "corrupt.tar"
        archive.write_bytes(ARCHIVE.read_bytes() + b"corrupted archive")
        before = self.snapshot()
        result = self.invoke(archive)
        self.assertNotEqual(0, result.returncode)
        self.assertIn("hash mismatch", result.stderr)
        self.assertEqual(before, self.snapshot())

    def test_partial_copy_retained_and_retry_refused(self) -> None:
        spec = importlib.util.spec_from_file_location("dependency_stage", SCRIPT)
        if spec is None or spec.loader is None:
            raise RuntimeError("stager module missing")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        stager = cast(Stager, module)
        victim = self.source / FIXTURES / "auth.rb"
        original_chmod = Path.chmod

        # AIDEV-NOTE: Fail after a real second-directory write; first directory and partial bytes must survive.
        def fail_chmod(path: Path, mode: int, *, follow_symlinks: bool = True) -> None:
            if path == victim:
                raise OSError("injected post-copy permission failure")
            original_chmod(path, mode, follow_symlinks=follow_symlinks)

        before = self.snapshot()
        with patch.object(Path, "chmod", fail_chmod):
            with self.assertRaisesRegex(OSError, "injected post-copy"):
                stager.stage(ARCHIVE, ALLOWLIST, self.source)
        after = self.snapshot()
        self.assertEqual(before, {name: after[name] for name in before})
        self.assertEqual(self.expected[FIXTURES + "/auth.rb"], hashlib.sha256(victim.read_bytes()).hexdigest())
        for name, digest in self.expected.items():
            if name.startswith(ADAPTER + "/"):
                self.assertEqual(digest, hashlib.sha256((self.source / name).read_bytes()).hexdigest())
        self.assertEqual(["auth.rb"], [p.name for p in (self.source / FIXTURES).iterdir()])
        retry = self.invoke()
        self.assertNotEqual(0, retry.returncode)
        self.assertIn("FileExistsError", retry.stderr)
        self.assertEqual(after, self.snapshot())

    def test_private_host_parent_with_traversable_bind_root(self) -> None:
        self.root.chmod(0o700)
        result = self.invoke()
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(0o700, stat.S_IMODE(self.root.stat().st_mode))
        for name, digest in self.expected.items():
            self.assertEqual(digest, hashlib.sha256((self.source / name).read_bytes()).hexdigest())

    def test_nontraversable_bind_paths_refused(self) -> None:
        for relative in (".", "ops", "ops/tests"):
            with self.subTest(relative=relative):
                target = self.source / relative
                target.chmod(0o700)
                before = self.snapshot()
                try:
                    result = self.invoke()
                    self.assertNotEqual(0, result.returncode)
                    self.assertIn("nontraversable ancestor", result.stderr)
                    self.assertEqual(before, self.snapshot())
                finally:
                    target.chmod(0o755)

    def test_symlink_host_ancestor_refused(self) -> None:
        alias = self.root / "alias"
        alias.symlink_to(self.root, target_is_directory=True)
        original = self.source
        before = self.snapshot()
        self.source = alias / "source"
        try:
            result = self.invoke()
        finally:
            self.source = original
        self.assertNotEqual(0, result.returncode)
        self.assertIn("absolute and resolved", result.stderr)
        self.assertEqual(before, self.snapshot())


if __name__ == "__main__":
    unittest.main()
