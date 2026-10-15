"""Keep isolated Mox alive for the app codec/IMAP compatibility container."""
from __future__ import annotations

import json
from pathlib import Path
import secrets
import shutil
import time

import dns_fixture
from fixture import CONFIG, ROOT, account, command, configure, start, stop


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
        # AIDEV-NOTE: Private synthetic credentials exist only for this run; the host trap deletes this exact file.
        credentials = out / 'fixture-credentials.json'
        credentials.write_text(json.dumps(passwords), encoding='utf-8')
        credentials.chmod(0o600)
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
