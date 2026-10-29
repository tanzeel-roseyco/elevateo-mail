#!/usr/bin/env bash
# AIDEV-NOTE: macOS: simulator build (unsigned) and env-gated signed archive. Linux: core build+test only.
# Signing credentials come ONLY from env vars; none set -> UNSIGNED DRY RUN; a partial set -> hard failure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
# shellcheck source=signing-helpers.sh
source "$SCRIPT_DIR/signing-helpers.sh"
BUNDLE_ID="co.elevateo.mail.ios"

OS="$(uname -s)"

if [[ "$OS" == "Linux" ]]; then
    echo "Linux host: building and testing ElevateoCore only."
    echo "The Elevateo iOS app target requires a macOS host with Xcode; it is NOT built here."
    cd ElevateoCore
    swift build
    swift test
    echo "ElevateoCore build and tests completed."
    exit 0
fi

if [[ "$OS" != "Darwin" ]]; then
    echo "Unsupported host '$OS'. Use macOS for the app target or Linux for the core package." >&2
    exit 1
fi

command -v xcodebuild >/dev/null || { echo "xcodebuild not found; install Xcode." >&2; exit 1; }

echo "== Core package tests (host) =="
(cd ElevateoCore && swift build && swift test)

echo "== Simulator build (unsigned) =="
xcodebuild \
    -project Elevateo.xcodeproj \
    -scheme Elevateo \
    -destination 'generic/platform=iOS Simulator' \
    -configuration Debug \
    CODE_SIGNING_ALLOWED=NO \
    build

# Signing env vars: all four must be present together.
TEAM_ID="${ELEVATEO_IOS_TEAM_ID:-}"
CERT_B64="${ELEVATEO_IOS_SIGNING_CERT_BASE64:-}"
CERT_PASSWORD="${ELEVATEO_IOS_SIGNING_CERT_PASSWORD:-}"
PROFILE_B64="${ELEVATEO_IOS_PROFILE_BASE64:-}"

set_count=0
for v in "$TEAM_ID" "$CERT_B64" "$CERT_PASSWORD" "$PROFILE_B64"; do
    [[ -n "$v" ]] && set_count=$((set_count + 1))
done

if [[ $set_count -eq 0 ]]; then
    echo "UNSIGNED DRY RUN: no signing environment variables set."
    echo "Simulator build succeeded; no archive/export was attempted."
    echo "Set ELEVATEO_IOS_TEAM_ID, ELEVATEO_IOS_SIGNING_CERT_BASE64, ELEVATEO_IOS_SIGNING_CERT_PASSWORD and ELEVATEO_IOS_PROFILE_BASE64 to produce a signed archive."
    exit 0
fi

if [[ $set_count -lt 4 ]]; then
    echo "ERROR: partial signing configuration ($set_count of 4 variables set)." >&2
    echo "Provide ALL of ELEVATEO_IOS_TEAM_ID, ELEVATEO_IOS_SIGNING_CERT_BASE64, ELEVATEO_IOS_SIGNING_CERT_PASSWORD, ELEVATEO_IOS_PROFILE_BASE64 — or none for an unsigned dry run." >&2
    exit 1
fi

echo "== Signed archive =="
WORK_DIR="$(mktemp -d)"
KEYCHAIN="$WORK_DIR/elevateo-build.keychain-db"
KEYCHAIN_PASSWORD="$(uuidgen)"
SAVED_SEARCH_LIST="$WORK_DIR/keychain-search-list.txt"
current_keychain_search_list > "$SAVED_SEARCH_LIST"
cleanup() {
    local status=0
    # The user's original keychain search list comes back first, success or failure.
    restore_keychain_search_list "$SAVED_SEARCH_LIST" || status=1
    if [[ -e "$KEYCHAIN" ]] && ! security delete-keychain "$KEYCHAIN"; then
        echo "ERROR: temporary build keychain $KEYCHAIN could not be deleted" >&2
        status=1
    fi
    rm -rf "$WORK_DIR"
    # A failed restore must fail the run even if the build itself succeeded.
    if [[ $status -ne 0 ]]; then exit $status; fi
}
trap cleanup EXIT

echo "$CERT_B64" | base64 -d > "$WORK_DIR/signing-cert.p12"
PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
mkdir -p "$PROFILE_DIR"
echo "$PROFILE_B64" | base64 -d > "$WORK_DIR/elevateo.mobileprovision"
PROFILE_UUID="$(security cms -D -i "$WORK_DIR/elevateo.mobileprovision" | plutil -extract UUID raw -o - -)"
cp "$WORK_DIR/elevateo.mobileprovision" "$PROFILE_DIR/$PROFILE_UUID.mobileprovision"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 1200 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$WORK_DIR/signing-cert.p12" -k "$KEYCHAIN" -P "$CERT_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
prepend_build_keychain "$KEYCHAIN" "$SAVED_SEARCH_LIST"

ARCHIVE_PATH="$WORK_DIR/Elevateo.xcarchive"
xcodebuild \
    -project Elevateo.xcodeproj \
    -scheme Elevateo \
    -destination 'generic/platform=iOS' \
    -configuration Release \
    -archivePath "$ARCHIVE_PATH" \
    CODE_SIGNING_ALLOWED=YES \
    CODE_SIGN_STYLE=Manual \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    PROVISIONING_PROFILE_SPECIFIER="$PROFILE_UUID" \
    archive

EXPORT_OPTIONS="$WORK_DIR/ExportOptions.plist"
write_export_options "$EXPORT_OPTIONS" "$TEAM_ID" "$BUNDLE_ID" "$PROFILE_UUID"

OUTPUT_DIR="$SCRIPT_DIR/dist"
mkdir -p "$OUTPUT_DIR"
xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS" \
    -exportPath "$OUTPUT_DIR"

echo "Signed export written to $OUTPUT_DIR"
