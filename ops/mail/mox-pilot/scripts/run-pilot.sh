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
docker image inspect 'axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea' >/dev/null
if [[ -n ${APP_TEST_IMAGE:-}${APP_SOURCE_DIR:-}${CORIN_SOURCE_SHA:-} ]] &&
   [[ -z ${APP_TEST_IMAGE:-} || -z ${APP_SOURCE_DIR:-} || -z ${CORIN_SOURCE_SHA:-} ]]; then
  echo 'interop inputs must be supplied together' >&2
  exit 2
fi
if [[ -n ${APP_TEST_IMAGE:-} ]]; then
  if [[ ! $APP_TEST_IMAGE =~ ^([^[:space:]]+@)?sha256:[a-f0-9]{64}$ ]] ||
     [[ ${APP_SOURCE_DIR:-} != /* ]] ||
     [[ ! ${CORIN_SOURCE_SHA:-} =~ ^[a-f0-9]{40}$ ]] ||
     [[ $(git -C "$APP_SOURCE_DIR" rev-parse HEAD) != "$CORIN_SOURCE_SHA" ]] ||
     [[ -n $(git -C "$APP_SOURCE_DIR" status --porcelain) ]]; then
    echo 'interop requires immutable app image and clean exact Corin source checkout' >&2
    exit 2
  fi
  docker image inspect "$APP_TEST_IMAGE" >/dev/null
fi
if (( $(df -Pk "$pilot_dir" | awk 'NR==2 {print $4}') < 5242880 )); then
  echo 'less than 5 GiB free; pilot not admitted' >&2
  exit 2
fi

mkdir -p -- "$pilot_dir/receipts"
receipt_dir=${MOX_PILOT_RECEIPT_DIR:-"$pilot_dir/receipts/$(date -u +%Y%m%dT%H%M%SZ)-$$"}
if [[ $receipt_dir != /* || -e $receipt_dir || -L $receipt_dir ]]; then
  echo 'receipt directory must be a new absolute path' >&2
  exit 2
fi
mkdir -m 700 -- "$receipt_dir"
export MOX_PILOT_RECEIPT_DIR="$receipt_dir"
project="mail818-$(date -u +%s)-$$"
export MOX_PILOT_SUBJECT="MAIL818-SYNTHETIC-$project"
export PROBE_VERIFY_EXISTING=0
interop_requested=0
corin_initial=skipped_missing_inputs
corin_restart=skipped_missing_inputs
if [[ -n ${APP_TEST_IMAGE:-} ]]; then
  interop_requested=1
  corin_initial=not_run
  corin_restart=not_run
fi
protocol_initial=not_run
tls_initial=not_run
protocol_restart=not_run
tls_restart=not_run
mailpit_result=not_run
resource_status=not_run
compose=(docker compose -p "$project" -f "$pilot_dir/compose.yaml")
interop_compose=(docker compose -p "$project" -f "$pilot_dir/compose.yaml" -f "$pilot_dir/compose-interop.yaml")
deadline=$((SECONDS + 840))
run_bounded() {
  remaining=$((deadline - SECONDS))
  if (( remaining <= 0 )); then
    echo 'pilot deadline exhausted' >&2
    return 124
  fi
  timeout -k 2s "${remaining}s" "$@"
}
cleanup() {
  previous_status=$?
  trap - EXIT
  set +e
  printf '%s\n' "$previous_status" >"$receipt_dir/exit-status.txt"
  timeout -k 2s 10s "${compose[@]}" logs --no-color --tail=300 mox >"$receipt_dir/mox.log" 2>&1
  log_status=$?
  timeout -k 2s 60s "${compose[@]}" down --volumes --remove-orphans >"$receipt_dir/cleanup.log" 2>&1
  down_status=$?
  # AIDEV-NOTE: A stalled daemon must yield an unverifiable cleanup receipt, never a false empty inventory.
  timeout -k 2s 10s docker ps -a --filter "label=com.docker.compose.project=$project" --format '{{.ID}}' >"$receipt_dir/remaining-containers.txt"
  container_query_status=$?
  timeout -k 2s 10s docker network ls --filter "label=com.docker.compose.project=$project" --format '{{.ID}}' >"$receipt_dir/remaining-networks.txt"
  network_query_status=$?
  timeout -k 2s 10s docker volume ls --filter "label=com.docker.compose.project=$project" --format '{{.Name}}' >"$receipt_dir/remaining-volumes.txt"
  volume_query_status=$?
  cleanup_verification=verified_absent
  if (( down_status != 0 || container_query_status != 0 || network_query_status != 0 || volume_query_status != 0 )); then
    cleanup_verification=unverifiable
  elif [[ -s $receipt_dir/remaining-containers.txt || -s $receipt_dir/remaining-networks.txt || -s $receipt_dir/remaining-volumes.txt ]]; then
    cleanup_verification=residual_resources
  fi
  printf 'logs=%s down=%s containers=%s networks=%s volumes=%s\n' \
    "$log_status" "$down_status" "$container_query_status" "$network_query_status" "$volume_query_status" \
    >"$receipt_dir/cleanup-status.txt"
  base_result=incomplete
  if (( previous_status == 0 )) && [[ $cleanup_verification == verified_absent &&
       $protocol_initial == pass && $tls_initial == pass && $protocol_restart == pass &&
       $tls_restart == pass && $mailpit_result == pass ]]; then
    base_result=pass
  fi
  interop_result=not_run_missing_inputs
  if (( interop_requested == 1 )); then
    interop_result=incomplete
    if [[ $base_result == pass && $corin_initial == pass && $corin_restart == pass ]]; then
      interop_result=pass
    fi
  fi
  printf 'schema=mail818-components-v1\nprotocol_initial=%s\ntls_initial=%s\nprotocol_restart=%s\ntls_restart=%s\nmailpit=%s\ncorin_initial=%s\ncorin_restart=%s\nbase_result=%s\ninterop_result=%s\ncleanup_verification=%s\nresource_status=%s\n' \
    "$protocol_initial" "$tls_initial" "$protocol_restart" "$tls_restart" "$mailpit_result" \
    "$corin_initial" "$corin_restart" "$base_result" "$interop_result" "$cleanup_verification" \
    "$resource_status" >"$receipt_dir/component-status.txt"
  if [[ $cleanup_verification != verified_absent ]]; then
    printf 'cleanup absence unverifiable or residual task-owned resources\n' >&2
    exit 1
  fi
  exit "$previous_status"
}
trap cleanup EXIT
printf 'project=%s\nsource=%s\nmox_image=%s\nprobe_image=%s\ninterop_requested=%s\napp_image=%s\ncorin_source_sha=%s\n' \
  "$project" "$MOX_SOURCE_SHA" "$MOX_IMAGE" "$PROBE_IMAGE" "$interop_requested" \
  "${APP_TEST_IMAGE:-not_supplied}" "${CORIN_SOURCE_SHA:-not_supplied}" >"$receipt_dir/inputs.txt"
run_bounded "${compose[@]}" run --rm guard >"$receipt_dir/guard.log" 2>&1
run_bounded "${compose[@]}" run --rm init >"$receipt_dir/init.log" 2>&1
run_bounded "${compose[@]}" run --rm cert_export >"$receipt_dir/cert-export.log" 2>&1
run_bounded "${compose[@]}" up -d mox
set +e
run_bounded "${compose[@]}" run --rm probe >"$receipt_dir/probe.log" 2>&1
status=$?
protocol_initial=$([[ $status == 0 ]] && printf pass || printf fail)
set -e
if (( status == 0 )); then
  set +e
  run_bounded "${compose[@]}" run --rm tls_probe >"$receipt_dir/tls-probe.log" 2>&1
  status=$?
  tls_initial=$([[ $status == 0 ]] && printf pass || printf fail)
  set -e
fi
if (( status == 0 )) && [[ -n ${APP_TEST_IMAGE:-} ]]; then
  set +e
  run_bounded "${interop_compose[@]}" run --rm corin_interop >"$receipt_dir/corin-interop.log" 2>&1
  status=$?
  corin_initial=$([[ $status == 0 ]] && printf pass || printf fail)
  set -e
fi
if (( status == 0 )); then
  run_bounded "${compose[@]}" restart mox >"$receipt_dir/restart.log" 2>&1
  export PROBE_VERIFY_EXISTING=1
  set +e
  run_bounded "${compose[@]}" run --rm probe >"$receipt_dir/probe-after-restart.log" 2>&1
  status=$?
  protocol_restart=$([[ $status == 0 ]] && printf pass || printf fail)
  set -e
fi
if (( status == 0 )); then
  set +e
  run_bounded "${compose[@]}" run --rm tls_probe >"$receipt_dir/tls-probe-after-restart.log" 2>&1
  status=$?
  tls_restart=$([[ $status == 0 ]] && printf pass || printf fail)
  set -e
fi
if (( status == 0 )) && [[ -n ${APP_TEST_IMAGE:-} ]]; then
  set +e
  run_bounded "${interop_compose[@]}" run --rm corin_interop >"$receipt_dir/corin-interop-after-restart.log" 2>&1
  status=$?
  corin_restart=$([[ $status == 0 ]] && printf pass || printf fail)
  set -e
fi
if (( status == 0 )); then
  run_bounded "${compose[@]}" stop mox >"$receipt_dir/mox-stop.log" 2>&1
  run_bounded "${compose[@]}" up -d mailpit >"$receipt_dir/mailpit-start.log" 2>&1
  set +e
  run_bounded "${compose[@]}" run --rm mailpit_probe >"$receipt_dir/mailpit-probe.log" 2>&1
  status=$?
  mailpit_result=$([[ $status == 0 ]] && printf pass || printf fail)
  set -e
fi
if timeout -k 2s 10s docker ps --filter "label=com.docker.compose.project=$project" --format '{{.ID}}' >"$receipt_dir/running-containers.txt"; then
  mapfile -t owned_containers <"$receipt_dir/running-containers.txt"
  resource_status=pass
  if (( ${#owned_containers[@]} > 0 )); then
    timeout -k 2s 10s docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' \
      "${owned_containers[@]}" >"$receipt_dir/resources.txt" 2>&1 || resource_status=incomplete
  else
    printf 'no task-owned running containers for stats\n' >"$receipt_dir/resources.txt"
  fi
else
  resource_status=unverifiable
  printf 'bounded running-container query failed; resource inventory unavailable\n' >"$receipt_dir/resources.txt"
  status=1
fi
exit "$status"
