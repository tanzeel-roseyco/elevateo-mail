#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-focused-feature.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
image=sha256:7dc61d4b7e12f94764f95f4f1bfe8e3940049247e6d409898ce9d3ed2810f348
name=qa815-focused-feature-$short
log="$root/docs/completion/qa815-evidence/focused-feature-$short.txt"
context=$(mktemp -d /tmp/qa815-focused-feature.XXXXXXXX)
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
set +e
timeout 360s docker run --rm --name "$name" --pull never --network none \
  --read-only --memory 2g --memory-swap 2g --cpus 2 --pids-limit 256 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e BUNDLE_APP_CONFIG=/tmp/bundle \
  --tmpfs /tmp:rw,size=256m -v "$context":/workspace:ro -w /workspace/apps/server \
  "$image" bash -c '
    overall=0
    bundle exec steep check
    status=$?; printf "steep_exit=%s\n" "$status"; if [ "$status" -ne 0 ]; then overall=1; fi
    bundle exec rubocop --lint app/controllers/v2/inbox_attachments_controller.rb app/controllers/v2/fake_inbound_controller.rb test/attachments/controller_authorization_test.rb --format simple
    status=$?; printf "targeted_lint_exit=%s\n" "$status"; if [ "$status" -ne 0 ]; then overall=1; fi
    bundle exec ruby -Itest test/attachments/controller_authorization_test.rb
    status=$?; printf "attachment_unit_exit=%s\n" "$status"; if [ "$status" -ne 0 ]; then overall=1; fi
    exit "$overall"
  ' >> "$log" 2>&1
status=$?
set -e
exit "$status"
