#!/bin/bash
# AIDEV-NOTE: Coordinator-authorized fallback builds only the reviewed backend snapshot in a task-owned builder.
set -euo pipefail
stage=/tmp/elevateo-initrepair20261023
source=/tmp/transport20261023-work/source/apps/server
builder=initrepair20261023
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -w 180 9
if docker buildx inspect "$builder" >/dev/null 2>&1; then exit 1; fi
test -f "$source/Dockerfile"
test "$(realpath "$stage/apps/server")" = "$stage/apps/server"
rm -rf "$stage/apps/server"
cp -a "$source" "$stage/apps/server"
(cd "$stage/apps/server"; find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$stage/backend-source.sha256"
created=0
cleanup() {
  if test "$created" != 1; then return; fi
  if docker container inspect "buildx_buildkit_${builder}0" >/dev/null 2>&1; then
    docker inspect --format '{{json .Mounts}}' "buildx_buildkit_${builder}0"
  fi
  docker buildx rm "$builder"
}
trap cleanup EXIT HUP INT TERM
docker buildx create --name "$builder" --driver docker-container --driver-opt image=sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea
created=1
docker buildx build --builder "$builder" --load --no-cache --progress plain --tag initrepair20261023-backend:disposable "$stage/apps/server"
docker image inspect --format '{{.Id}}' initrepair20261023-backend:disposable > "$stage/backend.id"
