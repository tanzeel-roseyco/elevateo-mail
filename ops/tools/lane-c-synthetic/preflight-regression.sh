#!/usr/bin/env bash
# AIDEV-NOTE: Docker-only fixtures exercise real non-root readability and the supported Buildx JSON contract.
set -euo pipefail
[[ -f /.dockerenv && ! -S /var/run/docker.sock && $(id -u) == 10001 ]]
source /src/ops/tools/lane-c-synthetic/cleanup.sh
source /src/ops/tools/lane-c-synthetic/preflight.sh
fixture=$(mktemp -d)
builder=test-builder; TOOLS_CONTEXT=selected; endpoint=unix:///selected
metadata='{"Name":"test-builder","Driver":"docker-container","Nodes":[{"Name":"test-builder0","Endpoint":"selected"}]}'
docker() {
  printf '%s\n' "$*" >> "$fixture/calls"
  case "$*" in
    'buildx ls --format json') [[ $mode != unavailable ]] || return 125; printf '%s\n' "$payload" ;;
    'buildx rm --keep-daemon --keep-state test-builder') return 0 ;;
    *) echo "unsupported/unexpected operation $*" >&2; return 99 ;;
  esac
}
mode=valid; payload=$metadata
registry_inventory >/dev/null
remove_builder_registration
grep -Fx 'buildx rm --keep-daemon --keep-state test-builder' "$fixture/calls" >/dev/null
for mode in unavailable malformed empty duplicate driver endpoint nodes; do
  : > "$fixture/calls"
  payload=$metadata
  case "$mode" in
    malformed) payload='not JSON' ;;
    empty) payload='' ;;
    duplicate) payload="$metadata"$'\n'"$metadata" ;;
    driver) payload=$(jq '.Driver="remote"' <<< "$metadata") ;;
    endpoint) payload=$(jq '.Nodes[0].Endpoint="foreign"' <<< "$metadata") ;;
    nodes) payload=$(jq '.Nodes += .Nodes' <<< "$metadata") ;;
  esac
  if remove_builder_registration; then echo "unexpected acceptance: $mode" >&2; exit 1; fi
  if grep -F 'buildx rm' "$fixture/calls"; then exit 1; fi
done
# Exercise the exact inline preflight as this container's UID, without a Docker socket or daemon mock.
run_container() { "$@"; }
mkdir -p "$fixture/ops/tools/lane-c-synthetic" "$fixture/ops/tests" "$fixture/restricted"
printf 'fixture\n' > "$fixture/restricted/input"
digest=$(sha256sum "$fixture/restricted/input"); digest=${digest%% *}
for manifest in ops/tools/lane-c-synthetic/tools.sha256 ops/tests/fleet02-egress-source.sha256 ops/tests/fleet02-egress-package.sha256; do
  printf '%s  restricted/input\n' "$digest" > "$fixture/$manifest"
done
check_readability "$fixture"
chmod 000 "$fixture/restricted/input"
if check_readability "$fixture"; then echo 'unreadable file accepted' >&2; exit 1; fi
chmod 600 "$fixture/restricted/input"
chmod 600 "$fixture/restricted"
if check_readability "$fixture"; then echo 'untraversable directory accepted' >&2; exit 1; fi
chmod 700 "$fixture/restricted"
check_readability "$fixture"
# Keep capability and runtime-user preflights before the builder/cache allocation in the real driver.
driver=/src/ops/tools/lane-c-synthetic/parent-run.sh
capability=$(grep -n '^registry_inventory >' "$driver"); capability=${capability%%:*}
readability=$(grep -n '^check_readability$' "$driver"); readability=${readability%%:*}
allocation=$(grep -n '^docker volume create' "$driver"); allocation=${allocation%%:*}
[[ $capability -lt $readability && $readability -lt $allocation ]]
echo 'PASS supported Buildx registry and runtime-user readability regression'
