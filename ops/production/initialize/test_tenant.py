"""Real PostgreSQL regressions in the task-owned disposable database, never a live DSN."""
from __future__ import annotations

import os
import subprocess
import textwrap
import unittest
from pathlib import Path

from admission import Tenant
from initialize import HERE, ROOT
from test_admission import VALUES


def sql(statement: str, env: dict[str, str] | None = None, file: Path | None = None) -> subprocess.CompletedProcess[str]:
    command = ["psql", "-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-Atq"]
    command += ["-f", str(file)] if file else ["-c", statement]
    return subprocess.run(command, env=env or dict(os.environ), text=True, capture_output=True, timeout=40, check=False)


def fixture() -> None:
    # AIDEV-NOTE: Use exact foundation/access/receipt/locking source slices; Auth shape is a test-only minimal double.
    foundation = (ROOT / "apps/server/db/migrate/20261012000001_create_app_foundation.rb").read_text()
    tables = textwrap.dedent(foundation.split("execute <<~SQL\n", 1)[1].split("\n    SQL", 1)[0])
    access = (ROOT / "apps/server/db/sec802/access.sql").read_text()
    access_table = access.split("CREATE TABLE app.organization_access", 1)[1].split("-- AIDEV-NOTE: Metadata-only", 1)[0]
    receipts = access.split("CREATE TABLE app.organization_enrollment_receipts", 1)[1].split(
        "-- AIDEV-NOTE: Deployment operator", 1)[0]
    generations = (ROOT / "apps/server/db/be02/generations.sql").read_text().split(
        "CREATE FUNCTION app_auth.bump_authorization_generation", 1)[0]
    ddl = """
      CREATE ROLE elevateo_owner NOLOGIN NOINHERIT;
      CREATE ROLE elevateo_migrator LOGIN NOINHERIT;
      CREATE ROLE elevateo_api LOGIN NOINHERIT;
      CREATE ROLE elevateo_worker LOGIN NOINHERIT;
      CREATE ROLE elevateo_app_read NOLOGIN;
      CREATE ROLE elevateo_session_owner NOLOGIN;
      CREATE SCHEMA app AUTHORIZATION elevateo_owner;
      CREATE SCHEMA app_auth AUTHORIZATION elevateo_owner;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
      CREATE TABLE auth.identities(user_id uuid REFERENCES auth.users(id),provider text);
      CREATE TABLE app_auth.authorization_generations(organization_id uuid,user_id uuid,generation bigint DEFAULT 1);
      SET ROLE elevateo_owner;
    """ + tables + "CREATE TABLE app.organization_access" + access_table + "CREATE TABLE app.organization_enrollment_receipts" + receipts
    ddl += """
      ALTER TABLE app.organizations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app.organizations FORCE ROW LEVEL SECURITY;
      ALTER TABLE app.organization_memberships ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app.organization_memberships FORCE ROW LEVEL SECURITY;
      RESET ROLE;
    """ + generations
    result = sql(ddl)
    if result.returncode:
        raise RuntimeError(result.stderr)


class TenantDatabaseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if os.environ.get("PGHOST") != "db" or os.environ.get("INIT62817_TEST_ONLY") != "disposable":
            raise RuntimeError("task-owned disposable Docker database required")
        fixture()
        result = sql("INSERT INTO auth.users VALUES ('" + VALUES["user_id"] + "',now(),NULL,NULL);"
                     "INSERT INTO auth.identities VALUES ('" + VALUES["user_id"] + "','google');")
        if result.returncode:
            raise RuntimeError(result.stderr)

    def enroll(self, **changes: str) -> subprocess.CompletedProcess[str]:
        values = Tenant.parse(dict(VALUES, **changes))
        env = dict(os.environ, **{"INIT_" + k.upper(): v for k, v in values.__dict__.items()})
        return sql("", env, HERE / "tenant.sql")

    def test_01_happy_path_idempotent_and_forced_rls(self) -> None:
        self.assertEqual(self.enroll().returncode, 0)
        repeat = self.enroll()
        self.assertEqual(repeat.returncode, 0, repeat.stderr)
        self.assertEqual(sql("SELECT count(*) FROM app.organization_access").stdout.strip(), "1")
        # The operator bypass must not change the owner's forced-RLS visibility.
        self.assertEqual(sql("SET ROLE elevateo_owner; SELECT count(*) FROM app.organizations").stdout.strip(), "0")
        hidden = sql("SET ROLE elevateo_api; SELECT * FROM app.organizations;")
        self.assertNotEqual(hidden.returncode, 0)
        self.assertEqual(sql("SELECT count(*) FROM pg_class WHERE oid IN ('app.organizations'::regclass,"
                             "'app.organization_memberships'::regclass) AND relforcerowsecurity").stdout.strip(), "2")

    def test_02_unknown_auth_user_rolls_back(self) -> None:
        result = self.enroll(user_id="33333333-3333-4333-8333-333333333333",
                             organization_id="44444444-4444-4444-8444-444444444444")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(sql("SELECT count(*) FROM app.organizations").stdout.strip(), "1")

    def test_03_conflicting_membership_receipt_name_and_role(self) -> None:
        for changes in ({"receipt": "approval:different-20261023"}, {"role": "admin"}, {"name": "Changed"}):
            with self.subTest(changes=changes):
                self.assertNotEqual(self.enroll(**changes).returncode, 0)
        self.assertEqual(sql("SELECT role FROM app.organization_access").stdout.strip(), "owner")

    def test_04_unconfirmed_auth_fails_without_mutation(self) -> None:
        sql("UPDATE auth.users SET email_confirmed_at=NULL")
        self.assertNotEqual(self.enroll().returncode, 0)
        sql("UPDATE auth.users SET email_confirmed_at=now()")
        self.assertEqual(sql("SELECT count(*) FROM app.organization_memberships").stdout.strip(), "1")

    def test_05_unreceipted_membership_cannot_be_elevated(self) -> None:
        other = "55555555-5555-4555-8555-555555555555"
        result = sql("INSERT INTO auth.users VALUES ('" + other + "',now(),NULL,NULL);"
                     "INSERT INTO auth.identities VALUES ('" + other + "','google');"
                     "INSERT INTO app.organization_memberships VALUES ('" + VALUES["organization_id"] + "','" + other + "');")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotEqual(self.enroll(user_id=other, role="admin").returncode, 0)
        self.assertEqual(sql("SELECT count(*) FROM app.organization_access").stdout.strip(), "1")


if __name__ == "__main__":
    unittest.main()
