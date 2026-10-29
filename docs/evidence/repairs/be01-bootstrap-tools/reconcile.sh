#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Independently callable read-only reconciliation; a failed inventory is UNKNOWN, never absence.
if [[ ${1:-} != --bounded ]]; then exec timeout -k 5s 180s bash "$0" --bounded "$@"; fi
shift
audit=${1:?Invocation audit required}; output=${2:?Fresh reconciliation directory required}
: "${TOOLS_SOURCE:?}"
umask 077
mkdir -- "$output"
printf 'reconciliation=UNKNOWN\n' > "$output/status"
cd "$TOOLS_SOURCE"
sha256sum -c payload.sha256 > "$output/source.log"
[[ $(cat "$audit/before/complete.status") == inventory_exit=0 ]]
bash docs/evidence/repairs/be01-bootstrap-tools/inventory.sh "$output/after"
failed=0
for file in container.ids volume.names image.ids containers.jsonl volumes.jsonl images.jsonl builders.json pinned.ids; do
  result=0
  cmp "$audit/before/$file" "$output/after/$file" > "$output/$file.diff" 2>&1 || result=$?
  printf '%s=%s\n' "$file" "$result" >> "$output/comparison.status"
  if (( result != 0 )); then failed=1; fi
done
shopt -s nullglob
runs=("$audit/parent"/be01bootstrap-*)
if (( ${#runs[@]} != 1 )); then
  printf 'task_identity=UNKNOWN\n' >> "$output/comparison.status"; failed=1
else
  run=${runs[0]}; leaf=${run##*/}; task=${leaf%.*}; nonce=${task#be01bootstrap-}
  [[ $nonce =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]
  printf 'task=%s\n' "$task" > "$output/task.identity"
  for record in fixture.id fixture.status fixture.verification.status identities; do
    if [[ -f $run/$record ]]; then cp -- "$run/$record" "$output/$record";
    else printf '%s=UNKNOWN_OR_NOT_RUN\n' "$record" >> "$output/comparison.status"; fi
  done
  # Complete inventory equality proves no new surviving object; captured IDs add explicit fixture evidence.
  if [[ -f $run/fixture.id ]]; then
    id=$(cat "$run/fixture.id"); [[ $id =~ ^[0-9a-f]{64}$ ]]
    if grep -Fx "$id" "$output/after/container.ids"; then failed=1; fi
  fi
fi
if [[ -f $audit/parent.status ]]; then cp "$audit/parent.status" "$output/parent.status";
else printf 'parent_exit=UNKNOWN\n' > "$output/parent.status"; failed=1; fi
# Parent's test_exit is the parent's pre-cleanup exit, not necessarily the fixture test result.
if ! grep -E '^test_exit=[0-9]+ cleanup_failed=[01] evidence=/' "$audit/parent.log" > "$output/parent-cleanup.status"; then
  printf 'parent_cleanup=UNKNOWN\n' > "$output/parent-cleanup.status"; failed=1
fi
printf 'reconciliation_exit=%s\n' "$failed" > "$output/status"
exit "$failed"
