#!/usr/bin/env bash
# AIDEV-NOTE: Independent read-only evidence; no deletion or inference from a failed inspect.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 15s 180s bash "$0" --bounded </dev/null; fi
: "${AUDIT:?}" "${NONCE:?}" "${SRC:?}" "${INPUT_SHA:?}"
[[ $NONCE =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]]
[[ $INPUT_SHA == 380bc01a2bb830133cb385be4f5e825b514cb283635a28fad9b565767b3fd573 ]]
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
daemon() { timeout -k 3s 15s docker --context default "$@"; }
[[ $(daemon context inspect default --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
out=$AUDIT/independent
[[ ! -e $out && ! -L $out ]]
umask 077
mkdir "$out"
trap 'rc=$?; trap - EXIT; printf "independent_exit=%s\n" "$rc" > "$out/status" || exit 1; exit "$rc"' EXIT
id=$(cat "$AUDIT/container.id")
[[ $id =~ ^[a-f0-9]{64}$ ]]
daemon container ls -a --no-trunc --format '{{json .}}' > "$out/containers.jsonl"
jq -se --arg id "$id" --arg n "be01diagnostic-$NONCE" 'all(.[]; .ID!=$id and .Names!=$n)' "$out/containers.jsonl" >/dev/null
daemon container ls -a -q --no-trunc --filter "label=elevateo.r1.run=$NONCE" > "$out/labels"
[[ ! -s $out/labels ]]
(cd "$SRC" && printf '%s  inputs.sha256\n' "$INPUT_SHA" | sha256sum -c - && sha256sum -c inputs.sha256) > "$out/source.log"
volume=be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6-config
daemon volume inspect "$volume" > "$out/config.json"
# Baseline is a successful fresh preflight inspect; compare identity only, never volume contents.
for file in "$AUDIT/retained-config.before.json" "$out/config.json"; do
  jq -e --arg n "$volume" 'length==1 and .[0].Name==$n' "$file" >/dev/null
  jq -S '.[0] | {Name,Driver,Scope,CreatedAt,Labels,Options,Mountpoint}' "$file" > "$out/$(basename "$file").identity"
done
cmp "$out/retained-config.before.json.identity" "$out/config.json.identity"
daemon container ls -a -q --no-trunc --filter "volume=$volume" > "$out/config-consumers"
[[ ! -s $out/config-consumers ]]
daemon image ls -a -q --no-trunc > "$out/images.raw"
sort -u "$out/images.raw" > "$out/images"
[[ -s $AUDIT/retained-image-ids.before ]]
while IFS= read -r image; do
  [[ $image =~ ^sha256:[a-f0-9]{64}$ ]]
  grep -Fx -- "$image" "$out/images" >/dev/null
done < "$AUDIT/retained-image-ids.before"
daemon buildx ls --format '{{.Name}}' > "$out/builders.raw"
sort -u "$out/builders.raw" > "$out/builders"
cmp "$AUDIT/builders.before" "$out/builders"
df -B1 "$AUDIT" > "$out/df.after"
