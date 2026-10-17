#!/usr/bin/env bash
# AIDEV-NOTE: Docker-only no-socket checks distinguish startup refusal from invalid egress evidence.
set -euo pipefail
[[ -f /.dockerenv && ! -S /var/run/docker.sock ]]
source /src/ops/tests/egress-check-fleet02.sh
evidence=$(mktemp -d)
target() {
  printf 'target\n' >> "$evidence/targets"
  [[ $scenario != identity ]] || return 1
  printf 'verified-id\n'
}
probe() {
  [[ $1 == verified-id && $2 == 127.0.0.1 && $3 == 8025 ]] || return 1
  printf 'probe\n' >> "$evidence/probes"
  [[ $scenario != tool ]] || return 1
  case $scenario in
    immediate) printf '%s' "$connected" ;;
    eventual)
      if [[ $(wc -l < "$evidence/probes") == 3 ]]; then
        printf '%s' "$connected"
      else printf '%s' "$refused"; fi ;;
    exhausted) printf '%s' "$refused" ;;
    malformed) printf 'not-json' ;;
    denied) printf '{"outcome":"denied","default_route":false,"reason":"Errno::ENETUNREACH"}' ;;
    timeout) printf '{"outcome":"invalid","default_route":false,"reason":"Errno::ETIMEDOUT"}' ;;
    assertion) printf '%s' "$connected" ;;
    mixed) printf '%s\n%s' '{"outcome":"denied","default_route":false}' "$refused" ;;
    multiple) printf '%s\n%s' "$refused" "$refused" ;;
    connected_stream) printf '%s\n%s' "$refused" "$connected" ;;
    empty) printf '' ;;
    array) printf '[%s]' "$refused" ;;
    wrong_type) printf '{"outcome":"invalid","reason":"Errno::ECONNREFUSED","default_route":"false"}' ;;
  esac
}
assert_json() {
  [[ $scenario != assertion ]] || return 1
  [[ $1 == outcome && $2 == connected ]] || return 1
  jq -e '.outcome == "connected"' >/dev/null
}
sleep() { [[ $1 == 1 ]]; printf 'sleep\n' >> "$evidence/sleeps"; }
refused='{"outcome":"invalid","default_route":false,"reason":"Errno::ECONNREFUSED"}'
connected='{"outcome":"connected","default_route":false}'
for row in 'immediate 0 1 1 0' 'eventual 0 3 3 2' 'exhausted 1 5 5 4' \
  'identity 1 1 0 0' 'tool 1 1 1 0' 'malformed 1 1 1 0' \
  'denied 1 1 1 0' 'timeout 1 1 1 0' 'assertion 1 1 1 0' \
  'mixed 1 1 1 0' 'multiple 1 1 1 0' 'connected_stream 1 1 1 0' \
  'empty 1 1 1 0' 'array 1 1 1 0' 'wrong_type 1 1 1 0'; do
  read -r scenario expected targets probes sleeps <<< "$row"
  for log in targets probes sleeps; do : > "$evidence/$log"; done
  result=0
  wait_local_ready mailpit 8025 || result=$?
  [[ $result == "$expected" && $(wc -l < "$evidence/targets") == "$targets" &&
    $(wc -l < "$evidence/probes") == "$probes" && $(wc -l < "$evidence/sleeps") == "$sleeps" ]]
done
# The unchanged negative assertion path must never inherit readiness retries.
scenario=denied
: > "$evidence/probes"
if expect_probe verified-id 127.0.0.1 8025 denied; then exit 1; fi
[[ $(wc -l < "$evidence/probes") == 1 ]]
printf 'PASS bounded positive readiness and immediate failure paths; no daemon contacted\n'
