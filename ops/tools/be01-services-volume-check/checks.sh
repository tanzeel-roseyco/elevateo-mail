#!/usr/bin/env bash
# AIDEV-NOTE: Mounted checks replace only historical baked checks; the reviewed image recipe stays unchanged.
set -euo pipefail
cd /src
[[ $(id -u) == 10001 ]]
check_sources() {
  for manifest in ops/tools/be01-services-volume-check/package.sha256 ops/tools/be01-services/package.sha256 ops/tools/be01-services/dependencies.sha256 ops/tests/be01-services/package.sha256 ops/tests/fleet02-egress-source.sha256 ops/tools/be01-services-app/package.sha256 ops/tools/lane-c-app/app.sha256; do
    sha256sum -c "$manifest" || return 1
  done
}
check_sources
if [[ ${1:-} == --readability ]]; then exit 0; fi
[[ $# == 0 ]]
for tool in bash jq sha256sum sed cp cut grep head; do command -v "$tool" >/dev/null; done
for file in ops/tools/be01-services-volume-check/*.sh ops/tools/be01-services/profile-regression.sh ops/tools/be01-services/stack.sh ops/tools/be01-services/stack-regression.sh ops/tools/be01-services-app/dispatch.sh ops/tools/be01-services-app/regression.sh; do bash -n "$file"; done
bash ops/tools/be01-services/profile-regression.sh
bash ops/tools/be01-services/stack-regression.sh /src
bash ops/tools/be01-services-app/regression.sh /src
check_sources
printf 'PASS capability profile, volume nine-case and app coupling regressions; syntax and source authentication\n'
