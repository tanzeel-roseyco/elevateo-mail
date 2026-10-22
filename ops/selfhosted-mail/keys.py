"""Create per-domain DKIM keys exclusively; TLS is supplied by the host operator."""
from __future__ import annotations

from pathlib import Path
import subprocess
import sys

from validation import load, validate
from tls_preflight import private_file, private_root
from private_publish import publish


def keys(root: Path) -> None:
    private_root(root)
    plan = validate(load(private_file(root, 'manifest.json')))
    directory = root / 'config/dkim'
    if directory != directory.resolve(strict=True) or directory.stat().st_mode & 0o077:
        raise ValueError('DKIM directory must be canonical and private')
    # AIDEV-NOTE: Never overwrite DKIM keys: rotation requires a separate selector and DNS overlap.
    for domain in plan['verified_domains']:
        # AIDEV-NOTE: Generate and validate before publishing so OpenSSL failure cannot poison the exclusive target.
        result = subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt',
                                 'rsa_keygen_bits:2048'], capture_output=True, check=True, timeout=60)
        subprocess.run(['openssl', 'pkey', '-check', '-noout'], input=result.stdout,
                       capture_output=True, check=True, timeout=30)
        publish(directory / f'{domain}.pem', result.stdout)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: keys.py ABSOLUTE_PRIVATE_ROOT')
    keys(Path(sys.argv[1]))
