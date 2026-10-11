#!/usr/bin/env python3
"""Import pinned Git blobs as inert source snapshots; never install or execute them."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PINS = ROOT / 'docs/research/repository-pins.json'
OMIT = {'BillionMail': {'ssl-self-signed/key.pem': 'Published sample TLS private key; deliberately not redistributed.'}}


def git(repo: Path, *args: str) -> bytes:
    return subprocess.check_output(['git', '-C', str(repo), *args])


def valid_path(value: str) -> bool:
    path = PurePosixPath(value)
    return not path.is_absolute() and bool(path.parts) and '..' not in path.parts and '.git' not in path.parts


def safe_target(path: Path) -> Path:
    if not path.is_relative_to(ROOT):
        raise SystemExit('Destination outside repository')
    for candidate in (path, *path.parents):
        if candidate == ROOT.parent:
            break
        if candidate.is_symlink():
            raise SystemExit(f'Refusing destination symlink: {candidate}')
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upstream-root', type=Path, required=True, help='Directory containing the six pinned local clones')
    args = parser.parse_args()
    pins = json.loads(PINS.read_text())
    target_root = safe_target(ROOT / 'third_party/upstream')
    registry_path = safe_target(ROOT / 'third_party/registry.json')
    safe_target(ROOT / 'third_party/manifests')
    if target_root.exists() or registry_path.exists():
        raise SystemExit('Refusing to overwrite source snapshots. Use a fresh checkout/worktree for a reviewed refresh.')
    prepared = []
    for pin in pins:
        repo = args.upstream_root / pin['name']
        slug = pin['name'].lower()
        if not re.fullmatch(r'[a-z][a-z0-9-]*', slug):
            raise SystemExit('Invalid repository identifier')
        if not re.fullmatch(r'[0-9a-f]{40}', pin['commit']):
            raise SystemExit('Expected a full Git SHA-1 revision')
        origin = git(repo, 'remote', 'get-url', 'origin').decode().strip()
        if origin.removesuffix('.git') != pin['remote'].removesuffix('.git'):
            raise SystemExit(f'Unexpected upstream origin for {slug}')
        if git(repo, 'cat-file', '-t', pin['commit']).strip() != b'commit':
            raise SystemExit(f'Not a commit: {slug}')
        entries = []
        for record in git(repo, 'ls-tree', '-rz', pin['commit']).split(b'\0'):
            if not record:
                continue
            metadata, raw_path = record.split(b'\t', 1)
            mode, kind, oid = metadata.decode().split()
            path = raw_path.decode('utf-8')
            if kind != 'blob' or mode not in ('100644', '100755') or not valid_path(path):
                raise SystemExit(f'Unsupported/unsafe tree entry: {slug}/{path}')
            entries.append((path, mode, oid))
        expected_omissions = set(OMIT.get(pin['name'], {}))
        if not expected_omissions.issubset({entry[0] for entry in entries}):
            raise SystemExit(f'Omission policy no longer matches {slug}; inspect before refreshing')
        prepared.append((pin, repo, slug, entries))
    registry = {'schema_version': 1, 'intake_date': '2026-10-11', 'purpose': 'Inert upstream reference snapshots, not integrated application code', 'repositories': []}
    for pin, repo, slug, entries in prepared:
        destination = target_root / slug
        manifest = {'schema_version': 1, 'repository': pin['name'], 'commit': pin['commit'], 'files': []}
        with subprocess.Popen(['git', '-C', str(repo), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE) as process:
            assert process.stdin is not None and process.stdout is not None
            for name, mode, oid in entries:
                process.stdin.write((oid + '\n').encode())
                process.stdin.flush()
                returned_oid, kind, size = process.stdout.readline().decode().split()
                data = process.stdout.read(int(size))
                if returned_oid != oid or kind != 'blob' or len(data) != int(size) or process.stdout.read(1) != b'\n':
                    raise RuntimeError('Unexpected git cat-file result')
                reason = OMIT.get(pin['name'], {}).get(name)
                entry = {'path': name, 'mode': mode, 'git_blob': oid, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'disposition': 'omitted' if reason else 'included'}
                if reason:
                    entry['reason'] = reason
                else:
                    output = safe_target(destination / name)
                    output.parent.mkdir(parents=True, exist_ok=True)
                    output.write_bytes(data)
                    output.chmod(0o755 if mode == '100755' else 0o644)
                manifest['files'].append(entry)
            process.stdin.close()
            if process.wait() != 0:
                raise RuntimeError(f'Git blob read failed for {slug}')
        manifest_path = safe_target(ROOT / 'third_party/manifests' / f'{slug}.json')
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        included = [entry for entry in manifest['files'] if entry['disposition'] == 'included']
        license_path = destination / 'LICENSE'
        if not license_path.is_file():
            raise RuntimeError(f'Expected preserved root LICENSE in {slug}')
        registry['repositories'].append({'id': slug, 'name': pin['name'], 'remote': pin['remote'], 'commit': pin['commit'], 'commit_date': pin['commit_date'], 'declared_root_license': 'AGPL-3.0' if slug == 'billionmail' else 'MIT', 'snapshot': str(destination.relative_to(ROOT)), 'manifest': str(manifest_path.relative_to(ROOT)), 'manifest_sha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(), 'license': str(license_path.relative_to(ROOT)), 'upstream_tracked_files': len(entries), 'included_files': len(included), 'omitted_files': len(entries) - len(included), 'included_bytes': sum(entry['bytes'] for entry in included)})
        print(f'{slug}: {len(included)} included; {len(entries) - len(included)} explicitly omitted')
    registry_path.write_text(json.dumps(registry, indent=2) + '\n')


if __name__ == '__main__':
    main()
