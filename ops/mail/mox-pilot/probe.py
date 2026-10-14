"""Bounded synthetic SMTP/IMAP assertions for Mox localserve."""

import imaplib
import os
import smtplib
import socket
import time
from email.message import EmailMessage


HOST = "mox"
SMTP_PORT = 1587
IMAP_PORT = 1143
TIMEOUT = 8


def wait_for_port(port: int) -> None:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((HOST, port), timeout=TIMEOUT):
                return
        except OSError:
            time.sleep(1)
    raise AssertionError(f"fixture port {port} did not become ready")


def smtp_case(recipient: str, expected_class: int, subject: str) -> None:
    message = EmailMessage()
    message["From"] = "sender@pilot.test"
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content("Synthetic MAIL-818 local-only fixture.")
    try:
        with smtplib.SMTP(HOST, SMTP_PORT, timeout=TIMEOUT) as smtp:
            smtp.send_message(message)
        status = 2
    except (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused,
            smtplib.SMTPDataError) as error:
        if isinstance(error, smtplib.SMTPRecipientsRefused):
            codes = [value[0] for value in error.recipients.values()]
            assert len(codes) == 1
            status = codes[0] // 100
        else:
            status = error.smtp_code // 100
    assert status == expected_class, (recipient, status, expected_class)


def assert_imap_subject(subject: str) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        with imaplib.IMAP4(HOST, IMAP_PORT, timeout=TIMEOUT) as imap:
            imap.login("mox@localhost", "moxmoxmox")
            result, _ = imap.select("INBOX", readonly=True)
            assert result == "OK"
            result, values = imap.search(None, "HEADER", "Subject", subject)
            assert result == "OK"
            if values and values[0].split():
                return
        time.sleep(1)
    raise AssertionError("accepted synthetic message absent from IMAP")


def assert_no_external_egress() -> None:
    # AIDEV-NOTE: Internal DNS should not resolve external names on an internal-only network.
    try:
        socket.getaddrinfo("example.com", 443)
    except OSError:
        pass
    else:
        raise AssertionError("external DNS unexpectedly available")
    try:
        with socket.create_connection(("1.1.1.1", 443), timeout=2):
            pass
    except OSError:
        return
    raise AssertionError("external TCP egress unexpectedly available")


def main() -> None:
    assert_no_external_egress()
    wait_for_port(SMTP_PORT)
    wait_for_port(IMAP_PORT)
    subject = "MAIL818-SYNTHETIC-" + os.environ.get("HOSTNAME", "probe")
    smtp_case("accepted@pilot.test", 2, subject)
    assert_imap_subject(subject)
    smtp_case("reject-permerror@pilot.test", 5, subject + "-permanent")
    smtp_case("reject-temperror@pilot.test", 4, subject + "-temporary")
    print("PASS: local SMTP, IMAP, permanent/temporary failures, egress denial")


if __name__ == "__main__":
    main()
