#!/usr/bin/env bash
# AIDEV-NOTE: Parent-review-only recovery; authenticate historical identity without replacing its pin.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 5s 90s bash "$0" --bounded; fi
[[ ${RECOVERY_APPROVED:-} == hostname-retained-tool ]]
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base && -z ${DOCKER_HOST:-} ]]
context=default
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra
src=$root/lane-c-20261012
task=be01r1-2fb0fbfc-ab83-4249-a11a-d2a9192b93da
evidence=$root/$task.OXM4uc
registry=$evidence/resources
name=$task-tool-7c9e9bf4-bef3-4cbd-a844-dbd7f3c940dc
id=9c90bd737e4917e53445e983207f9b340b286308535056d651b36b78a6fef6e1
pin=d935675c39c7d507d15b0fc800618093e7ee7164eb4308536214bf9c2f68ecba
inspector=$src/ops/tests/fleet02-egress-inspect.jq
daemon() { timeout -k 3s 10s docker --context "$context" "$@"; }
[[ $(daemon context inspect "$context" --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
printf '%s  %s\n' ee8df9810329ea884b4e706e0b9dee558026262fd7488afeff8abde2af873f4e "$inspector" | sha256sum -c -
for file in "$registry/$name.spec" "$registry/$name.pin" "$registry/$name.id" "$evidence/retained-tool-inspect.json"; do
  [[ -f $file && ! -L $file && $(realpath "$file") == "$file" ]]
done
[[ $(cat "$registry/$name.id") == "$id" && $(cat "$registry/$name.pin") == "$pin" ]]
umask 077
recovery=$(mktemp -d "$evidence/recovery.XXXXXX")
printf 'recovery=%s\n' "$recovery"
df -B1 "$root" > "$recovery/space-before"
profile() {
  local snapshot=$1 fingerprint
  jq -e --arg id "$id" 'length == 1 and (.[0] | .Id == $id and .State.Status == "exited" and
    .State.Running == false and .State.Paused == false and .State.Restarting == false and
    .State.ExitCode == 0 and (.Mounts | length) == 1 and .Mounts[0].Type == "bind" and
    .Mounts[0].RW == false)' "$snapshot" >/dev/null
  fingerprint=$(jq -ce --arg task "$task" --slurpfile spec "$registry/$name.spec" \
    -f "$inspector" "$snapshot" | sha256sum | cut -d' ' -f1)
  [[ $fingerprint == "$pin" ]]
}
# Preserve original evidence; both the diagnostic snapshot and fresh state must satisfy the same old pin.
profile "$evidence/retained-tool-inspect.json"
daemon inspect "$id" > "$recovery/before.json"
profile "$recovery/before.json"
daemon inspect "$id" > "$recovery/immediate.json"
profile "$recovery/immediate.json"
# No force and no volume deletion: a restart between verification and removal must fail safely.
daemon rm "$id" > "$recovery/remove.log"
daemon container ls -a --no-trunc --format '{{.ID}} {{.Names}}' > "$recovery/containers"
if awk -v id="$id" -v name="$name" '$1==id || $2==name {found=1} END {exit !found}' "$recovery/containers"; then
  echo 'FAIL exact retained identity still present'; exit 1
fi
daemon container ls -aq --filter "label=elevateo.lane=$task" > "$recovery/task-containers"
daemon volume ls -q --filter "label=elevateo.lane=$task" > "$recovery/task-volumes"
daemon network ls -q --filter "label=elevateo.lane=$task" > "$recovery/task-networks"
for kind in containers volumes networks; do [[ ! -s $recovery/task-$kind ]]; done
df -B1 "$root" > "$recovery/space-after"
printf 'recovery_exit=0 exact_id=%s shared_image_retained=true\n' "$id"
