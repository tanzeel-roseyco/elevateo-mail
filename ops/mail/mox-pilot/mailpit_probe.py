"""Synthetic Mailpit protocol check inside the pilot's internal network."""

import http.client
import json
import os
import smtplib
import socket
import time
from email.message import EmailMessage


def no_egress() -> None:
    try:
        with socket.create_connection(("1.1.1.1", 443), timeout=2):
            pass
    except OSError:
        return
    raise AssertionError("external TCP egress available")


def messages() -> list[dict[str, object]]:
    connection = http.client.HTTPConnection("mailpit", 8025, timeout=5)
    try:
        connection.request("GET", "/api/v1/messages?limit=50")
        response = connection.getresponse()
        if response.status != 200:
            raise AssertionError("Mailpit list unavailable")
        raw = response.read(1_048_577)
        if len(raw) > 1_048_576:
            raise AssertionError("Mailpit list oversized")
        value = json.loads(raw)
        if not isinstance(value, dict) or not isinstance(value.get("messages"), list):
            raise AssertionError("Mailpit list malformed")
        return value["messages"]
    finally:
        connection.close()


def main() -> None:
    no_egress()
    deadline = time.monotonic() + 30
    while True:
        try:
            with socket.create_connection(("mailpit", 1025), timeout=3):
                break
        except OSError:
            if time.monotonic() >= deadline:
                raise AssertionError("Mailpit SMTP did not become ready")
            time.sleep(0.5)
    subject = os.environ["MOX_PILOT_SUBJECT"] + "-mailpit"
    if len(subject) > 120 or not subject.startswith("MAIL818-SYNTHETIC-"):
        raise ValueError("invalid synthetic subject")
    message = EmailMessage()
    message["From"] = "sender@example.invalid"
    message["To"] = "recipient@example.invalid"
    message["Subject"] = subject
    message.set_content("Synthetic MAIL-818 protocol fixture.")
    with smtplib.SMTP("mailpit", 1025, timeout=5) as smtp:
        smtp.send_message(message)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        for item in messages():
            if isinstance(item, dict) and item.get("Subject") == subject:
                recipients = item.get("To")
                if isinstance(recipients, list) and len(recipients) == 1 and \
                        isinstance(recipients[0], dict) and recipients[0].get("Address") == "recipient@example.invalid":
                    print("PASS: Mailpit local SMTP acceptance and stored recipient")
                    return
        time.sleep(0.5)
    raise AssertionError("synthetic Mailpit message absent")


if __name__ == "__main__":
    main()
