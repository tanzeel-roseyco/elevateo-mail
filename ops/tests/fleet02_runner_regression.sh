#!/usr/bin/env bash
# Run only inside parent's disposable Docker tools container, without a Docker socket.
set -euo pipefail
[[ -f /.dockerenv && ! -S /var/run/docker.sock ]] || exit 2
for tool in bash jq git timeout sha256sum tar realpath cmp; do command -v "$tool" >/dev/null; done
root=$(cd "$(dirname "$0")/../.." && pwd)
scripts=$root/docs/evidence/scripts
helper=$scripts/be-01-r1-fleet02-resources.sh
runner=$scripts/be-01-r1-fleet02-full-run.sh
[[ $(sha256sum "$helper" | cut -d' ' -f1) == 86681089c789e3b636f518508e8c6cf496d332f69bd69e5696bbc1dd4302aa4d ]]
[[ $(sha256sum "$runner" | cut -d' ' -f1) == e2d409e0284cf486ea8894637f6376459994f4c5ae97a332b5a5c293aaf80066 ]]
work=$(mktemp -d)
# AIDEV-NOTE: All stimuli are synthetic; no daemon calls, real resources or host cleanup are permitted.
nonce=regression; task=regression; config=regression-config; pg=fixture
src=/synthetic/source; network=regression-net; db=regression-db
build_container=regression-builder; cache=regression-cache; builder=regression-builder
app_image=fixture; build_image=''; builder_id=''; config_ready=true
evidence=$work; declare -A profiles=()
source "$helper"
reset_fixture() {
  change_on_start=''
  : > "$work/calls"
  printf 'absent' > "$work/state"
  jq -n --arg nonce "$nonce" --arg config "$config" '[{
    Config:{Labels:{"elevateo.r1.run":$nonce}},
    Mounts:[{Type:"volume",Name:$config,Source:"",Destination:"/etc/postgresql-custom",RW:false}],
    HostConfig:{Tmpfs:{},NetworkMode:"none",PortBindings:{},NanoCpus:500000000,
      Memory:268435456,MemorySwap:268435456}}]' > "$work/inspect.json"
}
docker() {
  printf '%s\n' "$*" >> "$work/calls"
  case "$1 $2" in
    'create --name') printf created > "$work/state" ;;
    'start -a')
      printf running > "$work/state"
      if [[ -n $change_on_start ]]; then
        jq "$change_on_start" "$work/inspect.json" > "$work/changed.json"
        mv "$work/changed.json" "$work/inspect.json"
      fi ;;
    'rm -f')
      [[ $3 == "$task-config-check" ]] || return 97
      printf absent > "$work/state" ;;
    'inspect -f')
      case "$3" in
        *Config.Labels*) jq -r '.[0].Config.Labels["elevateo.r1.run"]' "$work/inspect.json" ;;
        *range*) jq -r '.[0].Mounts[] | [.Type,.Name,.Destination,(.RW|tostring)] | join("|")' "$work/inspect.json" ;;
        *) return 96 ;;
      esac ;;
    'inspect regression-config-check') cat "$work/inspect.json" ;;
    'container ls')
      [[ $(cat "$work/state") == absent ]] || printf '%s\n' "$task-config-check" ;;
    'volume inspect') printf '%s\n' "$nonce" ;;
    'network ls'|'image ls'|'system df') : ;;
    *) printf 'unexpected docker call: %s\n' "$*" >&2; return 95 ;;
  esac
}
timeout() {
  local duration=$1; shift
  if [[ $duration == 10s && $1 == docker && $2 == start ]]; then
    "$@"
    return "$probe_status"
  fi
  "$@"
}
# AIDEV-NOTE: The real helper and jq predicates run unchanged; only Docker and timeout boundaries are simulated.
for probe_status in 0 124; do
  reset_fixture
  status=0; inspect_config ro || status=$?
  [[ $status == "$probe_status" && $(cat "$work/state") == absent ]]
  grep -Fx "rm -f $task-config-check" "$work/calls" >/dev/null
done
printf 'PASS probe success and timeout preserve status and remove verified container\n'
for mutation in \
  '.[0].Config.Labels["elevateo.r1.run"]="foreign"' \
  '.[0].Mounts[0].Name="persistent"' \
  '.[0].Mounts[0].RW=true' \
  '.[0].HostConfig.NanoCpus=1000000000' \
  '.[0].HostConfig.Memory=536870912' \
  '.[0].HostConfig.MemorySwap=536870912'; do
  reset_fixture
  jq "$mutation" "$work/inspect.json" > "$work/changed.json"
  mv "$work/changed.json" "$work/inspect.json"
  status=0; inspect_config ro || status=$?
  [[ $status != 0 ]]
  ! grep -E '^(start|rm) ' "$work/calls" >/dev/null
  reset_fixture
  change_on_start=$mutation; probe_status=124
  status=0; inspect_config ro || status=$?
  [[ $status != 0 && $(cat "$work/state") == running ]]
  ! grep -E '^rm ' "$work/calls" >/dev/null
done
printf 'PASS foreign ownership, mount and caps rejected before start and before timeout removal\n'
reset_fixture
profiles=(); probe_status=124
status=0; (cleanup) > "$work/cleanup.log" 2>&1 || status=$?
[[ $status != 0 && $(cat "$work/state") == absent ]]
grep -Fx "rm -f $task-config-check" "$work/calls" >/dev/null
grep -F "RETAIN volume=$config verification_failed" "$work/cleanup.log" >/dev/null
! grep -E '^volume rm ' "$work/calls" >/dev/null
printf 'PASS cleanup late timeout reaps probe and retains unverified volume\n'

# Use the complete runner in fresh processes; a Docker sentinel must remain untouched on every hash rejection.
mkdir "$work/bin" "$work/staging"
cat > "$work/bin/docker" <<'SH'
#!/bin/bash
printf '%s\n' "$*" >> "$R1_SENTINEL"
exit 94
SH
chmod 700 "$work/bin/docker"
cp "$runner" "$work/staging/runner.sh"
cp "$helper" "$work/staging/be-01-r1-fleet02-resources.sh"
printf wrong > "$work/wrong-overlay.rb"
export R1_SENTINEL=$work/sentinel
backend_paths=(apps/server/lib/elevateo/tenancy.rb apps/server/test/be_01_r1/tenancy_test.rb apps/server/test/be_01_r1/worker_role_test.rb)
for scenario in valid overlay catalog helper "${backend_paths[@]}"; do
  cp "$helper" "$work/staging/be-01-r1-fleet02-resources.sh"
  for path in "${backend_paths[@]}"; do
    mkdir -p "$work/backend/$(dirname "$path")"
    cp "$root/$path" "$work/backend/$path"
    [[ $scenario != "$path" ]] || printf wrong > "$work/backend/$path"
  done
  overlay=$root/ops/tests/egress_test.rb
  catalog=$root/ops/tests/membership-catalog.sql
  [[ $(sha256sum "$overlay" | cut -d' ' -f1) == d31859d7747c9035b994f167bd84c5f80268af2d2d5c499514183838a5f237bf ]]
  [[ $(sha256sum "$catalog" | cut -d' ' -f1) == e1a347ce15e6779b93b9b8e4f1dd2baa3d3eac520d3ad294b919193aa1cdc77a ]]
  [[ $scenario != overlay ]] || overlay=$work/wrong-overlay.rb
  [[ $scenario != catalog ]] || catalog=$work/wrong-overlay.rb
  if [[ $scenario == helper ]]; then
    printf '\n# wrong helper bytes\n' >> "$work/staging/be-01-r1-fleet02-resources.sh"
  fi
  : > "$R1_SENTINEL"
  status=0
  PATH="$work/bin:$PATH" R1_BACKEND_REPAIR_ROOT="$work/backend" R1_EGRESS_REPAIR="$overlay" R1_CATALOG_REPAIR="$catalog" \
    bash "$work/staging/runner.sh" --bounded-child > "$work/preflight.log" 2>&1 || status=$?
  if [[ $scenario == valid ]]; then
    [[ $status == 94 && -s $R1_SENTINEL ]]
    grep -Fx 'image ls -q --no-trunc' "$R1_SENTINEL" >/dev/null
  else
    [[ $status == 1 && ! -s $R1_SENTINEL ]]
  fi
done
printf 'PASS valid preflight reaches sentinel; wrong five overlays/helper reject before any Docker call\n'
printf 'PASS all synthetic regressions; actual Docker timeout/resource semantics remain a separate gate\n'
