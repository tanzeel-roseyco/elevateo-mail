#!/usr/bin/env bash
# AIDEV-NOTE: Socket-free Docker-only checks for the new orchestration boundaries, not daemon lifecycle proof.
set -euo pipefail
root=${1:-/src}
source "$root/ops/tools/lane-c-app/source.sh"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
evidence=$work
cd "$work"
calls=$work/calls
docker() { printf '%s\n' "$*" >> "$calls"; [[ $* != *missing* ]]; }
for n in 1 2 3 4 5; do printf '    image: service%s@sha256:%064d\n' "$n" "$n"; done > compose.yaml
preflight_images
[[ $(wc -l < "$calls") == 5 ]]
sed -i 's/service3/missing/' compose.yaml
if preflight_images; then echo 'Missing image accepted'; exit 1; fi
printf '    image: unpinned:latest\n' > compose.yaml
if preflight_images; then echo 'Unpinned image inventory accepted'; exit 1; fi
check_sources() { return "${source_status:-0}"; }
cleanup_tools() { local status=$?; printf '%s\n' "$status" > "$work/status"; exit "$status"; }
for pair in '0 0 0' '0 1 1' '7 0 7' '7 1 7'; do
  read -r original source_status expected <<< "$pair"
  actual=0
  (finish_app "$original") || actual=$?
  [[ $actual == "$expected" && $(cat "$work/status") == "$expected" ]]
done
# Exercise the real source gate with a minimal, isolated manifest tree.
source "$root/ops/tools/lane-c-app/source.sh"
TOOLS_SOURCE=$work
mkdir -p ops/tests ops/tools/lane-c-synthetic ops/tools/lane-c-app apps/server/bin
for bin in rails worker worker-health; do printf '#!/bin/sh\n' > "apps/server/bin/$bin"; chmod 755 "apps/server/bin/$bin"; done
printf 'pinned\n' > payload
for manifest in ops/tests/fleet02-egress-source.sha256 ops/tests/fleet02-egress-package.sha256 \
  ops/tools/lane-c-synthetic/tools.sha256 ops/tools/lane-c-app/app.sha256; do
  sha256sum payload > "$manifest"
done
check_sources
printf 'changed\n' > payload
if check_sources; then echo 'Hash drift accepted'; exit 1; fi
printf 'pinned\n' > outside
rm payload; ln -s outside payload
if check_sources; then echo 'Symlink accepted'; exit 1; fi
rm payload; cp outside payload
chmod 644 apps/server/bin/rails
if check_sources; then echo 'Nonexecutable Rails accepted'; exit 1; fi
printf 'app orchestration synthetic PASS\n'
