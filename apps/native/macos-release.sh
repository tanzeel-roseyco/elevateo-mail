#!/bin/sh
# MAC-814: target-OS release entrypoint. No automatic publish or credential creation.
set -eu
mode=${1-}
case "$mode" in
  ''|--unsigned-candidate) ;;
  *) echo 'usage: macos-release.sh [--unsigned-candidate]' >&2; exit 2 ;;
esac
if [ "$(uname -s)" != Darwin ]; then
  echo 'MAC-814 requires a macOS runner; no DMG was built' >&2
  exit 2
fi
[ -n "${ELEVATEO_WEB_ORIGIN-}" ] || {
  echo 'MAC-814 missing ELEVATEO_WEB_ORIGIN; stopped before build' >&2; exit 2;
}
case "$ELEVATEO_WEB_ORIGIN" in
  https://*/*|https://*@*|https://*\?*|https://*\#*|*" "*) echo 'MAC-814 requires a bare exact HTTPS origin' >&2; exit 2 ;;
  https://*.*) ;;
  *) echo 'MAC-814 requires a public exact HTTPS origin' >&2; exit 2 ;;
esac
authority=${ELEVATEO_WEB_ORIGIN#https://}
host=${authority%%:*}
if [ "$authority" != "$host" ]; then
  port=${authority#*:}
  case "$port" in ''|*[!0-9]*) echo 'MAC-814 invalid origin port' >&2; exit 2 ;; esac
fi
host=$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')
case "$host" in
  localhost|*.localhost|example.com|*.example.com|*.invalid|*.test)
    echo 'MAC-814 placeholder origin refused' >&2; exit 2 ;;
  *[!0-9.]* ) ;;
  *) echo 'MAC-814 IP origin refused' >&2; exit 2 ;;
esac
if [ -z "$mode" ]; then
  for name in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
    case "$name" in
      APPLE_SIGNING_IDENTITY) present=${APPLE_SIGNING_IDENTITY-} ;;
      APPLE_ID) present=${APPLE_ID-} ;;
      APPLE_PASSWORD) present=${APPLE_PASSWORD-} ;;
      APPLE_TEAM_ID) present=${APPLE_TEAM_ID-} ;;
    esac
    [ -n "$present" ] || { echo "MAC-814 missing $name; release stopped before build" >&2; exit 2; }
  done
  case "$APPLE_SIGNING_IDENTITY" in
    'Developer ID Application:'*) ;;
    *) echo 'MAC-814 requires a Developer ID Application identity' >&2; exit 2 ;;
  esac
fi
for command in xcodebuild xcrun cargo rustup shasum lipo python3; do
  command -v "$command" >/dev/null 2>&1 || { echo "MAC-814 missing tool: $command" >&2; exit 2; }
done
if [ -z "$mode" ]; then
  for command in security codesign spctl; do
    command -v "$command" >/dev/null 2>&1 || { echo "MAC-814 missing tool: $command" >&2; exit 2; }
  done
  security find-identity -v -p codesigning | grep -F "$APPLE_SIGNING_IDENTITY" >/dev/null || {
    echo 'MAC-814 Developer ID identity not installed in keychain' >&2; exit 2;
  }
fi
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  rustup target list --installed | grep -x "$target" >/dev/null || {
    echo "MAC-814 missing Rust target: $target" >&2; exit 2;
  }
done
repo_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
[ -f "$repo_root/apps/native/src-tauri/Cargo.lock" ] || {
  echo 'MAC-814 requires reviewed Cargo.lock' >&2; exit 2;
}
python3 "$repo_root/apps/native/validate_macos_config.py" "$repo_root/apps/native/src-tauri"
cd "$repo_root/apps/native/src-tauri"
build_started=$(date +%s)
if [ "$mode" = --unsigned-candidate ]; then
  # AIDEV-NOTE: Candidate mode has no Apple identity and must never inherit notarization credentials.
  unset APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
  cargo tauri build --no-sign --target universal-apple-darwin --bundles dmg -- --locked
else
  cargo tauri build --target universal-apple-darwin --bundles dmg -- --locked
fi
set -- target/universal-apple-darwin/release/bundle/macos/*.app
[ "$#" -eq 1 ] && [ -d "$1" ] || { echo 'MAC-814 expected exactly one app bundle' >&2; exit 1; }
app_bundle=$1
app_name=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_bundle/Contents/Info.plist")
case "$app_name" in ''|*/*) echo 'MAC-814 invalid app executable name' >&2; exit 1;; esac
app_executable="$app_bundle/Contents/MacOS/$app_name"
[ -f "$app_executable" ] || { echo 'MAC-814 app executable missing' >&2; exit 1; }
architectures=$(lipo -archs "$app_executable")
case " $architectures " in *" x86_64 "*) ;; *) echo 'MAC-814 Intel slice missing' >&2; exit 1;; esac
case " $architectures " in *" arm64 "*) ;; *) echo 'MAC-814 Apple Silicon slice missing' >&2; exit 1;; esac
set -- target/universal-apple-darwin/release/bundle/dmg/*.dmg
[ "$#" -eq 1 ] && [ -f "$1" ] || { echo 'MAC-814 expected exactly one DMG' >&2; exit 1; }
artifact_modified=$(stat -f %m "$1")
[ "$artifact_modified" -ge "$build_started" ] || { echo 'MAC-814 stale DMG refused' >&2; exit 1; }
if [ "$mode" = --unsigned-candidate ]; then
  candidate_dir=target/native-candidates/unsigned
  mkdir -p "$candidate_dir"
  candidate="$candidate_dir/$(basename "$1" .dmg)-unsigned-candidate.dmg"
  cp "$1" "$candidate"
  shasum -a 256 "$candidate" > "$candidate.sha256"
  echo "MAC-814 UNSIGNED TEST-ONLY candidate DMG: $candidate"
  exit 0
fi
codesign --verify --deep --strict --verbose "$app_bundle"
xcrun stapler validate "$1"
spctl --assess --type open --context context:primary-signature --verbose "$1"
shasum -a 256 "$1" > "$1.sha256"
echo "MAC-814 candidate DMG: $1"
