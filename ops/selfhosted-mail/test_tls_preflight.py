"""Regression coverage for private roots and offline TLS admission."""
from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess

from generate import generate
from keys import keys
from runtime_fixture import HOST, openssl
from test_deployment import fixture
from tls_preflight import check_tls, private_root


class AdmissionTest(unittest.TestCase):
    def test_private_root_and_keys(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            source = parent / 'manifest.json'
            source.write_text(json.dumps(fixture()))
            root = parent / 'private'
            generate(source, root)
            link = parent / 'alias'
            link.symlink_to(root, target_is_directory=True)
            with self.assertRaises(ValueError):
                keys(link)
            parent.chmod(0o777)
            with self.assertRaises(ValueError):
                keys(root)
            parent.chmod(0o700)
            private_root(root)
            with patch('keys.subprocess.run', side_effect=subprocess.CalledProcessError(1, 'openssl')):
                with self.assertRaises(subprocess.CalledProcessError):
                    keys(root)
            self.assertEqual(list((root / 'config/dkim').iterdir()), [])
            keys(root)
            self.assertEqual(len(list((root / 'config/dkim').iterdir())), 1)
            (root / 'config/dkim').chmod(0o755)
            with self.assertRaises(ValueError):
                keys(root)

    def test_certificate_trust_name_key_and_expiry(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            source = parent / 'manifest.json'
            source.write_text(json.dumps(fixture()))
            root = parent / 'private'
            generate(source, root)
            key = root / 'tls/privkey.pem'
            cert = root / 'tls/fullchain.pem'
            openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(key),
                    '-out', str(cert), '-days', '30', '-subj', '/CN=' + HOST,
                    '-addext', 'subjectAltName=DNS:' + HOST)
            key.chmod(0o600)
            cert.chmod(0o600)
            check_tls(root, cert)
            with self.assertRaises(ValueError):
                check_tls(root)
            manifest = json.loads((root / 'manifest.json').read_text())
            manifest['hostname'] = 'other.dispatch.company.com'
            (root / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaises(ValueError):
                check_tls(root, cert)
            manifest['hostname'] = HOST
            (root / 'manifest.json').write_text(json.dumps(manifest))
            original_key = key.read_bytes()
            openssl('genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', str(key))
            with self.assertRaises(ValueError):
                check_tls(root, cert)
            key.write_bytes(original_key)
            key.write_bytes(b'not a private key')
            with self.assertRaises(ValueError):
                check_tls(root, cert)
            key.write_bytes(original_key)
            cert.chmod(0o644)
            with self.assertRaises(ValueError):
                check_tls(root, cert)
            cert.chmod(0o600)
            openssl('req', '-x509', '-key', str(key), '-out', str(cert), '-days', '1',
                    '-subj', '/CN=' + HOST, '-addext', 'subjectAltName=DNS:' + HOST)
            with self.assertRaises(ValueError):
                check_tls(root, cert)


if __name__ == '__main__':
    unittest.main()
