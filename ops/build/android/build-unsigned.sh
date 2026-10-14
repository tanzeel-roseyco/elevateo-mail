#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Soren executes only inside a fleet Docker lease against a reviewed integrated source SHA.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
native_dir="$project_root/apps/native/src-tauri"
android_dir="$project_root/apps/android"
: "${ANDROID_HOME:?Android SDK required}"
: "${NDK_HOME:?Pinned Android NDK required}"
: "${JAVA_HOME:?JDK 17 required}"
: "${APK813_BUILD_ROOT:?Task-owned output directory required}"
export ELEVATEO_WEB_ORIGIN=https://app.elevateo.invalid
# Compile-only fixture: Orion rejects .invalid at runtime; this APK cannot prove login or launch.
printf "%s\n" "COMPILE_ONLY_ORIGIN=$ELEVATEO_WEB_ORIGIN"
[[ -f "$native_dir/Cargo.lock" ]] || { echo 'Reviewed apps/native Cargo.lock required' >&2; exit 2; }
[[ -f "$native_dir/tauri.conf.json" ]] || { echo 'Orion Tauri shell required' >&2; exit 2; }
[[ -f "$android_dir/tauri.android.conf.json" ]] || exit 2
[[ "$APK813_BUILD_ROOT" != "$project_root"* ]] || { echo 'Output must be outside source' >&2; exit 2; }
[[ "$(rustc --version)" == 'rustc 1.90.0 '* ]] || { echo 'Rust 1.90.0 required' >&2; exit 2; }
[[ "$(cargo tauri --version)" == 'tauri-cli 2.12.2' ]] || { echo 'Tauri CLI 2.12.2 required' >&2; exit 2; }
[[ "$(javac -version 2>&1)" == 'javac 17.'* ]] || { echo 'JDK 17 required' >&2; exit 2; }
[[ -d "$ANDROID_HOME/platforms/android-37" ]] || { echo 'Android API 37 required' >&2; exit 2; }
[[ -d "$ANDROID_HOME/build-tools/36.0.0" ]] || { echo 'Build Tools 36.0.0 required' >&2; exit 2; }
[[ "$(basename "$NDK_HOME")" == '28.2.13676358' ]] || { echo 'NDK 28.2.13676358 required' >&2; exit 2; }
rustup target list --installed | grep -Fx 'aarch64-linux-android' >/dev/null || { echo 'Android Rust target required' >&2; exit 2; }
mkdir -p "$APK813_BUILD_ROOT"
cd "$android_dir"
python3 -m unittest discover -s . -p "test_*.py"
cd "$native_dir"
cargo test --locked
cargo_lock_before="$(sha256sum Cargo.lock | cut -d " " -f 1)"
cargo tauri android init --ci --config "$android_dir/tauri.android.conf.json"
wrapper="$native_dir/gen/android/gradle/wrapper/gradle-wrapper.properties"
[[ -f "$wrapper" ]] || { echo 'Generated Gradle wrapper missing' >&2; exit 2; }
python3 "$android_dir/pin_gradle.py" "$wrapper"
cargo tauri android build --apk --target aarch64 --config "$android_dir/tauri.android.conf.json" -- --locked
[[ "$(sha256sum Cargo.lock | cut -d " " -f 1)" == "$cargo_lock_before" ]] || { echo "Cargo.lock changed during build" >&2; exit 2; }
mapfile -d '' apk_files < <(find "$native_dir/gen/android/app/build/outputs/apk" -type f -name '*unsigned.apk' -print0)
[[ "${#apk_files[@]}" -eq 1 ]] || { echo "Expected exactly one unsigned APK, found ${#apk_files[@]}" >&2; exit 2; }
manifest_permissions="$("$ANDROID_HOME/build-tools/36.0.0/aapt" dump permissions "${apk_files[0]}" | sed -n "s/.*uses-permission: name='\([^']*\)'.*/\1/p" | sort -u)"
[[ "$manifest_permissions" == "android.permission.INTERNET" ]] || { echo "Unexpected APK permissions: $manifest_permissions" >&2; exit 2; }
"$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging "${apk_files[0]}" | grep -F "package: name='com.elevateo.mail'" >/dev/null || { echo "Unexpected Android package identifier" >&2; exit 2; }
if "$ANDROID_HOME/build-tools/36.0.0/aapt" dump xmltree "${apk_files[0]}" AndroidManifest.xml | grep -F "android.intent.action.VIEW" >/dev/null; then
  echo "Unreviewed Android VIEW callback filter" >&2; exit 2
fi
if "$ANDROID_HOME/build-tools/36.0.0/apksigner" verify "${apk_files[0]}" >/dev/null 2>&1; then
  echo 'APK unexpectedly signed' >&2; exit 2
fi
cp -- "${apk_files[0]}" "$APK813_BUILD_ROOT/elevateo-android-aarch64-compile-only-unsigned.apk"
sha256sum "$APK813_BUILD_ROOT/elevateo-android-aarch64-compile-only-unsigned.apk"
