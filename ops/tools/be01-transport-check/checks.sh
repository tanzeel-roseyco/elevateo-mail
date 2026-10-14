#!/usr/bin/env bash
# AIDEV-NOTE: Authenticate transport mocks at UID10001; never invoke real recovery from this test container.
set -euo pipefail
cd /src
[[ $(id -u) == 10001 ]]
# AIDEV-NOTE: Mock transport needs no service/app manifests; real recovery keeps its historical oracle gates.
check_sources() {
  for manifest in ops/tools/be01-transport-check/package.sha256 ops/tests/fleet02-egress-source.sha256; do
    sha256sum -c "$manifest" || return 1
  done
}
check_sources
if [[ ${1:-} == --readability ]]; then exit 0; fi
[[ $# == 0 ]]
for tool in bash jq timeout sha256sum sed grep chmod mktemp wc; do command -v "$tool" >/dev/null; done
for file in ops/tools/be01-transport-check/*.sh docs/evidence/scripts/be01-capability-volume-transport{,-regression}.sh; do bash -n "$file"; done
bash docs/evidence/scripts/be01-capability-volume-transport-regression.sh /src/docs/evidence/scripts/be01-capability-volume-transport.sh
bash ops/tools/be01-transport-check/dependency-regression.sh /src
check_sources
printf 'PASS transport regression, syntax and source authentication\n'
