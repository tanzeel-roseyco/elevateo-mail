#!/usr/bin/env bash
# AIDEV-NOTE: Fixed four-volume recovery; all structural checks precede any deletion, image is a separate phase.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 30s 600s bash "$0" --bounded; fi
[[ ${RECOVERY_APPROVED:-} == capability-four-volumes ]]
: "${RECOVERY_EVIDENCE:?Fresh absolute private evidence directory}" "${RECOVERY_INSPECTOR:?Pinned repaired profile}"
umask 077
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base && -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
d() { timeout -k 3s 15s docker --context default "$@"; }
[[ $(d context inspect default --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
[[ $RECOVERY_EVIDENCE == /* && ! -e $RECOVERY_EVIDENCE && ! -L $RECOVERY_EVIDENCE && $(realpath -m "$RECOVERY_EVIDENCE") == "$RECOVERY_EVIDENCE" ]]
mkdir -m 0700 "$RECOVERY_EVIDENCE"; evidence=$RECOVERY_EVIDENCE; phase=authenticate; removed=0
finish() { local rc=$?; trap - EXIT; printf 'volume_exit=%s phase=%s removed=%s image_untouched=true\n' "$rc" "$phase" "$removed" > "$evidence/status"; exit "$rc"; }
trap finish EXIT; trap 'exit 130' INT; trap 'exit 143' TERM
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra
src=$root/lane-c-20261012
task=be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b
registry=$root/$task.qXP5nL/resources
image=sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8
scripts=$(cd -- "$(dirname -- "$0")" && pwd -P)
pin() {
  [[ -f $2 && ! -L $2 && $(realpath "$2") == "$2" ]] || return 1
  printf '%s  %s\n' "$1" "$2" | sha256sum -c - >/dev/null || return 1
}
authenticate() {
  pin d7e8a7d982b4e9bac6bbca3daf8f13494a8181a40d4d704dcd7a28fc93b9b633 "$RECOVERY_INSPECTOR" || return 1
  pin 1c9e6f6a7aeb8cedace643d9c3798bd36d6fb623bff58e2ce6876becee8d54fa "$src/ops/tools/be01-services/volume.rb" || return 1
  pin 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b "$src/ops/tests/fleet02-egress-source.sha256" || return 1
  (cd "$src" && sha256sum -c --quiet ops/tests/fleet02-egress-source.sha256) || return 1
  pin e0c8e2d50f224436e92fb5b6c9ceae6388ea5e1dc3a6f8490c02a047fd17d20c "$scripts/be01-capability-content-probe.sh" || return 1
  pin 8ac8a690a9dd1e31a71b226bdf10d0cc9eca04381c94c51c0c1b771deb7b8348 "$scripts/be01-capability-image-recovery.sh" || return 1
  local kind hash
  while read -r kind hash; do
    pin "$hash" "$registry/$kind.volume" || return 1
    pin e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 "$registry/$kind.volume-intent" || return 1
  done < "$evidence/historical"
}
cat > "$evidence/historical" <<'PINS'
config 7cf01d4cd847257fab5900eb980a1e275bbc556fe4b812bd5feb9ab681adaf17
data 73067ea1144bcbde24bde0e474c40d179ac035936f0a7bad1a84a22ccfe04b27
state 4d120429862b7cfe894801384704d9252ce2a0292167a819443ddeb8c84b1a7c
storage 595857572c7971b0bd81c0608a618f96a62c0d92d0198864f7ba2eb7d331a4d2
PINS
volume_identity() {
  local kind=$1 out=$2
  d volume inspect "$task-$kind" > "$out.raw" || return 1
  jq -ce --arg name "$task-$kind" --arg task "$task" '
    if length==1 and (.[0]|.Name==$name and .Driver=="local" and .Scope=="local" and
      .Labels["elevateo.lane"]==$task and (.Options//{}|length)==0)
    then .[0]|{Name,Driver,Scope,Labels,Options,Mountpoint,CreatedAt} else error("volume identity") end' "$out.raw" > "$out" || return 1
  cmp -s "$registry/$kind.volume" "$out" || return 1
}
zero_consumers() {
  local kind=$1 out=$2 id; local ids=()
  d container ls -aq --no-trunc --filter "volume=$task-$kind" > "$out.filter" || return 1
  [[ ! -s $out.filter ]] || return 1
  d container ls -a --no-trunc --format '{{.ID}}' > "$out.all" || return 1
  while read -r id; do
    [[ $id =~ ^[0-9a-f]{64}$ ]] || return 1
    ids+=("$id")
  done < "$out.all"
  # Bound both argument size and total daemon calls on the shared host; disappearing IDs fail the whole batch.
  [[ ${#ids[@]} -le 1000 ]] || return 1
  if [[ ${#ids[@]} -gt 0 ]]; then d inspect "${ids[@]}" > "$out.inspect" || return 1
  else printf '[]\n' > "$out.inspect" || return 1; fi
  jq -e --rawfile ids "$out.all" --arg name "$task-$kind" '
    ($ids|split("\n")|map(select(length>0))|sort) as $expected |
    type=="array" and ([.[].Id]|sort)==$expected and ($expected|unique|length)==($expected|length) and
    all(.[]; all(.Mounts[]; .Type!="volume" or .Name!=$name))' "$out.inspect" >/dev/null || return 1
}
authenticate
source "$scripts/be01-capability-content-probe.sh"
df -B1 "$evidence" > "$evidence/space.before"
RECOVERY_EVIDENCE=$evidence/image-preflight bash "$scripts/be01-capability-image-recovery.sh" --verify
for kind in config data state storage; do
  volume_identity "$kind" "$evidence/$kind.before"
  zero_consumers "$kind" "$evidence/$kind.consumers.before"
  printf 'identity_exit=0 consumer_exit=0\n' > "$evidence/$kind.preflight.status"
done
phase=content
# Direct unconditional calls preserve errexit throughout the probe; no conditional-call suppression.
for kind in config data state storage; do content_probe "$kind"; done
authenticate
phase=remove
for kind in config data state storage; do
  volume_identity "$kind" "$evidence/$kind.fresh"
  zero_consumers "$kind" "$evidence/$kind.consumers.fresh"
  d volume rm "$task-$kind" > "$evidence/$kind.remove.log"
  removed=$((removed+1)); printf 'volume_rm_exit=0\n' > "$evidence/$kind.remove.status"
  d volume ls --format '{{.Name}}' > "$evidence/$kind.volumes.after"
  if grep -Fx "$task-$kind" "$evidence/$kind.volumes.after" >/dev/null; then exit 1; fi
  zero_consumers "$kind" "$evidence/$kind.consumers.after"
  printf 'absence_exit=0 consumer_exit=0\n' > "$evidence/$kind.absence.status"
done
authenticate
d container ls -a --no-trunc --format '{{json .}}' > "$evidence/containers.final"
jq -se --arg task "$task" 'all(.[]; (.Names|startswith($task))|not)' "$evidence/containers.final" >/dev/null
d volume ls --format '{{.Name}}' > "$evidence/volumes.final"
for kind in config data state storage; do
  if grep -Fx "$task-$kind" "$evidence/volumes.final" >/dev/null; then exit 1; fi
done
d volume ls -q --filter "label=elevateo.lane=$task" > "$evidence/volumes.label.final"
[[ ! -s $evidence/volumes.label.final ]]
df -B1 "$evidence" > "$evidence/space.after"
printf 'source_exit=0 inventory_exit=0\n' > "$evidence/final.status"
phase=complete
