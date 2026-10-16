"""Kernel socket regressions for the bounded QA relay, without external networking."""
import socket
import threading
import unittest
from relay import bridge
from test_listener import receive


class RelayTest(unittest.TestCase):
    def run_bridge(self, **bounds: float | int) -> tuple[socket.socket, socket.socket, threading.Thread]:
        left, inside_left = socket.socketpair(); right, inside_right = socket.socketpair()
        left.settimeout(1); right.settimeout(1)
        worker = threading.Thread(target=bridge, args=(inside_left, inside_right), kwargs=bounds)
        worker.start()
        self.addCleanup(left.close); self.addCleanup(right.close); self.addCleanup(worker.join, 2)
        return left, right, worker

    def test_binary_bytes_flow_both_ways(self) -> None:
        left, right, _ = self.run_bridge(lifetime=0.5)
        left.sendall(bytes(range(256))); self.assertEqual(receive(right, 256), bytes(range(256)))
        right.sendall(b'\x00response'); self.assertEqual(receive(left, 9), b'\x00response')
        left.shutdown(socket.SHUT_RDWR)

    def test_reply_after_request_half_close(self) -> None:
        left, right, worker = self.run_bridge()
        left.sendall(b'request'); left.shutdown(socket.SHUT_WR)
        self.assertEqual(receive(right, 7), b'request')
        self.assertEqual(right.recv(1), b'')
        right.sendall(b'response'); right.shutdown(socket.SHUT_WR)
        self.assertEqual(receive(left, 8), b'response')
        self.assertEqual(left.recv(1), b'')
        worker.join(1); self.assertFalse(worker.is_alive())

    def test_shared_byte_budget_closes_excess_without_forwarding(self) -> None:
        left, right, worker = self.run_bridge(limit=8)
        left.sendall(b'12345678'); self.assertEqual(receive(right, 8), b'12345678')
        right.sendall(b'9'); self.assertEqual(left.recv(1), b'')
        worker.join(1); self.assertFalse(worker.is_alive())

    def test_idle_timeout_releases_connection(self) -> None:
        left, _, worker = self.run_bridge(idle=0.05)
        self.assertEqual(left.recv(1), b''); worker.join(1); self.assertFalse(worker.is_alive())

    def test_hard_deadline_closes_even_with_idle_budget_remaining(self) -> None:
        left, _, worker = self.run_bridge(lifetime=0.05, idle=1)
        self.assertEqual(left.recv(1), b''); worker.join(1); self.assertFalse(worker.is_alive())


if __name__ == '__main__':
    unittest.main()
