#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# AIDEV-NOTE: fail if later packaging edits restore mutable image or distribution dependencies.
grep -Eq '^FROM .*@sha256:[0-9a-f]{64}$' build/Dockerfile
grep -Fq 'https://snapshot.debian.org/archive/debian/20260101T000000Z' build/Dockerfile
grep -Fq 'nsis=3.08-3+deb12u1 osslsigncode=2.5-4' build/Dockerfile
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/publish/nested directory"
printf 'stub' > "$fixture/publish/Elevateo.Windows.exe"
printf 'asset' > "$fixture/publish/nested directory/asset.txt"
bash build/uninstall-manifest.sh "$fixture/publish" > "$fixture/uninstall.nsh"
grep -F 'Delete "$INSTDIR\nested directory\asset.txt"' "$fixture/uninstall.nsh"
grep -F 'RMDir "$INSTDIR\nested directory"' "$fixture/uninstall.nsh"
if grep -E 'RMDir /r|Delete .*\*' "$fixture/uninstall.nsh" installer/elevateo.nsi; then
    echo 'FAIL: recursive or wildcard uninstall deletion' >&2
    exit 1
fi
# The script changes its cwd; all three input/output definitions must remain valid.
makensis -V2 -DVERSION=0.0.0 -DPUBLISH_DIR="$fixture/publish" \
    -DOUTFILE="$fixture/fixture.exe" -DUNINSTALL_MANIFEST="$fixture/uninstall.nsh" installer/elevateo.nsi
test -s "$fixture/fixture.exe"
printf 'bad' > "$fixture/publish/unsafe\$name"
if bash build/uninstall-manifest.sh "$fixture/publish" > /dev/null 2>&1; then
    echo 'FAIL: NSIS metacharacter accepted' >&2
    exit 1
fi
if bash build/uninstall-manifest.sh "$fixture/missing" > /dev/null 2>&1; then
    echo 'FAIL: missing publish directory accepted' >&2
    exit 1
fi
mkdir -p "$fixture/bin"
printf '#!/bin/sh\nexit 23\n' > "$fixture/bin/find"
chmod +x "$fixture/bin/find"
if PATH="$fixture/bin:$PATH" bash build/uninstall-manifest.sh "$fixture/publish" > "$fixture/failed.nsh" 2>/dev/null; then
    echo 'FAIL: enumeration failure accepted' >&2
    exit 1
fi
test ! -s "$fixture/failed.nsh"
# AIDEV-NOTE: stub only the expensive compiler to exercise the real staging and packaging flow.
mkdir -p "$fixture/project/build" "$fixture/project/artifacts/publish"
cp build/build-installer.sh build/uninstall-manifest.sh "$fixture/project/build/"
printf '0.0.0' > "$fixture/project/VERSION"
printf 'obsolete' > "$fixture/project/artifacts/publish/obsolete.dll"
cat > "$fixture/bin/dotnet" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = publish ]; then
    while [ "$#" -gt 0 ]; do
        if [ "$1" = -o ]; then printf current > "$2/current.dll"; break; fi
        shift
    done
fi
STUB
cat > "$fixture/bin/makensis" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
for argument in "$@"; do
    case "$argument" in
        -DPUBLISH_DIR=*) directory="${argument#*=}" ;;
    esac
done
test -f "$directory/current.dll"
test ! -e "$directory/obsolete.dll"
STUB
chmod +x "$fixture/bin/dotnet" "$fixture/bin/makensis"
rm "$fixture/bin/find"
PATH="$fixture/bin:$PATH" ELEVATEO_WIN_SIGN_PFX_BASE64= ELEVATEO_WIN_SIGN_PFX_PATH= \
    ELEVATEO_WIN_SIGN_PFX_PASSWORD= ELEVATEO_WIN_SIGN_TIMESTAMP_URL= \
    bash "$fixture/project/build/build-installer.sh"
test -f "$fixture/project/artifacts/publish/obsolete.dll"
printf 'PASS: ToolchainPinned InstallerAbsolutePaths UninstallExactManifest RejectUnsafeManifestPath MissingRoot EnumerationFailure FreshPublish\n'
