"""Real PostgreSQL admission decisions against isolated Auth fixtures; not a live Authentik proof."""
from __future__ import annotations

import json
import os
import sys
import subprocess
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "initialize"))
from test_tenant import fixture, sql  # noqa: E402

OWNER = "11111111-1111-4111-8111-111111111111"
USER = "22222222-2222-4222-8222-222222222222"
ORG = "33333333-3333-4333-8333-333333333333"
OTHER = "44444444-4444-4444-8444-444444444444"
SESSION = "55555555-5555-4555-8555-555555555555"


def execute(statement: str) -> str:
    result = sql(statement)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


class EnrollmentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if os.environ.get("PGHOST") != "db" or os.environ.get("INIT62817_TEST_ONLY") != "disposable":
            raise RuntimeError("disposable Docker database required")
        fixture()
        execute("GRANT USAGE ON SCHEMA app_auth TO elevateo_api,elevateo_worker;"
                "CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,created_at timestamptz,not_after timestamptz);")
        installed = sql("", file=HERE / "enrollment.sql")
        if installed.returncode:
            raise RuntimeError(installed.stderr)

    def setUp(self) -> None:
        execute("TRUNCATE launch_controls.company_enrollments, app.organization_memberships CASCADE;"
                "TRUNCATE app_auth.authorization_generations;"
                "TRUNCATE auth.users CASCADE; TRUNCATE auth.sessions;"
                f"INSERT INTO app.organizations VALUES ('{ORG}','Company'),('{OTHER}','Other') ON CONFLICT DO NOTHING;"
                f"INSERT INTO auth.users VALUES ('{OWNER}',now(),NULL,NULL,'owner@elevateoco.com'),"
                f"('{USER}',now(),NULL,NULL,'member@elevateoco.com');"
                "INSERT INTO auth.identities(user_id,provider,identity_data) SELECT id,'custom:authentik',"
                "jsonb_build_object('email',email,'email_verified',true,'sub',id::text) FROM auth.users;"
                f"INSERT INTO auth.sessions VALUES ('{SESSION}','{USER}',now(),now()+interval '1 hour');"
                f"INSERT INTO app.organization_memberships VALUES ('{ORG}','{OWNER}');"
                f"INSERT INTO app.organization_access(organization_id,user_id,role) VALUES ('{ORG}','{OWNER}','owner');"
                f"UPDATE launch_controls.company_policy SET enabled=true,organization_id='{ORG}',verified_owner_id='{OWNER}',verified_owner_subject='{OWNER}';")

    def enroll(self, user: str = USER, session: str = SESSION) -> str:
        return json.loads(execute(f"SET ROLE elevateo_api; SELECT app_auth.enroll_company_identity('{user}','{session}');"))["status"]

    def test_happy_path_idempotent_associate_and_no_cross_tenant_creation(self) -> None:
        self.assertEqual(self.enroll(), "ok")
        self.assertEqual(self.enroll(), "ok")
        self.assertEqual(execute(f"SELECT role FROM app.organization_access WHERE user_id='{USER}'"), "associate")
        self.assertEqual(execute("SELECT count(*) FROM launch_controls.company_enrollments"), "1")
        self.assertEqual(execute(f"SELECT count(*) FROM app.organization_memberships WHERE user_id='{USER}'"), "1")

    def test_disabled_or_unresolved_owner_denies_before_membership(self) -> None:
        for update in ("enabled=false", f"verified_owner_id='{USER}'"):
            self.setUp()
            execute("UPDATE launch_controls.company_policy SET " + update)
            self.assertEqual(self.enroll(), "unauthorized")
        self.assertEqual(execute(f"SELECT count(*) FROM app.organization_memberships WHERE user_id='{USER}'"), "0")

    def test_email_provider_and_trusted_verification_fail_closed(self) -> None:
        for mutation in (
            f"UPDATE auth.users SET email='member@evil.test' WHERE id='{USER}'",
            f"UPDATE auth.users SET email='member@elevateoco.com.evil.test' WHERE id='{USER}'",
            f"UPDATE auth.users SET email_confirmed_at=NULL WHERE id='{USER}'",
            f"UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='{USER}'",
            f"UPDATE auth.users SET deleted_at=now() WHERE id='{USER}'",
            f"UPDATE auth.identities SET identity_data=identity_data - 'sub' WHERE user_id='{USER}'",
            f"UPDATE auth.identities SET provider='google' WHERE user_id='{USER}'",
            f"UPDATE auth.identities SET provider='email' WHERE user_id='{USER}'",
            f"UPDATE auth.identities SET identity_data=identity_data || '{{\"email_verified\":false}}' WHERE user_id='{USER}'",
            f"UPDATE auth.identities SET identity_data=identity_data || '{{\"email\":\"other@elevateoco.com\"}}' WHERE user_id='{USER}'",
        ):
            with self.subTest(mutation=mutation):
                self.setUp()
                execute(mutation)
                self.assertEqual(self.enroll(), "unauthorized")

    def test_owner_subject_and_verification_are_pinned(self) -> None:
        for mutation in (
            "UPDATE launch_controls.company_policy SET verified_owner_subject='different-subject'",
            f"UPDATE auth.identities SET identity_data=identity_data - 'sub' WHERE user_id='{OWNER}'",
            f"UPDATE auth.identities SET identity_data=identity_data || '{{\"email_verified\":false}}' WHERE user_id='{OWNER}'",
            f"DELETE FROM auth.identities WHERE user_id='{OWNER}'",
        ):
            with self.subTest(mutation=mutation):
                self.setUp()
                execute(mutation)
                self.assertEqual(self.enroll(), "unauthorized")

    def test_session_binding_expiry_and_null_are_denied(self) -> None:
        self.assertEqual(self.enroll(session=OTHER), "unauthorized")
        self.assertEqual(self.enroll(user=OWNER), "unauthorized")
        execute("UPDATE auth.sessions SET not_after=now()-interval '1 second'")
        self.assertEqual(self.enroll(), "unauthorized")
        self.assertEqual(json.loads(execute("SET ROLE elevateo_api; SELECT app_auth.enroll_company_identity(NULL,NULL)"))["status"], "unauthorized")

    def test_other_tenant_existing_membership_and_removed_user_do_not_auto_enroll(self) -> None:
        execute(f"INSERT INTO app.organization_memberships VALUES ('{OTHER}','{USER}')")
        self.assertEqual(self.enroll(), "unauthorized")
        execute(f"DELETE FROM app.organization_memberships WHERE user_id='{USER}'")
        self.assertEqual(self.enroll(), "ok")
        execute(f"DELETE FROM app.organization_memberships WHERE user_id='{USER}'")
        self.assertEqual(self.enroll(), "unauthorized")

    def test_runtime_cannot_modify_policy_identity_or_assign_admin(self) -> None:
        for role in ("elevateo_api", "elevateo_worker"):
            for statement in ("UPDATE launch_controls.company_policy SET enabled=true", "SELECT * FROM auth.identities",
                              f"INSERT INTO app.organization_memberships VALUES ('{ORG}','{USER}')"):
                with self.subTest(role=role, statement=statement):
                    self.assertNotEqual(sql(f"SET ROLE {role}; {statement}").returncode, 0)
        self.assertNotEqual(sql("SET ROLE elevateo_worker; SELECT app_auth.enroll_company_identity(NULL,NULL)").returncode, 0)
        self.assertEqual(execute("SELECT count(*) FROM pg_auth_members WHERE roleid='elevateo_enrollment_owner'::regrole"), "0")

    def test_preexisting_revocation_history_denies_and_existing_member_gets_tombstone(self) -> None:
        execute(f"INSERT INTO app_auth.authorization_generations VALUES ('{OTHER}','{USER}',2)")
        self.assertEqual(self.enroll(), "unauthorized")
        execute(f"INSERT INTO app.organization_memberships VALUES ('{ORG}','{USER}')")
        self.assertEqual(self.enroll(), "ok")
        execute(f"DELETE FROM app.organization_memberships WHERE user_id='{USER}'")
        self.assertEqual(self.enroll(), "unauthorized")

    def test_owner_revocation_and_ban_serialize_before_enrollment(self) -> None:
        for mutation in (f"UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='{OWNER}';",
                         f"SELECT app_auth.lock_authorization_generations('{ORG}','{OWNER}');"
                         f"DELETE FROM app.organization_access WHERE user_id='{OWNER}';"):
            self.setUp()
            execute(f"INSERT INTO app_auth.authorization_generations VALUES ('{ORG}','{OWNER}',1)")
            command = ["psql", "-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-Atq", "-c",
                       "BEGIN;" + mutation + "SELECT pg_sleep(2); COMMIT;"]
            with subprocess.Popen(command, env=dict(os.environ, PGAPPNAME="launch7401-owner-change"),
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as process:
                for _ in range(100):
                    if execute("SELECT count(*) FROM pg_stat_activity WHERE application_name='launch7401-owner-change'"
                               " AND wait_event='PgSleep'") == "1":
                        break
                    time.sleep(0.02)
                else:
                    self.fail("owner mutation did not acquire its lock")
                self.assertEqual(self.enroll(), "unauthorized")
                _, error = process.communicate(timeout=10)
                self.assertEqual(process.returncode, 0, error)

    def test_concurrent_other_tenant_provisioning_denies_enrollment(self) -> None:
        # AIDEV-NOTE: Provisioning deliberately takes no Auth/generation lock; admission must fence its phantom.
        command = ["psql", "-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-Atq", "-c",
                   f"BEGIN; INSERT INTO app.organization_memberships VALUES ('{OTHER}','{USER}');"
                   "SELECT pg_sleep(2); COMMIT;"]
        with subprocess.Popen(command, env=dict(os.environ, PGAPPNAME="launch7401-tenant-change"),
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as process:
            for _ in range(100):
                if execute("SELECT count(*) FROM pg_stat_activity WHERE application_name='launch7401-tenant-change'"
                           " AND wait_event='PgSleep'") == "1":
                    break
                time.sleep(0.02)
            else:
                self.fail("provisioning did not acquire its membership lock")
            self.assertEqual(self.enroll(), "unauthorized")
            _, error = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 0, error)
        self.assertEqual(execute(f"SELECT count(*) FROM app.organization_memberships WHERE user_id='{USER}'"), "1")

    def test_session_revocation_serializes_before_enrollment(self) -> None:
        # AIDEV-NOTE: Explicit open transactions prove both commit orders, without relying on a sleep window.
        for mutation in (f"DELETE FROM auth.sessions WHERE id='{SESSION}';",
                         f"UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id='{SESSION}';"):
            for revoke_first in (True, False):
                self.setUp()
                admission = f"SET ROLE elevateo_api; SELECT app_auth.enroll_company_identity('{USER}','{SESSION}');"
                first, second = (mutation, admission) if revoke_first else (admission, mutation)
                command = ["psql", "-X", "--no-password", "-v", "ON_ERROR_STOP=1", "-Atq"]
                with subprocess.Popen(command, env=dict(os.environ, PGAPPNAME="authentik-first"),
                                      stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                      text=True) as holder:
                    assert holder.stdin is not None and holder.stdout is not None
                    holder.stdin.write("BEGIN; SET statement_timeout='10s'; " + first + " SELECT 'READY';\n")
                    holder.stdin.flush()
                    if not revoke_first:
                        self.assertEqual(json.loads(holder.stdout.readline())["status"], "ok")
                    self.assertEqual(holder.stdout.readline().strip(), "READY")
                    with subprocess.Popen(command + ["-c", "SET statement_timeout='10s'; " + second],
                                          env=dict(os.environ, PGAPPNAME="authentik-second"),
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as waiter:
                        try:
                            for _ in range(200):
                                if execute("SELECT count(*) FROM pg_stat_activity a WHERE application_name='authentik-second'"
                                           " AND EXISTS (SELECT 1 FROM pg_stat_activity b WHERE b.application_name='authentik-first'"
                                           " AND b.pid=ANY(pg_blocking_pids(a.pid)))") == "1":
                                    break
                                if waiter.poll() is not None:
                                    self.fail("second transaction did not wait for the first transaction lock")
                                time.sleep(0.02)
                            else:
                                self.fail("second transaction lock wait not observed")
                        finally:
                            _, error = holder.communicate("COMMIT;\n", timeout=10)
                            self.assertEqual(holder.returncode, 0, error)
                        output, error = waiter.communicate(timeout=15)
                        self.assertEqual(waiter.returncode, 0, error)
                        if revoke_first:
                            self.assertEqual(json.loads(output)["status"], "unauthorized")
                expected = "0" if revoke_first else "1"
                self.assertEqual(execute(f"SELECT count(*) FROM app.organization_memberships WHERE user_id='{USER}'"), expected)

    def test_z_rollback_reinstall_keeps_tombstones_and_disables_policy(self) -> None:
        self.assertEqual(self.enroll(), "ok")
        removed = sql("", file=HERE / "remove.sql")
        self.assertEqual(removed.returncode, 0, removed.stderr)
        self.assertEqual(execute("SELECT count(*) FROM launch_controls.company_enrollments"), "1")
        self.assertNotEqual(sql("SET ROLE elevateo_api; SELECT app_auth.enroll_company_identity(NULL,NULL)").returncode, 0)
        installed = sql("", file=HERE / "enrollment.sql")
        self.assertEqual(installed.returncode, 0, installed.stderr)
        self.assertEqual(self.enroll(), "unauthorized")
        self.assertEqual(execute("SELECT count(*) FROM launch_controls.company_enrollments"), "1")

    def test_repeat_install_fails_without_changing_enabled_policy_or_tombstones(self) -> None:
        # AIDEV-NOTE: Installation is one-shot; operator must remove first, and accidental repetition is atomic.
        self.assertEqual(self.enroll(), "ok")
        installed = sql("", file=HERE / "enrollment.sql")
        self.assertNotEqual(installed.returncode, 0)
        self.assertEqual(execute("SELECT enabled FROM launch_controls.company_policy"), "t")
        self.assertEqual(execute("SELECT count(*) FROM launch_controls.company_enrollments"), "1")


if __name__ == "__main__":
    unittest.main()
