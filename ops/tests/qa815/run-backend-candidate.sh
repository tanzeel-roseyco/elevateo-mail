#!/usr/bin/env bash
set -euo pipefail

# AIDEV-NOTE: Runner owns Compose cleanup; this wrapper preserves its sanitized receipt before archive removal.
candidate=$(git rev-parse "${1:?usage: run-backend-candidate.sh COMMIT}^{commit}")
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
receipt_dir="$root/docs/completion/qa815-evidence/backend-${candidate:0:12}"
summary="$root/docs/completion/qa815-evidence/backend-${candidate:0:12}.txt"
context=$(mktemp -d /tmp/qa815-backend.XXXXXXXX)
mkdir -p "$receipt_dir"
exec 9>"$lock"
flock -x 9
printf 'source=%s\nstarted=%s\n' "$candidate" "$(date -u +%FT%TZ)" > "$summary"
git archive "$candidate" | tar -x -C "$context"
# Git omits empty mountpoints; Compose's read-only source bind needs these paths in the disposable archive.
install -d -m 755 "$context/apps/server/tmp" "$context/apps/server/log"
chmod -R a+rX "$context"
if [[ ${QA815_GATEWAY_BOOTSTRAP:-0} == 1 ]]; then
  # AIDEV-NOTE: Test-only OPS820 bootstrap overlay; the candidate commit stays byte-for-byte intact.
  python3 - "$context/ops/tests/be02/run.py" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
needle = '''        task.compose(name, ["run", "--rm", "--no-deps", "bootstrap", "-f", "/ops/" + filename], 45)
'''
addition = '''    gateway_password = secrets.token_hex(32)
    task.secrets["qa815_gateway_password"] = gateway_password
    with task.env_file.open("a", encoding="ascii") as stream:
        stream.write("ATTACHMENT_GATEWAY_DB_PASSWORD=" + gateway_password + "\\n")
    task.env_file.chmod(0o600)
    task.docker("bootstrap-gateway", ["run", "--rm", "--network", task.project + "_isolated",
        "--read-only", "--cap-drop", "ALL", "--env-file", str(task.env_file),
        "-e", "PGHOST=db", "-e", "PGUSER=supabase_admin", "-e", "PGDATABASE=postgres",
        "-v", str(task.root / "ops/ops820/bootstrap-gateway.sql") + ":/bootstrap-gateway.sql:ro",
        "--entrypoint", "bash",
        "supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00",
        "-c", 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -v ON_ERROR_STOP=1 -f /bootstrap-gateway.sql'], 45)
'''
if source.count(needle) != 1:
    raise SystemExit("QA815 gateway overlay anchor mismatch")
path.write_text(source.replace(needle, needle + addition))
PY
  printf 'task_source_overlay=OPS820 restricted gateway login before migration; canonical commit unchanged\n' >> "$summary"
fi
set +e
python3 "$context/ops/tests/be02/run.py" --context default \
  --expect-host Ubuntu-noble-latest-amd64-base >> "$summary" 2>&1
run_status=$?
set -e
printf 'runner_exit=%s\n' "$run_status" >> "$summary"
shopt -s nullglob
projects=("$context"/ops/local/be02-*)
if [[ ${#projects[@]} -ne 1 || ! -f ${projects[0]}/result.json ]]; then
  printf 'receipt_copy_failed=1 archive_retained=%s\n' "$context" >> "$summary"
  exit 90
fi
project=${projects[0]}
for file in result.json cleanup.json server-image.json; do
  [[ ! -f $project/$file ]] || cp "$project/$file" "$receipt_dir/$file"
done
for source_log in "$project"/*.log; do
  # Task.run writes sanitized logs; runtime credential files and raw snapshots stay excluded.
  cp "$source_log" "$receipt_dir/$(basename "${source_log%.log}").txt"
done
[[ -f $receipt_dir/cleanup.json ]] || { printf 'cleanup_receipt_missing=1 archive_retained=%s\n' "$context" >> "$summary"; exit 91; }
printf 'receipt_copy_failed=0\n' >> "$summary"
rm -rf "$context"
printf 'archive_absent=%s\nfinished=%s\n' "$([[ ! -e $context ]] && echo yes || echo no)" "$(date -u +%FT%TZ)" >> "$summary"
exit "$run_status"
