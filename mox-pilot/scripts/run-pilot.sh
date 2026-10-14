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
for name in MOX_IMAGE PROBE_IMAGE; do
  value=${!name:-}
  if [[ ! $value =~ ^[^[:space:]]+@sha256:[a-f0-9]{64}$ ]]; then
    echo "$name must be an immutable sha256 image reference" >&2
    exit 2
  fi
done
if (( $(df -Pk "$pilot_dir" | awk 'NR==2 {print $4}') < 5242880 )); then
  echo 'less than 5 GiB free; pilot not admitted' >&2
  exit 2
fi

receipt_dir=${MOX_PILOT_RECEIPT_DIR:-"$pilot_dir/receipts/$(date -u +%Y%m%dT%H%M%SZ)"}
mkdir -p -- "$receipt_dir"
project="mail818-$(date -u +%s)-$$"
compose=(docker compose -p "$project" -f "$pilot_dir/compose.yaml")
cleanup() {
  previous_status=$?
  trap - EXIT
  "${compose[@]}" down --volumes --remove-orphans >"$receipt_dir/cleanup.log" 2>&1 || true
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
"${compose[@]}" up -d mox
set +e
timeout 15m "${compose[@]}" run --rm probe >"$receipt_dir/probe.log" 2>&1
status=$?
set -e
"${compose[@]}" logs --no-color --tail=300 mox >"$receipt_dir/mox.log" 2>&1
docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' \
  $(docker ps --filter "label=com.docker.compose.project=$project" --format '{{.ID}}') \
  >"$receipt_dir/resources.txt" 2>&1 || true
printf '%s\n' "$status" >"$receipt_dir/exit-status.txt"
exit "$status"
