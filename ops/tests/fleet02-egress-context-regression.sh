#!/usr/bin/env bash
# AIDEV-NOTE: Docker-only no-socket regression for explicit context and attached-start deadlines.
set -euo pipefail
[[ -f /.dockerenv && ! -S /var/run/docker.sock ]]
lane=/src/ops/tests
evidence=$(mktemp -d)
registry=$evidence
task=be01r1-context
context=selected-test-context
export DOCKER_CONTEXT=wrong-default DOCKER_HOST=unix:///wrong-daemon.sock
source "$lane/fleet02-egress-resources.sh"
source "$lane/fleet02-egress-compose.sh"
# Inspect every direct Docker call site, including driver preflight; all others use the shared adapter.
for file in "$lane/fleet02-egress-resources.sh" "$lane/fleet02-egress-compose.sh" \
  "$lane/egress-check-fleet02.sh" /src/docs/evidence/scripts/be-01-r1-fleet02-compose-egress.sh; do
  while IFS= read -r line; do
    [[ $line == 'for tool in docker '* ]] && continue
    [[ $line == *'docker --context "$context"'* ]] || { echo 'FAIL unpinned Docker call'; exit 1; }
  done < <(grep -E '(^|[[:space:]$(])docker[[:space:]]' "$file")
done
docker() {
  [[ $1 == --context && $2 == "$context" ]] || return 97
  shift 2
  printf '%s\n' "$*" >> "$evidence/calls"
  if [[ $1 == inspect ]]; then
    case $* in
      *State.Running*) printf 'false\n' ;;
      *State.ExitCode*State.Status*) return 98 ;;
      *State.Status*) printf 'exited|0\n' ;;
      *State.ExitCode*) printf '0\n' ;;
    esac
  fi
}
timeout() {
  [[ $1 == --signal=TERM && $2 == --kill-after=2s ]] || return 96
  local limit=$3
  shift 3
  if [[ $1 == env ]]; then
    # Simulate the clean Compose environment without requiring an executable on noexec /tmp.
    while [[ $# -gt 0 && $1 != docker ]]; do shift; done
  fi
  [[ ${1:-} == docker ]] || return 95
  shift
  # AIDEV-NOTE: Pair the bound with its operation so swapped deadlines cannot satisfy independent assertions.
  printf '%s|%s\n' "$limit" "$*" >> "$evidence/deadlines"
  docker "$@"
}
verify_container() { return 0; }
remove_container() { return 0; }
tool_create() { printf 'fixture-id\n' > "$registry/$1.id"; }
printf 'fixture-id\n' > "$registry/$task-bootstrap.id"
oneshot bootstrap
tool_run fixture-image none fixture.rb
src=/src app=fixture-image override=/src/ops/compose.fleet02-egress.yaml
compose config --format json
for operation in 'container ls' 'network inspect' 'network create' 'network rm' 'image inspect' \
  'create fixture' 'start fixture' 'stop fixture' 'rm fixture' 'ps fixture' 'version'; do
  read -r -a args <<< "$operation"
  daemon "${args[@]}"
done
grep -Fx 'start -a fixture-id' "$evidence/calls" >/dev/null
grep -Fx 'start -ai fixture-id' "$evidence/calls" >/dev/null
grep -Fx "60s|--context $context start -a fixture-id" "$evidence/deadlines" >/dev/null
grep -Fx "12s|--context $context start -ai fixture-id" "$evidence/deadlines" >/dev/null
grep -E "^25s\|--context $context compose .* config --format json$" "$evidence/deadlines" >/dev/null
grep -Fx "10s|--context $context version" "$evidence/deadlines" >/dev/null
printf 'PASS context forwarding, call-site guard and startup deadlines; no daemon contacted\n'
