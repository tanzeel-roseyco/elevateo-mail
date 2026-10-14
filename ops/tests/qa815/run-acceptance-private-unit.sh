#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-acceptance-private-unit.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
image=sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f
name=qa815-acceptance-private-$short
log="$root/docs/completion/qa815-evidence/acceptance-private-$short.txt"
context=$(mktemp -d /tmp/qa815-acceptance-private.XXXXXXXX)
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
timeout 180s docker run --rm --name "$name" --pull never --network none \
  --read-only --memory 1g --memory-swap 1g --cpus 1 --pids-limit 96 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 \
  --tmpfs /tmp:rw,size=32m,mode=1777 -v "$context":/workspace:ro \
  -w /workspace/ops/tests/be02 "$image" python3 test_acceptance_private_output.py >> "$log" 2>&1
status=$?
set -e
exit "$status"
