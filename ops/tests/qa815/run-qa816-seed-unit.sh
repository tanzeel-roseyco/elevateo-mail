#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-qa816-seed-unit.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
image=sha256:7dc61d4b7e12f94764f95f4f1bfe8e3940049247e6d409898ce9d3ed2810f348
name=qa815-qa816-seed-unit-$short
log="$root/docs/completion/qa815-evidence/qa816-seed-unit-$short.txt"
context=$(mktemp -d /tmp/qa815-seed-unit.XXXXXXXX)
exec 9>"$lock"
flock -x 9
printf 'source=%s\nimage=%s\nstarted=%s\n' "$candidate" "$image" "$(date -u +%FT%TZ)" > "$log"
cleanup() {
  status=$?
  set +e
  if docker container inspect "$name" >/dev/null 2>&1; then
    mounts=$(docker container inspect --format '{{range .Mounts}}{{println .Source}}{{end}}' "$name")
    if [[ $mounts == "$context" ]]; then
      docker rm -f "$name" >> "$log" 2>&1
    else
      printf 'cleanup_error=unexpected task container mounts\n' >> "$log"
      status=90
    fi
  fi
  find "$context" -mindepth 1 -depth -delete
  rmdir "$context"
  printf 'run_exit=%s\narchive_absent=%s\nremaining_task_containers=%s\nfinished=%s\n' \
    "$status" "$([[ ! -e $context ]] && echo yes || echo no)" \
    "$(docker ps -a --filter "name=^/$name$" -q | wc -l)" "$(date -u +%FT%TZ)" >> "$log"
}
trap cleanup EXIT
git archive "$candidate" | tar -x -C "$context"
test "$(docker image inspect --format '{{.Id}}' "$image")" = "$image"
timeout 120s docker run --rm --name "$name" --pull never --network none \
  --read-only --memory 1g --memory-swap 1g --cpus 1 --pids-limit 128 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e BUNDLE_APP_CONFIG=/tmp/bundle \
  -e BUNDLE_GEMFILE=/workspace/apps/server/Gemfile --tmpfs /tmp:rw,size=64m \
  -v "$context":/workspace:ro -w /workspace "$image" bash -ceu '
    ruby -c tests/acceptance/qa816-attachments-seed.rb
    bundle exec ruby tests/acceptance/qa816-attachments-seed-test.rb
  ' >> "$log" 2>&1
