"""Peer-verified synthetic Mox IMAPS evidence; run only in the private pilot."""

import hashlib
import imaplib
import json
import os
import socket
import ssl
import time
from pathlib import Path


HOST = "localhost"
PORT = 1993  # Mox localserve adds 1000 to standard IMAPS 993.
TRUST = Path("/pilot-evidence/mox-localserve-trust.crt")
EVIDENCE = Path("/pilot-evidence/mox-uid-evidence.json")


def verified_context() -> ssl.SSLContext:
    if not TRUST.is_file() or TRUST.stat().st_size > 8192:
        raise AssertionError("missing or oversized synthetic trust anchor")
    context = ssl.create_default_context(cafile=str(TRUST))
    assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
    return context


def connect(context: ssl.SSLContext) -> imaplib.IMAP4_SSL:
    return imaplib.IMAP4_SSL(HOST, PORT, ssl_context=context, timeout=5)


def assert_untrusted_peer_rejected() -> None:
    try:
        with connect(ssl.create_default_context()):
            pass
    except ssl.SSLCertVerificationError:
        return
    raise AssertionError("Mox peer unexpectedly trusted without pilot anchor")


def assert_wrong_password_rejected(context: ssl.SSLContext) -> None:
    with connect(context) as imap:
        try:
            imap.login("mox@localhost", "wrong-synthetic-password")
        except imaplib.IMAP4.error:
            return
    raise AssertionError("IMAPS accepted invalid synthetic password")


def evidence(context: ssl.SSLContext, subject: str) -> dict[str, object]:
    with connect(context) as imap:
        peer = imap.sock.getpeercert()
        if ("DNS", "localhost") not in peer.get("subjectAltName", ()):
            raise AssertionError("verified peer lacks localhost SAN")
        imap.login("mox@localhost", "moxmoxmox")
        result, _ = imap.select("INBOX", readonly=True)
        if result != "OK":
            raise AssertionError("synthetic IMAPS inbox unavailable")
        _, validity = imap.response("UIDVALIDITY")
        if not validity or not validity[0] or not validity[0].isdigit():
            raise AssertionError("IMAPS UIDVALIDITY missing")
        result, values = imap.uid("SEARCH", None, "HEADER", "Subject", subject)
        if result != "OK" or not values or len(values[0].split()) != 1:
            raise AssertionError("synthetic IMAPS UID missing or ambiguous")
        uid = values[0].split()[0]
        result, parts = imap.uid("FETCH", uid, "(BODY.PEEK[])")
        if result != "OK" or not parts or not isinstance(parts[0], tuple):
            raise AssertionError("synthetic IMAPS MIME absent")
        raw = parts[0][1]
        if not isinstance(raw, bytes) or not 1 <= len(raw) <= 1_048_576:
            raise AssertionError("synthetic IMAPS MIME invalid")
        return {"uidvalidity": int(validity[0]), "uid": int(uid),
                "content_sha256": hashlib.sha256(raw).hexdigest()}


def main() -> None:
    # The shared namespace has no published ports or external route.
    try:
        with socket.create_connection(("1.1.1.1", 443), timeout=2):
            pass
    except OSError:
        pass
    else:
        raise AssertionError("external TCP egress unexpectedly available")

    context = verified_context()
    deadline = time.monotonic() + 30
    while True:
        try:
            assert_untrusted_peer_rejected()
            break
        except (ConnectionError, OSError):
            if time.monotonic() >= deadline:
                raise AssertionError("Mox IMAPS did not become ready")
            time.sleep(0.5)
    assert_wrong_password_rejected(context)
    subject = os.environ["MOX_PILOT_SUBJECT"]
    if not subject.startswith("MAIL818-SYNTHETIC-") or len(subject) > 100:
        raise ValueError("invalid synthetic subject")
    expected = json.loads(EVIDENCE.read_text())
    first = evidence(context, subject)
    second = evidence(context, subject)
    if first != expected or second != expected:
        raise AssertionError("TLS UID replay or cursor evidence differs from plaintext IMAP")
    print("PASS: self-signed peer rejected by default trust, pinned trust verified, IMAPS login and UID replay")


if __name__ == "__main__":
    main()
