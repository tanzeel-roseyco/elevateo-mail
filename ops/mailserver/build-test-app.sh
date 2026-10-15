#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Build a disposable dependency image only on fleet; remove its exact image and builder on every exit.
[[ $(cat /etc/machine-id) == 5992663e9659484e90c0129edd5bd24b ]] || exit 2
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker() { command docker --host unix:///var/run/docker.sock "$@"; }
root=$(cd -- "$(dirname -- "$0")" && pwd)
base=/home/tanzeel/elevateo-mail-completion-20261015/control/mail1017
repo=/home/tanzeel/orca/workspaces/integration/completion-cassian-int801
run=${1:?unique app test run required}
[[ $run =~ ^mail1017-app-r[0-9]{1,2}$ ]] || exit 3
build=$run-build
out=$base/$build
builder=elevateo-$build
container=buildx_buildkit_${builder}0
cache=${container}_state
tag=elevateo-$build:dependencies
buildkit=moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea
python=python:3.12.9@sha256:48a11b7ba705fd53bf15248d1f94d36c39549903c5d59edcfa2f3f84126e7b44
exec 8>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n -x 8 || exit 4
[[ ! -e $out && ! -e $base/$run ]] || exit 5
[[ $(awk '/MemAvailable/ {print $2}' /proc/meminfo) -ge 4194304 ]] || exit 6
[[ $(df -B1 --output=avail "$base" | tail -1) -ge 10737418240 ]] || exit 7
! docker image inspect "$tag" >/dev/null 2>&1 || exit 8
! docker volume inspect "$cache" >/dev/null 2>&1 || exit 8
! docker container inspect "$container" >/dev/null 2>&1 || exit 8
! docker buildx inspect "$builder" >/dev/null 2>&1 || exit 8
umask 077
mkdir "$out"
before=$(df -B1 --output=avail "$base" | tail -1)
cleanup() {
  status=$?
  trap - EXIT
  set +e
  failed=0
  if docker image inspect "$tag" > "$out/image.json" 2>/dev/null; then
    label=$(docker image inspect -f '{{index .Config.Labels "elevateo.task"}}' "$tag")
    if [[ $label == "$build" ]]; then docker image rm "$tag" >> "$out/cleanup.log" 2>&1 || failed=1
    else failed=1; fi
  fi
  if docker container inspect "$container" >/dev/null 2>&1; then
    docker inspect -f '{{json .Mounts}}' "$container" > "$out/builder-mounts.json" || failed=1
  fi
  if docker buildx inspect "$builder" >/dev/null 2>&1; then
    docker buildx rm "$builder" >> "$out/cleanup.log" 2>&1 || failed=1
  fi
  if docker volume inspect "$cache" >/dev/null 2>&1; then
    label=$(docker volume inspect -f '{{index .Labels "elevateo.task"}}' "$cache")
    if [[ $label == "$build" ]]; then docker volume rm "$cache" >> "$out/cleanup.log" 2>&1 || failed=1
    else failed=1; fi
  fi
  after=$(df -B1 --output=avail "$base" | tail -1)
  printf 'exit=%s\ncleanup_failed=%s\nfree_before=%s\nfree_after=%s\nshared_pinned_bases_retained=1\n' \
    "$status" "$failed" "$before" "$after" >> "$out/cleanup.log" || failed=1
  [[ $failed == 0 ]] || status=90
  exit "$status"
}
trap cleanup EXIT
docker pull "$python" > "$out/python-pull.log" 2>&1
docker volume create --label "elevateo.task=$build" "$cache" > "$out/cache.txt"
docker buildx create --name "$builder" --driver docker-container \
  --driver-opt "image=$buildkit,restart-policy=no,memory=2g,cpu-period=100000,cpu-quota=200000" > "$out/builder.txt"
timeout 900s docker --host unix:///var/run/docker.sock buildx build --builder "$builder" --load \
  --progress plain --label "elevateo.task=$build" -t "$tag" "$repo/apps/server" > "$out/build.log" 2>&1
ruby=$(docker image inspect -f '{{.Id}}' "$tag")
printf '%s\n' "$ruby" > "$out/ruby-image.txt"
# AIDEV-NOTE: The test harness acquires the shared lease itself; the image remains task-owned until its return.
flock -u 8
MAIL1017_RUBY_IMAGE=$ruby bash "$root/test-app-compatibility.sh" "$run"
