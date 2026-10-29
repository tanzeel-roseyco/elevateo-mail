#!/usr/bin/env bash
# AIDEV-NOTE: Exercise actual parent functions with external Docker/checksum boundaries injected, never a daemon.
set -euo pipefail
root=${1:-/src}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
parent=$root/ops/tools/be01-services-app-check/parent-run.sh
sed -n '/^check_sources() {$/,/^}$/p' "$parent" > "$work/auth.sh"
sed -n '/^cleanup() {$/,/^}$/p' "$parent" > "$work/cleanup.sh"
[[ -s $work/auth.sh && -s $work/cleanup.sh ]]
source "$work/auth.sh"
APP_CHECK_PACKAGE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
# Use real hashes for the imported helper; other manifests are outside this isolated drift case.
(
  mkdir -p "$work/helper/ops/tools/lane-c-app"
  cp "$root/ops/tools/lane-c-app/"* "$work/helper/ops/tools/lane-c-app/"
  cd "$work/helper"
  sha256sum() {
    local input=''
    if [[ $2 == - ]]; then
      IFS= read -r input
      if [[ $input == *' ops/tools/lane-c-app/app.sha256' ]]; then
        printf '%s\n' "$input" | command sha256sum -c -
        return $?
      fi
    elif [[ $2 == ops/tools/lane-c-app/app.sha256 ]]; then
      command sha256sum "$@"; return $?
    fi
    return 0
  }
  check_sources
  printf '\n# helper drift\n' >> ops/tools/lane-c-app/source.sh
  if check_sources; then echo 'Imported helper drift accepted'; exit 1; fi
)
# Each pipeline runs in a subshell; the file log makes injected call ordering observable.
sha256sum() {
  local input='' number
  [[ $2 != - ]] || IFS= read -r input
  printf '%s %s\n' "$2" "$input" >> "$work/auth.calls"
  number=$(wc -l < "$work/auth.calls")
  [[ $number != "$fail_at" ]] || return 41
  return 0
}
fail_at=0; : > "$work/auth.calls"
check_sources
[[ $(wc -l < "$work/auth.calls") == 12 ]]
# Fail each pin/manifest with errexit disabled and a successful final manifest available.
for fail_at in 1 2 3 4 5 6 7 8 9 10 11 12; do
  : > "$work/auth.calls"
  set +e
  check_sources
  result=$?
  set -e
  [[ $result == 41 && $(wc -l < "$work/auth.calls") == "$fail_at" ]]
done
# Discriminate the original swallowed failure: only remove the explicit failure returns.
sed 's/ || return $?//g' "$work/auth.sh" > "$work/original-auth.sh"
(
  source "$work/original-auth.sh"
  fail_at=1; : > "$work/auth.calls"
  set +e
  check_sources
  result=$?
  [[ $result == 0 && $(wc -l < "$work/auth.calls") == 12 ]]
)
source "$work/cleanup.sh"
snapshot() { printf 'same\n'; }
daemon() {
  if [[ $1 == rm ]]; then return "$remove_status"; fi
  [[ $1 == container && $2 == ls ]] || return 99
  printf '[]\n'
}
jq() { cat >/dev/null; return 0; }
check_sources() { return "$auth_status"; }
id=exact-test-id; name=exact-test-name; fingerprint=same
evidence=$work/evidence; mkdir "$evidence"
# Run the real EXIT trap in a process: a function return-only assertion would miss the original defect.
for tuple in '0 0 0 0' '0 1 0 1' '0 0 41 1' '7 0 0 7' '7 1 41 7'; do
  read -r original remove_status auth_status expected <<< "$tuple"
  actual=0
  (trap cleanup EXIT; exit "$original") || actual=$?
  [[ $actual == "$expected" ]]
  grep -q "test_exit=$original cleanup_failed=$remove_status source_exit=$auth_status " "$evidence/status"
done
# Original EXIT trap predicate returns false, yet an initially successful process still exits zero.
sed '/^  if \[\[ \$test_exit != 0 \]\]; then exit /,$d' "$work/cleanup.sh" > "$work/original-cleanup.sh"
printf '  [[ $test_exit == 0 && $cleanup_failed == 0 && $source_exit == 0 ]]\n}\n' >> "$work/original-cleanup.sh"
(
  source "$work/original-cleanup.sh"
  remove_status=1; auth_status=0; actual=0
  (trap cleanup EXIT; exit 0) || actual=$?
  [[ $actual == 0 ]]
)
printf 'PASS app-check authentication propagation and EXIT cleanup status; both originals discriminated\n'
