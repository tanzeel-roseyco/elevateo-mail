"""Private Mox serve fixture; synthetic accounts never leave the container."""
from __future__ import annotations

import os
from pathlib import Path
import socket
import subprocess
import time

ROOT = Path('/tmp/mail1017')
CONFIG = ROOT / 'config'
MOX = '/release/mox'
COUNT = 700


def account(index: int) -> str:
    if not 0 <= index < COUNT:
        raise ValueError('synthetic account index outside capacity plan')
    return f'outreach{index:03d}@send.test' if index < 500 else f'seed{index - 500:03d}@seed.test'


def command(*args: str, data: bytes | None = None, timeout: int = 60) -> bytes:
    result = subprocess.run([MOX, '-config', str(CONFIG / 'mox.conf'), *args],
                            input=data, capture_output=True, timeout=timeout, check=False)
    if result.returncode:
        # AIDEV-NOTE: CLI stderr is retained privately; credentials never become test-report fields.
        with (ROOT / 'cli-errors.log').open('ab') as output:
            output.write(result.stderr)
        raise RuntimeError(f'Mox command failed: {args[0]} ({result.returncode})')
    return result.stdout


def configure() -> None:
    ROOT.mkdir(mode=0o750)
    CONFIG.mkdir(mode=0o750)
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                    '-keyout', str(CONFIG / 'tls.key'), '-out', str(CONFIG / 'tls.crt'),
                    '-days', '2', '-subj', '/CN=localhost',
                    '-addext', 'subjectAltName=DNS:localhost,DNS:mail.lab.test'],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    static = '''DataDir: ../data
User: 1000
NoFixPermissions: true
LogLevel: info
Hostname: mail.lab.test
QuotaMessageSize: 52428800
Postmaster:
\tAccount: outreach000@send.test
\tMailbox: Inbox
TLS:
\tCA:
\t\tAdditionalToSystem: true
\t\tCertFiles:
\t\t\t- tls.crt
Listeners:
\tpublic:
\t\tIPs:
\t\t\t- 127.0.0.1
\t\tTLS:
\t\t\tKeyCerts:
\t\t\t\t-
\t\t\t\t\tCertFile: tls.crt
\t\t\t\t\tKeyFile: tls.key
\t\tSMTPMaxMessageSize: 1048576
\t\tSMTP:
\t\t\tEnabled: true
\t\t\tPort: 1025
\t\t\tFirstTimeSenderDelay: 0s
\t\tSubmission:
\t\t\tEnabled: true
\t\t\tPort: 1587
\t\tSubmissions:
\t\t\tEnabled: true
\t\t\tPort: 1465
\t\tIMAPS:
\t\t\tEnabled: true
\t\t\tPort: 1993
Transports:
\tloopback:
\t\tSMTP:
\t\t\tHost: localhost
\t\t\tPort: 1025
'''
    dynamic = 'Domains:\n\tsend.test: nil\n\tseed.test: nil\nAccounts:\n'
    for index in range(COUNT):
        address = account(index)
        dynamic += (f'\t{address}:\n\t\tDomain: {address.split("@")[1]}\n'
                    f'\t\tDestinations:\n\t\t\t{address}: nil\n'
                    '\t\tNoFirstTimeSenderDelay: true\n'
                    '\t\tMaxOutgoingMessagesPerDay: 30\n')
        if index == 699:
            dynamic += '\t\tQuotaMessageSize: 4096\n'
    # AIDEV-NOTE: Loopback route is a fixture transport, never a production relay configuration.
    dynamic += 'Routes:\n\t-\n\t\tTransport: loopback\n'
    (CONFIG / 'mox.conf').write_text(static, encoding='utf-8')
    (CONFIG / 'domains.conf').write_text(dynamic, encoding='utf-8')
    (ROOT / 'data').mkdir()
    for path in [ROOT, *ROOT.rglob('*')]:
        path.chmod(0o750 if path.is_dir() else 0o640)
        os.chown(path, 1000, 1000)


def start(log: Path, port: int = 1993) -> subprocess.Popen[bytes]:
    with log.open('ab') as output:
        process = subprocess.Popen([MOX, '-config', str(CONFIG / 'mox.conf'), 'serve'],
                                   cwd=ROOT, stdout=output, stderr=output, start_new_session=True)
    try:
        end = time.monotonic() + 30
        while time.monotonic() < end:
            if process.poll() is not None:
                raise RuntimeError('Mox serve exited during startup')
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=0.5):
                    return process
            except OSError:
                time.sleep(0.1)
        raise RuntimeError('Mox startup deadline exceeded')
    except BaseException:
        # AIDEV-NOTE: Failed startup cannot return its handle, so this function owns failure cleanup.
        stop(process)
        raise


def stop(process: subprocess.Popen[bytes]) -> None:
    import signal
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
