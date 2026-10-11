"""Isolated provenance-tool regressions; never import or execute upstream code."""
from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


def load_tool(name: str):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    with patch.object(sys, 'dont_write_bytecode', True):
        spec.loader.exec_module(module)
    return module


class SnapshotToolsTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix='snapshot-tools-')
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.root = self.base / 'intake'
        self.source = self.base / 'clones' / 'BillionMail'
        self.source.mkdir(parents=True)
        self.environment = dict(os.environ, GIT_CONFIG_NOSYSTEM='1',
                                GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_COUNT='0')
        for key in tuple(self.environment):
            if key.startswith(('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
                               'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_')):
                del self.environment[key]
        self.git('init', '-q', '--template=')
        self.git('config', '--local', 'user.name', 'Snapshot Fixture')
        self.git('config', '--local', 'user.email', 'fixture@example.invalid')
        self.git('config', '--local', 'core.hooksPath', '/dev/null')
        self.git('config', '--local', 'commit.gpgSign', 'false')
        self.git('remote', 'add', 'origin', 'https://example.invalid/fixture.git')
        (self.source / 'LICENSE').write_bytes(b'Fixture license must survive verbatim.\n')
        (self.source / 'payload.txt').write_bytes(b'pinned committed bytes\n')
        (self.source / 'run.sh').write_bytes(b'# inert executable fixture; never run\n')
        (self.source / 'run.sh').chmod(0o755)
        key = self.source / 'ssl-self-signed/key.pem'
        key.parent.mkdir()
        key.write_bytes(b'INERT DUMMY NOT A PRIVATE KEY\n')
        self.git('add', '.')
        self.git('commit', '-qm', 'fixture')
        commit = self.git('rev-parse', 'HEAD').decode().strip()
        pins = self.root / 'docs/research/repository-pins.json'
        pins.parent.mkdir(parents=True)
        pins.write_text(json.dumps([{'name': 'BillionMail', 'commit': commit,
                                    'remote': 'https://example.invalid/fixture.git',
                                    'commit_date': '2026-10-11'}]))
        self.importer = load_tool('import_upstream')
        self.verifier = load_tool('verify_upstream')
        self.importer.ROOT = self.verifier.ROOT = self.root
        self.importer.PINS = pins
        self.snapshot = self.root / 'third_party/upstream/billionmail'
        self.manifest = self.root / 'third_party/manifests/billionmail.json'
        self.registry = self.root / 'third_party/registry.json'

    def git(self, *args: str) -> bytes:
        return subprocess.check_output(['git', '-C', str(self.source), *args], env=self.environment)

    def import_snapshot(self) -> None:
        with patch.object(sys, 'argv', ['import_upstream', '--upstream-root', str(self.source.parent)]):
            with patch.dict(os.environ, self.environment, clear=True), contextlib.redirect_stdout(io.StringIO()):
                self.importer.main()

    def verify(self, original: bool = False) -> dict:
        with patch.dict(os.environ, self.environment, clear=True):
            return self.verifier.verify(self.source.parent if original else None)

    def test_pinned_bytes_ignore_new_head_dirty_and_untracked_files(self) -> None:
        (self.source / 'payload.txt').write_bytes(b'later commit\n')
        self.git('commit', '-qam', 'later')
        (self.source / 'payload.txt').write_bytes(b'dirty\n')
        (self.source / 'untracked.txt').write_bytes(b'untracked\n')
        self.import_snapshot()
        self.assertEqual((self.snapshot / 'payload.txt').read_bytes(), b'pinned committed bytes\n')
        self.assertFalse((self.snapshot / 'untracked.txt').exists())
        self.assertTrue(self.verify(True)['original_git_trees_checked'])

    def test_license_and_executable_mode_preserved(self) -> None:
        self.import_snapshot()
        self.assertEqual((self.snapshot / 'LICENSE').read_bytes(), (self.source / 'LICENSE').read_bytes())
        self.assertEqual((self.snapshot / 'run.sh').stat().st_mode & 0o777, 0o755)
        self.assertEqual(self.verify()['included_files'], 3)

    def test_demo_key_omitted_and_accounted_for(self) -> None:
        self.import_snapshot()
        self.assertFalse((self.snapshot / 'ssl-self-signed/key.pem').exists())
        self.assertEqual(self.verify(True)['omitted_files'], 1)

    def test_existing_snapshot_refused_without_changes(self) -> None:
        self.import_snapshot()
        before = self.registry.read_bytes()
        with self.assertRaises(SystemExit):
            self.import_snapshot()
        self.assertEqual(self.registry.read_bytes(), before)
        self.verify(True)

    def test_content_tamper_rejected(self) -> None:
        self.import_snapshot()
        (self.snapshot / 'payload.txt').write_bytes(b'altered\n')
        with self.assertRaisesRegex(ValueError, 'Content mismatch'):
            self.verify()

    def test_unexpected_file_rejected(self) -> None:
        self.import_snapshot()
        (self.snapshot / 'extra.txt').touch()
        with self.assertRaisesRegex(ValueError, 'Unexpected or missing'):
            self.verify()

    def test_symlinks_rejected(self) -> None:
        for listed in (True, False):
            with self.subTest(listed=listed):
                if not self.snapshot.exists():
                    self.import_snapshot()
                path = self.snapshot / ('payload.txt' if listed else 'extra-link')
                original = path.read_bytes() if listed else None
                path.unlink(missing_ok=True)
                path.symlink_to(self.source / 'payload.txt')
                with self.assertRaisesRegex(ValueError, '[Ss]ymlink'):
                    self.verify()
                path.unlink()
                if original is not None:
                    path.write_bytes(original)

    def test_manifest_tamper_rejected(self) -> None:
        self.import_snapshot()
        self.manifest.write_bytes(self.manifest.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'Manifest hash mismatch'):
            self.verify()

    def test_executable_mode_tamper_rejected(self) -> None:
        self.import_snapshot()
        (self.snapshot / 'run.sh').chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'Executable mode mismatch'):
            self.verify()

    def test_original_tree_rejects_coherent_inventory_deletion(self) -> None:
        self.import_snapshot()
        manifest = json.loads(self.manifest.read_text())
        manifest['files'] = [entry for entry in manifest['files'] if entry['path'] != 'payload.txt']
        size = (self.snapshot / 'payload.txt').stat().st_size
        (self.snapshot / 'payload.txt').unlink()
        self.manifest.write_text(json.dumps(manifest))
        registry = json.loads(self.registry.read_text())
        repo = registry['repositories'][0]
        repo['manifest_sha256'] = hashlib.sha256(self.manifest.read_bytes()).hexdigest()
        repo['included_files'] -= 1
        repo['upstream_tracked_files'] -= 1
        repo['included_bytes'] -= size
        self.registry.write_text(json.dumps(registry))
        self.verify()  # Inventory authenticity needs the optional original-tree check.
        with self.assertRaisesRegex(ValueError, 'Original Git tree mismatch'):
            self.verify(True)

    def test_importer_rejects_destination_parent_symlink(self) -> None:
        outside = self.base / 'outside'; outside.mkdir()
        (self.root / 'third_party').symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(SystemExit, 'symlink'):
            self.import_snapshot()
        self.assertEqual(list(outside.iterdir()), [])

    def test_omission_policy_survives_coherent_manifest_edits(self) -> None:
        self.import_snapshot()
        relative = 'ssl-self-signed/key.pem'
        path = self.snapshot / relative; path.parent.mkdir()
        path.write_bytes((self.source / relative).read_bytes())
        manifest = json.loads(self.manifest.read_text())
        entry = next(row for row in manifest['files'] if row['path'] == relative)
        entry['disposition'] = 'included'
        self.manifest.write_text(json.dumps(manifest))
        registry = json.loads(self.registry.read_text()); repo = registry['repositories'][0]
        repo['manifest_sha256'] = hashlib.sha256(self.manifest.read_bytes()).hexdigest()
        repo['included_files'] += 1; repo['omitted_files'] -= 1; repo['included_bytes'] += path.stat().st_size
        self.registry.write_text(json.dumps(registry))
        with self.assertRaisesRegex(ValueError, 'Omission policy violation'):
            self.verify(True)


if __name__ == '__main__':
    unittest.main()
