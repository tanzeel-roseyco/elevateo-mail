"""Prepare disposable bytes and verify real private clamd INSTREAM verdicts in Soren Docker."""
from __future__ import annotations

import hashlib
import os
import pathlib
import re
import socket
import struct
import sys

CLEAN = b"OPS820 isolated harmless attachment fixture\n"
EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
FIXTURES = {"clean.txt": CLEAN, "eicar.txt": EICAR}


def prepare(directory: pathlib.Path) -> None:
    if not directory.is_absolute() or directory.exists():
        raise ValueError("fresh absolute fixture directory required")
    directory.mkdir(mode=0o700)
    for name, payload in FIXTURES.items():
        fd = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as target:
            target.write(payload)
        print(f"{name} sha256={hashlib.sha256(payload).hexdigest()}")


def scan(payload: bytes, connection: socket.socket) -> str:
    if not payload or len(payload) > 1_048_576:
        raise ValueError("invalid isolated scan payload")
    connection.sendall(b"zINSTREAM\0" + struct.pack("!I", len(payload)) + payload + b"\0\0\0\0")
    reply = bytearray()
    while len(reply) <= 256:
        item = connection.recv(1)
        if not item:
            raise ValueError("clamd reply incomplete")
        if item == b"\0":
            break
        reply.extend(item)
    else:
        raise ValueError("clamd reply too long")
    if reply == b"stream: OK":
        return "clean"
    if re.fullmatch(rb"stream: [A-Za-z0-9._-]{1,128} FOUND", reply):
        return "malware"
    raise ValueError("clamd did not return a verdict")


def verify(directory: pathlib.Path) -> None:
    if not directory.is_absolute() or not directory.is_dir():
        raise ValueError("absolute fixture directory required")
    for name, expected in (("clean.txt", "clean"), ("eicar.txt", "malware")):
        path = directory / name
        if path.is_symlink() or path.read_bytes() != FIXTURES[name]:
            raise ValueError("fixture bytes changed")
        with socket.create_connection(("clamav", 3310), timeout=3) as connection:
            connection.settimeout(20)
            verdict = scan(FIXTURES[name], connection)
        if verdict != expected:
            raise ValueError(f"{name} unexpected clamd verdict")
        print(f"PASS real clamd {name} verdict={verdict}")


if __name__ == "__main__":
    try:
        mode, raw_directory = sys.argv[1:]
        directory = pathlib.Path(raw_directory)
        if mode == "prepare":
            prepare(directory)
        elif mode == "verify":
            verify(directory)
        else:
            raise ValueError("usage: clamav_probe.py prepare|verify ABSOLUTE_DIRECTORY")
    except (OSError, ValueError) as error:
        print(f"clamav probe failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
