#!/usr/bin/env bash
# AIDEV-NOTE: Exercise the actual diagnostic oracle; only its deliberate fail status counts as fixture rejection.
set -euo pipefail
scratch=$1; test_dir=$2
source "$test_dir/auth-rls-concurrency-processes.sh"
fail() { printf 'assertion\n' >"$scratch/assertion"; exit 42; }
check() {
  local label=$1 expected=$2 state=$3 reason=$4 content=$5 status=0
  : >"$scratch/assertion"
  printf '%s' "$content" >"$scratch/fixture.log"
  (expect_error fixture "$state" "$reason") >"$scratch/output" 2>&1 || status=$?
  [[ "$status" = "$expected" ]] || { printf 'FAILED error fixture %s status=%s\n' "$label" "$status" >&2; exit 1; }
  if [[ "$expected" = 42 ]]; then
    [[ $(cat "$scratch/assertion") = assertion ]] || exit 1
  else
    [[ ! -s "$scratch/assertion" ]] || exit 1
  fi
  printf 'PASSED error fixture %s\n' "$label"
}
prefix='psql:/workspace/ops/db/bootstrap-auth-grants.sql:147: '
reason='Auth additional session policy drift: be02_fixture'
exact="${prefix}ERROR:  P0001: $reason"
check exact-drift-no-newline 0 P0001 "$reason" "$exact"
check timeout-metadata 0 55P03 'canceling statement due to lock timeout' \
  "123|supabase_admin|supabase_admin|read committed"$'\n'"${prefix}ERROR:  55P03: canceling statement due to lock timeout"$'\nLOCATION:  ProcessInterrupts, postgres.c:1\n'
check policy-suffix 42 P0001 "$reason" "${exact}_other"
check timeout-suffix 42 55P03 'canceling statement due to lock timeout' "${prefix}ERROR:  55P03: canceling statement due to lock timeout extra"
check trailing-space 42 P0001 "$reason" "$exact "
check prepended-message 42 P0001 "$reason" "${prefix}ERROR:  P0001: extra $reason"
check wrong-state 42 P0001 "$reason" "${prefix}ERROR:  55P03: $reason"
check wrong-severity 42 P0001 "$reason" "${prefix}NOTICE:  P0001: $reason"
check duplicate 42 P0001 "$reason" "$exact"$'\n'"$exact"
check second-error 42 P0001 "$reason" "$exact"$'\n'"${prefix}ERROR:  XX000: other"
check notice-embedded 42 P0001 "$reason" "NOTICE:  $exact"
check context-embedded 42 P0001 "$reason" "CONTEXT:  $exact"
check foreign-path 42 P0001 "$reason" "psql:/other.sql:147: ERROR:  P0001: $reason"
check no-prefix 42 P0001 "$reason" "ERROR:  P0001: $reason"
check invalid-line 42 P0001 "$reason" "psql:/workspace/ops/db/bootstrap-auth-grants.sql:0: ERROR:  P0001: $reason"
check empty 42 P0001 "$reason" ''
check success-only 42 P0001 "$reason" '123|supabase_admin|supabase_admin|read committed'
check foreign-after-valid 42 P0001 "$reason" "$exact"$'\nNOTICE: unrelated diagnostic'
