#!/bin/sh
# FC-MAC release entrypoint: builds the macOS .app and .dmg ready for notarization.
#
# Credentials come ONLY from environment variables (never flags, never files in the repo):
#   Signing:       APPLE_SIGNING_IDENTITY ("Developer ID Application: ..."), APPLE_TEAM_ID
#   Notarization:  APPLE_KEYCHAIN_PROFILE
#                  or APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER
#                  or APPLE_ID + APPLE_PASSWORD (team id from APPLE_TEAM_ID)
#   Updater:       TAURI_SIGNING_PRIVATE_KEY (+ optional TAURI_SIGNING_PRIVATE_KEY_PASSWORD)
#                  and ELEVATEO_UPDATER_PUBKEY (public verification key embedded in the app)
#   App config:    ELEVATEO_WEB_ORIGIN (required), ELEVATEO_UPDATE_MANIFEST_URL,
#                  ELEVATEO_OIDC_ISSUER, ELEVATEO_OIDC_CLIENT_ID (all public values)
#
# Modes:
#   No credential env at all  -> explicit UNSIGNED DRY RUN: validate config, print the exact
#                                commands that a signed run would execute, exit 0.
#   Some but not all          -> fail with the missing names; a half-signed artifact is worse
#                                than none.
#   --dry-run                 -> print commands instead of running them; also skips the macOS
#                                runner/tool checks so CI on Linux can validate config and logic.
#   --arch universal|arm64    -> build target (default universal).
#
# AIDEV-NOTE: test_macos_release.py asserts the mode decisions and the printed command order
# (codesign -> notarytool submit -> stapler staple); keep output lines stable.
set -eu

DRY_RUN=0
ARCH=universal
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --arch)
      shift
      case "${1-}" in
        universal|arm64) ARCH=$1 ;;
        *) echo 'FC-MAC --arch must be universal or arm64' >&2; exit 2 ;;
      esac ;;
    *) echo "FC-MAC unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

case "$ARCH" in
  universal) TARGET=universal-apple-darwin ;;
  arm64) TARGET=aarch64-apple-darwin ;;
esac

# ---- credential classification ----------------------------------------------------------------
have() { eval "[ -n \"\${$1-}\" ]"; }

SIGNING_VARS='APPLE_SIGNING_IDENTITY APPLE_TEAM_ID'
UPDATER_VARS='TAURI_SIGNING_PRIVATE_KEY ELEVATEO_UPDATER_PUBKEY'
NOTARY_ANY='APPLE_KEYCHAIN_PROFILE APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER APPLE_ID APPLE_PASSWORD'

any_credential=0
for name in $SIGNING_VARS $UPDATER_VARS $NOTARY_ANY; do
  if have "$name"; then any_credential=1; fi
done

notary_method=''
if have APPLE_KEYCHAIN_PROFILE; then
  notary_method=keychain-profile
elif have APPLE_API_KEY || have APPLE_API_KEY_ID || have APPLE_API_ISSUER; then
  for name in APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER; do
    have "$name" || { echo "FC-MAC partial notarization API-key credentials: missing $name" >&2; exit 2; }
  done
  notary_method=api-key
elif have APPLE_ID || have APPLE_PASSWORD; then
  for name in APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
    have "$name" || { echo "FC-MAC partial notarization Apple-ID credentials: missing $name" >&2; exit 2; }
  done
  notary_method=apple-id
fi

if [ "$any_credential" -eq 1 ]; then
  missing=''
  for name in $SIGNING_VARS $UPDATER_VARS; do
    have "$name" || missing="$missing $name"
  done
  [ -n "$notary_method" ] || missing="$missing (one notarization method: APPLE_KEYCHAIN_PROFILE, API key trio, or APPLE_ID+APPLE_PASSWORD)"
  if [ -n "$missing" ]; then
    echo "FC-MAC partial credentials; refusing a half-signed release. Missing:$missing" >&2
    exit 2
  fi
  SIGNED=1
else
  SIGNED=0
fi

if [ "$SIGNED" -eq 1 ]; then
  case "$APPLE_SIGNING_IDENTITY" in
    'Developer ID Application:'*) ;;
    *) echo 'FC-MAC requires a Developer ID Application identity' >&2; exit 2 ;;
  esac
fi

# ---- app configuration validation -------------------------------------------------------------
[ -n "${ELEVATEO_WEB_ORIGIN-}" ] || { echo 'FC-MAC missing ELEVATEO_WEB_ORIGIN' >&2; exit 2; }
case "$ELEVATEO_WEB_ORIGIN" in
  https://*/*|https://*@*|https://*\?*|https://*\#*|*' '*) echo 'FC-MAC requires a bare exact HTTPS origin' >&2; exit 2 ;;
  https://*.*) ;;
  *) echo 'FC-MAC requires a public exact HTTPS origin' >&2; exit 2 ;;
esac

repo_root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
src_tauri="$repo_root/apps/native/src-tauri"
[ -f "$src_tauri/Cargo.lock" ] || { echo 'FC-MAC requires reviewed Cargo.lock' >&2; exit 2; }
if command -v python3 >/dev/null 2>&1; then
  python3 "$repo_root/apps/native/validate_macos_config.py" "$src_tauri" || {
    echo 'FC-MAC static configuration validation failed' >&2; exit 2;
  }
else
  echo 'FC-MAC python3 unavailable; static configuration validation skipped' >&2
fi

# A run only executes commands when fully credentialed and not --dry-run; otherwise it prints them.
EXECUTE=1
if [ "$DRY_RUN" -eq 1 ] || [ "$SIGNED" -eq 0 ]; then EXECUTE=0; fi

# ---- runner and tool admission (only when commands will actually execute) -----------------------
if [ "$EXECUTE" -eq 1 ]; then
  if [ "$(uname -s)" != Darwin ]; then
    echo 'FC-MAC requires a macOS runner (use --dry-run elsewhere); no DMG was built' >&2
    exit 2
  fi
  for tool in xcodebuild xcrun security cargo rustup shasum lipo codesign spctl; do
    command -v "$tool" >/dev/null 2>&1 || { echo "FC-MAC missing tool: $tool" >&2; exit 2; }
  done
  if [ "$SIGNED" -eq 1 ]; then
    security find-identity -v -p codesigning | grep -F "$APPLE_SIGNING_IDENTITY" >/dev/null || {
      echo 'FC-MAC Developer ID identity not installed in keychain' >&2; exit 2;
    }
  fi
  if [ "$ARCH" = universal ]; then rust_targets='aarch64-apple-darwin x86_64-apple-darwin'; else rust_targets='aarch64-apple-darwin'; fi
  for rust_target in $rust_targets; do
    rustup target list --installed | grep -x "$rust_target" >/dev/null || {
      echo "FC-MAC missing Rust target: $rust_target" >&2; exit 2;
    }
  done
fi

# ---- command plan ------------------------------------------------------------------------------
# run NAME CMD...: executes in a signed run, prints the exact command in any dry run.
run() {
  step=$1; shift
  if [ "$EXECUTE" -eq 1 ]; then
    # Only the step name is echoed when executing: notarize arguments include APPLE_PASSWORD,
    # which must never reach a log.
    echo "FC-MAC step $step"
    "$@"
  else
    echo "DRY RUN [$step]: $*"
  fi
}

bundle_dir="target/$TARGET/release/bundle"
app_glob="$bundle_dir/macos/*.app"
dmg_glob="$bundle_dir/dmg/*.dmg"

cd "$src_tauri"
# AIDEV-NOTE: launch_origin requires this provenance marker; Tauri handles codesigning separately.
export ELEVATEO_NATIVE_ARTIFACT=unsigned-candidate

# tauri.macos.conf.json is merged automatically by filename convention on a macOS runner.
run build cargo tauri build --target "$TARGET" --bundles dmg,app -- --locked

if [ "$EXECUTE" -eq 1 ]; then
  set -- $app_glob
  [ "$#" -eq 1 ] && [ -d "$1" ] || { echo 'FC-MAC expected exactly one app bundle' >&2; exit 1; }
  app_bundle=$1
  app_name=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_bundle/Contents/Info.plist")
  case "$app_name" in ''|*/*) echo 'FC-MAC invalid app executable name' >&2; exit 1 ;; esac
  app_executable="$app_bundle/Contents/MacOS/$app_name"
  [ -f "$app_executable" ] || { echo 'FC-MAC app executable missing' >&2; exit 1; }
  architectures=$(lipo -archs "$app_executable")
  case " $architectures " in *' arm64 '*) ;; *) echo 'FC-MAC Apple Silicon slice missing' >&2; exit 1 ;; esac
  if [ "$ARCH" = universal ]; then
    case " $architectures " in *' x86_64 '*) ;; *) echo 'FC-MAC Intel slice missing' >&2; exit 1 ;; esac
  fi
  set -- $dmg_glob
  [ "$#" -eq 1 ] && [ -f "$1" ] || { echo 'FC-MAC expected exactly one DMG' >&2; exit 1; }
  dmg=$1
else
  app_bundle="$app_glob"
  dmg="$dmg_glob"
fi

run codesign-verify codesign --verify --deep --strict --verbose "$app_bundle"

if [ "$EXECUTE" -eq 1 ]; then
  case "$notary_method" in
    keychain-profile) run notarize xcrun notarytool submit "$dmg" --keychain-profile "$APPLE_KEYCHAIN_PROFILE" --wait ;;
    api-key)          run notarize xcrun notarytool submit "$dmg" --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait ;;
    apple-id)         run notarize xcrun notarytool submit "$dmg" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait ;;
  esac
else
  # Dry runs print env-var placeholders, never credential values.
  case "$notary_method" in
    api-key)  run notarize xcrun notarytool submit "$dmg" --key '$APPLE_API_KEY' --key-id '$APPLE_API_KEY_ID' --issuer '$APPLE_API_ISSUER' --wait ;;
    apple-id) run notarize xcrun notarytool submit "$dmg" --apple-id '$APPLE_ID' --password '$APPLE_PASSWORD' --team-id '$APPLE_TEAM_ID' --wait ;;
    *)        run notarize xcrun notarytool submit "$dmg" --keychain-profile '$APPLE_KEYCHAIN_PROFILE' --wait ;;
  esac
fi
run staple xcrun stapler staple "$dmg"
run staple-validate xcrun stapler validate "$dmg"
run gatekeeper spctl --assess --type open --context context:primary-signature --verbose "$dmg"
run checksum shasum -a 256 "$dmg"

if [ "$EXECUTE" -eq 1 ]; then
  shasum -a 256 "$dmg" > "$dmg.sha256"
  echo "FC-MAC candidate DMG: $dmg"
elif [ "$SIGNED" -eq 0 ]; then
  echo 'UNSIGNED DRY RUN: configuration validated; no signing, notarization or build was performed.'
else
  echo 'DRY RUN complete: configuration validated; the commands above are what a signed run executes.'
fi
