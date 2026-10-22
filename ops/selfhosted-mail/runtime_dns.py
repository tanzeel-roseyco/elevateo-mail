"""Loopback-only authoritative fixture; never forwards or modifies external DNS."""
from __future__ import annotations

import socket
import struct
import threading


def wire_name(name: str) -> bytes:
    return b''.join(bytes([len(part)]) + part.encode('ascii') for part in name.split('.')) + b'\0'


class FixtureDNS:
    # AIDEV-NOTE: Real queue delivery still uses DNS and SMTP25; the container has no external network.
    def __init__(self) -> None:
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.socket.bind(('127.0.0.1', 53))
        self.socket.settimeout(0.2)
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)

    def start(self) -> None:
        self.thread.start()

    def close(self) -> None:
        self.stopped.set()
        self.thread.join(timeout=2)
        self.socket.close()

    def run(self) -> None:
        while not self.stopped.is_set():
            try:
                query, peer = self.socket.recvfrom(4096)
            except TimeoutError:
                continue
            answer = self.answer(query)
            if answer is not None:
                self.socket.sendto(answer, peer)

    @staticmethod
    def answer(query: bytes) -> bytes | None:
        if len(query) < 17 or query[4:6] != b'\0\1':
            return None
        offset, labels = 12, []
        while offset < len(query) and query[offset]:
            size = query[offset]
            if size > 63 or offset + size + 1 >= len(query):
                return None
            labels.append(query[offset + 1:offset + size + 1].decode('ascii', errors='replace'))
            offset += size + 1
        offset += 1
        if offset + 4 > len(query):
            return None
        kind, family = struct.unpack('!HH', query[offset:offset + 4])
        name = '.'.join(labels).lower()
        data = b''
        if family == 1 and name in {'dispatch.company.com', 'mail.dispatch.company.com'}:
            if kind == 15:
                data = b'\0\x0a' + wire_name('mail.dispatch.company.com')
            elif kind == 1:
                data = socket.inet_aton('127.0.0.1')
        records = b'' if not data else b'\xc0\x0c' + struct.pack('!HHIH', kind, 1, 30, len(data)) + data
        return query[:2] + struct.pack('!HHHHH', 0x8180, 1, int(bool(data)), 0, 0) + query[12:offset + 4] + records
