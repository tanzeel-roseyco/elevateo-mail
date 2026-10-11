#!/usr/bin/env python3
"""Verify snapshot file sets, SHA-256, Git blobs, modes and optional original trees."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess

ROOT = Path(__file__).resolve().parents[1]
# AIDEV-NOTE: Keep this required omission policy aligned with import_upstream.py; manifests cannot override it.
REQUIRED_OMISSIONS = {'BillionMail': {'ssl-self-signed/key.pem'}}


def safe_path(base: Path, relative: str) -> Path:
    value = PurePosixPath(relative)
    if value.is_absolute() or not value.parts or any(part in ('..', '.git') for part in value.parts):
        raise ValueError(f'Unsafe path: {relative}')
    result = base.joinpath(*value.parts)
    for parent in (result, *result.parents):
        if parent == base.parent:
            break
        if parent.is_symlink():
            raise ValueError(f'Symlink is not allowed in this intake: {relative}')
    return result


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def verify(upstream_root: Path | None) -> dict:
    registry = json.loads((ROOT / 'third_party/registry.json').read_text())
    pins = {pin['name']: pin for pin in json.loads((ROOT / 'docs/research/repository-pins.json').read_text())}
    require(registry['schema_version'] == 1, 'Unsupported registry version')
    require(len(registry['repositories']) == len(pins), 'Repository count differs from pins')
    seen = set()
    counts = {'repositories': 0, 'included_files': 0, 'omitted_files': 0, 'included_bytes': 0}
    for repo in registry['repositories']:
        name = repo['name']
        require(name not in seen and name in pins, f'Duplicate/unknown repository: {name}')
        seen.add(name)
        slug = name.lower()
        require(repo['id'] == slug and repo['snapshot'] == f'third_party/upstream/{slug}' and repo['manifest'] == f'third_party/manifests/{slug}.json' and repo['license'] == f'third_party/upstream/{slug}/LICENSE', f'Noncanonical registry path: {name}')
        require(repo['commit'] == pins[name]['commit'] and repo['remote'] == pins[name]['remote'], f'Pin mismatch: {name}')
        manifest_path = safe_path(ROOT, repo['manifest'])
        require(hashlib.sha256(manifest_path.read_bytes()).hexdigest() == repo['manifest_sha256'], f'Manifest hash mismatch: {name}')
        manifest = json.loads(manifest_path.read_text())
        require(manifest['schema_version'] == 1 and manifest['repository'] == name and manifest['commit'] == repo['commit'], f'Manifest identity mismatch: {name}')
        snapshot = safe_path(ROOT, repo['snapshot'])
        expected = set()
        all_entries = {}
        byte_count = 0
        omitted = 0
        for entry in manifest['files']:
            relative = entry['path']
            require(relative not in all_entries, f'Duplicate manifest path: {name}/{relative}')
            all_entries[relative] = (entry['mode'], 'blob', entry['git_blob'])
            path = safe_path(snapshot, relative)
            must_omit = relative in REQUIRED_OMISSIONS.get(name, set())
            require((entry['disposition'] == 'omitted') == must_omit, f'Omission policy violation: {name}/{relative}')
            require(entry['mode'] in ('100644', '100755'), f'Unsupported mode: {relative}')
            if entry['disposition'] == 'omitted':
                require(not path.exists() and bool(entry.get('reason')), f'Omission mismatch: {name}/{relative}')
                omitted += 1
                continue
            require(entry['disposition'] == 'included' and path.is_file(), f'Missing/invalid entry: {name}/{relative}')
            data = path.read_bytes()
            require(len(data) == entry['bytes'] and hashlib.sha256(data).hexdigest() == entry['sha256'], f'Content mismatch: {name}/{relative}')
            blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            require(blob == entry['git_blob'], f'Git blob mismatch: {name}/{relative}')
            if os.name != 'nt':
                require(bool(path.stat().st_mode & 0o111) == (entry['mode'] == '100755'), f'Executable mode mismatch: {name}/{relative}')
            expected.add(relative)
            byte_count += len(data)
        require(REQUIRED_OMISSIONS.get(name, set()).issubset(all_entries), f'Missing required omission record: {name}')
        actual = set()
        for path in snapshot.rglob('*'):
            require(not path.is_symlink(), f'Unexpected symlink: {path}')
            if path.is_file():
                actual.add(path.relative_to(snapshot).as_posix())
        require(actual == expected, f'Unexpected or missing snapshot files: {name}')
        require(len(expected) == repo['included_files'] and omitted == repo['omitted_files'] and byte_count == repo['included_bytes'] and len(all_entries) == repo['upstream_tracked_files'], f'Inventory count mismatch: {name}')
        require(safe_path(ROOT, repo['license']).is_file(), f'Missing license: {name}')
        if upstream_root is not None:
            tree = subprocess.check_output(['git', '-C', str(upstream_root / name), 'ls-tree', '-rz', repo['commit']])
            original = {}
            for row in tree.split(b'\0'):
                if row:
                    metadata, relative = row.split(b'\t', 1)
                    original[relative.decode()] = tuple(metadata.decode().split())
            require(original == all_entries, f'Original Git tree mismatch: {name}')
        counts['repositories'] += 1
        counts['included_files'] += len(expected)
        counts['omitted_files'] += omitted
        counts['included_bytes'] += byte_count
    counts['original_git_trees_checked'] = upstream_root is not None
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upstream-root', type=Path, help='Optionally verify full file inventories against pinned local Git trees')
    args = parser.parse_args()
    try:
        print(json.dumps({'status': 'pass', **verify(args.upstream_root)}, indent=2))
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(f'FAIL: {error}') from error


if __name__ == '__main__':
    main()
