"""Offline boundary regressions; run only inside fleet Docker."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from admission import Tenant, approve, digest, source_digest
from initialize import ROOT, environment, execute, main

VALUES = {"organization_id": "11111111-1111-4111-8111-111111111111",
          "user_id": "22222222-2222-4222-8222-222222222222", "name": "Approved organization",
          "role": "owner", "receipt": "approval:tenant-20261023"}


class AdmissionTest(unittest.TestCase):
    def test_tenant_and_escaped_name(self) -> None:
        self.assertEqual(Tenant.parse(VALUES).role, "owner")
        self.assertEqual(Tenant.parse(dict(VALUES, name="O'Brien")).name, "O'Brien")

    def test_invalid_tenant(self) -> None:
        for key, value in (("user_id", "person@example.com"), ("user_id", "00000000-0000-0000-0000-000000000000"),
                           ("name", ""), ("name", "x" * 201), ("name", "x\ny"),
                           ("role", "superuser"), ("receipt", "short")):
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                Tenant.parse(dict(VALUES, **{key: value}))

    def test_minimal_environment(self) -> None:
        env = environment({"PGPASSWORD": "x" * 32, "PGOPTIONS": "danger", "RUBYOPT": "danger",
                           "RESEND_API_KEY": "danger"}, "tenant")
        self.assertNotIn("RUBYOPT", env)
        self.assertNotIn("RESEND_API_KEY", env)
        self.assertEqual(env["PGHOST"], "db")
        self.assertEqual(env["ELEVATEO_OUTBOUND_HOLD"], "true")

    def test_missing_or_multiline_secrets(self) -> None:
        for value in ("", "short", "x" * 32 + "\n"):
            with self.assertRaises(ValueError):
                environment({"PGPASSWORD": value}, "tenant")

    def test_default_dry_run_never_connects(self) -> None:
        with patch("sys.argv", ["initialize.py", "schema"]), patch("initialize.execute") as execution:
            self.assertEqual(main(), 0)
            execution.assert_not_called()

    def test_apply_without_gate_never_connects(self) -> None:
        with patch("sys.argv", ["initialize.py", "schema", "--apply"]), patch("initialize.execute") as execution:
            self.assertEqual(main(), 1)
            execution.assert_not_called()

    def test_schema_order_and_no_test_runner(self) -> None:
        with patch("initialize.run") as execution:
            execute("schema", {"MIGRATOR_DB_PASSWORD": "secret", "PGPASSWORD": "admin"}, None)
        commands = [call.args[0] for call in execution.call_args_list]
        self.assertEqual([Path(command[-1]).name for command in commands[:-1]],
                         ["preflight.sql", "bootstrap.sql", "bootstrap-send.sql", "bootstrap-auth-grants.sql",
                          "bootstrap-gateway.sql"])
        self.assertEqual(commands[-1], ["bundle", "exec", "rails", "db:migrate"])
        self.assertNotIn("PGPASSWORD", execution.call_args_list[-1].args[1])

    def test_backup_gate_and_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            evidence = directory / "evidence"
            evidence.write_text("independently verified restore evidence")
            gate: dict[str, object] = {"target": "elevateo-mail-live/postgres", "phase": "tenant",
                "source_sha256": source_digest(ROOT), "approval": "approval:operator-20261023",
                "tenant": Tenant.parse(VALUES).__dict__}
            for key in ("services_stopped", "outbound_held", "independent_review_passed", "isolated_restore_passed",
                        "auth_storage_preserved", "restore_instructions_verified"):
                gate[key] = True
            for key in ("database_backup", "globals_backup", "storage_manifest", "restore_report"):
                gate[key] = {"path": str(evidence), "sha256": digest(evidence)}
            path = directory / "gate.json"
            path.write_text(json.dumps(gate))
            approve(path, ROOT, "tenant", Tenant.parse(VALUES))
            with self.assertRaises(ValueError):
                approve(path, ROOT, "schema", None)
            evidence.write_text("changed backup")
            with self.assertRaises(ValueError):
                approve(path, ROOT, "tenant", Tenant.parse(VALUES))


if __name__ == "__main__":
    unittest.main()
