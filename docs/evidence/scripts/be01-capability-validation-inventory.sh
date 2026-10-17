#!/usr/bin/env bash
# AIDEV-NOTE: Separate read-only reconciliation never removes resources or treats failed inspection as absence.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 10s 180s bash "$0" --bounded "${1:?before or after}"; fi
phase=${2:?}; [[ $phase == before || $phase == after ]]
: "${AUDIT:?}" "${TOOLS_CONTEXT:?}" "${TOOLS_SOURCE:?}"
d() { timeout -k 3s 15s docker --context "$TOOLS_CONTEXT" "$@"; }
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base && -z ${DOCKER_HOST:-} ]]
[[ $(d context inspect "$TOOLS_CONTEXT" --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
df -B1 "$TOOLS_SOURCE" "$AUDIT" > "$AUDIT/space.$phase"
d container ls -a --no-trunc --format '{{json .}}' > "$AUDIT/containers.$phase"
d volume ls --format '{{json .}}' > "$AUDIT/volumes.$phase"
d image ls -a --no-trunc --format '{{json .}}' > "$AUDIT/images.$phase"
d buildx ls --format json > "$AUDIT/builders.$phase"
d image inspect -f '{{.Id}}' ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2 > "$AUDIT/base.$phase"
[[ $phase == after ]] || exit 0
cmp "$AUDIT/base.before" "$AUDIT/base.after"
: "${RUN_EVIDENCE:?}"
read -r id_field name_field image_field nonce_field < "$RUN_EVIDENCE/identities"
id=${id_field#id=}; name=${name_field#name=}; image=${image_field#image=}; nonce=${nonce_field#nonce=}
[[ $id =~ ^[a-f0-9]{64}$ && $nonce =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]]
[[ $name == be01recoverycheck-$nonce && $image == "$(cat "$AUDIT/base.before")" ]]
jq -se --arg id "$id" --arg name "$name" 'all(.[]; .ID!=$id and .Names!=$name)' "$AUDIT/containers.after" >/dev/null
for kind in container volume image; do
  args=(); [[ $kind == volume ]] || args+=(-a)
  d "$kind" ls "${args[@]}" -q --filter "label=elevateo.r1.run=$nonce" > "$AUDIT/$kind.label.after"
  [[ ! -s $AUDIT/$kind.label.after ]]
done
printf 'independent_inventory_exit=0\n' > "$AUDIT/inventory.status"
