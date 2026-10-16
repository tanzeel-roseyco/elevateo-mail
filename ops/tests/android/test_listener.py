"""Real listener/permission/admission regressions; run only in an isolated Docker network."""
import multiprocessing
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from typing import Callable
import relay

CTX = multiprocessing.get_context('fork')


def serve_relay(role: str, path: str) -> None:
    relay.SOCKET = path
    relay.main(role)


def serve_echo(family: int, address: str | tuple[str, int]) -> None:
    def echo(peer: socket.socket) -> None:
        try:
            # AIDEV-NOTE: The child process owns cleanup; no echo idle timer can invalidate the admission witness.
            while data := peer.recv(4096):
                peer.sendall(data)
        except OSError:
            pass
        finally:
            peer.close()
    with socket.socket(family) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(address); server.listen(16)
        while True:
            peer, _ = server.accept()
            threading.Thread(target=echo, args=(peer,), daemon=True).start()


def receive(peer: socket.socket, length: int) -> bytes:
    data = bytearray()
    deadline = time.monotonic() + 2
    while len(data) < length:
        peer.settimeout(max(0.001, deadline - time.monotonic()))
        chunk = peer.recv(length - len(data))
        if not chunk:
            break
        data.extend(chunk)
        if time.monotonic() > deadline:
            raise TimeoutError('Echo byte deadline exceeded')
    return bytes(data)


class ListenerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / 'edge.sock')
        self.children: list[multiprocessing.Process] = []
        self.addCleanup(self.stop_children)

    def stop_children(self) -> None:
        for child in reversed(self.children):
            child.terminate(); child.join(2)
            if child.is_alive():
                child.kill(); child.join(2)

    def start(self, target: Callable[..., None], *args: object) -> None:
        child = CTX.Process(target=target, args=args)
        self.children.append(child); child.start()

    def connect(self, role: str) -> socket.socket:
        peer = socket.socket(socket.AF_INET)
        peer.settimeout(1)
        try:
            peer.connect(('127.0.0.1', 19443))
        except OSError:
            peer.close(); raise
        self.addCleanup(peer.close)
        return peer

    def wait_listener(self, role: str) -> None:
        end = time.monotonic() + 3
        while time.monotonic() < end:
            try:
                self.connect(role).close(); return
            except OSError:
                time.sleep(0.01)
        self.fail('Listener did not bind')

    def echo_ready(self, role: str) -> socket.socket:
        end = time.monotonic() + 3
        while time.monotonic() < end:
            peer = self.connect(role)
            try:
                peer.sendall(b'ready')
                if receive(peer, 5) == b'ready':
                    return peer
            except OSError:
                pass
            peer.close(); time.sleep(0.01)
        self.fail('Relay did not recover')

    def test_container_upstream_failures_release_slots_then_recover(self) -> None:
        self.start(serve_relay, 'container', self.path); self.wait_listener('container')
        for _ in range(20):
            peer = self.connect('container'); self.assertEqual(peer.recv(1), b''); peer.close()
        self.start(serve_echo, socket.AF_UNIX, self.path)
        peer = self.echo_ready('container'); peer.sendall(b'payload'); self.assertEqual(receive(peer, 7), b'payload')

    def test_container_ninth_connection_rejected_and_closed_slot_recovers(self) -> None:
        self.start(serve_echo, socket.AF_UNIX, self.path)
        self.start(serve_relay, 'container', self.path); self.wait_listener('container')
        peers = [self.echo_ready('container') for _ in range(8)]
        # AIDEV-NOTE: Prove every occupied slot is still active immediately before the admission check.
        for peer in peers:
            peer.sendall(b'held'); self.assertEqual(receive(peer, 4), b'held')
        ninth = self.connect('container'); self.assertEqual(ninth.recv(1), b'')
        peers[0].close(); replacement = self.echo_ready('container')
        replacement.sendall(b'recovered'); self.assertEqual(receive(replacement, 9), b'recovered')

    def test_container_role_forwards_binary_through_unix_socket(self) -> None:
        self.start(serve_echo, socket.AF_UNIX, self.path)
        self.start(serve_relay, 'container', self.path); self.wait_listener('container')
        peer = self.echo_ready('container'); payload = bytes(range(256))
        peer.sendall(payload); self.assertEqual(receive(peer, 256), payload)


if __name__ == '__main__':
    unittest.main()
