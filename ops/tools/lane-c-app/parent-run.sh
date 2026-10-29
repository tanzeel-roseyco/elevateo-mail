#!/usr/bin/env bash
# AIDEV-NOTE: Separate parent orchestration; frozen tools own build recovery, frozen Lane C owns Compose resources.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 240s 1800s bash "$0" --bounded; fi
umask 077
: "${TOOLS_SOURCE:?Canonical staged source required}" "${TOOLS_CONTEXT:?Selected context required}"
: "${TOOLS_HOST:?Verified fleet hostname required}" "${TOOLS_EVIDENCE:?Private evidence parent required}"
: "${APP_BUILDKIT_IMAGE:?Parent-prestaged digest-pinned BuildKit image required}"
[[ $(hostname -s) == "$TOOLS_HOST" && -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
[[ $(realpath "$TOOLS_SOURCE") == "$TOOLS_SOURCE" && -d $TOOLS_EVIDENCE ]]
[[ $TOOLS_SOURCE != *','* && $TOOLS_SOURCE != *':'* && $TOOLS_SOURCE != *$'\n'* ]]
[[ $APP_BUILDKIT_IMAGE =~ ^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$ ]]
export DOCKER_CONTEXT=$TOOLS_CONTEXT
daemon_for() { local seconds=$1; shift; timeout -k 3s "${seconds}s" docker --context "$TOOLS_CONTEXT" "$@"; }
docker() { daemon_for 10 "$@"; }
for tool in docker jq timeout sha256sum realpath tar awk sed; do command -v "$tool" >/dev/null; done
cd "$TOOLS_SOURCE"
# The parent authenticates app.sha256 externally before entry; authenticate every reused module here.
sha256sum -c ops/tools/lane-c-app/app.sha256
printf '%s  %s\n' f799b9edefd8f88fccd10ab6c452e253d6174cf68b2cdee919a3d5d15e046b6e \
  ops/tools/lane-c-synthetic/tools.sha256 | sha256sum -c -
printf '%s  %s\n' 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b \
  ops/tests/fleet02-egress-source.sha256 | sha256sum -c -
printf '%s  %s\n' 46b296fd1158da3e9df1362162d903e01013c5fedd33465bf8ab323ed4217862 \
  ops/tests/fleet02-egress-package.sha256 | sha256sum -c -
printf '%s  %s\n' 97bdb91a0cc406cff6611c5eb97158988e12ffd19cd4413231ea578de7c5a1f4 \
  docs/evidence/scripts/be-01-r1-fleet02-compose-egress.sh | sha256sum -c -
helper=docs/evidence/scripts/be-01-r1-fleet02-resources.sh
printf '%s  %s\n' 86681089c789e3b636f518508e8c6cf496d332f69bd69e5696bbc1dd4302aa4d "$helper" | sha256sum -c -
sha256sum -c ops/tools/lane-c-synthetic/tools.sha256
source ops/tools/lane-c-app/source.sh
check_sources
source "$helper"
source ops/tools/lane-c-synthetic/cleanup.sh
source ops/tools/lane-c-synthetic/run-container.sh
source ops/tools/lane-c-synthetic/preflight.sh
endpoint=$(docker context inspect "$TOOLS_CONTEXT" --format '{{.Endpoints.docker.Host}}')
[[ $endpoint == unix:///var/run/docker.sock ]]
nonce=$(cat /proc/sys/kernel/random/uuid); task=be01app-$nonce
evidence=$(mktemp -d "$TOOLS_EVIDENCE/$task.XXXXXX")
builder=$task-build; build_container=buildx_buildkit_${builder}0; cache=${build_container}_state
image=$task:app; name=$task-readability; probe_name=$task-cache-check
builder_id=''; build_image=''; image_id=''; run_id=''; fingerprint=''; probe_id=''; probe_fingerprint=''
base=ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
base_id=$(docker image inspect -f '{{.Id}}' "$base")
docker image inspect "$base_id" | jq -e '.[0].Config.Volumes // {} | length == 0' >/dev/null
docker image inspect "$APP_BUILDKIT_IMAGE" > "$evidence/buildkit-image.json"
expected_build_image=$(jq -er '.[0].Id' "$evidence/buildkit-image.json")
preflight_images
docker image ls -aq --no-trunc | sort -u > "$evidence/preexisting-images"
docker container ls -a --format '{{.Names}}' > "$evidence/containers.before"
docker volume ls --format '{{.Name}}' > "$evidence/volumes.before"
registry_inventory > "$evidence/builders.json"
jq -r '.[].Name' "$evidence/builders.json" > "$evidence/builders.before"
for candidate in "$name" "$probe_name" "$build_container" "$cache" "$builder"; do
  if grep -Fx "$candidate" "$evidence/"*.before >/dev/null; then exit 1; fi
done
trap 'finish_app "$?"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker system df > "$evidence/docker-space.before"
df -h "$evidence" > "$evidence/host-space.before"
image_id=$base_id; phase=readability
check_readability
run_id=''; fingerprint=''
prepare_context
docker volume create --label "elevateo.r1.run=$nonce" "$cache" >/dev/null
docker buildx create --name "$builder" --driver docker-container \
  --driver-opt "image=$APP_BUILDKIT_IMAGE",restart-policy=no,memory=2g,cpu-period=100000,cpu-quota=200000 >/dev/null
daemon_for 180 buildx inspect "$builder" --bootstrap > "$evidence/builder.log"
verify_builder
[[ $build_image == "$expected_build_image" ]]
daemon_for 720 buildx build --builder "$builder" --load --progress plain \
  --label "elevateo.r1.run=$nonce" -t "$image" - < "$evidence/app-context.tar" > "$evidence/build.log" 2>&1
verify_builder
check_sources > "$evidence/source.after-build.log"
image_id=$(docker image inspect -f '{{.Id}}' "$image")
[[ $image_id =~ ^sha256:[a-f0-9]{64}$ ]]
docker image inspect "$image_id" | jq -e --arg id "$image_id" --arg nonce "$nonce" \
  'length == 1 and (.[0] | .Id == $id and .Config.User == "10001" and
    .Config.Labels["elevateo.r1.run"] == $nonce and ((.Config.Volumes // {}) | length == 0))' >/dev/null
printf 'image=%s builder=%s task=%s\n' "$image_id" "$builder_id" "$task" > "$evidence/identities"
R1_SOURCE=$TOOLS_SOURCE R1_APP_IMAGE=$image_id R1_EXPECT_HOST=$TOOLS_HOST R1_EVIDENCE_PARENT=$TOOLS_EVIDENCE \
  bash docs/evidence/scripts/be-01-r1-fleet02-compose-egress.sh > "$evidence/lane-c.log" 2>&1
