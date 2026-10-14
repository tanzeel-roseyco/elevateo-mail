#!/bin/sh
# MAC-814: target-OS release entrypoint. No automatic publish or credential creation.
set -eu
if [ "$(uname -s)" != Darwin ]; then
  echo 'MAC-814 requires a macOS runner; no DMG was built' >&2
  exit 2
fi
for name in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  case "$name" in
    APPLE_SIGNING_IDENTITY) present=${APPLE_SIGNING_IDENTITY-} ;;
    APPLE_ID) present=${APPLE_ID-} ;;
    APPLE_PASSWORD) present=${APPLE_PASSWORD-} ;;
    APPLE_TEAM_ID) present=${APPLE_TEAM_ID-} ;;
  esac
  if [ -z "$present" ]; then
    echo "MAC-814 missing $name; release stopped before build" >&2
    exit 2
  fi
done
case "$APPLE_SIGNING_IDENTITY" in
  'Developer ID Application:'*) ;;
  *) echo 'MAC-814 requires a Developer ID Application identity' >&2; exit 2 ;;
esac
for command in xcodebuild xcrun security cargo rustup npm shasum lipo codesign spctl; do
  command -v "$command" >/dev/null 2>&1 || { echo "MAC-814 missing tool: $command" >&2; exit 2; }
done
security find-identity -v -p codesigning | grep -F "$APPLE_SIGNING_IDENTITY" >/dev/null || {
  echo 'MAC-814 Developer ID identity not installed in keychain' >&2; exit 2;
}
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  rustup target list --installed | grep -x "$target" >/dev/null || {
    echo "MAC-814 missing Rust target: $target" >&2; exit 2;
  }
done
repo_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
[ -f "$repo_root/apps/native/src-tauri/Cargo.lock" ] || {
  echo 'MAC-814 requires reviewed Cargo.lock' >&2; exit 2;
}
[ -f "$repo_root/apps/web/package-lock.json" ] || exit 2
cd "$repo_root/apps/web"
npm ci
npm run build
cd "$repo_root/apps/native/src-tauri"
cargo tauri build --locked --target universal-apple-darwin --bundles dmg
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
codesign --verify --deep --strict --verbose "$app_bundle"
set -- target/universal-apple-darwin/release/bundle/dmg/*.dmg
[ "$#" -eq 1 ] && [ -f "$1" ] || { echo 'MAC-814 expected exactly one DMG' >&2; exit 1; }
xcrun stapler validate "$1"
spctl --assess --type open --context context:primary-signature --verbose "$1"
shasum -a 256 "$1" > "$1.sha256"
echo "MAC-814 candidate DMG: $1"
