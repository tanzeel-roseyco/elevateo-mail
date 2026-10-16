"""Fixed QA relay: emulator container loopback -> owned UNIX CONNECT socket on the internal app network."""
import select
import socket
import sys
import threading
import time

SOCKET = '/relay/edge.sock'
LIMIT = 16 * 1024 * 1024


def bridge(left: socket.socket, right: socket.socket, *, lifetime: float = 120,
           idle: float = 10, limit: int = LIMIT) -> None:
    # AIDEV-NOTE: Both directions share one byte/time budget; stalled writes cannot extend the hard deadline.
    end, activity, transferred = time.monotonic() + lifetime, time.monotonic(), 0
    readers = [left, right]
    try:
        while readers:
            remaining = min(end - time.monotonic(), idle - (time.monotonic() - activity))
            if remaining <= 0:
                return
            readable, _, _ = select.select(readers, [], [], remaining)
            if not readable:
                return
            for source in readable:
                target = right if source is left else left
                data = source.recv(min(65536, limit - transferred + 1))
                if not data:
                    # AIDEV-NOTE: Preserve the response direction when a client finishes sending its request.
                    readers.remove(source)
                    target.shutdown(socket.SHUT_WR)
                    continue
                transferred += len(data)
                if transferred > limit:
                    return
                target.settimeout(max(0.001, min(idle, end - time.monotonic())))
                target.sendall(data)
                activity = time.monotonic()
    except (OSError, ValueError):
        # AIDEV-NOTE: Peer close/deadline is an expected connection outcome; never log TLS or synthetic credentials.
        return
    finally:
        left.close(); right.close()


def main(role: str) -> None:
    if role != 'container':
        raise RuntimeError('Unknown relay role')
    server = socket.socket(socket.AF_INET)
    # AIDEV-NOTE: Permit restart after closed clients enter TIME_WAIT; a second live listener still cannot bind.
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', 19443))
    server.listen(8)
    slots = threading.BoundedSemaphore(8)
    def connect(client: socket.socket) -> None:
        peer = socket.socket(socket.AF_UNIX)
        try:
            peer.settimeout(5)
            peer.connect(SOCKET)
            bridge(client, peer)
        except OSError:
            client.close(); peer.close()
        finally:
            slots.release()
    try:
        while True:
            client, _ = server.accept()
            if not slots.acquire(blocking=False):
                client.close(); continue
            threading.Thread(target=connect, args=(client,), daemon=True).start()
    finally:
        server.close()


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise RuntimeError('Relay role required')
    main(sys.argv[1])
