#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-v2-codegen.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
tag=qa815-v2-codegen-$short
name=$tag
context=$(mktemp -d /tmp/qa815-v2-codegen.XXXXXXXX)
artifact="$root/docs/completion/qa815-evidence/generated-v2-$short"
log="$root/docs/completion/qa815-evidence/v2-codegen-$short.txt"
exec 9>"$lock"
flock -x 9
mkdir -p "$artifact"
printf 'source=%s\nstarted=%s\nartifact=%s\n' "$candidate" "$(date -u +%FT%TZ)" "$artifact" > "$log"
cleanup() {
  status=$?
  set +e
  if docker container inspect "$name" >/dev/null 2>&1; then
    mounts=$(docker container inspect --format '{{range .Mounts}}{{println .Source}}{{end}}' "$name")
    if [[ $mounts == "$artifact" ]]; then
      docker rm -f "$name" >> "$log" 2>&1
    else
      printf 'cleanup_error=unexpected task container mounts\n' >> "$log"
      status=90
    fi
  fi
  if docker image inspect "$tag" >/dev/null 2>&1; then
    owner=$(docker image inspect --format '{{index .Config.Labels "qa815.owner"}}' "$tag")
    if [[ $owner == soren-v2-codegen ]]; then
      docker image rm "$tag" >> "$log" 2>&1
    else
      printf 'cleanup_error=unexpected task image label\n' >> "$log"
      status=91
    fi
  fi
  find "$context" -mindepth 1 -depth -delete
  rmdir "$context"
  printf 'run_exit=%s\narchive_absent=%s\nremaining_task_containers=%s\nremaining_task_images=%s\nfinished=%s\n' \
    "$status" "$([[ ! -e $context ]] && echo yes || echo no)" \
    "$(docker ps -a --filter "name=^/$name$" -q | wc -l)" \
    "$(docker image ls "$tag" -q | wc -l)" "$(date -u +%FT%TZ)" >> "$log"
}
trap cleanup EXIT
git archive "$candidate" | tar -x -C "$context"
test -f "$context/contracts/v2/openapi.json"
test -f "$context/apps/web/docker/test.Dockerfile"
printf 'contract_sha256=%s\n' "$(sha256sum "$context/contracts/v2/openapi.json" | cut -d' ' -f1)" >> "$log"
DOCKER_BUILDKIT=0 timeout 1200s docker build --memory 2g --cpu-quota 200000 --cpu-period 100000 \
  --label qa815.owner=soren-v2-codegen -f "$context/apps/web/docker/test.Dockerfile" \
  -t "$tag" "$context" >> "$log" 2>&1
printf 'derived_image=%s\nimage_bytes=%s\n' \
  "$(docker image inspect --format '{{.Id}}' "$tag")" \
  "$(docker image inspect --format '{{.Size}}' "$tag")" >> "$log"
timeout 300s docker run --rm --name "$name" --pull never --network none \
  --memory 2g --memory-swap 2g --cpus 2 --pids-limit 256 \
  -v "$artifact":/output "$tag" bash -ceu '
    npm run generate:api:v2
    npm run check:api:v2
    cp src/data/generated/api-v2.d.ts /output/api-v2.d.ts
    chmod 0644 /output/api-v2.d.ts
    sha256sum /output/api-v2.d.ts
  ' >> "$log" 2>&1
test -s "$artifact/api-v2.d.ts"
printf 'generated_sha256=%s\n' "$(sha256sum "$artifact/api-v2.d.ts" | cut -d' ' -f1)" >> "$log"
