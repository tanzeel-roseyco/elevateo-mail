#!/usr/bin/env bash
# AIDEV-NOTE: Real manifest tampering plus mocked dispatch/cleanup test wiring without a daemon or image build.
set -euo pipefail
root=${1:-/src}
source "$root/ops/tools/lane-c-app/source.sh"
source "$root/ops/tools/be01-services-app/dispatch.sh"
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir "$work/source" "$work/evidence"
TOOLS_SOURCE=$work/source; TOOLS_CONTEXT=selected; TOOLS_EVIDENCE=$work/evidence
evidence=$TOOLS_EVIDENCE
SERVICES_APP_PACKAGE_SHA=$(sha256sum "$root/ops/tools/be01-services-app/package.sha256" | cut -d ' ' -f 1)
manifests=(ops/tools/be01-services/package.sha256 ops/tools/be01-services/dependencies.sha256
  ops/tests/be01-services/package.sha256 ops/tests/fleet02-egress-source.sha256
  ops/tools/be01-services-app/package.sha256)
for manifest in "${manifests[@]}"; do
  mkdir -p "$TOOLS_SOURCE/$(dirname "$manifest")"
  cp "$root/$manifest" "$TOOLS_SOURCE/$manifest"
  while read -r digest path; do
    mkdir -p "$TOOLS_SOURCE/$(dirname "$path")"
    cp "$root/$path" "$TOOLS_SOURCE/$path"
  done < "$root/$manifest"
done
check_services_sources
# A changed allowlist must fail even if its remaining entries still verify.
sed -i '/dispatch.sh/d' "$TOOLS_SOURCE/ops/tools/be01-services-app/package.sha256"
if check_services_sources; then echo 'Changed new manifest accepted'; exit 1; fi
cp "$root/ops/tools/be01-services-app/package.sha256" "$TOOLS_SOURCE/ops/tools/be01-services-app/package.sha256"
child=ops/tools/be01-services/run.sh
printf '\n# tampered\n' >> "$TOOLS_SOURCE/$child"
if check_services_sources; then echo 'Changed child accepted'; exit 1; fi
cp "$root/$child" "$TOOLS_SOURCE/$child"
manifest=ops/tools/be01-services/package.sha256
printf '\n' >> "$TOOLS_SOURCE/$manifest"
if check_services_sources; then echo 'Changed manifest accepted'; exit 1; fi
cp "$root/$manifest" "$TOOLS_SOURCE/$manifest"
rm "$TOOLS_SOURCE/$child"
ln -s "$root/$child" "$TOOLS_SOURCE/$child"
if check_services_sources; then echo 'Symlink child accepted'; exit 1; fi
rm "$TOOLS_SOURCE/$child"; cp "$root/$child" "$TOOLS_SOURCE/$child"
printf '\n# drift\n' >> "$TOOLS_SOURCE/ops/tools/be01-services-app/dispatch.sh"
if check_services_sources; then echo 'New dispatch drift accepted'; exit 1; fi
cp "$root/ops/tools/be01-services-app/dispatch.sh" "$TOOLS_SOURCE/ops/tools/be01-services-app/dispatch.sh"
check_services_sources
# Mock only external dispatch and cleanup after exercising the real authentication checker above.
check_services_sources() { return "${auth_status:-0}"; }
check_sources() { return "${canonical_status:-0}"; }
bash() {
  [[ $# == 1 && $1 == "$TOOLS_SOURCE/$child" ]] || return 99
  [[ $BE01_SOURCE == "$TOOLS_SOURCE" && $BE01_CONTEXT == selected && $BE01_APP_IMAGE == "$image_id" &&
    $BE01_EVIDENCE == "$TOOLS_EVIDENCE" &&
    $BE01_PACKAGE_SHA == ad4773807748c99d23c763f2a6203a4cde276c68cca09ea6f9f030380252235d ]] || return 99
  printf 'dispatch\n' >> "$work/events"
  return "${child_status:-0}"
}
cleanup_tools() {
  local original=$?
  printf 'cleanup:%s\n' "$original" >> "$work/events"
  ((original == 0 && cleanup_status != 0)) && original=1
  exit "$original"
}
image_id=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
for tuple in '0 0 0 0 0' '7 0 0 0 7' '0 1 0 0 1' '7 1 0 0 7' '0 0 1 0 1' '0 0 0 1 1'; do
  read -r child_status final_auth canonical_status cleanup_status expected <<< "$tuple"
  : > "$work/events"; actual=0; auth_status=0
  (
    trap 'finish_services_app "$?"' EXIT
    result=0
    dispatch_services || result=$?
    auth_status=$final_auth
    exit "$result"
  ) || actual=$?
  [[ $actual == "$expected" && $(head -n 1 "$work/events") == dispatch &&
    $(grep -c '^cleanup:' "$work/events") == 1 ]]
done
: > "$work/events"; auth_status=1
if dispatch_services; then echo 'Unauthenticated dispatch accepted'; exit 1; fi
[[ ! -s $work/events ]]
auth_status=0; image_id=mutable:tag
if dispatch_services; then echo 'Mutable app reference accepted'; exit 1; fi
[[ ! -s $work/events ]]
printf 'services app orchestration synthetic PASS\n'
