#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Soren executes only inside a fleet Docker lease against a reviewed integrated source SHA.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
native_dir="$project_root/apps/native/src-tauri"
web_dir="$project_root/apps/web"
android_dir="$project_root/apps/android"
: "${ANDROID_HOME:?Android SDK required}"
: "${NDK_HOME:?Pinned Android NDK required}"
: "${JAVA_HOME:?JDK 17 required}"
: "${APK813_BUILD_ROOT:?Task-owned output directory required}"
[[ -f "$native_dir/Cargo.lock" ]] || { echo 'Reviewed apps/native Cargo.lock required' >&2; exit 2; }
[[ -f "$native_dir/tauri.conf.json" ]] || { echo 'Orion Tauri shell required' >&2; exit 2; }
[[ -f "$android_dir/tauri.android.conf.json" ]] || exit 2
[[ "$APK813_BUILD_ROOT" != "$project_root"* ]] || { echo 'Output must be outside source' >&2; exit 2; }
[[ "$(rustc --version)" == 'rustc 1.90.0 '* ]] || { echo 'Rust 1.90.0 required' >&2; exit 2; }
[[ "$(cargo tauri --version)" == 'tauri-cli 2.12.0' ]] || { echo 'Tauri CLI 2.12.0 required' >&2; exit 2; }
[[ "$(node --version)" == 'v22.15.0' ]] || { echo 'Node 22.15.0 required' >&2; exit 2; }
[[ "$(javac -version 2>&1)" == 'javac 17.'* ]] || { echo 'JDK 17 required' >&2; exit 2; }
[[ -d "$ANDROID_HOME/platforms/android-37" ]] || { echo 'Android API 37 required' >&2; exit 2; }
[[ -d "$ANDROID_HOME/build-tools/36.0.0" ]] || { echo 'Build Tools 36.0.0 required' >&2; exit 2; }
[[ "$(basename "$NDK_HOME")" == '28.2.13676358' ]] || { echo 'NDK 28.2.13676358 required' >&2; exit 2; }
rustup target list --installed | grep -Fx 'aarch64-linux-android' >/dev/null || { echo 'Android Rust target required' >&2; exit 2; }
mkdir -p "$APK813_BUILD_ROOT"
cd "$android_dir"
python3 -m unittest discover -s . -p "test_*.py"
cd "$web_dir"
npm ci --ignore-scripts
npm run build
cd "$native_dir"
cargo_lock_before="$(sha256sum Cargo.lock | cut -d " " -f 1)"
cargo tauri android init --config "$android_dir/tauri.android.conf.json"
wrapper="$native_dir/gen/android/gradle/wrapper/gradle-wrapper.properties"
[[ -f "$wrapper" ]] || { echo 'Generated Gradle wrapper missing' >&2; exit 2; }
python3 "$android_dir/pin_gradle.py" "$wrapper"
cargo tauri android build --apk --target aarch64 --config "$android_dir/tauri.android.conf.json"
[[ "$(sha256sum Cargo.lock | cut -d " " -f 1)" == "$cargo_lock_before" ]] || { echo "Cargo.lock changed during build" >&2; exit 2; }
mapfile -d '' apk_files < <(find "$native_dir/gen/android/app/build/outputs/apk" -type f -name '*unsigned.apk' -print0)
[[ "${#apk_files[@]}" -eq 1 ]] || { echo "Expected exactly one unsigned APK, found ${#apk_files[@]}" >&2; exit 2; }
if "$ANDROID_HOME/build-tools/36.0.0/apksigner" verify "${apk_files[0]}" >/dev/null 2>&1; then
  echo 'APK unexpectedly signed' >&2; exit 2
fi
cp -- "${apk_files[0]}" "$APK813_BUILD_ROOT/elevateo-android-aarch64-unsigned.apk"
sha256sum "$APK813_BUILD_ROOT/elevateo-android-aarch64-unsigned.apk"
