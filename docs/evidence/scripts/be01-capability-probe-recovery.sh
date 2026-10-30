#!/usr/bin/env bash
# AIDEV-NOTE: Four exact Created probes only; never invoke failed lifecycle cleanup or remove volumes/images.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 5s 240s bash "$0" --bounded; fi
[[ ${RECOVERY_APPROVED:-} == capability-four-created-probes ]]
umask 077
: "${RECOVERY_INSPECTOR:?Separately staged frozen profile.jq}" "${RECOVERY_EVIDENCE:?Fresh absolute evidence directory}"
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base && -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
d() { timeout -k 3s 15s docker --context default "$@"; }
[[ $(d context inspect default --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
[[ $RECOVERY_EVIDENCE == /* && ! -e $RECOVERY_EVIDENCE && ! -L $RECOVERY_EVIDENCE ]]
[[ -f $RECOVERY_INSPECTOR && ! -L $RECOVERY_INSPECTOR && $(realpath "$RECOVERY_INSPECTOR") == "$RECOVERY_INSPECTOR" ]]
printf '%s  %s\n' d7e8a7d982b4e9bac6bbca3daf8f13494a8181a40d4d704dcd7a28fc93b9b633 "$RECOVERY_INSPECTOR" | sha256sum -c -
[[ $(realpath -m "$RECOVERY_EVIDENCE") == "$RECOVERY_EVIDENCE" ]]
mkdir -m 0700 "$RECOVERY_EVIDENCE"
evidence=$RECOVERY_EVIDENCE; phase=preverify; removed=0
finish() { local code=$?; trap - EXIT; printf 'recovery_exit=%s phase=%s removed=%s volumes_images_untouched=true\n' "$code" "$phase" "$removed" | tee "$evidence/status"; exit "$code"; }
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
task=be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b
registry=/home/tanzeel/elevateo-mail-tests-20261012-ultra/$task.qXP5nL/resources
cat > "$evidence/exact" <<'EXACT'
4e6e0384c68c53a8dc5a399ac29475bd512a1c9944495c18b346d60a4a0f3c4f 4f29be4c-9ffa-49c6-a22e-4732818631b7 8b51d389284dfb801a5eedf45fbcfac67138cd0387f5afbe09fbdbf268db7918
204eb69b6ee37cfbecc49186a5135c8b64ac762bd22b958dc844b6a1a6954082 6eb9c0f5-8a4d-4099-91bc-e31f88884284 47b7642d31b99d118fe0d5374742202d85f224707b5b0395aaf823e5e20b984e
9550a43d00f4683d763bb08ac53c8e1d7c87c2ff1ea0d529d073d44fa2dbf5a9 cd747e1c-cd92-44d9-bdf2-0fb2767bd58e dc14678e31b79e79ed98075d8115eca42260843dbccd44095ea432133e7c399a
3fc61e99ba60e33b95254fec05751d4e6705125749643a5b75a10fd89fa3fe95 02fce9dc-9840-4b41-9493-a49ce29c61f6 5ad6e4d45ef350c871d609628466311638105b4d034897c5d9d24eba0b5fa0cb
EXACT
snapshot() {
  local id=$1 suffix=$2 pin=$3 out=$4 spec=$registry/$task-probe-$2.spec
  [[ -f $spec && ! -L $spec && $(realpath "$spec") == "$spec" ]] || return 1
  printf '%s  %s\n' "$pin" "$spec" | sha256sum -c - >/dev/null || return 1
  d inspect "$id" > "$out.raw" || return 1
  jq -e --arg id "$id" 'length==1 and (.[0]|.Id==$id and .State.Status=="created" and
    .State.Running==false and .State.Paused==false and .State.Restarting==false and .State.Dead==false and .State.Pid==0)' "$out.raw" >/dev/null || return 1
  jq -ce --arg task "$task" --slurpfile spec "$spec" -f "$RECOVERY_INSPECTOR" "$out.raw" > "$out" || return 1
}
# Authenticate all four historical specs/profiles before the first destructive operation.
while read -r id suffix pin; do snapshot "$id" "$suffix" "$pin" "$evidence/$suffix.before"; done < "$evidence/exact"
phase=remove
while read -r id suffix pin; do
  snapshot "$id" "$suffix" "$pin" "$evidence/$suffix.fresh"
  cmp -s "$evidence/$suffix.before" "$evidence/$suffix.fresh"
  d rm "$id" > "$evidence/$suffix.rm" # Non-force: concurrent starts fail safe.
  removed=$((removed+1))
  # Successful full inventory proves absence; an inspect error never does.
  d container ls -a --no-trunc --format '{{json .}}' > "$evidence/$suffix.inventory"
  jq -se --arg id "$id" --arg name "$task-probe-$suffix" 'all(.[]; .ID!=$id and .Names!=$name)' "$evidence/$suffix.inventory" >/dev/null
 done < "$evidence/exact"
phase=independent_absence
d container ls -a --no-trunc --format '{{json .}}' > "$evidence/final.inventory"
while read -r id suffix pin; do
  jq -se --arg id "$id" --arg name "$task-probe-$suffix" 'all(.[]; .ID!=$id and .Names!=$name)' "$evidence/final.inventory" >/dev/null
done < "$evidence/exact"
printf 'exact_four_absence_exit=0\n' > "$evidence/absence.status"
phase=complete
