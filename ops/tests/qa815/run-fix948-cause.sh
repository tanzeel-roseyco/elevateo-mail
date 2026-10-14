#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-fix948-cause.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
image=sha256:7dc61d4b7e12f94764f95f4f1bfe8e3940049247e6d409898ce9d3ed2810f348
name=qa815-fix948-cause-$short
log="$root/docs/completion/qa815-evidence/fix948-cause-$short.txt"
context=$(mktemp -d /tmp/qa815-fix948-cause.XXXXXXXX)
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
python3 - "$context/apps/server/app/controllers/application_controller.rb" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
needle = '    error_logger = Rails.respond_to?(:logger) ? Rails.logger : Logger.new($stderr)\n'
if source.count(needle) != 1:
    raise SystemExit('QA815 FIX948 diagnostic source anchor mismatch')
addition = ('    frame = error.backtrace_locations.find { |entry| entry.path.start_with?("/workspace/apps/server/") }\n'
            '    receiver_class = error.respond_to?(:receiver) ? error.receiver.class.name : :none\n'
            '    warn "QA815_DIAGNOSTIC class=#{error.class.name} method=#{error.respond_to?(:name) ? error.name : :none} receiver_class=#{receiver_class} source=#{frame&.path&.sub("/workspace/apps/server/", "")} line=#{frame&.lineno}"\n')
path.write_text(source.replace(needle, addition + needle))
PY
printf 'task_source_overlay=fixed class and NoMethodError method name only; no message, receiver, payload or backtrace; canonical commit unchanged\n' >> "$log"
test "$(docker image inspect --format '{{.Id}}' "$image")" = "$image"
set +e
timeout 480s docker run --rm --name "$name" --pull never --network none \
  --read-only --memory 2g --memory-swap 2g --cpus 2 --pids-limit 256 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e BUNDLE_APP_CONFIG=/tmp/bundle \
  --tmpfs /tmp:rw,size=256m -v "$context":/workspace:ro -w /workspace/apps/server \
  "$image" bash -c '
    overall=0
    for suite in \
      test/administration/assignee_options_http_test.rb \
      test/administration/organization_role_audit_http_test.rb \
      test/campaigns/accounts_controller_test.rb \
      test/inbound/permalink_http_test.rb; do
      printf "RUN %s\n" "$suite"
      bundle exec ruby -Itest "$suite"
      status=$?; printf "SUITE_RESULT path=%s exit=%s\n" "$suite" "$status"
      if [ "$status" -ne 0 ]; then overall=1; fi
    done
    exit "$overall"
  ' >> "$log" 2>&1
status=$?
set -e
exit "$status"
