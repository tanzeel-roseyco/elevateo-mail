#!/usr/bin/env bash
# AIDEV-NOTE: Mock Docker checks wrapper dispatch without services, secrets, or a daemon; run inside Docker only.
set -euo pipefail
cd /src
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export INT401_CALLS="$work/calls"
cat > "$work/docker" <<'MOCK'
#!/bin/sh
printf '%s\n' "$*" >> "$INT401_CALLS"
exit "${INT401_DOCKER_EXIT:-0}"
MOCK
chmod 700 "$work/docker"
export PATH="$work:$PATH"
for command in bootstrap up migrate stop; do
  : > "$INT401_CALLS"
  sh scripts/dev "$command"
  case "$command" in
    bootstrap) expected='compose -f ops/compose.secrets.yaml run --rm secrets
compose -f compose.yaml --env-file ops/local/.env build api
compose -f compose.yaml --env-file ops/local/.env up -d --wait db
compose -f compose.yaml --env-file ops/local/.env run --rm bootstrap' ;;
    up) expected='compose -f compose.yaml --env-file ops/local/.env up -d --wait db auth rest storage mailpit api worker' ;;
    migrate) expected='compose -f compose.yaml --env-file ops/local/.env run --rm migrate' ;;
    stop) expected='compose -f compose.yaml --env-file ops/local/.env stop' ;;
  esac
  [[ $(cat "$INT401_CALLS") == "$expected" ]]
done
for command in '' seed check unknown; do
  : > "$INT401_CALLS"
  status=0; sh scripts/dev "$command" > "$work/usage" 2>&1 || status=$?
  [[ $status == 2 && ! -s $INT401_CALLS ]]
  grep -F 'bootstrap|up|migrate|stop' "$work/usage"
done
export INT401_DOCKER_EXIT=17
status=0; sh scripts/dev bootstrap > "$work/failure" 2>&1 || status=$?
[[ $status == 17 && $(wc -l < "$INT401_CALLS") == 1 ]]
printf 'PASS dev commands, invalid inputs, Docker failure propagation\n'
