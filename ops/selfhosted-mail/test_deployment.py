"""Offline regression suite; execute only inside fleet-02 Docker."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch

from generate import generate
from provision import provision
from keys import keys
from validation import validate


def fixture() -> dict[str, object]:
    # AIDEV-NOTE: Synthetic strings test admission only; no DNS lookup or external connection is permitted.
    return dict(hostname='mail.dispatch.company.com', public_ipv4='8.8.4.4',
                verified_domains=['dispatch.company.com'], workspace_domains=['company.com'],
                accounts=[f'person{i:03d}@dispatch.company.com' for i in range(120)],
                quota_mib=250, disk_gib=80, outbound_hold=True)


class DeploymentTest(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('MOX_BINARY'), 'pinned Mox binary not mounted')
    def test_real_mox_parser(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'input.json'
            source.write_text(json.dumps(fixture()))
            root = Path(temp) / 'output'
            generate(source, root)
            keys(root)
            subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                            '-keyout', str(root / 'tls/privkey.pem'), '-out', str(root / 'tls/fullchain.pem'),
                            '-subj', '/CN=mail.dispatch.company.com', '-days', '30'],
                           capture_output=True, check=True, timeout=60)
            result = subprocess.run([os.environ['MOX_BINARY'], '-config',
                                     str(root / 'config/mox.conf'), 'config', 'test'],
                                    capture_output=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr.decode())

    def test_private_generation_and_no_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'input.json'
            source.write_text(json.dumps(fixture()))
            target = root / 'output'
            generate(source, target)
            files = list((target / 'credentials').glob('*.json'))
            self.assertEqual(len(files), 120)
            self.assertEqual(len({json.loads(p.read_text())['password'] for p in files}), 120)
            self.assertTrue(all(p.stat().st_mode & 0o777 == 0o600 for p in files))
            self.assertEqual((target / 'config/domains.conf').read_text().count('LoginDisabled:'), 120)
            with self.assertRaises(FileExistsError):
                generate(source, target)

    def test_manifest_failures(self) -> None:
        changes = [{'accounts': []}, {'outbound_hold': False}, {'public_ipv4': '127.0.0.1'},
                   {'verified_domains': ['company.com']}, {'hostname': 'mail.unknown.com'},
                   {'quota_mib': True}, {'quota_mib': 10240}, {'hostname': 'mail.bad\n.com'},
                   {'verified_domains': ['mail.test']}]
        changes += [{'public_ipv4': value} for value in ['224.0.0.1', '239.255.255.255']]
        changes += [{'hostname': value} for value in ['example.com', 'mail.example.net', 'a.b.example.org']]
        for change in changes:
            with self.subTest(change=change), self.assertRaises((ValueError, TypeError)):
                validate({**fixture(), **change})
        raw = copy.deepcopy(fixture())
        raw['accounts'][1] = raw['accounts'][0]
        with self.assertRaises(ValueError):
            validate(raw)

    def test_duplicates_and_no_output_on_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'input.json'
            source.write_text('{"hostname":"x","hostname":"y"}')
            with self.assertRaises(ValueError):
                generate(source, root / 'output')
            self.assertFalse((root / 'output').exists())

    def test_provision_all_or_no_mutation_and_redaction(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'input.json'
            source.write_text(json.dumps(fixture()))
            target = root / 'output'
            generate(source, target)
            compose = root / 'compose.yaml'
            compose.touch()
            with patch.dict(os.environ, MAIL_ROOT=str(target)), patch('provision.subprocess.run') as run:
                run.return_value.returncode = 0
                provision(target, compose)
                self.assertEqual(run.call_count, 120)
                self.assertNotIn(run.call_args.kwargs['input'].decode().strip(), ' '.join(run.call_args.args[0]))
                run.reset_mock()
                last = target / 'credentials/119.json'
                last.chmod(0o644)
                with self.assertRaises(ValueError):
                    provision(target, compose)
                run.assert_not_called()
                last.chmod(0o600)
                run.return_value.returncode = 1
                with self.assertRaisesRegex(RuntimeError, 'held state retained'):
                    provision(target, compose)


if __name__ == '__main__':
    unittest.main()
