#!/bin/bash
# AIDEV-NOTE: Exercise the actual staging entry point inside a disposable quality container only.
set -euo pipefail
[[ "${INITREPAIR_CONTAINER_TEST:-}" == 1 ]]
stage=/tmp/elevateo-initrepair20261023
outside=$(mktemp -d)
trap 'rm -rf "$outside" "$stage"' EXIT
mkdir -p /home/tanzeel/elevateo-mail-wave-20261014/control
reset_stage() {
  rm -rf "$stage"
  mkdir -p "$stage/apps/server/db/migrate"
  cp /source/migration42.reviewed.rb "$stage/migration42.reviewed.rb"
  printf 'untouched\n' > "$outside/sentinel"
}
for scenario in baseline root directory destination source manifest hard_destination hard_manifest; do
  reset_stage
  case "$scenario" in
    root) rm -rf "$stage"; ln -s "$outside" "$stage" ;;
    directory) rmdir "$stage/apps/server/db/migrate"; ln -s "$outside" "$stage/apps/server/db/migrate" ;;
    destination) ln -s "$outside/sentinel" "$stage/apps/server/db/migrate/20261023000042_allow_verified_enrollment_lock.rb" ;;
    source) rm "$stage/migration42.reviewed.rb"; ln -s /source/migration42.reviewed.rb "$stage/migration42.reviewed.rb" ;;
    manifest) ln -s "$outside/sentinel" "$stage/backend-final-source.sha256" ;;
    hard_destination) ln "$outside/sentinel" "$stage/apps/server/db/migrate/20261023000042_allow_verified_enrollment_lock.rb" ;;
    hard_manifest) ln "$outside/sentinel" "$stage/backend-final-source.sha256" ;;
  esac
  if bash stage-final.sh; then
    [[ "$scenario" == baseline ]]
    cmp /source/migration42.reviewed.rb "$stage/apps/server/db/migrate/20261023000042_allow_verified_enrollment_lock.rb"
  else
    [[ "$scenario" != baseline ]]
  fi
  [[ "$(cat "$outside/sentinel")" == untouched ]]
done
echo 'PASS: staging baseline plus five symlink and two hard-link rejection regressions'
