"""Bounded synthetic SMTP/IMAP assertions for Mox localserve."""

import imaplib
import hashlib
import json
import os
import smtplib
import socket
import time
from email.message import EmailMessage
from pathlib import Path


HOST = "mox"
SMTP_PORT = 1025
SUBMISSION_PORT = 1587
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


def smtp_case(recipient: str, expected_class: int, subject: str,
              submission: bool = False) -> None:
    if not recipient.endswith("@pilot.test"):
        raise ValueError("recipient outside synthetic pilot.test domain")
    message = EmailMessage()
    message["From"] = "sender@pilot.test"
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content("Synthetic MAIL-818 local-only fixture.")
    try:
        with smtplib.SMTP(HOST, SUBMISSION_PORT if submission else SMTP_PORT,
                          timeout=TIMEOUT) as smtp:
            if submission:
                smtp.login("mox@localhost", "moxmoxmox")
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


def uid_evidence(subject: str) -> dict[str, object]:
    with imaplib.IMAP4(HOST, IMAP_PORT, timeout=TIMEOUT) as imap:
        imap.login("mox@localhost", "moxmoxmox")
        result, _ = imap.select("INBOX", readonly=True)
        assert result == "OK"
        _, epoch_values = imap.response("UIDVALIDITY")
        if not epoch_values or not epoch_values[0] or not epoch_values[0].isdigit():
            raise AssertionError("IMAP UIDVALIDITY missing")
        result, values = imap.uid("SEARCH", None, "HEADER", "Subject", subject)
        if result != "OK" or not values or not values[0].split():
            raise AssertionError("synthetic IMAP UID absent")
        uid = values[0].split()[0]
        result, parts = imap.uid("FETCH", uid, "(BODY.PEEK[])")
        if result != "OK" or not parts or not isinstance(parts[0], tuple):
            raise AssertionError("synthetic IMAP MIME absent")
        raw = parts[0][1]
        if not isinstance(raw, bytes) or not 1 <= len(raw) <= 1_048_576:
            raise AssertionError("synthetic IMAP MIME invalid")
        return {"uidvalidity": int(epoch_values[0]), "uid": int(uid),
                "content_sha256": hashlib.sha256(raw).hexdigest()}


def assert_wrong_password_denied() -> None:
    with imaplib.IMAP4(HOST, IMAP_PORT, timeout=TIMEOUT) as imap:
        try:
            imap.login("mox@localhost", "wrong-synthetic-password")
        except imaplib.IMAP4.error:
            return
    raise AssertionError("IMAP accepted wrong password")


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


def assert_data_timeout_is_uncertain(subject: str) -> None:
    message = EmailMessage()
    message["From"] = "sender@pilot.test"
    message["To"] = "reject-timeout@pilot.test"
    message["Subject"] = subject + "-uncertain"
    message.set_content("Synthetic timeout; never resend automatically.")
    smtp = smtplib.SMTP(HOST, SMTP_PORT, timeout=3)
    try:
        smtp.ehlo()
        if smtp.mail("sender@pilot.test")[0] != 250 or smtp.rcpt("reject-timeout@pilot.test")[0] != 250:
            raise AssertionError("timeout fixture failed before DATA")
        try:
            smtp.data(message.as_bytes())
        except (TimeoutError, OSError, smtplib.SMTPServerDisconnected):
            return
        raise AssertionError("Mox timeout suffix unexpectedly accepted")
    finally:
        smtp.close()


def main() -> None:
    assert_no_external_egress()
    wait_for_port(SMTP_PORT)
    wait_for_port(SUBMISSION_PORT)
    wait_for_port(IMAP_PORT)
    assert_wrong_password_denied()
    subject = os.environ["MOX_PILOT_SUBJECT"]
    if not subject.startswith("MAIL818-SYNTHETIC-") or len(subject) > 100:
        raise ValueError("invalid synthetic subject")
    if os.environ.get("PROBE_VERIFY_EXISTING") == "1":
        assert_imap_subject(subject)
        assert_imap_subject(subject + "-submission")
        expected = json.loads(Path("/pilot-evidence/mox-uid-evidence.json").read_text())
        if uid_evidence(subject) != expected:
            raise AssertionError("IMAP UID cursor changed across same-volume restart")
    smtp_case("accepted@pilot.test", 2, subject)
    assert_imap_subject(subject)
    smtp_case("outbound@pilot.test", 2, subject + "-submission", submission=True)
    assert_imap_subject(subject + "-submission")
    if os.environ.get("PROBE_VERIFY_EXISTING") != "1":
        evidence = uid_evidence(subject)
        Path("/pilot-evidence/mox-uid-evidence.json").write_text(json.dumps(evidence, sort_keys=True))
    smtp_case("reject-permerror@pilot.test", 5, subject + "-permanent")
    smtp_case("reject-temperror@pilot.test", 4, subject + "-temporary")
    assert_data_timeout_is_uncertain(subject)
    print("PASS: local SMTP, submission loopback, IMAP, failures, egress denial")


if __name__ == "__main__":
    main()
