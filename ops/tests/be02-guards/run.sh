#!/usr/bin/env bash
# AIDEV-NOTE: Run only in root's disposable Docker cluster before Auth/API/worker consumers start.
set -euo pipefail
: "$BE02_GUARDS_DISPOSABLE" "$PGHOST" "$PGUSER" "$PGDATABASE" "$PGPASSWORD"
: "$MIGRATOR_DB_PASSWORD" "$API_DB_PASSWORD" "$WORKER_DB_PASSWORD"
if [[ "$BE02_GUARDS_DISPOSABLE" != 1 || "$PGHOST" != db || "$PGUSER" != supabase_admin ||
      "$PGDATABASE" != postgres || ! -f /.dockerenv || -z "$PGPASSWORD" ||
      -z "$MIGRATOR_DB_PASSWORD" || -z "$API_DB_PASSWORD" || -z "$WORKER_DB_PASSWORD" ]]; then
  printf '%s\n' 'Refusing guard suite outside the explicit disposable Docker database.' >&2
  exit 1
fi
test_dir=$(cd -- "$(dirname -- "$0")" && pwd)
repo=$(cd -- "$test_dir/../../.." && pwd)
scratch=$(mktemp -d /tmp/be02-guards.XXXXXXXX)
guard_database="be02_guards_$BASHPID$RANDOM$RANDOM"
guard_created=0
passed=0
export PGOPTIONS='-c statement_timeout=15000 -c lock_timeout=5000'

cleanup() {
  local status=$?
  trap - EXIT
  if (( guard_created )); then
    if ! dropdb --no-password --maintenance-db=postgres -- "$guard_database"; then
      printf 'FAILED cleanup of exact disposable database %s\n' "$guard_database" >&2
      status=1
    fi
  fi
  rm -f -- "$scratch/bootstrap-body.sql" "$scratch/auth-body.sql" "$scratch/case.sql" "$scratch/case.log"
  rmdir -- "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

psql_cmd() {
  psql -X --no-password --dbname="$guard_database" --set=ON_ERROR_STOP=1 --quiet "$@"
}
run_file() {
  local label=$1 file=$2
  if ! psql_cmd --file="$file" >"$scratch/case.log" 2>&1; then
    cat "$scratch/case.log" >&2
    printf 'FAILED %s\n' "$label" >&2
    return 1
  fi
  passed=$((passed + 1))
  printf 'ok %s\n' "$label"
}
run_case() {
  local label=$1 body=$2 fixture=$3 expected=$4 assertion=$5
  {
    printf 'BEGIN;\n%s\n' "$fixture"
    printf '\\i %s\n' "$body"
    printf '%s\nROLLBACK;\n' "$assertion"
  } >"$scratch/case.sql"
  if psql_cmd --file="$scratch/case.sql" >"$scratch/case.log" 2>&1; then
    if [[ -n "$expected" ]]; then
      printf 'FAILED %s: accepted forbidden drift\n' "$label" >&2
      return 1
    fi
  elif [[ -z "$expected" ]] || ! grep -Fq -- "$expected" "$scratch/case.log"; then
    cat "$scratch/case.log" >&2
    printf 'FAILED %s: unexpected error\n' "$label" >&2
    return 1
  fi
  passed=$((passed + 1))
  printf 'ok %s\n' "$label"
}
rollback_body() {
  # AIDEV-NOTE: Strip only the outer pair so even a missing guard cannot commit injected cluster-role drift.
  awk '{ sub(/\r$/, ""); if ($0 == "BEGIN;") { begins++; next }
    if ($0 == "COMMIT;") { commits++; next } print }
    END { if (begins != 1 || commits != 1) exit 1 }' "$1" >"$2"
}

# template0 excludes vendor fixtures; cleanup is armed only after createdb creates this exact new database.
createdb --no-password --maintenance-db=postgres --template=template0 --owner=supabase_admin -- "$guard_database"
guard_created=1
bootstrap="$repo/ops/db/bootstrap.sql"
auth_grants="$repo/ops/db/bootstrap-auth-grants.sql"
bootstrap_body="$scratch/bootstrap-body.sql"
auth_body="$scratch/auth-body.sql"
rollback_body "$bootstrap" "$bootstrap_body"
rollback_body "$auth_grants" "$auth_body"
run_file bootstrap-fresh "$bootstrap"
run_file bootstrap-idempotent "$bootstrap"
source "$test_dir/membership.sh"
run_file disposable-auth-fixture "$test_dir/fixture.sql"
run_file disposable-auth-rls-fixture "$test_dir/auth-rls-setup.sql"
run_file auth-grants-fresh "$auth_grants"
run_file auth-grants-idempotent "$auth_grants"
source "$test_dir/auth.sh"
run_file named-default-acl-boundary "$test_dir/private-grants.sql"
printf 'PASS %s BE02 guard cases; database=%s\n' "$passed" "$guard_database"
