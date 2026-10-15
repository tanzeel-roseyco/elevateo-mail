"""Exercise actual SMTP message and IMAP storage limits with tiny synthetic payloads."""
from __future__ import annotations

from email.message import EmailMessage
from email.policy import SMTP
import imaplib

from fixture import account
from protocol import PASSWORDS, submission, tls


def verify_limits() -> list[str]:
    with submission() as client:
        assert client.esmtp_features.get('size') == '1048576'
        code, _ = client.mail(account(0), options=['SIZE=1048577'])
        assert code == 552, 'oversized SMTP envelope was accepted'
    message = EmailMessage(policy=SMTP)
    message['From'], message['To'] = account(0), account(699)
    message['Subject'] = 'quota-probe'
    message.set_content('x' * 6000)
    with imaplib.IMAP4_SSL('localhost', 1993, ssl_context=tls(), timeout=10) as client:
        client.login(account(699), PASSWORDS[699])
        status, rows = client.append('Inbox', None, None, message.as_bytes())
        assert status == 'NO' and b'OVERQUOTA' in b' '.join(rows), 'mailbox byte quota not enforced'
        assert client.select('Inbox', readonly=True)[1] == [b'0'], 'rejected append left a message'
        message.set_content('small permitted payload')
        assert client.append('Inbox', None, None, message.as_bytes())[0] == 'OK'
        assert client.select('Inbox', readonly=True)[1] == [b'1'], 'valid append was not persisted'
    return ['oversized SMTP envelope rejected at 1 MiB', 'IMAP over-quota append rejected atomically; small append accepted']
