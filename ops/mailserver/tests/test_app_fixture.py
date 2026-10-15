"""Private credential handoff regressions; real root-to-host ownership runs in the Mox composition gate."""
from __future__ import annotations

import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from app_fixture import write_credentials


class CredentialHandoffTest(unittest.TestCase):
    def test_private_file_belongs_to_evidence_owner(self) -> None:
        with TemporaryDirectory() as directory:
            out = Path(directory)
            passwords = {'outreach000@send.test': 'synthetic-unit-password'}
            with patch('app_fixture.os.fchown', wraps=os.fchown) as change_owner:
                write_credentials(out, passwords)
            path = out / 'fixture-credentials.json'
            owner, actual = out.stat(), path.stat()
            self.assertEqual(json.loads(path.read_text()), passwords)
            self.assertEqual(actual.st_mode & 0o777, 0o600)
            self.assertEqual((actual.st_uid, actual.st_gid), (owner.st_uid, owner.st_gid))
            self.assertEqual(change_owner.call_args.args[1:], (owner.st_uid, owner.st_gid))

    def test_existing_file_or_symlink_is_never_overwritten(self) -> None:
        for symlink in [False, True]:
            with self.subTest(symlink=symlink), TemporaryDirectory() as directory:
                out = Path(directory)
                target = out / 'preserved'
                target.write_text('preserved')
                path = out / 'fixture-credentials.json'
                if symlink:
                    path.symlink_to(target)
                else:
                    path.write_text('preserved')
                with self.assertRaises(FileExistsError):
                    write_credentials(out, {'account': 'must-not-write'})
                self.assertEqual(path.read_text(), 'preserved')
                self.assertEqual(target.read_text(), 'preserved')

    def test_public_evidence_directory_is_rejected_before_write(self) -> None:
        with TemporaryDirectory() as directory:
            out = Path(directory)
            out.chmod(0o755)
            with self.assertRaises(PermissionError):
                write_credentials(out, {'account': 'must-not-write'})
            self.assertFalse((out / 'fixture-credentials.json').exists())

    def test_failed_ownership_transfer_writes_no_secret(self) -> None:
        with TemporaryDirectory() as directory:
            out = Path(directory)
            with patch('app_fixture.os.fchown', side_effect=PermissionError('denied')):
                with self.assertRaises(PermissionError):
                    write_credentials(out, {'account': 'must-not-write'})
            self.assertEqual((out / 'fixture-credentials.json').read_bytes(), b'')
            self.assertEqual((out / 'fixture-credentials.json').stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
