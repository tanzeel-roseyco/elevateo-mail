"""Validate generated native configuration and prove its account/domain holds."""
from __future__ import annotations

import imaplib
import os
from pathlib import Path
import secrets
import shutil
import smtplib
import ssl
import sys

from fixture import CONFIG, ROOT, command, start, stop

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from plan import compile_plan


def verify_prepared() -> dict[str, object]:
    output = ROOT / 'prepared'
    compile_plan(Path(__file__).resolve().parents[1] / 'plan.example.json', output)
    saved = {name: (CONFIG / name).read_bytes() for name in ['mox.conf', 'domains.conf']}
    process = None
    try:
        for name in saved:
            shutil.copyfile(output / name, CONFIG / name)
        static = (CONFIG / 'mox.conf').read_text()
        # AIDEV-NOTE: The container has numeric UID 1000 instead of native system user mox; no policy is changed.
        (CONFIG / 'mox.conf').write_text(static.replace('User: mox\n', 'User: 1000\nNoFixPermissions: true\n'))
        for name in saved:
            (CONFIG / name).chmod(0o640)
            os.chown(CONFIG / name, 1000, 1000)
        command('config', 'test')
        process = start(ROOT / 'server.log', port=993)
        password = secrets.token_urlsafe(24)
        command('setaccountpassword', 'member000@team.test', data=(password + '\n').encode())
        context = ssl.create_default_context(cafile=str(CONFIG / 'tls.crt'))
        with imaplib.IMAP4_SSL('localhost', 993, ssl_context=context, timeout=15) as client:
            try:
                client.login('member000@team.test', password)
            except imaplib.IMAP4.error as exc:
                assert 'activation pending' in str(exc), 'IMAP rejection was not the configured login hold'
            else:
                raise AssertionError('prepared account login was not disabled')
        with smtplib.SMTP('localhost', 25, timeout=10) as client:
            client.ehlo()
            assert client.mail('')[0] == 250
            code, diagnostic = client.rcpt('member000@team.test')
            assert code == 450 and b'recipient domain temporarily disabled' in diagnostic
        return {'prepared_accounts': 712, 'native_config_parsed': True,
                'prepared_login_denied': True, 'prepared_domain_delivery_denied': True}
    finally:
        # AIDEV-NOTE: Always restore the independent delivery fixture, including after a failed held-account probe.
        if process is not None:
            stop(process)
        for name, content in saved.items():
            (CONFIG / name).write_bytes(content)
        for path in (ROOT / 'data').iterdir():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
