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
mkdir -p "$(dirname "$log")"
exec 9>"$lock"
flock -x 9
cleanup() {
  docker rm -f "$tag" >> "$log" 2>&1 || true
  docker image rm "$tag" >> "$log" 2>&1 || true
  rm -rf "$context"
  printf 'remaining_containers=%s\n' "$(docker ps -a --filter "name=^/${tag}$" --format '{{.ID}}' | wc -l)" >> "$log"
  printf 'remaining_image=%s\n' "$(docker image ls "$tag" -q | wc -l)" >> "$log"
}
trap cleanup EXIT
printf 'source=%s\nstarted=%s\n' "$candidate" "$(date -u +%FT%TZ)" > "$log"
git archive "$candidate" | tar -x -C "$context"
docker build --label qa815.owner=soren -f "$context/apps/web/docker/test.Dockerfile" -t "$tag" "$context" >> "$log" 2>&1
docker run --rm --name "$tag" --network none "$tag" bash -ceu \
  'npm run check:api && npm run lint && npm run typecheck && npm run test -- --coverage && npm run build' \
  >> "$log" 2>&1
printf 'checks_exit=0\nfinished=%s\n' "$(date -u +%FT%TZ)" >> "$log"
