"""Publish fully written private artifacts without replacing an existing generation."""
from __future__ import annotations

import os
from pathlib import Path
import tempfile


def publish(path: Path, payload: bytes) -> None:
    # AIDEV-NOTE: Same-filesystem link is atomic and exclusive; readers never observe a partial Bundle or DKIM key.
    with tempfile.NamedTemporaryFile(prefix='.pending-', dir=path.parent) as staged:
        staged.write(payload)
        staged.flush()
        os.fsync(staged.fileno())
        os.link(staged.name, path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
