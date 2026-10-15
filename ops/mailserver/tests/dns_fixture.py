"""Minimal authoritative DNS answers for isolated synthetic SMTP tests only."""
from __future__ import annotations

import socket
import socketserver
import struct
import threading


def wire(name: str) -> bytes:
    return b''.join(bytes([len(part)]) + part.encode('ascii') for part in name.split('.')) + b'\0'


def answer(packet: bytes) -> bytes:
    if len(packet) < 17 or struct.unpack('!H', packet[4:6])[0] != 1:
        raise ValueError('one bounded DNS question required')
    offset, labels = 12, []
    while packet[offset]:
        length = packet[offset]
        if length > 63 or offset + length + 1 >= len(packet):
            raise ValueError('invalid DNS label')
        labels.append(packet[offset + 1:offset + length + 1].decode('ascii').lower())
        offset += length + 1
    qtype, qclass = struct.unpack('!HH', packet[offset + 1:offset + 5])
    if qclass != 1:
        raise ValueError('IN class required')
    name = '.'.join(labels)
    known = name == 'localhost' or name.endswith('.test') or name == '1.0.0.127.in-addr.arpa'
    data = b''
    if known and qtype == 1:
        data = socket.inet_aton('127.0.0.1')
    elif known and qtype == 15:
        data = struct.pack('!H', 10) + wire('mail.lab.test')
    elif known and qtype == 12:
        data = wire('mail.lab.test')
    elif known and qtype == 16 and not name.startswith('_'):
        txt = b'v=spf1 ip4:127.0.0.1 -all'
        data = bytes([len(txt)]) + txt
    # AIDEV-NOTE: No recursion or upstream sockets; unsupported records return authoritative NODATA.
    header = packet[:2] + struct.pack('!HHHHH', 0x8500 if known else 0x8503, 1, bool(data), 0, 0)
    record = b'\xc0\x0c' + struct.pack('!HHIH', qtype, 1, 60, len(data)) + data if data else b''
    return header + packet[12:offset + 5] + record


class Handler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        packet, sock = self.request
        try:
            response = answer(packet)
        except (ValueError, IndexError, UnicodeError, struct.error):
            return
        sock.sendto(response, self.client_address)


def start() -> socketserver.UDPServer:
    server = socketserver.UDPServer(('127.0.0.1', 53), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
