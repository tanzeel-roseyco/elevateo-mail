#!/usr/bin/env bash
# AIDEV-NOTE: Interpreter-backed mock preserves noexec tmpfs; NUL-delimited arguments detect boundary changes.
set -euo pipefail
cd /src
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export INT401_CALLS="$work/calls"
run_dev() {
  bash -c '
    docker() {
      printf "%s\0" "$@" >> "$INT401_CALLS"
      printf "\n" >> "$INT401_CALLS"
      return "${INT401_DOCKER_EXIT:-0}"
    }
    source "$0" "$@"
  ' /src/scripts/dev "$@"
}
expect() { printf '%s\0' "$@" >> "$work/expected"; printf '\n' >> "$work/expected"; }
for command in bootstrap up migrate stop; do
  : > "$INT401_CALLS"; : > "$work/expected"
  run_dev "$command"
  case "$command" in
    bootstrap)
      expect compose -f ops/compose.secrets.yaml run --rm secrets
      expect compose -f compose.yaml --env-file ops/local/.env build api
      expect compose -f compose.yaml --env-file ops/local/.env up -d --wait db
      expect compose -f compose.yaml --env-file ops/local/.env run --rm bootstrap ;;
    up) expect compose -f compose.yaml --env-file ops/local/.env up -d --wait db auth rest storage mailpit api worker ;;
    migrate) expect compose -f compose.yaml --env-file ops/local/.env run --rm migrate ;;
    stop) expect compose -f compose.yaml --env-file ops/local/.env stop ;;
  esac
  cmp "$INT401_CALLS" "$work/expected"
done
for command in '' seed check unknown; do
  : > "$INT401_CALLS"
  status=0; run_dev "$command" > "$work/usage" 2>&1 || status=$?
  [[ $status == 2 && ! -s $INT401_CALLS ]]
  grep -F 'bootstrap|up|migrate|stop' "$work/usage"
done
export INT401_DOCKER_EXIT=17
: > "$INT401_CALLS"; : > "$work/expected"
status=0; run_dev bootstrap > "$work/failure" 2>&1 || status=$?
expect compose -f ops/compose.secrets.yaml run --rm secrets
[[ $status == 17 ]]
cmp "$INT401_CALLS" "$work/expected"
printf 'PASS dev commands, invalid inputs, Docker failure propagation\n'
