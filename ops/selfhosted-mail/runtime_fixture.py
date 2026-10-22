"""Test-only activation of the generated production config inside network-none Docker."""
from __future__ import annotations

import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import time

from generate import generate
from keys import keys
from test_deployment import fixture
from tls_preflight import check_tls

ROOT = Path('/tmp/mailruntime')
MOX = '/release/mox'
HOST = 'mail.dispatch.company.com'


def command(root: Path, *args: str, data: bytes | None = None) -> bytes:
    # AIDEV-NOTE: Backup destination is created by the CLI; match the daemon UID so it can populate that directory.
    identity = 1000 if args[0] == 'backup' else 0
    result = subprocess.run([MOX, '-config', str(root / 'config/mox.conf'), *args],
                            input=data, capture_output=True, timeout=60, check=False,
                            user=identity, group=identity)
    if result.returncode:
        raise RuntimeError(f'Mox {args[0]} failed ({result.returncode})')
    return result.stdout


def openssl(*args: str) -> None:
    subprocess.run(['openssl', *args], capture_output=True, check=True, timeout=60)


def configure() -> Path:
    source = Path('/tmp/runtime-manifest.json')
    source.write_text(json.dumps(fixture()))
    generate(source, ROOT)
    keys(ROOT)
    ca = ROOT / 'ca.pem'
    openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(ROOT / 'ca.key'),
            '-out', str(ca), '-days', '30', '-subj', '/CN=Private runtime test CA',
            '-addext', 'basicConstraints=critical,CA:TRUE')
    openssl('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(ROOT / 'tls/privkey.pem'),
            '-out', str(ROOT / 'request.pem'), '-subj', '/CN=' + HOST)
    extensions = ROOT / 'extensions.txt'
    extensions.write_text('basicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\n'
                          'subjectAltName=DNS:' + HOST + '\n')
    openssl('x509', '-req', '-in', str(ROOT / 'request.pem'), '-CA', str(ca),
            '-CAkey', str(ROOT / 'ca.key'), '-CAcreateserial', '-days', '30',
            '-extfile', str(extensions), '-out', str(ROOT / 'tls/fullchain.pem'))
    for path in ROOT.rglob('*'):
        if path.is_file():
            path.chmod(0o600)
    check_tls(ROOT, ca)
    static = ROOT / 'config/mox.conf'
    dynamic = ROOT / 'config/domains.conf'
    # AIDEV-NOTE: Only listener IP and activation holds change; no localserve, relay or transport bypass is added.
    static.write_text(static.read_text().replace('- 8.8.4.4', '- 127.0.0.1'))
    dynamic.write_text(dynamic.read_text().replace('\t\tDisabled: true\n', '')
                       .replace('\t\tLoginDisabled: activation pending\n', ''))
    command(ROOT, 'config', 'test')
    for path in [ROOT, *ROOT.rglob('*')]:
        os.chown(path, 1000, 1000)
    return ca


def start(root: Path) -> subprocess.Popen[bytes]:
    with (root / 'server.log').open('ab') as log:
        process = subprocess.Popen([MOX, '-config', str(root / 'config/mox.conf'), 'serve'],
                                   cwd=root, stdout=log, stderr=log, start_new_session=True)
    try:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError('production serve exited at startup')
            try:
                with socket.create_connection(('127.0.0.1', 993), timeout=0.5):
                    return process
            except OSError:
                time.sleep(0.1)
        raise RuntimeError('production serve startup timeout')
    except BaseException:
        stop(process)
        raise


def stop(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
