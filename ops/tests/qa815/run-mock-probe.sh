#!/usr/bin/env bash
set -euo pipefail
candidate=$(git rev-parse "${1:?usage: run-mock-probe.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
image=sha256:7dc61d4b7e12f94764f95f4f1bfe8e3940049247e6d409898ce9d3ed2810f348
name=qa815-mock-probe-$short
context=$(mktemp -d /tmp/qa815-mock-probe.XXXXXXXX)
log="$root/docs/completion/qa815-evidence/mock-probe-$short.txt"
exec 9>"$lock"
flock -x 9
printf 'source=%s\nimage=%s\nstarted=%s\n' "$candidate" "$image" "$(date -u +%FT%TZ)" > "$log"
cleanup() {
  status=$?
  set +e
  if docker container inspect "$name" >/dev/null 2>&1; then
    mounts=$(docker container inspect --format '{{range .Mounts}}{{println .Source}}{{end}}' "$name")
    if [[ $mounts == "$context" ]]; then docker rm -f "$name" >> "$log" 2>&1; else status=90; fi
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
timeout 300s docker run --rm --name "$name" --network none --memory 1g --memory-swap 1g \
  --cpus 1 --pids-limit 128 --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e BUNDLE_APP_CONFIG=/tmp/bundle --tmpfs /tmp:rw,size=128m \
  -v "$context":/workspace -w /workspace/apps/server "$image" bash -c '
    overall=0
    for file in test/attachments/service_test.rb test/send_worker/drain_test.rb; do
      printf "RUN_WITH_MINITEST_MOCK %s\n" "$file"
      bundle exec ruby -rminitest/mock -Itest "$file"
      status=$?; printf "test_exit=%s file=%s\n" "$status" "$file"
      if [ "$status" -ne 0 ]; then overall=1; fi
    done
    exit "$overall"
  ' >> "$log" 2>&1
status=$?
set -e
exit "$status"
