#!/usr/bin/env bash
# AIDEV-NOTE: Separate review-only regression lane; never stage canonical sources or recover uncertain containers.
set -euo pipefail
umask 077
[[ ${BE01_LEASE:-} == services-python-regression ]]
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
: "${REVIEW:?exact authenticated regression directory}" "${EVIDENCE:?existing evidence root}"
[[ $(realpath "$REVIEW") == "$REVIEW" && -d $EVIDENCE ]]
context=default
image=python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a
# AIDEV-NOTE: Config identity is not portable across image stores; verify the authenticated manifest chain.
task=be01stagepy-$(cat /proc/sys/kernel/random/uuid)
audit=$(mktemp -d "$EVIDENCE/$task.XXXXXX")
printf 'evidence=%s task=%s\n' "$audit" "$task"
d() { timeout -k 3s 20s docker --context "$context" "$@"; }
snapshot() {
  local phase=$1
  df -B1 "$REVIEW" "$EVIDENCE" > "$audit/space.$phase" || return
  d ps -aq --filter "label=org.elevateo.stage-task=$task" > "$audit/labels.$phase" || return
  d ps -aq --filter "name=^/${task}$" > "$audit/name.$phase" || return
  d image inspect "$image" > "$audit/image.$phase" || return
  jq -se --slurpfile manifest be01-services-python-manifest.json -f be01-services-python-identity.jq "$audit/image.$phase" >/dev/null || return
  [[ ! -s $audit/labels.$phase && ! -s $audit/name.$phase ]]
}
d context inspect "$context" > "$audit/context.json"
jq -e 'length == 1 and .[0].Endpoints.docker.Host == "unix:///var/run/docker.sock"' "$audit/context.json" >/dev/null
cd "$REVIEW"
printf '%s  %s\n' 1f19030c64e24e72c7f0f137504717ea65d7acb3600a352dcf24842c0cfad02c \
  be01-services-python.sha256 | sha256sum -c - > "$audit/manifest.log"
sha256sum -c be01-services-python.sha256 > "$audit/files.before"
snapshot before
# --rm owns normal cleanup; timeout or inspection uncertainty is retained for separately reviewed recovery.
set +e
timeout -k 5s 90s docker --context "$context" run --rm --pull never --name "$task" \
  --label "org.elevateo.stage-task=$task" --network none --read-only --user 10001:10001 \
  --cpus 0.5 --memory 256m --memory-swap 256m --pids-limit 64 --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777 \
  --mount "type=bind,src=$REVIEW/be01-services-stage.py,dst=/review/be01-services-stage.py,readonly" \
  --mount "type=bind,src=$REVIEW/be01-services-stage-regression.py,dst=/review/be01-services-stage-regression.py,readonly" \
  --mount "type=bind,src=$REVIEW/be01-services-stage-boundary.py,dst=/review/be01-services-stage-boundary.py,readonly" \
  --env PYTHONDONTWRITEBYTECODE=1 --entrypoint /bin/sh "$image" \
  -c 'python3 -B /review/be01-services-stage-regression.py && python3 -B /review/be01-services-stage-boundary.py' \
  > "$audit/checks.log" 2>&1
test_exit=$?
snapshot after
inventory_exit=$?
sha256sum -c be01-services-python.sha256 > "$audit/files.after"
source_exit=$?
set -e
cleanup_failed=0
[[ $inventory_exit == 0 ]] || cleanup_failed=1
printf 'test_exit=%s cleanup_failed=%s inventory_exit=%s source_exit=%s evidence=%s\n' \
  "$test_exit" "$cleanup_failed" "$inventory_exit" "$source_exit" "$audit" | tee "$audit/status"
[[ $test_exit == 0 && $cleanup_failed == 0 && $source_exit == 0 ]]
