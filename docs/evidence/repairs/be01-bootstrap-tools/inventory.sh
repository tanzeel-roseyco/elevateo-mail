#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Read-only stable identities avoid secret-bearing Config.Env and transient container state.
if [[ ${1:-} != --bounded ]]; then exec timeout -k 5s 120s bash "$0" --bounded "$@"; fi
shift
out=${1:?Fresh inventory directory required}
: "${TOOLS_CONTEXT:?}" "${TOOLS_HOST:?}"
[[ $TOOLS_HOST == Ubuntu-noble-latest-amd64-base && $(hostname -s) == "$TOOLS_HOST" ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
d() { timeout -k 3s 10s docker --context "$TOOLS_CONTEXT" "$@"; }
[[ $(d context inspect "$TOOLS_CONTEXT" --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
umask 077
mkdir -- "$out"
d container ls -aq --no-trunc | sort -u > "$out/container.ids"
d volume ls -q | sort -u > "$out/volume.names"
d image ls -aq --no-trunc | sort -u > "$out/image.ids"
for list in container.ids volume.names image.ids; do [[ $(wc -l < "$out/$list") -le 300 ]]; done
: > "$out/containers.jsonl"; : > "$out/volumes.jsonl"; : > "$out/images.jsonl"
while IFS= read -r id; do
  d container inspect "$id" | jq -ceS 'if length != 1 then error("inspect cardinality") else
    .[0] | {Id,Name,Image,Mounts,HostConfig,Labels:.Config.Labels} end' >> "$out/containers.jsonl"
done < "$out/container.ids"
while IFS= read -r name; do
  d volume inspect "$name" | jq -ceS 'if length != 1 then error("inspect cardinality") else
    .[0] | {Name,Driver,Scope,CreatedAt,Labels,Options,Mountpoint} end' >> "$out/volumes.jsonl"
done < "$out/volume.names"
while IFS= read -r id; do
  d image inspect "$id" | jq -ceS 'if length != 1 then error("inspect cardinality") else
    .[0] | {Id,RepoTags:((.RepoTags // [])|sort),RepoDigests:((.RepoDigests // [])|sort)} end' >> "$out/images.jsonl"
done < "$out/image.ids"
d buildx ls --format '{{json .}}' | jq -seS 'map({Name,Driver,Nodes:
  ((.Nodes // [])|map({Name,Endpoint})|sort_by(.Name))}) | sort_by(.Name) |
  if length == 0 or any(.[]; (.Name|type) != "string") then error("invalid builders") else . end' > "$out/builders.json"
retained=be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6-config
jq -se --arg name "$retained" 'map(select(.Name==$name)) | length==1' "$out/volumes.jsonl" >/dev/null
jq -se --arg name "$retained" 'all(.[]; all(.Mounts[]; .Name != $name))' "$out/containers.jsonl" >/dev/null
# AIDEV-NOTE: FE removed the historical stage in r10; record fresh presence or absence without recreating it.
jq -sc 'map(select(.Name=="/fe01r8-probes-stage" or .Name=="fe01r8-probes-stage"))' \
  "$out/containers.jsonl" "$out/volumes.jsonl" > "$out/fe-stage.observed.json"
for ref in \
  ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2 \
  moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea \
  python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a; do
  d image inspect "$ref" --format '{{.Id}}' >> "$out/pinned.ids"
done
# Re-list detects ordinary concurrent allocation/removal; inventory is not an atomic daemon transaction.
d container ls -aq --no-trunc | sort -u | cmp "$out/container.ids" -
d volume ls -q | sort -u | cmp "$out/volume.names" -
d image ls -aq --no-trunc | sort -u | cmp "$out/image.ids" -
d system df > "$out/docker-space.txt"
df -B1 "$out" > "$out/host-space.txt"
printf 'inventory_exit=0\n' > "$out/complete.status"
