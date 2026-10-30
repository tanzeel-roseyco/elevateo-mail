#!/usr/bin/env bash
# AIDEV-NOTE: Parent-only Docker orchestration; reuse frozen builder verification, not its database cleanup.
set -euo pipefail
# AIDEV-NOTE: The outer timeout also bounds sourced helper inspections and failure-path cleanup.
if [[ ${1:-} != --bounded ]]; then exec timeout -k 180s 1200s bash "$0" --bounded; fi
umask 077
: "${TOOLS_SOURCE:?Canonical staged source directory required}"
: "${TOOLS_CONTEXT:?Explicit local Docker context required}"
: "${TOOLS_HOST:?Expected fleet-02 hostname required}"
: "${TOOLS_EVIDENCE:?Existing private evidence parent required}"
[[ $TOOLS_HOST == Ubuntu-noble-latest-amd64-base && $(hostname -s) == "$TOOLS_HOST" && -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
[[ $(realpath "$TOOLS_SOURCE") == "$TOOLS_SOURCE" && -d $TOOLS_EVIDENCE ]]
[[ "$TOOLS_SOURCE" != *','* && "$TOOLS_SOURCE" != *':'* && "$TOOLS_SOURCE" != *$'\n'* ]]
export DOCKER_CONTEXT=$TOOLS_CONTEXT
daemon_for() { local seconds=$1; shift; timeout -k 3s "${seconds}s" docker --context "$TOOLS_CONTEXT" "$@"; }
docker() { daemon_for 10 "$@"; }
for tool in docker jq timeout sha256sum realpath tar; do command -v "$tool" >/dev/null; done
cd "$TOOLS_SOURCE"
sha256sum -c ops/tools/lane-p-dispatch/dispatch.sha256
sha256sum -c ops/tools/lane-p-protocol/package.sha256
printf '%s  %s\n' 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b \
  ops/tests/fleet02-egress-source.sha256 | sha256sum -c -
sha256sum -c ops/tests/fleet02-egress-source.sha256
helper=docs/evidence/scripts/be-01-r1-fleet02-resources.sh
printf '%s  %s\n' 86681089c789e3b636f518508e8c6cf496d332f69bd69e5696bbc1dd4302aa4d "$helper" | sha256sum -c -
source "$helper"
source ops/tools/lane-c-synthetic/cleanup.sh
source ops/tools/lane-p-dispatch/run-container.sh
source ops/tools/lane-p-dispatch/preflight.sh
endpoint=$(docker context inspect "$TOOLS_CONTEXT" --format '{{.Endpoints.docker.Host}}')
[[ $endpoint == unix:///var/run/docker.sock ]]
nonce=$(cat /proc/sys/kernel/random/uuid)
task=be01pwsh-$nonce
evidence=$(mktemp -d "$TOOLS_EVIDENCE/$task.XXXXXX")
builder=$task-build; build_container=buildx_buildkit_${builder}0
cache=${build_container}_state; image=$task:tools; name=$task-checks
probe_name=$task-cache-check
builder_id=''; build_image=''; image_id=''; run_id=''; fingerprint=''; probe_id=''; probe_fingerprint=''
base=ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
buildkit=moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea
expected_build_image=$(docker image inspect -f '{{.Id}}' "$buildkit")
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
  --driver-opt "image=$buildkit",restart-policy=no,memory=2g,cpu-period=100000,cpu-quota=200000 > /dev/null
daemon_for 180 buildx inspect "$builder" --bootstrap > "$evidence/builder.log"
verify_builder
[[ $build_image == "$expected_build_image" ]]
# AIDEV-NOTE: Only authenticated Dockerfile/checks/gems enter context; never product source or credentials.
tar -C ops/tools/lane-p-protocol -cf "$evidence/context.tar" Dockerfile checks.sh gems.rb
daemon_for 720 buildx build --builder "$builder" --load --progress plain \
  --label "elevateo.r1.run=$nonce" -t "$image" - < "$evidence/context.tar" \
  > "$evidence/build.log" 2>&1
verify_builder
sha256sum -c ops/tools/lane-p-dispatch/dispatch.sha256 > "$evidence/dispatch.after-build.log"
sha256sum -c ops/tests/fleet02-egress-source.sha256 > "$evidence/source.after-build.log"
image_id=$(docker image inspect -f '{{.Id}}' "$image")
docker image inspect "$image_id" | jq -e '.[0].Config.Volumes // {} | length == 0' > /dev/null
printf 'image=%s builder=%s\n' "$image_id" "$builder_id" > "$evidence/identities"
phase=checks
run_container /opt/lane-p/checks.sh
sha256sum -c ops/tools/lane-p-dispatch/dispatch.sha256 > "$evidence/dispatch.after.log"
sha256sum -c ops/tests/fleet02-egress-source.sha256 > "$evidence/source.after.log"
