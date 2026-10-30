#!/usr/bin/env bash
# AIDEV-NOTE: Socket-free checks of the new parent coupling; mocked cleanup is not real lifecycle proof.
set -euo pipefail
for tool in bash sha256sum cut mkdir cp mktemp rm dirname sed grep wc cat tee head; do command -v "$tool" >/dev/null; done
cd /src
[[ $(id -u) == 10001 ]]
printf '%s  %s\n' 6721b35694543a6e758df4547fa145491e737f8f9bb05a3e2ef7ffaefd35238f ops/tools/be01-services-app/package.sha256 | sha256sum -c -
sha256sum -c ops/tools/be01-services-app/package.sha256
# AIDEV-NOTE: The regression sources the frozen Lane C helper; authenticate it before and after execution.
printf '%s  %s\n' 1eeeca5c896bc1082e43202478b5816e8d909efdf0c40e712c367df4ad50f9c4 ops/tools/lane-c-app/app.sha256 | sha256sum -c -
sha256sum -c ops/tools/lane-c-app/app.sha256
for file in ops/tools/be01-services-app/*.sh ops/tools/be01-services-app-check/*.sh; do bash -n "$file"; done
bash ops/tools/be01-services-app-check/regression.sh
bash ops/tools/be01-services-app/regression.sh
sha256sum -c ops/tools/be01-services-app/package.sha256
# AIDEV-NOTE: The regression sources the frozen Lane C helper; authenticate it before and after execution.
printf '%s  %s\n' 1eeeca5c896bc1082e43202478b5816e8d909efdf0c40e712c367df4ad50f9c4 ops/tools/lane-c-app/app.sha256 | sha256sum -c -
sha256sum -c ops/tools/lane-c-app/app.sha256
printf 'PASS services-app syntax and socket-free coupling regression\n'
