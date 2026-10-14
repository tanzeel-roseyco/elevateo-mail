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
