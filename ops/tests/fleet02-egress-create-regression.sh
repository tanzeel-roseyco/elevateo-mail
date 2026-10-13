#!/usr/bin/env bash
# AIDEV-NOTE: Docker-only no-socket regression for registration before dependency-inclusive Compose creation.
set -euo pipefail
[[ -f /.dockerenv && ! -S /var/run/docker.sock ]]
source /src/ops/tests/fleet02-egress-compose.sh
evidence=$(mktemp -d)
registry=$evidence
task=be01r1-create
runtime=$task-runtime
services=(db bootstrap migrate auth rest storage mailpit api worker)
register() {
  local service
  for service in "${services[@]}"; do
    jq -n --arg name "$task-$service" --arg service "$service" \
      '{name:$name,service:$service}' > "$registry/$task-$service.spec"
  done
}
absent() { [[ $1 == container && $2 != "${occupied:-}" ]]; }
network_new() { printf 'network\n' >> "$evidence/calls"; }
verify_network() { [[ ${bad_network:-false} == false ]]; }
compose() {
  local service
  [[ $* == 'create --no-build --pull never db bootstrap migrate auth rest storage mailpit api worker' ]] || return 97
  # Simulate dependency-inclusive creation: every possible service must already have its ownership intent.
  for service in "${services[@]}"; do
    jq -e --arg name "$task-$service" --arg service "$service" \
      '.name == $name and .service == $service' "$registry/$task-$service.spec" >/dev/null || return 98
  done
  printf 'create\n' >> "$evidence/calls"
  return "${create_status:-0}"
}
pin_container() {
  [[ $1 != "${bad_pin:-}" ]] || return 1
  printf 'pin %s\n' "$1" >> "$evidence/calls"
}
register
create_services
{
  printf 'network\ncreate\n'
  for service in "${services[@]}"; do printf 'pin %s\n' "$task-$service"; done
} > "$evidence/expected"
cmp "$evidence/expected" "$evidence/calls"
# Missing or mismatched intent, and occupied names, must fail before even network creation.
for mode in missing mismatched occupied; do
  register
  : > "$evidence/calls"
  occupied=
  case $mode in
    missing) rm "$registry/$task-worker.spec" ;;
    mismatched) printf '{"name":"foreign","service":"worker"}\n' > "$registry/$task-worker.spec" ;;
    occupied) occupied=$task-worker ;;
  esac
  if create_services; then echo "FAIL accepted $mode"; exit 1; fi
  [[ ! -s $evidence/calls ]]
done
occupied=
register
# A failed network verification prevents Compose creation.
bad_network=true
: > "$evidence/calls"
if create_services; then echo 'FAIL ignored network uncertainty'; exit 1; fi
[[ $(cat "$evidence/calls") == network ]]
bad_network=false
# Failed/partial create must never establish pins from incomplete, uncertain results.
create_status=42
: > "$evidence/calls"
if create_services; then echo 'FAIL ignored create failure'; exit 1; fi
printf 'network\ncreate\n' > "$evidence/expected"
cmp "$evidence/expected" "$evidence/calls"
create_status=0
# Profile/identity rejection after create stops pinning and leaves existing cleanup policy in control.
bad_pin=$task-bootstrap
: > "$evidence/calls"
if create_services; then echo 'FAIL ignored pin failure'; exit 1; fi
printf 'network\ncreate\npin %s-db\n' "$task" > "$evidence/expected"
cmp "$evidence/expected" "$evidence/calls"
printf 'PASS complete registration, supported batch create, conflict and failure gates; no daemon contacted\n'
