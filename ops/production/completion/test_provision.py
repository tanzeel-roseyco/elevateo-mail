"""Container-ready admission tests; no Docker daemon or database used by these unit tests."""
from __future__ import annotations

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from assignments import load
from provision import provision
from initialize_mox import archive, configuration
import io
import tarfile

HEADER = "organization_id,user_id,mailbox_id,address\n"
ROW = "11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222,33333333-3333-4333-8333-333333333333,a@mail.example.org\n"
ENV = {"ELEVATEO_EGRESS_ID": "44444444-4444-4444-8444-444444444444"}


class ProvisionTests(unittest.TestCase):
    # AIDEV-NOTE: Assert the mutation boundary remains untouched for every rejected batch, including late bad rows.
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "approved-mailbox-assignments.csv"
        self.path.write_text(HEADER + ROW)
        self.environment = patch.dict(os.environ, ENV, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_dry_run_is_default(self) -> None:
        with patch("provision.sql") as database:
            self.assertEqual(provision(self.path), 1)
            database.assert_not_called()

    def test_enabled_apply_uses_real_quota_transaction(self) -> None:
        with patch.dict(os.environ, {"ELEVATEO_PROVISIONING_ENABLED": "true"}), patch("provision.sql") as database:
            self.assertEqual(provision(self.path, True), 1)
            query = database.call_args.args[0]
            self.assertIn("BEGIN;", query)
            self.assertIn("'mailbox',jsonb_build_array(org,box),30", query)
            self.assertIn("'user',jsonb_build_array(usr),300", query)
            self.assertIn("ORDER BY l.id FOR UPDATE OF l", query)
            self.assertNotIn("__ASSIGNMENTS__", query)

    def test_disabled_apply_fails_before_database(self) -> None:
        with patch("provision.sql") as database, self.assertRaises(ValueError):
            provision(self.path, True)
        database.assert_not_called()

    def test_late_invalid_row_prevents_entire_batch(self) -> None:
        self.path.write_text(HEADER + ROW + ROW.replace("a@mail.example.org", "x';DROP TABLE app.mailboxes;--"))
        with patch.dict(os.environ, {"ELEVATEO_PROVISIONING_ENABLED": "true"}), patch("provision.sql") as database:
            with self.assertRaises(ValueError):
                provision(self.path, True)
            database.assert_not_called()

    def test_duplicate_mailbox_rejected(self) -> None:
        self.path.write_text(HEADER + ROW + ROW.replace("a@mail.example.org", "b@mail.example.org"))
        with self.assertRaises(ValueError):
            load(self.path)

    def test_empty_batch_rejected(self) -> None:
        self.path.write_text(HEADER)
        with self.assertRaises(ValueError):
            load(self.path)

    def test_oversized_dns_label_rejected(self) -> None:
        self.path.write_text(HEADER + ROW.replace("mail.example.org", "x" * 64 + ".example.org"))
        with self.assertRaises(ValueError):
            load(self.path)

    def test_budget_cannot_be_raised_above_daily_cap(self) -> None:
        with patch.dict(os.environ, {"ELEVATEO_USER_DAILY_SEND_LIMIT": "301"}), self.assertRaises(ValueError):
            provision(self.path)

    def test_mox_configuration_is_held_and_private(self) -> None:
        environment = {"ELEVATEO_MOX_HOSTNAME": "mx.mail.example.org", "ELEVATEO_MOX_IPV4": "8.8.8.8",
                       "ELEVATEO_MAIL_DOMAINS": "mail.example.org", "ELEVATEO_WORKSPACE_DOMAINS": "example.org"}
        with patch.dict(os.environ, environment):
            files = configuration(load(self.path))
        self.assertIn(b"Disabled: true", files["domains.conf"])
        self.assertIn(b"LoginDisabled: activation pending", files["domains.conf"])
        with tarfile.open(fileobj=io.BytesIO(archive(files))) as bundle:
            self.assertTrue(all(item.mode == 0o600 and item.uid == 1000 for item in bundle))

    def test_mox_workspace_domain_rejected(self) -> None:
        environment = {"ELEVATEO_MOX_HOSTNAME": "mx.mail.example.org", "ELEVATEO_MOX_IPV4": "8.8.8.8",
                       "ELEVATEO_MAIL_DOMAINS": "mail.example.org", "ELEVATEO_WORKSPACE_DOMAINS": "mail.example.org"}
        with patch.dict(os.environ, environment), self.assertRaises(ValueError):
            configuration(load(self.path))

    def test_mox_private_address_rejected(self) -> None:
        with patch.dict(os.environ, {"ELEVATEO_MOX_HOSTNAME": "mx.mail.example.org", "ELEVATEO_MOX_IPV4": "127.0.0.1"}):
            with self.assertRaises(ValueError):
                configuration(load(self.path))


if __name__ == "__main__":
    unittest.main()
