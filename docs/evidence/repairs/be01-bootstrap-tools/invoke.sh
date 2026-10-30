#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Future approved invocation only; original parent exit and reconciliation have separate records.
if [[ ${1:-} != --bounded ]]; then exec timeout -k 30s 1800s bash "$0" --bounded; fi
: "${TOOLS_SOURCE:?}" "${TOOLS_EVIDENCE:?}" "${TOOLS_CONTEXT:?}" "${TOOLS_HOST:?}"
[[ $(realpath "$TOOLS_SOURCE") == "$TOOLS_SOURCE" && -d $TOOLS_EVIDENCE ]]
[[ $(stat -c %a "$TOOLS_EVIDENCE") == 700 && $(stat -c %u "$TOOLS_EVIDENCE") == "$(id -u)" ]]
cd "$TOOLS_SOURCE"
sha256sum -c payload.sha256
packet=docs/evidence/repairs/be01-bootstrap-tools
export BOOTSTRAP_PACKAGE_SHA=$(sha256sum "$packet/package.sha256" | cut -d ' ' -f1)
umask 077
audit=$(mktemp -d "$TOOLS_EVIDENCE/be01bootstrap-invoke.XXXXXX")
printf 'audit=%s\n' "$audit"
mkdir "$audit/parent"
printf 'parent_exit=NOT_RUN\n' > "$audit/parent.status"
printf 'invocation=UNKNOWN\n' > "$audit/invocation.status"
bash "$packet/inventory.sh" "$audit/before"
# AIDEV-NOTE: Historical config evidence is an object, not Docker inspect's usual one-element array.
historical=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-full-services-d25b2424-838c-4c2e-8a7c-c8c7abdfa1ab/evidence/be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6.ahYiWs/resources/config.volume
jq -ceS 'select(type=="object") | {Name,Driver,Scope,CreatedAt,Labels,Options,Mountpoint}' \
  "$historical" > "$audit/config.historical.json"
jq -ceS 'select(.Name=="be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6-config")' \
  "$audit/before/volumes.jsonl" > "$audit/config.before.json"
cmp "$audit/config.historical.json" "$audit/config.before.json"
export TOOLS_EVIDENCE="$audit/parent"
set +e
bash "$packet/parent.sh" > "$audit/parent.log" 2>&1
parent_exit=$?
set -e
# AIDEV-NOTE: Evidence failures must not skip reconciliation or replace the saved nonzero parent result.
parent_write_exit=0
printf 'parent_exit=%s\n' "$parent_exit" > "$audit/parent.status" || parent_write_exit=$?
reconcile_exit=0
bash "$packet/reconcile.sh" "$audit" "$audit/reconciliation" || reconcile_exit=$?
invocation_write_exit=0
printf 'parent_exit=%s\nreconcile_exit=%s\nparent_write_exit=%s\n' \
  "$parent_exit" "$reconcile_exit" "$parent_write_exit" > "$audit/invocation.status" || invocation_write_exit=$?
chosen_exit=$parent_exit
if (( chosen_exit == 0 )); then
  chosen_exit=$reconcile_exit
  if (( chosen_exit == 0 && (parent_write_exit != 0 || invocation_write_exit != 0) )); then chosen_exit=1; fi
fi
# AIDEV-NOTE: Best-effort diagnostics cannot change the already chosen exit, even when stderr fails.
printf 'parent_write_exit=%s\ninvocation_write_exit=%s\nchosen_exit=%s\n' \
  "$parent_write_exit" "$invocation_write_exit" "$chosen_exit" >&2 || :
exit "$chosen_exit"
