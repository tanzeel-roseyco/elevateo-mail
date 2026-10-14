#!/usr/bin/env bash
# AIDEV-NOTE: Exercise integrity failure on a disposable copy; never alter frozen evidence or the readonly source.
set -euo pipefail
cd /src
manifest=ops/tools/be01-services-tools-v2/package.sha256
sha256sum -c "$manifest"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
while read -r digest file; do
  mkdir -p "$work/$(dirname "$file")"
  cp "$file" "$work/$file"
done < "$manifest"
cp "$manifest" "$work/package.sha256"
(cd "$work"; sha256sum -c package.sha256)
printf '\n# tampered\n' >> "$work/ops/tools/be01-services-tools-v2/checks.sh"
if (cd "$work"; sha256sum -c package.sha256 > /dev/null 2>&1); then
  echo 'FAIL accepted tampered current package' >&2; exit 1
fi
printf 'PASS current closure and tamper rejection\n'
