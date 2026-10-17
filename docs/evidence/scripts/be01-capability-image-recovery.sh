#!/usr/bin/env bash
# AIDEV-NOTE: Separate exact output-image phase; --verify is read-only and also gates content probes.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 10s 120s bash "$0" --bounded "${1:-}"; fi
mode=${2:-}; [[ $mode == --verify || $mode == --remove ]]
[[ $mode == --verify || ${RECOVERY_APPROVED:-} == capability-exact-image ]]
: "${RECOVERY_EVIDENCE:?Fresh absolute private evidence directory}"
umask 077
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base && -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
d() { timeout -k 3s 15s docker --context default "$@"; }
[[ $(d context inspect default --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
[[ $RECOVERY_EVIDENCE == /* && ! -e $RECOVERY_EVIDENCE && ! -L $RECOVERY_EVIDENCE && $(realpath -m "$RECOVERY_EVIDENCE") == "$RECOVERY_EVIDENCE" ]]
mkdir -m 0700 "$RECOVERY_EVIDENCE"; evidence=$RECOVERY_EVIDENCE; phase=authenticate
finish() { local rc=$?; trap - EXIT; printf 'image_exit=%s mode=%s phase=%s\n' "$rc" "$mode" "$phase" > "$evidence/status"; exit "$rc"; }
trap finish EXIT; trap 'exit 130' INT; trap 'exit 143' TERM
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra
task=be01servicesapp-00ef5f0b-5d3a-4285-813b-b9895a0bc443
history=$root/$task.qiDe2B
image=sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8
authenticate() {
  local file
  for file in identities preexisting-images; do
    [[ -f $history/$file && ! -L $history/$file && $(realpath "$history/$file") == "$history/$file" ]] || return 1
  done
  printf '%s  %s\n' 380cb63781dc296acd718b82523302bdf2504b08c80a9e4c7bdc9efaf8604930 "$history/identities" \
    57b2d5ae5322297d79e3d709bc2495c2cc66fa8283f5cc3d178ed54e6f2f72c7 "$history/preexisting-images" | sha256sum -c - || return 1
  grep -Fx "image=$image builder=bf0e5f1939dd6f82d6b3eb92471071e37aa710365a876cc46bdb1075c135f73c task=$task" "$history/identities" >/dev/null || return 1
  if grep -F "$image" "$history/preexisting-images" >/dev/null; then return 1; fi
}
snapshot() {
  d image inspect "$image" > "$1.raw" || return 1
  jq -ce --arg id "$image" --arg task "$task" '
    if length==1 and (.[0]|.Id==$id and .RepoTags==[$task+":app"] and
      .RepoDigests==[$task+"@"+$id] and .Config.User=="10001" and
      (.Config.Volumes//{}|length)==0 and .Config.Labels["elevateo.r1.run"]=="00ef5f0b-5d3a-4285-813b-b9895a0bc443")
    then .[0]|{Id,RepoTags,RepoDigests,Config} else error("image provenance") end' "$1.raw" > "$1" || return 1
  [[ $(d image inspect "$task:app" --format '{{.Id}}') == "$image" ]] || return 1
}
consumers() {
  local id; local ids=()
  d container ls -a --no-trunc --format '{{.ID}}' > "$evidence/containers.$1" || return 1
  while read -r id; do
    [[ $id =~ ^[0-9a-f]{64}$ ]] || return 1
    ids+=("$id")
  done < "$evidence/containers.$1"
  # One bounded batch avoids hundreds of shared-host CLI startups; require the complete captured ID set.
  [[ ${#ids[@]} -le 1000 ]] || return 1
  if [[ ${#ids[@]} -gt 0 ]]; then d inspect "${ids[@]}" > "$evidence/consumer.$1.raw" || return 1
  else printf '[]\n' > "$evidence/consumer.$1.raw" || return 1; fi
  jq -e --rawfile ids "$evidence/containers.$1" --arg image "$image" '
    ($ids|split("\n")|map(select(length>0))|sort) as $expected |
    type=="array" and ([.[].Id]|sort)==$expected and ($expected|unique|length)==($expected|length) and
    all(.[]; .Image!=$image)' "$evidence/consumer.$1.raw" >/dev/null || return 1
  d container ls -aq --no-trunc --filter "ancestor=$image" > "$evidence/ancestor.$1" || return 1
  [[ ! -s $evidence/ancestor.$1 ]]
}
remove_exact_image() {
  # AIDEV-NOTE: --no-prune prevents deletion of untagged parents outside this exact output-image scope.
  d image rm --no-prune "$image"
}
authenticate
df -B1 "$evidence" > "$evidence/space.before"
d image ls -aq --no-trunc | sort -u > "$evidence/images.before"
snapshot "$evidence/before"; consumers before
if [[ $mode == --remove ]]; then
  # Image is last: successful exact-volume and label inventories must both be empty.
  d volume ls --format '{{.Name}}' > "$evidence/volumes.before"
  for kind in config data state storage; do
    if grep -Fx "be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b-$kind" "$evidence/volumes.before" >/dev/null; then exit 1; fi
  done
  d volume ls -q --filter label=elevateo.lane=be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b > "$evidence/volumes.label"
  [[ ! -s $evidence/volumes.label ]]
fi
authenticate; snapshot "$evidence/fresh"; cmp -s "$evidence/before" "$evidence/fresh"; consumers fresh
if [[ $mode == --remove ]]; then
  phase=remove; remove_exact_image > "$evidence/remove.log"
  printf 'image_rm_exit=0\n' > "$evidence/remove.status"
  d image ls --no-trunc --format '{{json .}}' > "$evidence/images.after.json"
  jq -se --arg id "$image" --arg task "$task" 'all(.[]; .ID!=$id and (.Repository!=$task or .Tag!="app"))' "$evidence/images.after.json" >/dev/null
  d image ls -aq --no-trunc | sort -u > "$evidence/images.after"
  while read -r id; do [[ $id == "$image" ]] || grep -Fx "$id" "$evidence/images.after" >/dev/null; done < "$evidence/images.before"
  printf 'absence_exit=0 shared_retention_exit=0\n' > "$evidence/absence.status"
fi
df -B1 "$evidence" > "$evidence/space.after"
phase=complete
