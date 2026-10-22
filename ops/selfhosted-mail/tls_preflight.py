"""Private-root admission and trusted TLS verification, without network access."""
from __future__ import annotations

import os
from pathlib import Path
import stat
import subprocess
import sys

from validation import load, validate


def private_root(root: Path) -> None:
    if not root.is_absolute() or root != root.resolve(strict=True):
        raise ValueError('absolute canonical private root required')
    for parent in [root, *root.parents]:
        if (parent / '.git').exists():
            raise ValueError('private root cannot be inside a checkout')
        info = parent.stat()
        # AIDEV-NOTE: Sticky /tmp is safe for an owner-controlled child; writable nonsticky parents permit replacement.
        if info.st_uid not in {0, os.getuid()} or (info.st_mode & 0o022 and not info.st_mode & stat.S_ISVTX):
            raise ValueError('private root has an untrusted ancestor')
    info = root.stat()
    if not root.is_dir() or info.st_mode & 0o077 or info.st_uid not in {0, os.getuid()}:
        raise ValueError('private root must be owner-controlled mode0700')


def private_file(root: Path, relative: str, limit: int = 131072) -> Path:
    path = root / relative
    # AIDEV-NOTE: Every component is checked; checking only the leaf misses symlinked secret directories.
    for component in [path, *path.parents]:
        if component == root:
            break
        if component.is_symlink():
            raise ValueError('symlink inside private root')
        if component != path:
            info = component.stat()
            if info.st_mode & 0o077 or info.st_uid not in {0, os.getuid()}:
                raise ValueError('private file parent must be owner-controlled mode0700')
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid not in {0, os.getuid()} or \
            info.st_mode & 0o077 or info.st_nlink != 1 or not 0 < info.st_size <= limit:
        raise ValueError('private file must be bounded, unlinked and owner-controlled')
    return path


def openssl(*args: str) -> bytes:
    result = subprocess.run(['openssl', *args], capture_output=True, timeout=30, check=False)
    if result.returncode:
        raise ValueError('TLS certificate, trust, name, expiry or key validation failed')
    return result.stdout


def check_tls(root: Path, ca_file: Path | None = None) -> None:
    private_root(root)
    plan = validate(load(private_file(root, 'manifest.json')))
    for name in ['config/mox.conf', 'config/domains.conf']:
        private_file(root, name)
    cert = private_file(root, 'tls/fullchain.pem')
    key = private_file(root, 'tls/privkey.pem')
    trust = ['-CAfile', str(ca_file)] if ca_file is not None else []
    # AIDEV-NOTE: Name/key checks alone accept self-signed certificates; verify the chain and server purpose too.
    openssl('verify', *trust, '-purpose', 'sslserver', '-verify_hostname', plan['hostname'],
            '-untrusted', str(cert), str(cert))
    openssl('x509', '-in', str(cert), '-noout', '-checkend', '1209600')
    openssl('pkey', '-in', str(key), '-check', '-noout')
    cert_public = openssl('x509', '-in', str(cert), '-noout', '-pubkey')
    key_public = openssl('pkey', '-in', str(key), '-pubout')
    if cert_public != key_public:
        raise ValueError('TLS private key does not match certificate')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: tls_preflight.py ABSOLUTE_PRIVATE_ROOT')
    check_tls(Path(sys.argv[1]))
