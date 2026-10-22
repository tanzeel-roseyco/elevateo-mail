"""Synthetic-only contract fixtures; these UUIDs must never become operator bindings."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from export_bundle import binding_entries, export_bundle
from generate import generate
from test_deployment import fixture


def metadata() -> dict[str, object]:
    base = dict(account_id='00000000-0000-4000-8000-000000000001',
                organization_id='00000000-0000-4000-8000-000000000002',
                mailbox_id='00000000-0000-4000-8000-000000000003',
                credential_version=1, credential_ref='secret:synthetic-contract-only',
                username=fixture()['accounts'][0], host=fixture()['hostname'])
    return {'format_version': 1, 'entries': [dict(base, protocol='smtp', port=587, tls_mode='starttls_required'),
                                             dict(base, protocol='imap', port=993, tls_mode='verified_tls')]}


class BundleTest(unittest.TestCase):
    def test_export_and_exclusive_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            source = parent / 'manifest.json'
            source.write_text(json.dumps(fixture()))
            root = parent / 'private'
            generate(source, root)
            binding = root / 'bindings.json'
            binding.write_text(json.dumps(metadata()))
            binding.chmod(0o600)
            with patch('private_publish.os.fsync', side_effect=OSError('injected disk failure')):
                with self.assertRaises(OSError):
                    export_bundle(root, 'bindings.json', 'failed.json')
            self.assertFalse((root / 'failed.json').exists())
            self.assertEqual(list(root.glob('.pending-*')), [])
            export_bundle(root, 'bindings.json', 'bundle.json')
            bundle = json.loads((root / 'bundle.json').read_text())
            self.assertEqual(bundle['format_version'], 1)
            self.assertEqual(len(bundle['entries']), 2)
            password = json.loads((root / 'credentials/000.json').read_text())['password']
            for entry in bundle['entries']:
                self.assertEqual(entry['password'], password)
                self.assertEqual(set(entry), {'account_id', 'organization_id', 'mailbox_id', 'credential_version',
                                             'credential_ref', 'protocol', 'username', 'password'})
            self.assertEqual((root / 'bundle.json').stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                export_bundle(root, 'bindings.json', 'bundle.json')
            binding.write_text('{"format_version":1,"entries":[]}')
            with self.assertRaises(ValueError):
                export_bundle(root, 'bindings.json', 'invalid.json')
            self.assertFalse((root / 'invalid.json').exists())

    def test_missing_cross_tenant_and_tls_fail_closed(self) -> None:
        raw = metadata()
        entries = raw['entries']
        assert isinstance(entries, list)
        changes: list[tuple[str, object]] = [
            ('account_id', None), ('organization_id', 'invented'), ('mailbox_id', ''),
            ('credential_ref', 'test:not-production'), ('credential_version', 0), ('credential_version', True),
            ('username', 'outside@outside.invalid'), ('port', 465), ('tls_mode', 'none'),
            ('protocol', 'pop3'), ('host', 'other.dispatch.company.com')]
        for field, value in changes:
            candidate = copy.deepcopy(raw)
            candidate_entries = candidate['entries']
            assert isinstance(candidate_entries, list)
            candidate_entries[0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                binding_entries(candidate, fixture()['hostname'], fixture()['accounts'])
        for selected in [[], entries[:1], entries + entries, [entries[0], dict(entries[1], credential_version=2)]]:
            with self.assertRaises(ValueError):
                binding_entries({'format_version': 1, 'entries': selected}, fixture()['hostname'], fixture()['accounts'])


if __name__ == '__main__':
    unittest.main()
