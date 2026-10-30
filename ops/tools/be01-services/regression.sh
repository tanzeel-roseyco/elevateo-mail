#!/usr/bin/env bash
# AIDEV-NOTE: Socket-free phase oracle; run only inside the reviewed Docker tools environment.
set -euo pipefail
adapter=$(cd "$(dirname "$0")" && pwd)
source "$adapter/phases.sh"
calls=()
fixture() { calls+=("$*"); }
observe restart
[[ ${calls[*]} == 'restart-services services check restart-database database compare restart-authorized authorized-storage restart-credentials credentials compare' ]]
calls=()
fixture() { calls+=("$*"); [[ $2 != database ]]; }
if observe restart; then echo 'FAIL swallowed database comparison' >&2; exit 1; fi
[[ ${#calls[@]} == 2 ]]
# Missing services state must prevent all later checks, even when caller uses an if condition.
calls=()
fixture() { calls+=("$*"); return 1; }
if observe restart; then echo 'FAIL swallowed services failure' >&2; exit 1; fi
[[ ${#calls[@]} == 1 ]]
printf 'PASS observation sequence and failure propagation\n'
