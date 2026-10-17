#!/usr/bin/env bash
# AIDEV-NOTE: Exercise the frozen transport shell; only fixed paths and external boundaries are mocked.
set -euo pipefail
source_file=${1:?Frozen transport script path}
printf '%s  %s\n' 44bbb5de36b813a5f68b68d894fc50e2ec400fe1271e9143aad5ceccec93b1a7 "$source_file" | sha256sum -c -
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir "$work/bin" "$work/audit"
export TEST_AUDIT=$work/audit TEST_TRACE=$work/trace
# One exact fixed-path substitution permits UID10001/socket-free execution; logic remains byte-for-byte otherwise.
sed "s|^AUDIT=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-recovery-validation-audit.DIGxywd8$|AUDIT=$TEST_AUDIT|" "$source_file" > "$work/transport.sh"
[[ $(grep -c '^AUDIT=' "$work/transport.sh") == 1 ]]
cat > "$work/bin/hostname" <<'MOCK'
#!/bin/bash
printf 'Ubuntu-noble-latest-amd64-base\n'
MOCK
cat > "$work/bin/docker" <<'MOCK'
#!/bin/bash
set -eu
[[ $1 == --context && $2 == default ]]; shift 2
if [[ $1 == context ]]; then printf 'unix:///var/run/docker.sock\n'; exit; fi
[[ $1 == container && $2 == ls ]]
[[ ${TEST_DAEMON_FAIL:-0} == 0 ]] || exit 37
[[ ${TEST_PRESENT:-0} == 0 ]] || printf '%s\n' 4e6e0384c68c53a8dc5a399ac29475bd512a1c9944495c18b346d60a4a0f3c4f
MOCK
cat > "$work/bin/sha256sum" <<'MOCK'
#!/bin/bash
# The unchanged invoke file is unavailable here; validate the requested authentication boundary exactly.
set -eu
[[ $1 == -c && $2 == - ]]
IFS= read -r line
[[ $line == "98d543f4ca570473a6f2e19bc0f1e8f300d810c510726a833faebc5a310597ee  $TEST_AUDIT/invoke.sh" ]]
MOCK
cat > "$work/audit/invoke.sh" <<'MOCK'
#!/bin/bash
set -eu
if IFS= read -r unexpected; then exit 91; fi
printf 'invoked\n' >> "$TEST_TRACE"
exit "${TEST_INVOKE_EXIT:-0}"
MOCK
chmod 0755 "$work/bin/hostname" "$work/bin/docker" "$work/bin/sha256sum"
export PATH="$work/bin:$PATH"
unset DOCKER_HOST DOCKER_TLS_VERIFY DOCKER_CERT_PATH
run_case() {
  local label=$1 present=$2 daemon=$3 child=$4 expected=$5 invoked=$6 rc
  rm -rf -- "$TEST_AUDIT/volume-transport-r2"
  : > "$TEST_TRACE"
  printf 'must-not-reach-child\n' > "$work/input"
  set +e
  TEST_PRESENT=$present TEST_DAEMON_FAIL=$daemon TEST_INVOKE_EXIT=$child timeout -k 2s 10s /bin/bash "$work/transport.sh" < "$work/input" > "$work/$label.log" 2>&1
  rc=$?
  set -e
  [[ $rc == "$expected" && $(wc -l < "$TEST_TRACE") == "$invoked" ]]
  grep -Fx "transport_exit=$expected phase=$([[ $invoked == 1 ]] && printf finished || printf guard)" "$TEST_AUDIT/volume-transport-r2/status" >/dev/null
  if [[ $invoked == 1 ]]; then
    grep -Fx "invoke_process_exit=$child" "$TEST_AUDIT/volume-transport-r2/invoke.status" >/dev/null
  else [[ ! -e $TEST_AUDIT/volume-transport-r2/invoke.status ]]; fi
  printf 'PASS %s\n' "$label"
}
run_case absent 0 0 0 0 1
run_case present 1 0 0 1 0
run_case daemon-failure 0 1 0 37 0
run_case invoke-failure 0 0 23 23 1
# Discriminate the old shell failure: unquoted alternation becomes a pipeline command, never an ID predicate.
set +e
/bin/bash -c 'grep -E absent|historical_probe_id_not_a_command /dev/null' </dev/null > "$work/original.log" 2>&1
original_exit=$?
set -e
[[ $original_exit == 127 ]]
grep -F 'historical_probe_id_not_a_command: command not found' "$work/original.log" >/dev/null
printf 'PASS original-shell-quoting-discrimination (Windows SSH transport still pending)\n'
