"""Protocol health tests use sockets replaced by bounded fixtures."""
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "production"))
import mox_readiness as readiness


class ReadinessTest(unittest.TestCase):
    def setUp(self) -> None:
        self.env = {"ELEVATEO_MOX_IPV4": "192.0.2.1", "ELEVATEO_MOX_HOSTNAME": "mail.example.test"}

    def test_live_tls_and_three_greetings(self) -> None:
        connection = MagicMock()
        connection.__enter__.return_value.recv.return_value = b"220"
        context = MagicMock()
        context.wrap_socket.return_value.__enter__.return_value.recv.return_value = b"* OK"
        with patch.dict(readiness.os.environ, self.env), patch.object(readiness.ssl, "create_default_context", return_value=context), patch.object(readiness.socket, "create_connection", return_value=connection) as connect:
            readiness.check()
        self.assertEqual([993, 25, 587], [call.args[0][1] for call in connect.call_args_list])
        self.assertTrue(all(call.kwargs["timeout"] == 2 for call in connect.call_args_list))

    def test_closed_listener_fails(self) -> None:
        with patch.dict(readiness.os.environ, self.env), patch.object(readiness.socket, "create_connection", side_effect=OSError), self.assertRaises(OSError):
            readiness.check()

    def test_fragmented_prefix_is_accepted(self) -> None:
        connection = MagicMock()
        connection.recv.side_effect = [b"*", b" ", b"O", b"K"]
        readiness.prefix(connection, b"* OK")
        self.assertEqual(4, connection.recv.call_count)

    def test_truncated_prefix_and_absolute_deadline_fail(self) -> None:
        connection = MagicMock()
        connection.recv.side_effect = [b"2", b""]
        with self.assertRaises(ValueError):
            readiness.prefix(connection, b"220")
        with patch.object(readiness.time, "monotonic", side_effect=[0, 3]), self.assertRaises(TimeoutError):
            readiness.prefix(connection, b"220")

    def test_wrong_imap_greeting_fails_before_smtp(self) -> None:
        context = MagicMock()
        context.wrap_socket.return_value.__enter__.return_value.recv.return_value = b"* BYE unavailable\r\n"
        with patch.dict(readiness.os.environ, self.env), patch.object(readiness.ssl, "create_default_context", return_value=context), patch.object(readiness.socket, "create_connection") as connect, self.assertRaises(ValueError):
            readiness.check()
        self.assertEqual(1, connect.call_count)


if __name__ == "__main__":
    unittest.main()
