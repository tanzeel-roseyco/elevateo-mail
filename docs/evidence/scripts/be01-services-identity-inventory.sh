#!/usr/bin/env bash
# AIDEV-NOTE: Independent read-only inventory; uncertainty fails closed, never authorizes cleanup.
set -euo pipefail
: "${TOOLS_CONTEXT:?}" "${AUDIT:?}" "${TOOLS_SOURCE:?}"
phase=${1:?before, after or incomplete}
[[ $phase == before || $phase == after || $phase == incomplete ]]
daemon() { timeout -k 3s 20s docker --context "$TOOLS_CONTEXT" "$@"; }
base=ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
buildkit=moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea
df -B1 "$TOOLS_SOURCE" "$AUDIT" > "$AUDIT/space.$phase"
daemon image inspect "$base" "$buildkit" | jq -er '.[].Id' > "$AUDIT/bases.$phase"
daemon container ls -a --no-trunc --format '{{json .}}' > "$AUDIT/containers.$phase"
daemon volume ls --format '{{json .}}' > "$AUDIT/volumes.$phase"
daemon network ls --no-trunc --format '{{json .}}' > "$AUDIT/networks.$phase"
daemon image ls -a --no-trunc --format '{{json .}}' > "$AUDIT/images.$phase"
daemon buildx ls --format json | jq -s '.' > "$AUDIT/builders.$phase"
[[ $phase == after ]] || exit 0
cmp "$AUDIT/bases.before" "$AUDIT/bases.after"
: "${TASK:?exact task required}"
[[ $TASK =~ ^be01identity-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]
nonce=${TASK#be01identity-}
failed=0
for kind in container volume network image; do
  args=(); [[ $kind != container && $kind != image ]] || args+=(-a)
  daemon "$kind" ls "${args[@]}" -q --filter "label=elevateo.r1.run=$nonce" > "$AUDIT/$kind.label.after"
  [[ ! -s $AUDIT/$kind.label.after ]] || failed=1
done
jq -se --arg task "$TASK" 'all(.[]; .Names != ($task+"-checks") and .Names != ($task+"-cache-check") and .Names != ("buildx_buildkit_"+$task+"-build0"))' "$AUDIT/containers.after" >/dev/null || failed=1
jq -se --arg cache "buildx_buildkit_${TASK}-build0_state" 'all(.[]; .Name != $cache)' "$AUDIT/volumes.after" >/dev/null || failed=1
jq -se --arg task "$TASK" 'all(.[]; .Repository != $task)' "$AUDIT/images.after" >/dev/null || failed=1
jq -e --arg builder "$TASK-build" 'all(.[]; .Name != $builder)' "$AUDIT/builders.after" >/dev/null || failed=1
# Recorded immutable IDs must also disappear, even if labels/tags changed.
if [[ -f $RUN_EVIDENCE/identities ]]; then
  read -r image_field builder_field < "$RUN_EVIDENCE/identities"
  image_id=${image_field#image=}; builder_id=${builder_field#builder=}
  [[ $image_id =~ ^sha256:[0-9a-f]{64}$ && $builder_id =~ ^[0-9a-f]{64}$ ]] || exit 1
  jq -se --arg id "$image_id" 'all(.[]; .ID != $id)' "$AUDIT/images.after" >/dev/null || failed=1
  jq -se --arg id "$builder_id" 'all(.[]; .ID != $id)' "$AUDIT/containers.after" >/dev/null || failed=1
fi
printf 'independent_inventory_exit=%s\n' "$failed"
exit "$failed"
