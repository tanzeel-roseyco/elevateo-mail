set -euo pipefail
exec </dev/null
# AIDEV-NOTE: Fixed shell bytes replace template generation; only a validated UUID is variable.
[[ $# == 1 && $1 =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra
D=$root/be01-capability-check-delivery-$1
A=$root/be01-capability-check-audit-$1
cd "$D"
printf '%s  %s\n' 0a38d5252cd5c9e363d70658c7dba0182f65bc097531d1857b857a25f57431c7 launcher.sh | sha256sum -c -
[[ $(cat preflight/status) == phase_exit=0 ]]
start=$(date +%s)
printf '%s\n' "$start" > events.start
# AIDEV-NOTE: Reap only our observer even when status writes fail; preserve nonzero launch/signal outcomes.
cleanup_observer() {
 incoming=$?
 trap - EXIT
 trap '' TERM INT
 set +e
 result=$incoming
 if [[ ${rc:-0} != 0 ]]; then result=$rc; fi
 if [[ -n ${observer:-} ]]; then
  pid=$observer
  observer=
  kill "$pid" 2>/dev/null
  wait "$pid"
  event_exit=$?
  printf 'observer_exit=%s\n' "$event_exit" > events.status
  written=$?
  if [[ $result == 0 && $written != 0 ]]; then result=$written; fi
 fi
 exit "$result"
}
timeout -k3s 1540s docker --context default events --since "$start" --format '{{json .}}' > events.jsonl 2>events.stderr &
observer=$!
trap cleanup_observer EXIT
trap 'rc=143; exit 143' TERM
trap 'rc=130; exit 130' INT
sleep 1
kill -0 "$observer"
set +e
CAPABILITY_CHECK_APPROVED=capability-socket-free CHECK_AUDIT="$A" timeout -k20s 1500s bash "$D/launcher.sh" </dev/null > console.log 2>&1
rc=$?
set -e
printf 'process_exit=%s\n' "$rc" > process.status
exit "$rc"
