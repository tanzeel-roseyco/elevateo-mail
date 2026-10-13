#!/usr/bin/env bash
# AIDEV-NOTE: Only the parent tools container executes these frozen, socket-free synthetic checks.
set -euo pipefail
[[ -f /.dockerenv && ! -S /var/run/docker.sock ]]
cd /src
sha256sum -c ops/tests/fleet02-egress-source.sha256
sha256sum -c ops/tests/fleet02-egress-package.sha256
dpkg-query -W bash coreutils jq grep
for file in docs/evidence/scripts/be-01-r1-fleet02-compose-egress.sh \
  ops/tests/fleet02-egress-resources.sh ops/tests/fleet02-egress-compose.sh \
  ops/tests/egress-check-fleet02.sh ops/tests/fleet02-egress-regression.sh \
  ops/tests/fleet02-egress-context-regression.sh ops/tests/fleet02-egress-readiness-regression.sh \
  ops/tests/fleet02-egress-create-regression.sh \
  ops/tools/lane-c-synthetic/checks.sh ops/tools/lane-c-synthetic/parent-run.sh \
  ops/tools/lane-c-synthetic/cleanup.sh ops/tools/lane-c-synthetic/cleanup-regression.sh \
  ops/tools/lane-c-synthetic/run-container.sh ops/tools/lane-c-synthetic/preflight.sh \
  ops/tools/lane-c-synthetic/preflight-regression.sh; do
  bash -n "$file"
done
bash ops/tools/lane-c-synthetic/cleanup-regression.sh
bash ops/tools/lane-c-synthetic/preflight-regression.sh
ruby -c ops/tests/fleet02-egress-baked.rb
for name in regression context-regression readiness-regression create-regression; do
  printf 'synthetic=%s\n' "$name"
  bash "ops/tests/fleet02-egress-$name.sh"
done
