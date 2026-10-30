#!/usr/bin/env bash
# AIDEV-NOTE: Review-only preparation until an explicit coordinator lease; no automatic reservation or recovery.
set -euo pipefail
umask 077
[[ ${BE01_LEASE:-} == services-socket-free ]]
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
: "${ARCHIVE:?authenticated transfer path}" "${TOOLS_SOURCE:?canonical source}" "${TOOLS_CONTEXT:?}"
: "${TOOLS_EVIDENCE:?existing evidence root}"
export TOOLS_SOURCE TOOLS_CONTEXT TOOLS_EVIDENCE
[[ $(realpath "$TOOLS_SOURCE") == "$TOOLS_SOURCE" && -d $TOOLS_EVIDENCE ]]
scripts=$(cd "$(dirname "$0")" && pwd)
printf '%s  %s\n' \
  3bcafad3d1246a4cb6abe152445d38c2f4318f6e33e33bd901670feebf822ed9 "$scripts/be01-services-stage.py" \
  6ca249554afacb3dde83cd473f8907994fb852b20e5bd3a4d2a5603bd402f03a "$scripts/be01-services-inventory.sh" | sha256sum -c -
export AUDIT
AUDIT=$(mktemp -d "$TOOLS_EVIDENCE/be01services-stage.XXXXXX")
printf 'audit=%s\n' "$AUDIT"
timeout -k 3s 20s docker --context "$TOOLS_CONTEXT" context inspect "$TOOLS_CONTEXT" \
  > "$AUDIT/context.json"
jq -e 'length == 1 and .[0].Endpoints.docker.Host == "unix:///var/run/docker.sock"' "$AUDIT/context.json" >/dev/null
cd "$TOOLS_SOURCE"
printf '%s  %s\n' 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b \
  ops/tests/fleet02-egress-source.sha256 | sha256sum -c -
sha256sum -c ops/tests/fleet02-egress-source.sha256 > "$AUDIT/source.before"
bash "$scripts/be01-services-inventory.sh" before
python3 "$scripts/be01-services-stage.py" "$ARCHIVE" "$TOOLS_SOURCE" > "$AUDIT/stage.log" 2>&1
sha256sum -c ops/tools/be01-services-tools/package.sha256 > "$AUDIT/package.before"
sha256sum -c ops/tests/fleet02-egress-source.sha256 > "$AUDIT/source.staged"
# Only the reviewed parent can mutate Docker; capture its actual exit without a pipeline.
set +e
TOOLS_HOST=Ubuntu-noble-latest-amd64-base bash ops/tools/be01-services-tools/parent-run.sh \
  > "$AUDIT/console.log" 2>&1
parent_exit=$?
set -e
printf 'parent_exit=%s\n' "$parent_exit" > "$AUDIT/status"
mapfile -t summaries < <(grep -E '^test_exit=[0-9]+ cleanup_failed=[01] evidence=' "$AUDIT/console.log")
if [[ ${#summaries[@]} != 1 ]]; then
  printf 'test_exit=unknown cleanup_failed=unknown; inspect console; no acceptance\n' >> "$AUDIT/status"
  set +e
  bash "$scripts/be01-services-inventory.sh" incomplete > "$AUDIT/inventory-incomplete.log" 2>&1
  incomplete_inventory_exit=$?
  set -e
  printf 'incomplete_inventory_exit=%s\n' "$incomplete_inventory_exit" >> "$AUDIT/status"
  exit 1
fi
summary=${summaries[0]}
test_exit=${summary#test_exit=}; test_exit=${test_exit%% *}
cleanup_failed=${summary#*cleanup_failed=}; cleanup_failed=${cleanup_failed%% *}
export RUN_EVIDENCE TASK
RUN_EVIDENCE=${summary#* evidence=}
[[ -d $RUN_EVIDENCE && $(dirname "$RUN_EVIDENCE") == "$TOOLS_EVIDENCE" ]]
TASK=$(basename "$RUN_EVIDENCE"); TASK=${TASK%.*}
printf '%s\n' "$summary" >> "$AUDIT/status"
set +e
bash "$scripts/be01-services-inventory.sh" after > "$AUDIT/inventory.log" 2>&1
inventory_exit=$?
sha256sum -c ops/tests/fleet02-egress-source.sha256 > "$AUDIT/source.after"
source_exit=$?
set -e
printf 'inventory_exit=%s source_exit=%s\n' "$inventory_exit" "$source_exit" >> "$AUDIT/status"
cat "$AUDIT/status"
[[ $parent_exit == 0 && $test_exit == 0 && $cleanup_failed == 0 && $inventory_exit == 0 && $source_exit == 0 ]]
