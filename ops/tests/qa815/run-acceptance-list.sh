#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-acceptance-list.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
image=sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
name=qa815-acceptance-list-$short
install_name=$name-install
log="$root/docs/completion/qa815-evidence/acceptance-list-$short.txt"
context=$(mktemp -d /tmp/qa815-acceptance-list.XXXXXXXX)
private=$(mktemp -d /tmp/qa815-acceptance-private.XXXXXXXX)
output=$(mktemp -d /tmp/qa815-acceptance-output.XXXXXXXX)
exec 9>"$lock"
flock -x 9
chmod 0700 "$private" "$output"
printf 'source=%s\nimage=%s\nmode=COMPILED_REPORTER_LIST_ONLY_SYNTHETIC_SEED\nstarted=%s\n' \
  "$candidate" "$image" "$(date -u +%FT%TZ)" > "$log"
cleanup() {
  status=$?
  set +e
  for item in "$name" "$install_name"; do
    if docker container inspect "$item" >/dev/null 2>&1; then
      owner=$(docker container inspect --format '{{index .Config.Labels "qa815.owner"}}' "$item")
      if [[ $owner == soren-acceptance-list ]]; then
        docker rm -f "$item" >> "$log" 2>&1
      else
        printf 'cleanup_error=unexpected task container label %s\n' "$item" >> "$log"
        status=90
      fi
    fi
  done
  find "$context" -mindepth 1 -depth -delete
  rmdir "$context"
  find "$private" -mindepth 1 -depth -delete
  rmdir "$private"
  find "$output" -mindepth 1 -depth -delete
  rmdir "$output"
  printf 'run_exit=%s\nsource_archive_absent=%s\nprivate_absent=%s\noutput_absent=%s\nremaining_task_containers=%s\nfinished=%s\n' \
    "$status" "$([[ ! -e $context ]] && echo yes || echo no)" \
    "$([[ ! -e $private ]] && echo yes || echo no)" \
    "$([[ ! -e $output ]] && echo yes || echo no)" \
    "$(docker ps -a --filter "name=$name" -q | wc -l)" "$(date -u +%FT%TZ)" >> "$log"
}
trap cleanup EXIT
git archive "$candidate" | tar -x -C "$context"
test "$(docker image inspect --format '{{.Id}}' "$image")" = "$image"
python3 - "$context/tests/acceptance/shared/seed-contract.json" "$private/seed.json" <<'PY'
import json
from pathlib import Path
import sys
source = json.loads(Path(sys.argv[1]).read_text())
if source.get("kind") != "example":
    raise SystemExit("unexpected example seed kind")
source["kind"] = "runtime"
destination = Path(sys.argv[2])
with destination.open("x") as stream:
    json.dump(source, stream)
destination.chmod(0o600)
PY
printf 'seed_kind=runtime_from_pinned_example_for_list_only\nseed_mode=%s\n' \
  "$(stat -c %a "$private/seed.json")" >> "$log"
printf 'dependency_install=public npm registry, exact package-lock, no credentials\n' >> "$log"
timeout 600s docker run --rm --name "$install_name" --label qa815.owner=soren-acceptance-list \
  --memory 2g --memory-swap 2g --cpus 2 --pids-limit 256 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp --tmpfs /tmp:rw,size=256m,mode=1777 \
  --mount "type=bind,source=$context/tests/acceptance,target=/opt/acceptance" \
  -w /opt/acceptance "$image" npm ci --no-audit --no-fund >> "$log" 2>&1
printf 'install_exit=0\n' >> "$log"
timeout 900s docker run --rm --name "$name" --pull never --network none \
  --label qa815.owner=soren-acceptance-list \
  --memory 2g --memory-swap 2g --cpus 2 --pids-limit 256 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -e ACCEPTANCE_BASE_URL=http://app.test -e ACCEPTANCE_LANE=playwright_real \
  -e ACCEPTANCE_PROFILE=internal_http -e ACCEPTANCE_RUN_ID=qa815-list-$short \
  -e ACCEPTANCE_DISPATCH_ID=ctx_6763d61080c0 \
  -e ACCEPTANCE_SEED_PATH=/acceptance/seed.json -e ACCEPTANCE_OUTPUT_DIR=/output \
  -e ACCEPTANCE_BROWSER=chromium -e ACCEPTANCE_MEMORY_MIB=2048 -e ACCEPTANCE_CPUS=2 \
  --tmpfs /tmp:rw,size=256m,mode=1777 \
  --mount "type=bind,source=$context/tests/acceptance,target=/opt/acceptance" \
  --mount "type=bind,source=$private/seed.json,target=/acceptance/seed.json,readonly" \
  --mount "type=bind,source=$output,target=/output" \
  -w /opt/acceptance "$image" bash -ceu '
    npm run typecheck
    npm run build
    test -f dist/playwright/quiet-reporter.js
    printf "compiled_reporter=%s\n" /opt/acceptance/dist/playwright/quiet-reporter.js
    npm test
    node node_modules/@playwright/test/cli.js test --config=playwright/playwright.config.ts --list
    printf "list_exit=0\n"
  ' >> "$log" 2>&1
