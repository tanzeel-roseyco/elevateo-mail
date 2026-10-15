"""Keep isolated Mox alive for the app codec/IMAP compatibility container."""
from __future__ import annotations

import json
import os
from pathlib import Path
import secrets
import shutil
import time

import dns_fixture
from fixture import CONFIG, ROOT, account, command, configure, start, stop


def write_credentials(out: Path, passwords: dict[str, str]) -> None:
    owner = out.stat()
    if out.is_symlink() or owner.st_mode & 0o777 != 0o700:
        raise PermissionError('fixture evidence directory must be private')
    # AIDEV-NOTE: The root fixture hands this 0600 file to the host directory owner; cleanup deletes only this file.
    descriptor = os.open(out / 'fixture-credentials.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as credentials:
        os.fchown(credentials.fileno(), owner.st_uid, owner.st_gid)
        json.dump(passwords, credentials)


def main() -> None:
    out = Path('/evidence')
    process = None
    dns = None
    try:
        configure()
        dns = dns_fixture.start()
        process = start(ROOT / 'server.log')
        passwords = {account(index): secrets.token_urlsafe(24) for index in [0, 500]}
        for address, password in passwords.items():
            command('setaccountpassword', address, data=(password + '\n').encode())
        shutil.copyfile(CONFIG / 'tls.crt', out / 'fixture-ca.pem')
        write_credentials(out, passwords)
        (out / 'ready').write_text('ready\n', encoding='ascii')
        end = time.monotonic() + 360
        while time.monotonic() < end:
            if (out / 'finished').exists():
                return
            if process.poll() is not None:
                raise RuntimeError('Mox exited before compatibility test finished')
            time.sleep(0.2)
        raise TimeoutError('application compatibility test deadline exceeded')
    finally:
        try:
            if process:
                stop(process)
        finally:
            if dns:
                dns.shutdown()
                dns.server_close()
            if (ROOT / 'server.log').exists():
                shutil.copyfile(ROOT / 'server.log', out / 'server.log')


if __name__ == '__main__':
    main()
