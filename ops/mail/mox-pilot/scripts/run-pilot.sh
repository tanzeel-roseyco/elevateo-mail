#!/usr/bin/env bash
set -euo pipefail

pilot_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ $(hostname -s) != fleet-02* ]]; then
  echo 'refusing non-fleet-02 host' >&2
  exit 2
fi
if [[ -z ${MOX_PILOT_LEASE_TOKEN:-} ]]; then
  echo 'Soren lease token required' >&2
  exit 2
fi
if [[ ${MOX_SOURCE_SHA:-} != 1c9587665b321199312e11b6a47a0480a9e2750f ]]; then
  echo 'Mox source pin mismatch' >&2
  exit 2
fi
expected_mox_image='r.xmox.nl/mox@sha256:831c6f11b3c2ee1633077052e6d4b7ae53f73972adf4bf08be0a740121d24cc7'
if [[ ${MOX_IMAGE:-} != "$expected_mox_image" ]]; then
  echo 'Mox image differs from reviewed v0.0.17 digest' >&2
  exit 2
fi
for name in MOX_IMAGE PROBE_IMAGE; do
  value=${!name:-}
  if [[ ! $value =~ ^([^[:space:]]+@)?sha256:[a-f0-9]{64}$ ]]; then
    echo "$name must be an immutable sha256 image reference" >&2
    exit 2
  fi
done
docker image inspect "$MOX_IMAGE" "$PROBE_IMAGE" >/dev/null
if (( $(df -Pk "$pilot_dir" | awk 'NR==2 {print $4}') < 5242880 )); then
  echo 'less than 5 GiB free; pilot not admitted' >&2
  exit 2
fi

receipt_dir=${MOX_PILOT_RECEIPT_DIR:-"$pilot_dir/receipts/$(date -u +%Y%m%dT%H%M%SZ)"}
mkdir -p -- "$receipt_dir"
project="mail818-$(date -u +%s)-$$"
export MOX_PILOT_SUBJECT="MAIL818-SYNTHETIC-$project"
export PROBE_VERIFY_EXISTING=0
compose=(docker compose -p "$project" -f "$pilot_dir/compose.yaml")
deadline=$((SECONDS + 840))
run_bounded() {
  remaining=$((deadline - SECONDS))
  if (( remaining <= 0 )); then
    echo 'pilot deadline exhausted' >&2
    return 124
  fi
  timeout "${remaining}s" "$@"
}
cleanup() {
  previous_status=$?
  trap - EXIT
  timeout 60s "${compose[@]}" down --volumes --remove-orphans >"$receipt_dir/cleanup.log" 2>&1 || true
  docker ps -a --filter "label=com.docker.compose.project=$project" --format '{{.ID}}' >"$receipt_dir/remaining-containers.txt"
  docker network ls --filter "label=com.docker.compose.project=$project" --format '{{.ID}}' >"$receipt_dir/remaining-networks.txt"
  docker volume ls --filter "label=com.docker.compose.project=$project" --format '{{.Name}}' >"$receipt_dir/remaining-volumes.txt"
  if [[ -s $receipt_dir/remaining-containers.txt || -s $receipt_dir/remaining-networks.txt || -s $receipt_dir/remaining-volumes.txt ]]; then
    printf 'cleanup failed: task-owned Docker resources remain\n' >&2
    exit 1
  fi
  exit "$previous_status"
}
trap cleanup EXIT
printf 'project=%s\nsource=%s\nmox_image=%s\nprobe_image=%s\n' \
  "$project" "$MOX_SOURCE_SHA" "$MOX_IMAGE" "$PROBE_IMAGE" >"$receipt_dir/inputs.txt"
run_bounded "${compose[@]}" run --rm guard >"$receipt_dir/guard.log" 2>&1
run_bounded "${compose[@]}" run --rm init >"$receipt_dir/init.log" 2>&1
run_bounded "${compose[@]}" up -d mox
set +e
run_bounded "${compose[@]}" run --rm probe >"$receipt_dir/probe.log" 2>&1
status=$?
set -e
if (( status == 0 )); then
  run_bounded "${compose[@]}" restart mox >"$receipt_dir/restart.log" 2>&1
  export PROBE_VERIFY_EXISTING=1
  set +e
  run_bounded "${compose[@]}" run --rm probe >"$receipt_dir/probe-after-restart.log" 2>&1
  status=$?
  set -e
fi
"${compose[@]}" logs --no-color --tail=300 mox >"$receipt_dir/mox.log" 2>&1
mapfile -t owned_containers < <(docker ps --filter "label=com.docker.compose.project=$project" --format '{{.ID}}')
if (( ${#owned_containers[@]} > 0 )); then
  timeout 10s docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' \
    "${owned_containers[@]}" >"$receipt_dir/resources.txt" 2>&1 || true
else
  printf 'no task-owned running containers for stats\n' >"$receipt_dir/resources.txt"
fi
printf '%s\n' "$status" >"$receipt_dir/exit-status.txt"
exit "$status"
