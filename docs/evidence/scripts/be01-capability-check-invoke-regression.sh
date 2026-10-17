set -euo pipefail
# AIDEV-NOTE: Docker-only shell boundary test; never invokes Docker or the real launcher.
script=$(realpath "${1:?Invocation source required}")
bash -n "$script"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
sed '/^cd /,$d' "$script" > "$work/paths.sh"
cat >> "$work/paths.sh" <<'PATHS'
printf '%s\n' "$D" "$A"
PATHS
uuid=00000000-0000-0000-0000-000000000001
bash "$work/paths.sh" "$uuid" > "$work/paths"
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra
printf '%s\n' "$root/be01-capability-check-delivery-$uuid" "$root/be01-capability-check-audit-$uuid" > "$work/expected"
cmp "$work/paths" "$work/expected"
for bad in AUDIT '../escape' '$(touch unwanted)' 00000000-0000-0000-0000-00000000000Z; do
 if bash "$work/paths.sh" "$bad"; then echo 'invalid UUID accepted' >&2; exit 1; fi
done
if bash "$work/paths.sh"; then exit 1; fi
if bash "$work/paths.sh" "$uuid" extra; then exit 1; fi
[[ $(grep -c '^CAPABILITY_CHECK_APPROVED=' "$script") == 1 ]]
grep '^CAPABILITY_CHECK_APPROVED=' "$script" > "$work/call.sh"
cat > "$work/stub.sh" <<'STUB'
set -euo pipefail
D='/fixture delivery'
A='/fixture audit'
timeout() {
 [[ $CAPABILITY_CHECK_APPROVED == capability-socket-free && $CHECK_AUDIT == "$A" ]] || return 91
 [[ $# == 4 && $1 == -k20s && $2 == 1500s && $3 == bash && $4 == "$D/launcher.sh" ]] || return 92
 [[ ! -t 0 ]] || return 93
 printf 'ASSIGNMENT_AND_ARGUMENTS_PASS\n'
 return 37
}
source "$1"
STUB
cd "$work"
set +e
bash stub.sh call.sh
rc=$?
set -e
[[ $rc == 37 ]]
grep -Fx ASSIGNMENT_AND_ARGUMENTS_PASS console.log
# Reproduce the failed broad replacement; a syntactically valid shell line must still fail the oracle.
sed 's@AUDIT@/broken/audit@g' call.sh > broken.sh
set +e
bash stub.sh broken.sh
rc=$?
set -e
[[ $rc == 127 ]]
if grep -Fx ASSIGNMENT_AND_ARGUMENTS_PASS console.log; then exit 1; fi
printf 'PASS paths, invalid inputs, literal assignment/arguments/status, original discrimination\n'
# Exercise the real spawn/trap/status tail with a harmless timed observer, never a Docker daemon.
sed -n '/^cleanup_observer()/,$p' "$script" > lifecycle.sh
cat > lifecycle-stub.sh <<'LIFECYCLE'
set -euo pipefail
D=/fixture
A=/fixture-audit
start=0
mode=$1
timeout() {
 if [[ $1 == -k3s ]]; then
  printf '%s\n' "$BASHPID" > observer.pid
  exec /usr/bin/timeout -k1s 30s sleep 30
 fi
 case "$mode" in
  status-failure) mkdir process.status; return 0;;
  failed-launch) mkdir process.status; return 37;;
  term) kill -TERM "$$"; return 0;;
  int) kill -INT "$$"; return 0;;
  success) return 0;;
 esac
}
source ../lifecycle.sh
LIFECYCLE
for mode in success status-failure failed-launch term int; do
 mkdir "$mode"
 set +e
 (cd "$mode" && bash ../lifecycle-stub.sh "$mode")
 outcome=$?
 set -e
 case "$mode" in
  success) [[ $outcome == 0 ]];;
  status-failure) [[ $outcome == 1 ]];;
  failed-launch) [[ $outcome == 37 ]];;
  term) [[ $outcome == 143 ]];;
  int) [[ $outcome == 130 ]];;
 esac
 [[ -s $mode/observer.pid && -s $mode/events.status ]]
 pid=$(cat "$mode/observer.pid")
 [[ $pid =~ ^[0-9]+$ ]]
 if kill -0 "$pid" 2>/dev/null; then echo 'observer survived cleanup' >&2; exit 1; fi
 grep -E '^observer_exit=[0-9]+$' "$mode/events.status"
done
printf 'PASS observer cleanup on success, write failure, failed launch, TERM and INT\n'
