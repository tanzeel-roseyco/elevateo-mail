#!/usr/bin/env bash
# Builds, tests, publishes win-x64 and produces the NSIS installer (signed when credentials exist).
# Run inside the image from build/Dockerfile with the repo's apps/windows directory mounted at /workspace.
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION="$(tr -d '[:space:]' < VERSION)"
ARTIFACTS="$PWD/artifacts"
INSTALLER_UNSIGNED="$ARTIFACTS/ElevateoMail-Setup-$VERSION-unsigned.exe"
INSTALLER_SIGNED="$ARTIFACTS/ElevateoMail-Setup-$VERSION.exe"
mkdir -p "$ARTIFACTS"
# AIDEV-NOTE: fresh staging prevents removed binaries from leaking into subsequent installers.
PUBLISH_DIR="$(mktemp -d "$ARTIFACTS/publish.XXXXXX")"
PFX_TEMP=""
cleanup() {
    rm -rf "$PUBLISH_DIR"
    if [ -n "$PFX_TEMP" ]; then rm -f "$PFX_TEMP"; fi
}
trap cleanup EXIT

echo "==> restore"
dotnet restore Elevateo.Windows.sln

echo "==> test"
dotnet test Elevateo.Windows.sln -c Release --no-restore

echo "==> publish win-x64 self-contained"
dotnet publish src/Elevateo.Windows/Elevateo.Windows.csproj \
    -c Release -r win-x64 --self-contained true \
    -o "$PUBLISH_DIR"

bash build/uninstall-manifest.sh "$PUBLISH_DIR" > "$ARTIFACTS/uninstall-files.nsh"
echo "==> makensis"
makensis -DVERSION="$VERSION" -DPUBLISH_DIR="$PUBLISH_DIR" \
    -DOUTFILE="$INSTALLER_UNSIGNED" -DUNINSTALL_MANIFEST="$ARTIFACTS/uninstall-files.nsh" installer/elevateo.nsi

# Signing credential policy:
#  - all of PFX (base64 or path), password and timestamp URL set -> sign
#  - none set -> unsigned dry run (explicitly labelled)
#  - a partial set is a configuration error -> fail loudly, never ship half-configured signing
PFX_B64="${ELEVATEO_WIN_SIGN_PFX_BASE64:-}"
PFX_PATH="${ELEVATEO_WIN_SIGN_PFX_PATH:-}"
PFX_PASSWORD="${ELEVATEO_WIN_SIGN_PFX_PASSWORD:-}"
TS_URL="${ELEVATEO_WIN_SIGN_TIMESTAMP_URL:-}"

have_pfx=0
if [ -n "$PFX_B64" ] || [ -n "$PFX_PATH" ]; then have_pfx=1; fi

if [ "$have_pfx" -eq 0 ] && [ -z "$PFX_PASSWORD" ] && [ -z "$TS_URL" ]; then
    echo "UNSIGNED DRY RUN: no signing credentials set; produced $INSTALLER_UNSIGNED"
    exit 0
fi

if [ "$have_pfx" -eq 0 ] || [ -z "$PFX_PASSWORD" ] || [ -z "$TS_URL" ]; then
    echo "ERROR: partial signing configuration." >&2
    echo "Set ALL of: ELEVATEO_WIN_SIGN_PFX_BASE64 (or ELEVATEO_WIN_SIGN_PFX_PATH)," >&2
    echo "ELEVATEO_WIN_SIGN_PFX_PASSWORD and ELEVATEO_WIN_SIGN_TIMESTAMP_URL — or none for a dry run." >&2
    exit 2
fi

echo "==> signing installer"
PFX_FILE="$PFX_PATH"
if [ -n "$PFX_B64" ]; then
    PFX_FILE="$(mktemp)"
    PFX_TEMP="$PFX_FILE"
    printf '%s' "$PFX_B64" | base64 -d > "$PFX_FILE"
fi
if [ ! -s "$PFX_FILE" ]; then
    echo "ERROR: signing certificate file is missing or empty." >&2
    exit 2
fi

# Password via env keeps it out of process listings of the argv-visible -pass form as much as
# osslsigncode allows; osslsigncode only takes -pass, so restrict this build to trusted runners.
osslsigncode sign \
    -pkcs12 "$PFX_FILE" -pass "$PFX_PASSWORD" \
    -t "$TS_URL" \
    -n "Elevateo Mail" \
    -in "$INSTALLER_UNSIGNED" -out "$INSTALLER_SIGNED"
osslsigncode verify -in "$INSTALLER_SIGNED" || {
    echo "ERROR: signature verification failed." >&2
    exit 2
}
rm -f "$INSTALLER_UNSIGNED"
echo "Signed installer: $INSTALLER_SIGNED"
