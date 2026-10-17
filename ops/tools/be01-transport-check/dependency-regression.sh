#!/usr/bin/env bash
# AIDEV-NOTE: Exercise both real authentication functions without running parent Docker or real recovery.
set -euo pipefail
source_root=${1:?Authenticated source root required}
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
package=ops/tools/be01-transport-check/package.sha256
canonical=ops/tests/fleet02-egress-source.sha256
mkdir "$work/tree"
# Only declared transitive inputs enter the fixture; unused service/app manifests must remain absent.
copy_manifest() {
  local manifest=$1 digest path
  while read -r digest path; do
    [[ $digest =~ ^[a-f0-9]{64}$ && $path != /* && $path != *..* ]]
    mkdir -p "$work/tree/$(dirname "$path")"
    cp "$source_root/$path" "$work/tree/$path"
  done < "$source_root/$manifest"
}
copy_manifest "$package"
copy_manifest "$canonical"
cp "$source_root/$package" "$work/tree/$package"
export TRANSPORT_CHECK_PACKAGE_SHA
TRANSPORT_CHECK_PACKAGE_SHA=$(sha256sum "$source_root/$package"); TRANSPORT_CHECK_PACKAGE_SHA=${TRANSPORT_CHECK_PACKAGE_SHA%% *}
for script in parent-run checks; do
  # Extract only the actual top-level function; assert exactly one complete definition before sourcing.
  sed -n '/^check_sources() {$/,/^}$/p' "$source_root/ops/tools/be01-transport-check/$script.sh" > "$work/$script.function"
  [[ $(grep -c '^check_sources() {$' "$work/$script.function") == 1 ]]
  [[ $(tail -n 1 "$work/$script.function") == '}' ]]
  source "$work/$script.function"
  cd "$work/tree"
  for unused in ops/tools/be01-services/package.sha256 ops/tools/be01-services/dependencies.sha256 ops/tests/be01-services/package.sha256 ops/tools/be01-services-app/package.sha256 ops/tools/lane-c-app/app.sha256; do
    [[ ! -e $unused ]]
  done
  check_sources > "$work/$script.baseline.log" 2>&1
  # Conditional invocation deliberately suppresses errexit: explicit authentication returns must reject drift.
  while read -r digest path; do
    cp "$path" "$work/saved"
    printf '\nDRIFT\n' >> "$path"
    if check_sources > "$work/rejection.log" 2>&1; then echo "FAIL $script accepts drift: $path"; exit 1; fi
    cp "$work/saved" "$path"
  done < "$source_root/$package"
  read -r digest path < "$source_root/$canonical"
  cp "$path" "$work/saved"
  printf '\nDRIFT\n' >> "$path"
  if check_sources > "$work/rejection.log" 2>&1; then echo "FAIL $script accepts canonical source drift"; exit 1; fi
  cp "$work/saved" "$path"
  # Outer manifest authentication belongs to the parent; reject even a valid subset manifest there.
  if [[ $script == parent-run ]]; then
    cp "$package" "$work/package.saved"
    tail -n +2 "$package" > "$work/subset"
    cp "$work/subset" "$package"
    if check_sources > "$work/rejection.log" 2>&1; then echo 'FAIL parent accepts altered package'; exit 1; fi
    cp "$work/package.saved" "$package"
  fi
  check_sources > "$work/$script.restored.log" 2>&1
  # Original dependency-list behavior must reject this otherwise authentic tree, proving discrimination.
  sed 's@for manifest in @for manifest in ops/tools/be01-services/package.sha256 @' "$work/$script.function" > "$work/original.function"
  source "$work/original.function"
  if check_sources > "$work/original.log" 2>&1; then echo "FAIL $script original dependency not discriminated"; exit 1; fi
  printf 'PASS %s dependency boundary, used-file drift, canonical drift and original discrimination\n' "$script"
done
