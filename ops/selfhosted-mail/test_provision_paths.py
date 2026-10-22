"""Provisioning rejects untrusted parent directories before Docker mutation."""
from __future__ import annotations

import os
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from generate import generate
from provision import provision
from test_deployment import fixture


class ProvisionPathTest(unittest.TestCase):
    def test_directory_symlink_and_public_parent(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            source = parent / 'manifest.json'
            source.write_text(json.dumps(fixture()))
            root = parent / 'private'
            generate(source, root)
            compose = parent / 'compose.yaml'
            compose.write_text('services: {}')
            credentials = root / 'credentials'
            credentials.rename(root / 'original')
            credentials.symlink_to(root / 'original', target_is_directory=True)
            with patch.dict(os.environ, MAIL_ROOT=str(root)), patch('provision.subprocess.run') as run:
                with self.assertRaises(ValueError):
                    provision(root, compose)
                run.assert_not_called()
                credentials.unlink()
                (root / 'original').rename(credentials)
                parent.chmod(0o777)
                try:
                    with self.assertRaises(ValueError):
                        provision(root, compose)
                    run.assert_not_called()
                finally:
                    parent.chmod(0o700)
