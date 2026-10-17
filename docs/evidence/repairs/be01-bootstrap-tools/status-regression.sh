#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Exercise the production finalizer under errexit; fake daemon failures need no Docker socket.
[[ -f /.dockerenv && ! -S /var/run/docker.sock && $(id -u) == 10001 ]]
source_dir=$(cd "$(dirname "$0")" && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
cases=0
for row in '124 1 0 124 NOT_RUN' '0 1 0 1 NOT_RUN' \
           '124 0 1 124 1' '0 0 1 1 1' '124 0 0 124 0' '0 0 0 0 0'; do
  read -r test_status inspect_status ownership_status expected expected_owner <<< "$row"
  cases=$((cases + 1))
  evidence="$scratch/$cases"
  mkdir "$evidence"
  actual=0
  # AIDEV-NOTE: A separate bash keeps the production call outside an if/|| errexit-suppression context.
  timeout -k 1s 5s bash -c '
    set -euo pipefail
    source "$1/fixture-run.sh"
    evidence=$2; run_id=fixture-test-id
    injected_inspect_exit=$3; injected_ownership_exit=$4
    # AIDEV-NOTE: Distinct names avoid Bash dynamic-scope shadowing by production finalizer locals.
    docker() { [[ $* == "inspect fixture-test-id" ]] || return 99; return "$injected_inspect_exit"; }
    owned_run() { printf called > "$evidence/ownership.called"; return "$injected_ownership_exit"; }
    finish_fixture "$5"
  ' fixture-regression "$source_dir" "$evidence" "$inspect_status" "$ownership_status" "$test_status" || actual=$?
  [[ $actual == "$expected" ]]
  [[ $(cat "$evidence/fixture.status") == "test_exit=$test_status" ]]
  printf 'inspect_exit=%s\nownership_exit=%s\n' "$inspect_status" "$expected_owner" > "$evidence/expected"
  cmp "$evidence/expected" "$evidence/fixture.verification.status"
  if [[ $expected_owner == NOT_RUN ]]; then [[ ! -e $evidence/ownership.called ]];
  else [[ -f $evidence/ownership.called ]]; fi
done
printf 'PASS fixture status precedence: %s cases\n' "$cases"
