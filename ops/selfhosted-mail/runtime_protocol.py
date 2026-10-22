"""Real SMTP587 STARTTLS and IMAP993 verified-TLS acceptance probes."""
from __future__ import annotations

from email.message import EmailMessage
import imaplib
import json
from pathlib import Path
import smtplib
import socket
import ssl
import time

from runtime_fixture import HOST, ROOT, command


def credentials(index: int) -> tuple[str, str]:
    item = json.loads((ROOT / f'credentials/{index:03d}.json').read_text())
    return item['account'], item['password']


def context(ca: Path) -> ssl.SSLContext:
    return ssl.create_default_context(cafile=str(ca))


def smtp(ca: Path, index: int = 0) -> smtplib.SMTP:
    client = smtplib.SMTP(HOST, 587, timeout=15)
    try:
        client.ehlo()
        client.starttls(context=context(ca))
        client.ehlo()
        client.login(*credentials(index))
        return client
    except BaseException:
        client.close()
        raise


def mailbox(ca: Path, index: int = 0) -> imaplib.IMAP4_SSL:
    client = imaplib.IMAP4_SSL(HOST, 993, ssl_context=context(ca), timeout=15)
    try:
        client.login(*credentials(index))
        return client
    except BaseException:
        client.shutdown()
        raise


def verify_message(ca: Path, token: str, index: int = 0) -> None:
    with mailbox(ca, index) as client:
        assert client.select('Inbox', readonly=True)[0] == 'OK'
        status, ids = client.uid('search', 'SUBJECT', token)
        assert status == 'OK' and len(ids[0].split()) == 1
        status, rows = client.uid('fetch', ids[0], '(BODY.PEEK[])')
        assert status == 'OK' and isinstance(rows[0], tuple) and token.encode() in rows[0][1]


def exercise(ca: Path) -> list[str]:
    checks: list[str] = []
    for index in [0, 1]:
        account, password = credentials(index)
        command(ROOT, 'setaccountpassword', account, data=(password + '\n').encode())
    with smtplib.SMTP(HOST, 25, timeout=15) as client:
        client.ehlo()
        assert client.mail('')[0] == 250
        assert client.rcpt('recipient@outside.invalid')[0] >= 500
        client.rset()
        assert client.mail('')[0] == 250
        code, _ = client.rcpt('unknown@dispatch.company.com')
        checks.append(f'unknown local RCPT response {code}; upstream defers address rejection to DATA')
        if code < 400:
            code, _ = client.data(b'From: postmaster@outside.invalid\r\nTo: unknown@dispatch.company.com\r\n'
                                  b'Subject: unknown-recipient-sentinel\r\n\r\nMust not persist\r\n')
        assert code >= 500
        checks.append(f'unknown local delivery permanently rejected with {code}')
    checks += ['unauthenticated external relay denied']
    with smtplib.SMTP(HOST, 587, timeout=15) as client:
        client.ehlo()
        assert 'PLAIN' not in client.esmtp_features.get('auth', '').split()
        assert client.mail(credentials(0)[0])[0] >= 500
        client.starttls(context=context(ca))
        client.ehlo()
        assert client.mail(credentials(0)[0])[0] >= 500
        try:
            client.login(credentials(0)[0], 'wrong-password')
        except smtplib.SMTPAuthenticationError:
            checks.append('wrong SMTP password denied; unauthenticated submission denied')
        else:
            raise AssertionError('wrong SMTP password accepted')
    with smtp(ca) as client:
        assert client.mail(credentials(1)[0])[0] >= 500
        client.rset()
        assert client.mail(credentials(0)[0])[0] == 250
        assert client.rcpt(credentials(1)[0])[0] == 250
        message = EmailMessage()
        message['From'], message['To'] = credentials(0)[0], credentials(1)[0]
        message['Subject'] = 'owned-smtp-runtime'
        message.set_content('Private test-only SMTP acceptance')
        assert client.data(message.as_bytes())[0] == 250
    checks += ['A cannot submit as B', 'owned authenticated SMTP587 STARTTLS accepted']
    deadline = time.monotonic() + 45
    while True:
        try:
            verify_message(ca, 'owned-smtp-runtime', 1)
            break
        except AssertionError:
            if time.monotonic() >= deadline:
                raise AssertionError('SMTP-to-B IMAP delivery did not complete within45seconds') from None
            time.sleep(0.5)
    checks.append('A SMTP message delivered to B verified-TLS IMAP')
    with imaplib.IMAP4_SSL(HOST, 993, ssl_context=context(ca), timeout=15) as client:
        try:
            client.login(credentials(1)[0], credentials(0)[1])
        except imaplib.IMAP4.error:
            checks.append('A password cannot authenticate/read B')
        else:
            raise AssertionError('cross-account IMAP password accepted')
    for index in [0, 1]:
        with mailbox(ca, index) as client:
            token = f'private-sentinel-{index}'
            # AIDEV-NOTE: imaplib requires these positions but accepts None; bundled typeshed incorrectly requires str.
            assert client.append('Inbox', None, None,  # type: ignore[arg-type]
                                 f'Subject: {token}\r\n\r\n{token}\r\n'.encode())[0] == 'OK'
            verify_message(ca, token, index)
            assert client.select('Inbox', readonly=True)[0] == 'OK'
            assert client.uid('search', 'SUBJECT', 'unknown-recipient-sentinel') == ('OK', [b''])
    assert not (ROOT / 'data/accounts/unknown@dispatch.company.com').exists()
    checks.append('unknown local message not persisted in either owned Inbox or an unknown account')
    with mailbox(ca) as client:
        assert client.select('Inbox', readonly=True)[0] == 'OK'
        assert client.uid('search', 'SUBJECT', 'private-sentinel-1') == ('OK', [b''])
        assert client.uid('search', 'SUBJECT', 'owned-smtp-runtime') == ('OK', [b''])
        assert client.select(credentials(1)[0] + '/Inbox', readonly=True)[0] == 'NO'
    checks += ['verified IMAP993 owned append/read', 'A cannot see B sentinel or select B mailbox']
    for trust, hostname in [(ssl.create_default_context(), HOST), (context(ca), 'wrong.invalid')]:
        with socket.create_connection((HOST, 993), timeout=5) as raw:
            try:
                with trust.wrap_socket(raw, server_hostname=hostname):
                    raise AssertionError('invalid server certificate accepted')
            except ssl.SSLCertVerificationError:
                checks.append('untrusted chain or wrong server name denied')
    return checks
