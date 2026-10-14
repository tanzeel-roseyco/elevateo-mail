#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-ops820-python.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
image=sha256:48a11b7ba705fd53bf15248d1f94d36c39549903c5d59edcfa2f3f84126e7b44
name=qa815-ops820-python-$short
log="$root/docs/completion/qa815-evidence/ops820-python-$short.txt"
context=$(mktemp -d /tmp/qa815-ops820-python.XXXXXXXX)
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
files=(
  test_make_test_env.py test_verify_snapshot.py test_runtime_env.py
  test_probe_cleanup.py test_compose_absence.py test_gateway_runtime_env.py
  test_clamav_probe.py
)
for file in "${files[@]}"; do test -f "$context/ops/ops820/$file"; done
set +e
timeout 600s docker run --rm --name "$name" --pull never --network none \
  --read-only --memory 1g --memory-swap 1g --cpus 1 --pids-limit 96 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 \
  --tmpfs /tmp:rw,exec,size=64m,mode=1777 -v "$context":/workspace:ro -w /workspace \
  "$image" sh -ceu '
    python3 --version
    set +e
    overall=0
    for file in test_make_test_env.py test_verify_snapshot.py test_runtime_env.py \
                test_probe_cleanup.py test_compose_absence.py test_gateway_runtime_env.py \
                test_clamav_probe.py; do
      printf "RUN %s\n" "$file"
      python3 "ops/ops820/$file"
      status=$?; printf "test_exit=%s file=%s\n" "$status" "$file"
      if [ "$status" -ne 0 ]; then overall=1; fi
    done
    exit "$overall"
  ' >> "$log" 2>&1
status=$?
set -e
exit "$status"
