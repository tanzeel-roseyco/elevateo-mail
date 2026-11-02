#!/usr/bin/env bash
# Emit an immutable uninstall manifest from this release's published files.
set -euo pipefail
root="$(realpath "$1")"
test -d "$root"
# AIDEV-NOTE: checked enumeration must finish before output; process substitution hides find failures.
listing="$(mktemp -d)"
trap 'rm -rf "$listing"' EXIT
find "$root" -type f -print0 | sort -z > "$listing/files"
find "$root" -mindepth 1 -type d -print0 | sort -zr > "$listing/directories"
# AIDEV-NOTE: reject NSIS metacharacters rather than interpolating untrusted filenames as installer code.
validate_path() {
    if [[ ! "$1" =~ ^[a-zA-Z0-9._/\ -]+$ ]]; then
        echo "Unsupported publish path: $1" >&2
        exit 2
    fi
}
while IFS= read -r -d '' path; do
    relative="${path#"$root"/}"
    validate_path "$relative"
    printf '  Delete "$INSTDIR\\%s"\n' "${relative//\//\\}"
done < "$listing/files"
# Remove descendants first, and only when empty; user-created files/directories survive.
while IFS= read -r -d '' path; do
    relative="${path#"$root"/}"
    validate_path "$relative"
    printf '  RMDir "$INSTDIR\\%s"\n' "${relative//\//\\}"
done < "$listing/directories"
