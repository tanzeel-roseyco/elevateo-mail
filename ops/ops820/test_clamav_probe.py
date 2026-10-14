"""Protocol fault cases for a disposable Python Docker job; no local runner."""
import struct
import unittest

from clamav_probe import CLEAN, EICAR, scan


class FakeSocket:
    def __init__(self, reply: bytes):
        self.reply = bytearray(reply)
        self.sent = b""

    def sendall(self, payload: bytes) -> None:
        self.sent += payload

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


if __name__ == "__main__":
    unittest.main()
