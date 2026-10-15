"""Real serve policy and TLS delivery probes; all addresses are synthetic .test."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import base64
from email.message import EmailMessage
from email.policy import SMTP
from email.parser import BytesParser
import imaplib
import secrets
import smtplib
import socket
import ssl
import time

from fixture import CONFIG, COUNT, account, command

ACTIVE = [0, 1, 2, 3, 500, 501, 502, 503]
PASSWORDS = {index: secrets.token_urlsafe(24) for index in range(COUNT)}
TOKEN = secrets.token_hex(12)
DELIVERIES: list[tuple[int, str]] = [(500, TOKEN)]


def tls() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=str(CONFIG / 'tls.crt'))


def submission(index: int = 0) -> smtplib.SMTP_SSL:
    client = smtplib.SMTP_SSL('localhost', 1465, context=tls(), timeout=10)
    try:
        client.login(account(index), PASSWORDS[index])
    except BaseException:
        client.close()
        raise
    return client


def mailbox(index: int) -> imaplib.IMAP4_SSL:
    client = imaplib.IMAP4_SSL('localhost', 1993, ssl_context=tls(), timeout=10)
    try:
        client.login(account(index), PASSWORDS[index])
        status, _ = client.select('Inbox', readonly=True)
        assert status == 'OK'
    except BaseException:
        client.shutdown()
        raise
    return client


def search(index: int, token: str) -> list[bytes]:
    with mailbox(index) as client:
        status, values = client.uid('search', None, 'SUBJECT', f'"{token}"')
        assert status == 'OK'
        return values[0].split()


def wait_delivery(index: int, token: str) -> float:
    started = time.monotonic()
    while time.monotonic() - started < 30:
        with mailbox(index) as client:
            status, values = client.uid('search', None, 'SUBJECT', f'"{token}"')
            assert status == 'OK'
            if values[0]:
                assert len(values[0].split()) == 1, 'duplicate delivered message'
                status, rows = client.uid('fetch', values[0], '(BODY.PEEK[])')
                assert status == 'OK' and isinstance(rows[0], tuple), 'missing message content'
                message = BytesParser(policy=SMTP).parsebytes(rows[0][1])
                assert message['Subject'] == token, 'sentinel subject mismatch'
                body = message.get_content().replace('\r\n', '\n').strip()
                assert body == f'Synthetic consented diagnostic\n{token}', 'body mismatch'
                return time.monotonic() - started
        time.sleep(0.2)
    raise AssertionError('SMTP accepted but delivery never appeared in IMAP')


def send(source: int, target: int, token: str, body: str = 'Synthetic consented diagnostic') -> None:
    message = EmailMessage(policy=SMTP)
    message['From'], message['To'] = account(source), account(target)
    message['Subject'] = token
    message['Message-ID'] = f'<{token}@send.test>'
    message.set_content(f'{body}\n{token}')
    with submission(source) as client:
        assert client.send_message(message) == {}, 'recipient refused'


def negative_cases() -> list[str]:
    checks = []
    with smtplib.SMTP('localhost', 1587, timeout=10) as client:
        client.ehlo()
        # AIDEV-NOTE: Mox advertises challenge auth before TLS but must reject plaintext password mechanisms.
        assert 'PLAIN' not in client.esmtp_features.get('auth', '').split()
        plain = base64.b64encode(f'\0{account(0)}\0{PASSWORDS[0]}'.encode()).decode()
        assert client.docmd('AUTH', f'PLAIN {plain}')[0] >= 500
        assert client.mail(account(0))[0] >= 500
        client.starttls(context=tls())
        client.ehlo()
        assert client.has_extn('AUTH')
        assert client.mail(account(0))[0] >= 500, 'unauthenticated TLS submission accepted'
    checks.append('STARTTLS required; unauthenticated submission rejected')
    with smtplib.SMTP('localhost', 1025, timeout=10) as client:
        client.ehlo()
        assert client.mail('')[0] == 250
        assert client.rcpt('recipient@outside.invalid')[0] >= 500
    checks.append('unauthenticated relay denied')
    with submission() as client:
        assert client.mail(account(1))[0] >= 500, 'cross-account envelope sender accepted'
        client.rset()
        assert client.mail(account(0))[0] == 250
        assert client.rcpt('missing@seed.test')[0] >= 500
    checks.append('sender impersonation and unknown local recipient denied')
    with smtplib.SMTP_SSL('localhost', 1465, context=tls(), timeout=15) as client:
        try:
            client.login(account(0), 'wrong-synthetic-password')
        except smtplib.SMTPAuthenticationError:
            checks.append('wrong SMTP password denied')
        else:
            raise AssertionError('wrong SMTP password accepted')
    with imaplib.IMAP4_SSL('localhost', 1993, ssl_context=tls(), timeout=15) as client:
        try:
            client.login(account(1), PASSWORDS[0])
        except imaplib.IMAP4.error:
            checks.append('cross-account IMAP password denied')
        else:
            raise AssertionError('cross-account password accepted')
    for context, hostname in [(ssl.create_default_context(), 'localhost'), (tls(), 'wrong.test')]:
        with socket.create_connection(('localhost', 1993), timeout=5) as raw:
            try:
                with context.wrap_socket(raw, server_hostname=hostname):
                    raise AssertionError('invalid server certificate accepted')
            except ssl.SSLCertVerificationError:
                checks.append('certificate chain or hostname mismatch denied')
    return checks


def exercise() -> dict[str, object]:
    provision_started = time.monotonic()
    for index in range(COUNT):
        command('setaccountpassword', account(index), data=(PASSWORDS[index] + '\n').encode())
    provision_seconds = time.monotonic() - provision_started
    for index in [0, 499, 500, 699]:
        assert search(index, TOKEN) == [], 'new mailbox was not empty'
    checks = negative_cases()
    send(0, 500, TOKEN)
    latency = wait_delivery(500, TOKEN)
    assert search(501, TOKEN) == [], 'message crossed account boundary'
    checks.append('SMTP TLS to IMAP TLS exact sentinel delivery and isolation')
    # AIDEV-NOTE: Two bounded connections model scheduler reuse; never spawn one worker per mailbox.
    tokens = [secrets.token_hex(12) for _ in range(16)]
    DELIVERIES.extend((500 + index % 4, token) for index, token in enumerate(tokens))
    def roundtrip(index: int) -> float:
        token = tokens[index]
        send(index % 4, 500 + index % 4, token)
        return wait_delivery(500 + index % 4, token)
    with ThreadPoolExecutor(max_workers=2) as pool:
        latencies = list(pool.map(roundtrip, range(16)))
    return {'checks': checks, 'accounts_configured': COUNT, 'accounts_password_provisioned': COUNT,
            'accounts_in_delivery_workload': len(ACTIVE), 'provision_seconds': provision_seconds,
            'concurrent_workers': 2, 'messages_verified': 17, 'first_delivery_seconds': latency,
            'roundtrip_max_seconds': max(latencies), 'roundtrip_median_seconds': sorted(latencies)[8]}
