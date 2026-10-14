"""Protocol fault cases for a disposable Python Docker job; no local runner."""
import struct
import pathlib
import tempfile
import unittest
from unittest.mock import patch

from clamav_probe import CLEAN, EICAR, prepare, scan, verify


class FakeSocket:
    def __init__(self, reply: bytes):
        self.reply = bytearray(reply)
        self.sent = b""

    def sendall(self, payload: bytes) -> None:
        self.sent += payload

    def settimeout(self, timeout: float) -> None:
        self.timeout = timeout

    def recv(self, count: int) -> bytes:
        if not self.reply:
            return b""
        result = bytes(self.reply[:count])
        del self.reply[:count]
        return result


class ClamdProtocolTest(unittest.TestCase):
    def test_clean_and_eicar_framing(self):
        self.assertEqual(len(EICAR), 68)
        for payload, reply, verdict in (
            (CLEAN, b"stream: OK\0", "clean"),
            (EICAR, b"stream: Eicar-Test-Signature FOUND\0", "malware"),
        ):
            with self.subTest(verdict=verdict):
                fake = FakeSocket(reply)
                self.assertEqual(scan(payload, fake), verdict)
                self.assertEqual(fake.sent, b"zINSTREAM\0" + struct.pack("!I", len(payload)) + payload + b"\0\0\0\0")

    def test_incomplete_reply_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "incomplete"):
            scan(CLEAN, FakeSocket(b"stream: OK"))

    def test_unrecognized_reply_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "did not return"):
            scan(CLEAN, FakeSocket(b"stream: ERROR\0"))

    def test_whole_reply_deadline_stops_trickle(self):
        with patch("clamav_probe.time.monotonic", side_effect=[0, 21]):
            with self.assertRaisesRegex(ValueError, "whole reply timeout"):
                scan(CLEAN, FakeSocket(b"stream: OK\0"))

    def test_changed_size_rejected_before_socket(self):
        with tempfile.TemporaryDirectory() as parent:
            directory = pathlib.Path(parent) / "fixtures"
            prepare(directory)
            with (directory / "clean.txt").open("ab") as target:
                target.write(b"extra")
            with patch("clamav_probe.socket.create_connection") as connect:
                with self.assertRaisesRegex(ValueError, "fixture bytes changed"):
                    verify(directory)
                connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
