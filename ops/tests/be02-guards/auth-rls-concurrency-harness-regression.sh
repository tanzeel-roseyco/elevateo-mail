#!/usr/bin/env bash
# AIDEV-NOTE: Real timeout smoke checks and separate mock children stay outside the three database schedules.
set -euo pipefail
umask 077
[[ $# = 0 && -f /.dockerenv && ${BE02_GUARDS_DISPOSABLE:-} = 1 ]] || exit 1
test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
scratch=$(mktemp -d /tmp/be02-concurrency-fixtures.XXXXXXXX)
timeout_fd=
cleanup() {
  local status=$? file
  trap - EXIT INT TERM
  [[ -z "$timeout_fd" ]] || exec {timeout_fd}>&-
  for file in assertion fixture.log output events infra killed step timeout.fifo; do
    rm -f -- "$scratch/$file" || status=1
  done
  rmdir -- "$scratch" || status=1
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' INT TERM
# AIDEV-NOTE: Use the image's actual timeout before mock helpers; no wrapper or replacement utility is involved.
timeout -k 1 1 bash -c 'exit 0'
status=0
timeout -k 1 1 bash -c 'exit 37' || status=$?
[[ "$status" = 37 ]] || exit 1
mkfifo -- "$scratch/timeout.fifo"
exec {timeout_fd}<>"$scratch/timeout.fifo"
status=0
# AIDEV-NOTE: Builtin read bounds the child even if timeout is broken and avoids orphan sleep descendants.
output=$(timeout -k 1 1 bash -c '
  trap '\''printf "terminated\n"; exit 42'\'' TERM
  printf "ready\n"
  read -r -t 3 -u "$1" || :
  printf "overran\n"
  exit 0
' timeout-fixture "$timeout_fd") || status=$?
# AIDEV-NOTE: BusyBox preserves the trapped exit; GNU reports 124. Both must prove actual TERM delivery.
[[ "$output" = $'ready\nterminated' && ( "$status" = 42 || "$status" = 124 ) ]] || exit 1
exec {timeout_fd}>&-
timeout_fd=
bash "$test_dir/auth-rls-concurrency-harness-regression-errors.sh" "$scratch" "$test_dir"
bash "$test_dir/auth-rls-concurrency-harness-regression-cleanup.sh" "$scratch" "$test_dir"
printf '%s\n' 'PASSED concurrency harness regressions: 3 real timeout fixtures; 18 diagnostic fixtures; 16 cleanup fixtures'
