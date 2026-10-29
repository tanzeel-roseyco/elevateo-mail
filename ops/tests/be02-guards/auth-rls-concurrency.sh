#!/usr/bin/env bash
# AIDEV-NOTE: Run in guards only after real pinned Auth readiness/grants and before Rails migrations or consumers.
set -euo pipefail
umask 077
fail() { printf 'FAILED Auth RLS concurrency: %s\n' "$1" >&2; exit 1; }
[[ $# = 0 && -f /.dockerenv && ${BE02_GUARDS_DISPOSABLE:-} = 1 \
  && ${PGHOST:-} = db && ${PGUSER:-} = supabase_admin && ${PGDATABASE:-} = postgres \
  && ${PGPORT:-5432} = 5432 && -n ${PGPASSWORD:-} ]] || fail 'unexpected disposable guards environment'
for key in PGOPTIONS PGHOSTADDR PGSERVICE PGSERVICEFILE; do
  [[ -z ${!key:-} ]] || fail "ambient $key is forbidden"
done
for command in psql timeout mktemp mkfifo sha256sum grep; do
  command -v "$command" >/dev/null || fail "required command absent: $command"
done
export PGCONNECT_TIMEOUT=3 LC_ALL=C
test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ "$test_dir" = /workspace/ops/tests/be02-guards ]] || fail 'unexpected read-only source mount'
production=/workspace/ops/db/bootstrap-auth-grants.sql
expected_hash=2f63d116e2b23af69d7abd0452893509231e39658d298a9ad207e75a8a96fcd6
[[ $(sha256sum "$production") = "$expected_hash  $production" ]] || fail 'accepted production source hash changed'
# AIDEV-NOTE: Runtime/mock regressions precede real schedules; -k and numeric seconds also work with BusyBox.
timeout -k 1 5 bash "$test_dir/auth-rls-concurrency-harness-regression.sh" \
  || fail 'isolated concurrency harness regressions failed'
injected_oid= baseline= holder_fd= watchdog_fd= watchdog_pid=
source "$test_dir/auth-rls-concurrency-processes.sh"
source "$test_dir/auth-rls-concurrency-catalog.sh"

cleanup() {
  local status=$? final_state name
  trap - EXIT INT TERM
  set +e
  if [[ -n "$watchdog_pid" ]]; then
    kill -TERM "$watchdog_pid" 2>/dev/null
    reap_stopped "$watchdog_pid" 2 || status=1
  fi
  stop_children || status=1
  remove_fixture || status=1
  if [[ -n "$baseline" ]]; then
    final_state=$(snapshot) || status=1
    [[ -n "$final_state" && "$final_state" = "$baseline" ]] || status=1
  fi
  [[ -z "$holder_fd" ]] || exec {holder_fd}>&-
  [[ -z "$watchdog_fd" ]] || exec {watchdog_fd}>&-
  for name in control.log holder.fifo watchdog.fifo injected.oid serial_holder.log first.log second.log \
    timeout_holder.log timed.log ddl_holder.log drift.log; do
    rm -f -- "$scratch/$name" || status=1
  done
  rmdir -- "$scratch" || status=1
  if (( status == 0 )); then
    printf '%s\n' 'PASSED Auth RLS concurrency: all three schedules, exact catalog restoration, no owned sessions remain'
  else
    printf '%s\n' 'FAILED Auth RLS concurrency: assertions or bounded cleanup failed' >&2
  fi
  exit "$status"
}
scratch=$(mktemp -d /tmp/be02-auth-rls.XXXXXXXX)
token=${scratch##*.}
tag="be02_rlsc_$token"
injected_name="be02_rlsc_${token,,}"
trap cleanup EXIT
trap 'fail "interrupted or whole-probe deadline exceeded"' INT TERM
[[ "$token" =~ ^[a-zA-Z0-9]{8}$ ]] || fail 'unexpected temporary namespace'
mkfifo -- "$scratch/holder.fifo" "$scratch/watchdog.fifo"
exec {holder_fd}<>"$scratch/holder.fifo"
exec {watchdog_fd}<>"$scratch/watchdog.fifo"
# AIDEV-NOTE: A timed Bash read avoids an orphan sleep process; 75s work plus bounded cleanup fits runner's 120s.
(read -r -t 75 -u "$watchdog_fd" || kill -TERM "$$") &
watchdog_pid=$!
preflight_catalog
baseline=$(snapshot)
[[ -n "$baseline" ]] || fail 'empty baseline catalog'
baseline_hash=$(printf '%s' "$baseline" | sha256sum)
printf 'EVIDENCE production_sha256=%s server=170006 database=postgres initial_catalog_sha256=%s\n' \
  "$expected_hash" "${baseline_hash%% *}"

# AIDEV-NOTE: Both real scripts must be queued at once; a holder makes overlap independent of scheduler speed.
start_holder serial_holder
start_child first "$production"
capture first
await_locks 'first waits' "$(waiting first serial_holder)" 1
start_child second "$production"
capture second
await_locks 'two simultaneous bootstrap waiters' \
  "($(waiting first serial_holder)) OR ($(waiting second serial_holder))" 2
release_holder serial_holder ROLLBACK
finish_child first 0
finish_child second 0
unchanged 'serialized actual bootstrap reruns'

# AIDEV-NOTE: Keep the holder until the actual production lock_timeout fires; only the exact SQLSTATE/reason passes.
start_holder timeout_holder
started=$SECONDS
start_child timed "$production"
capture timed
await_locks 'timeout candidate waits' "$(waiting timed timeout_holder)" 1
finish_child timed 3
elapsed=$((SECONDS - started))
expect_error timed 55P03 'canceling statement due to lock timeout'
(( elapsed >= 5 && elapsed <= 12 )) || fail "lock timeout elapsed outside 5..12 seconds: $elapsed"
await_locks 'holder still locked after production timeout' \
  "$(identity timeout_holder) AND a.state = 'idle in transaction' AND l.granted" 1
printf 'EVIDENCE production lock_timeout elapsed_seconds=%s envelope=5..12\n' "$elapsed"
unchanged 'lock timeout rollback while holder remains'
release_holder timeout_holder ROLLBACK
unchanged 'lock timeout holder rollback'

# AIDEV-NOTE: Capture the injected OID inside its uncommitted DDL; cleanup cannot delete an unrelated replacement.
ddl="CREATE POLICY $injected_name ON auth.sessions FOR SELECT TO elevateo_session_owner USING (false);
SELECT oid FROM pg_policy WHERE polrelid = 'auth.sessions'::regclass AND polname = '$injected_name'
\\g $scratch/injected.oid"
start_holder ddl_holder "$ddl"
read -r injected_oid <"$scratch/injected.oid"
[[ "$injected_oid" =~ ^[0-9]+$ ]] || fail 'injected policy OID was not captured'
visible=$(query "SELECT count(*) FROM pg_policy WHERE polrelid = 'auth.sessions'::regclass
  AND polname = '$injected_name';") || fail 'uncommitted DDL observation failed'
[[ "$visible" = 0 ]] || fail 'uncommitted DDL visible before holder commit'
start_child drift "$production"
capture drift
await_locks 'bootstrap waits behind uncommitted policy DDL' "$(waiting drift ddl_holder)" 1
release_holder ddl_holder COMMIT
finish_child drift 3
expect_error drift P0001 "Auth additional session policy drift: $injected_name"
check_fixture || fail 'committed injected policy changed or vanished'
unchanged 'post-wait policy drift rejection'
remove_fixture || fail 'exact injected policy cleanup failed'
unchanged 'post-wait DDL cleanup'
[[ $(sha256sum "$production") = "$expected_hash  $production" ]] || fail 'production source changed during probe'
