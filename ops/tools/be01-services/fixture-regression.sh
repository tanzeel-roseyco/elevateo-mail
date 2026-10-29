#!/usr/bin/env bash
# AIDEV-NOTE: Run the real fixture in cleanup's conditional shape; only Docker boundary functions are mocked.
set -euo pipefail
adapter=$(cd "$(dirname "$0")" && pwd)
source "$adapter/fixture.sh"
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
src=$tmp; evidence=$tmp; registry=$tmp/registry
mkdir "$registry"
task=fixture-regression; runtime=none; app=sha256:synthetic
absent() { [[ $1 == container ]]; }
daemon() {
  case $1 in
    create) return 0 ;;
    inspect)
      case $3 in
        '{{.State.Status}}') printf 'exited\n' ;;
        '{{.State.ExitCode}}') printf '%s\n' "$oracle_exit" ;;
        *) return 99 ;;
      esac ;;
    *) return 99 ;;
  esac
}
pin_container() { printf 'synthetic-id\n' > "$registry/$1.id"; }
daemon_for() { [[ $1 == 30s && $2 == start && $3 == -a && $4 == synthetic-id ]]; }
verify_container() { [[ -f $registry/$1.id ]]; }
remove_container() {
  removed=$1
  # A directory forces redirection failure even as root, without relying on chmod or a full filesystem.
  if [[ $inject_marker == true ]]; then mkdir "$registry/$1.gone"; fi
}
volume_verify() { verified=$1; }
exercise() {
  local label=$1 expected=$2 status=0
  removed=''; verified=''
  # Match volumes.sh exactly: errexit is suppressed throughout fixture, including nested functions.
  if fixture "$label" volume check-data && volume_verify data; then
    status=0
  else
    status=$?
  fi
  [[ $status == "$expected" && -n $removed ]]
  if [[ $expected == 0 ]]; then
    [[ $verified == data && -f $registry/$removed.gone ]]
  else
    [[ -z $verified ]]
  fi
  if [[ $inject_marker == true ]]; then [[ -d $registry/$removed.gone ]]; fi
}
oracle_exit=0; inject_marker=false
exercise success 0
oracle_exit=0; inject_marker=true
exercise marker-failure 1
oracle_exit=42; inject_marker=false
exercise oracle-failure 42
oracle_exit=42; inject_marker=true
exercise combined-failure 1
printf 'PASS real fixture conditional success, marker failure, oracle failure and combined failure\n'
