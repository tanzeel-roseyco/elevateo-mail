#!/usr/bin/env bash
# AIDEV-NOTE: Parent-only Docker orchestration; reuse frozen builder verification, not its database cleanup.
set -euo pipefail
# AIDEV-NOTE: The outer timeout also bounds sourced helper inspections and failure-path cleanup.
if [[ ${1:-} != --bounded ]]; then exec timeout -k 180s 900s bash "$0" --bounded; fi
umask 077
: "${TOOLS_SOURCE:?Canonical staged source directory required}"
: "${TOOLS_CONTEXT:?Explicit local Docker context required}"
: "${TOOLS_HOST:?Expected fleet-02 hostname required}"
: "${TOOLS_EVIDENCE:?Existing private evidence parent required}"
[[ $(hostname -s) == "$TOOLS_HOST" && -z ${DOCKER_HOST:-} ]]
[[ $(realpath "$TOOLS_SOURCE") == "$TOOLS_SOURCE" && -d $TOOLS_EVIDENCE ]]
export DOCKER_CONTEXT=$TOOLS_CONTEXT
daemon_for() { local seconds=$1; shift; timeout -k 3s "${seconds}s" docker --context "$TOOLS_CONTEXT" "$@"; }
docker() { daemon_for 10 "$@"; }
for tool in docker jq timeout sha256sum realpath; do command -v "$tool" >/dev/null; done
cd "$TOOLS_SOURCE"
sha256sum -c ops/tools/lane-c-synthetic/tools.sha256
printf '%s  %s\n' 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b \
  ops/tests/fleet02-egress-source.sha256 | sha256sum -c -
printf '%s  %s\n' 46b296fd1158da3e9df1362162d903e01013c5fedd33465bf8ab323ed4217862 \
  ops/tests/fleet02-egress-package.sha256 | sha256sum -c -
sha256sum -c ops/tests/fleet02-egress-source.sha256
sha256sum -c ops/tests/fleet02-egress-package.sha256
printf '%s  %s\n' 97bdb91a0cc406cff6611c5eb97158988e12ffd19cd4413231ea578de7c5a1f4 \
  docs/evidence/scripts/be-01-r1-fleet02-compose-egress.sh | sha256sum -c -
helper=docs/evidence/scripts/be-01-r1-fleet02-resources.sh
printf '%s  %s\n' 86681089c789e3b636f518508e8c6cf496d332f69bd69e5696bbc1dd4302aa4d "$helper" | sha256sum -c -
source "$helper"
source ops/tools/lane-c-synthetic/cleanup.sh
source ops/tools/lane-c-synthetic/run-container.sh
source ops/tools/lane-c-synthetic/preflight.sh
endpoint=$(docker context inspect "$TOOLS_CONTEXT" --format '{{.Endpoints.docker.Host}}')
[[ $endpoint == unix://* ]]
nonce=$(cat /proc/sys/kernel/random/uuid)
task=be01tools-$nonce
evidence=$(mktemp -d "$TOOLS_EVIDENCE/$task.XXXXXX")
builder=$task-build; build_container=buildx_buildkit_${builder}0
cache=${build_container}_state; image=$task:tools; name=$task-checks
probe_name=$task-cache-check
builder_id=''; build_image=''; image_id=''; run_id=''; fingerprint=''; probe_id=''; probe_fingerprint=''
base=ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
base_id=$(docker image inspect -f '{{.Id}}' "$base")
docker image inspect "$base_id" | jq -e '.[0].Config.Volumes // {} | length == 0' >/dev/null
docker image ls -aq --no-trunc | sort -u > "$evidence/preexisting-images"
# Inventory errors abort before mutation; UUID names must be absent across each relevant namespace.
docker container ls -a --format '{{.Names}}' > "$evidence/containers.before"
docker volume ls --format '{{.Name}}' > "$evidence/volumes.before"
registry_inventory > "$evidence/builders.json"
jq -r '.[].Name' "$evidence/builders.json" > "$evidence/builders.before"
for candidate in "$name" "$probe_name" "$build_container" "$cache" "$builder"; do
  if grep -Fx "$candidate" "$evidence/"*.before >/dev/null; then exit 1; fi
done
trap cleanup_tools EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker system df > "$evidence/docker-space.before"
df -h "$evidence" > "$evidence/host-space.before"
# AIDEV-NOTE: Read pinned files as the runtime UID before creating the builder/cache or downloading tools.
image_id=$base_id
phase=readability
check_readability
run_id=''; fingerprint=''
docker volume create --label "elevateo.r1.run=$nonce" "$cache" > /dev/null
docker buildx create --name "$builder" --driver docker-container \
  --driver-opt restart-policy=no,memory=2g,cpu-period=100000,cpu-quota=200000 > /dev/null
daemon_for 180 buildx inspect "$builder" --bootstrap > "$evidence/builder.log"
verify_builder
# Empty build context: only this Dockerfile is sent; package source and credentials cannot enter layers.
daemon_for 420 buildx build --builder "$builder" --load --progress plain \
  --label "elevateo.r1.run=$nonce" -t "$image" - < ops/tools/lane-c-synthetic/Dockerfile \
  > "$evidence/build.log" 2>&1
verify_builder
image_id=$(docker image inspect -f '{{.Id}}' "$image")
docker image inspect "$image_id" | jq -e '.[0].Config.Volumes // {} | length == 0' > /dev/null
printf 'image=%s builder=%s\n' "$image_id" "$builder_id" > "$evidence/identities"
phase=checks
run_container bash /src/ops/tools/lane-c-synthetic/checks.sh
