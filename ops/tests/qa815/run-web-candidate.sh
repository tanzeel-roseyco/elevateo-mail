#!/usr/bin/env bash
set -euo pipefail

# AIDEV-NOTE: Archive the exact commit so concurrent owner edits cannot change Docker's build context.
candidate=${1:?usage: run-web-candidate.sh COMMIT}
git cat-file -e "${candidate}^{commit}"
candidate=$(git rev-parse "${candidate}^{commit}")
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
tag="qa815-web-${candidate:0:12}"
context=$(mktemp -d /tmp/qa815-web-context.XXXXXXXX)
log="$root/docs/completion/qa815-evidence/web-${candidate:0:12}.log"
if [[ ${QA815_WEB_TARGETED:-0} == 1 ]]; then
  log="$root/docs/completion/qa815-evidence/web-targeted-${candidate:0:12}.log"
  web_command='npm run typecheck && npm run test -- src/features/thread/CollaborationPanels.test.tsx'
else
  web_command='npm run check:api && npm run generate:api:v2 && npm run check:api:v2 && sha256sum src/data/generated/api-v2.d.ts && npm run lint && npm run typecheck && npm run test -- --coverage && npm run build'
fi
mkdir -p "$(dirname "$log")"
exec 9>"$lock"
lease_guard_pid=
if [[ ${QA815_SHARED_ACTIVE_LEASE:-0} == 1 ]]; then
  # AIDEV-NOTE: Android holds this same lease during the root-authorized second slot.
  [[ $(docker inspect qa815-apk-b999f4f-usercache --format '{{.State.Running}}') == true ]]
  (flock -x 9) &
  lease_guard_pid=$!
else
  flock -x 9
fi
cleanup() {
  status=$?
  set +e
  if docker container inspect "$tag" >/dev/null 2>&1; then
    owner=$(docker container inspect --format '{{index .Config.Labels "qa815.owner"}}' "$tag")
    if [[ $owner == soren ]]; then
      docker rm -f "$tag" >> "$log" 2>&1
    else
      printf 'cleanup_error=unexpected task container label\n' >> "$log"
      status=90
    fi
  fi
  if docker image inspect "$tag" >/dev/null 2>&1; then
    owner=$(docker image inspect --format '{{index .Config.Labels "qa815.owner"}}' "$tag")
    if [[ $owner == soren ]]; then
      docker image rm "$tag" >> "$log" 2>&1
    else
      printf 'cleanup_error=unexpected task image label\n' >> "$log"
      status=91
    fi
  fi
  find "$context" -mindepth 1 -depth -delete
  rmdir "$context"
  printf 'remaining_containers=%s\n' "$(docker ps -a --filter "name=^/${tag}$" --format '{{.ID}}' | wc -l)" >> "$log"
  printf 'remaining_image=%s\n' "$(docker image ls "$tag" -q | wc -l)" >> "$log"
  printf 'runner_exit=%s\narchive_absent=%s\n' "$status" "$([[ ! -e $context ]] && echo yes || echo no)" >> "$log"
  if [[ -n $lease_guard_pid ]]; then
    kill "$lease_guard_pid" 2>/dev/null || true
    wait "$lease_guard_pid" 2>/dev/null || true
  fi
  exit "$status"
}
trap cleanup EXIT
printf 'source=%s\nmode=%s\nstarted=%s\n' "$candidate" "$([[ ${QA815_WEB_TARGETED:-0} == 1 ]] && echo targeted || echo full)" "$(date -u +%FT%TZ)" > "$log"
if docker container inspect "$tag" >/dev/null 2>&1 || docker image inspect "$tag" >/dev/null 2>&1; then
  printf 'preflight_error=task name or image tag already exists\n' >> "$log"
  exit 92
fi
git archive "$candidate" | tar -x -C "$context"
# Test-only input: the maintained Dockerfile copies frozen v1; this batch also checks additive v2.
if ! grep -Fq 'COPY contracts/v2 ./contracts/v2' "$context/apps/web/docker/test.Dockerfile"; then
  sed -i '/^COPY contracts\/v1 /a COPY contracts/v2 ./contracts/v2' "$context/apps/web/docker/test.Dockerfile"
  printf 'task_dockerfile_overlay=COPY contracts/v2 ./contracts/v2\n' >> "$log"
fi
DOCKER_BUILDKIT=0 docker build --memory 2g --cpu-quota 200000 --cpu-period 100000 --label qa815.owner=soren -f "$context/apps/web/docker/test.Dockerfile" -t "$tag" "$context" >> "$log" 2>&1
docker run --rm --name "$tag" --label qa815.owner=soren --network none --memory 2g --cpus 2 --pids-limit 256 "$tag" bash -ceu \
  "$web_command" \
  >> "$log" 2>&1
printf 'checks_exit=0\nfinished=%s\n' "$(date -u +%FT%TZ)" >> "$log"
