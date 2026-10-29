"""Disposable Supabase restore assertions, executed only by fleet-rehearsal.sh."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys

from admission import Tenant, require, source_digest
from initialize import ROOT, environment, execute

USER = "22222222-2222-4222-8222-222222222222"
SUBJECT = "66666666-6666-4666-8666-666666666666"
ORG = "11111111-1111-4111-8111-111111111111"
SENTINEL = "initrepair20261023-preserve"


def sql(statement: str) -> str:
    result = subprocess.run(["psql", "-X", "--no-password", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", statement],
                            env=environment(os.environ, "tenant"), capture_output=True, text=True, timeout=60)
    require(result.returncode == 0, "disposable assertion SQL failed: " + result.stderr)
    return result.stdout.strip()


def protected() -> str:
    # AIDEV-NOTE: Hash whole sentinel rows, not counts, so metadata or identity corruption cannot pass restoration.
    rows = sql("SELECT row_to_json(u)::text FROM auth.users u WHERE id='" + USER + "';"
               "SELECT row_to_json(i)::text FROM auth.identities i WHERE user_id='" + USER + "' ORDER BY id;"
               "SELECT row_to_json(s)::text FROM auth.sessions s WHERE user_id='" + USER + "' ORDER BY id;"
               "SELECT row_to_json(b)::text FROM storage.buckets b WHERE id='" + SENTINEL + "';"
               "SELECT row_to_json(o)::text FROM storage.objects o WHERE bucket_id='" + SENTINEL + "' ORDER BY id;")
    require(len(rows.splitlines()) == 5, "all five real Auth/Storage sentinel rows required")
    return hashlib.sha256(rows.encode()).hexdigest()


def seed() -> None:
    # AIDEV-NOTE: Fabricated verified claims exist only in this guarded disposable restore database, never live Auth.
    sql("INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) VALUES ('" + USER +
        "','sentinel@elevateoco.com','2026-10-23T00:00:00Z','{\"provider\":\"custom:authentik\"}','{\"sentinel\":true}');"
        "INSERT INTO auth.identities(id,provider_id,user_id,identity_data,provider) VALUES ('" + USER + "','" + SUBJECT +
        "','" + USER + "','{\"sub\":\"" + SUBJECT + "\",\"email\":\"sentinel@elevateoco.com\",\"email_verified\":true}','custom:authentik');"
        "INSERT INTO auth.sessions(id,user_id,not_after) VALUES ('" + USER + "','" + USER + "','2099-01-01T00:00:00Z');"
        "INSERT INTO storage.buckets(id,name,public) VALUES ('" + SENTINEL + "','" + SENTINEL + "',false);"
        "INSERT INTO storage.objects(id,bucket_id,name,metadata) VALUES ('" + USER + "','" + SENTINEL +
        "','sentinel.txt','{\"sentinel\":true}');")
    require(sql("SELECT to_regnamespace('app') IS NULL") == "t", "pre-initialization app schema must be absent")


def forward() -> None:
    before = protected()
    execute("schema", environment(os.environ, "schema"), None)
    require(protected() == before, "forward bootstrap/migration altered Auth/Storage rows")
    versions = sql("SELECT version FROM app_meta.schema_migrations ORDER BY version").splitlines()
    expected = sorted(path.name.split("_", 1)[0] for path in (ROOT / "apps/server/db/migrate").glob("*.rb"))
    require(versions == expected and bool(versions), "all exact Rails migrations must complete")
    tenant = Tenant(ORG, USER, "Disposable restore rehearsal", "owner", "rehearsal:initrepair20261023", SUBJECT)
    execute("tenant", environment(os.environ, "tenant"), tenant)
    execute("tenant", environment(os.environ, "tenant"), tenant)
    for candidate in (Tenant(ORG, USER, tenant.name, "admin", tenant.receipt, SUBJECT),
                      Tenant("33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444",
                             tenant.name, "owner", tenant.receipt, SUBJECT)):
        try:
            execute("tenant", environment(os.environ, "tenant"), candidate)
        except ValueError:
            pass
        else:
            raise ValueError("conflicting/missing Auth enrollment unexpectedly accepted")
    require(protected() == before, "tenant phase altered Auth/Storage sentinels")
    require(sql("SELECT count(*) FROM app.organizations") == "1", "tenant rollback/idempotency failed")
    require(sql("SELECT count(*) FROM app.organization_enrollment_receipts") == "1", "exact receipt required")
    require(sql("SELECT role FROM app.organization_access") == "owner", "conflict changed role")
    require(sql("SELECT count(*) FROM pg_class WHERE relnamespace='app'::regnamespace "
                "AND relname IN ('organizations','organization_memberships','organization_access',"
                "'organization_enrollment_receipts') AND relrowsecurity AND relforcerowsecurity "
                "AND relowner='elevateo_owner'::regrole") == "4", "ownership/forced RLS changed")
    print(json.dumps({"source_sha256": source_digest(ROOT), "migrations": len(versions),
                      "protected_sha256": before, "tenant_replay": "PASS", "failure_rollbacks": 2,
                      "forced_rls_tables": 4}, sort_keys=True))


if __name__ == "__main__":
    require(os.environ.get("INITREPAIR_DISPOSABLE") == "initrepair20261023", "disposable runner guard required")
    action = sys.argv[1]
    if action == "seed":
        seed()
        print(protected())
    elif action == "snapshot":
        print(protected())
    elif action == "forward":
        forward()
    else:
        raise ValueError("unknown rehearsal action")
