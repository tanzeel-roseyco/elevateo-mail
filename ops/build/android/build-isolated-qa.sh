#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Fleet Docker only; generated resources live exclusively in debug and cannot authorize a release.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
native_dir="$project_root/apps/native/src-tauri"
android_dir="$project_root/apps/android"
: "${ANDROID_HOME:?Android SDK required}"
: "${QA_BUILD_ROOT:?Task-owned output directory required}"
: "${QA_CA_CERT:?Public test CA required}"
[[ $(id -u) -ne 0 && $QA_BUILD_ROOT != "$project_root"* ]] || exit 2
[[ $(rustc --version) == 'rustc 1.90.0 '* && $(cargo tauri --version) == 'tauri-cli 2.12.2' ]] || exit 2
export CARGO_HOME="$QA_BUILD_ROOT/cargo-home"
export CARGO_TARGET_DIR="$QA_BUILD_ROOT/cargo-target" CARGO_BUILD_JOBS=4
export GRADLE_USER_HOME="$QA_BUILD_ROOT/gradle"
export ELEVATEO_WEB_ORIGIN=https://elevateo.qa.internal ELEVATEO_NATIVE_ARTIFACT=isolated-qa
mkdir -p "$CARGO_HOME" "$CARGO_TARGET_DIR" "$GRADLE_USER_HOME"
export GRADLE_OPTS='-Dorg.gradle.daemon=false -Dorg.gradle.workers.max=2 -Dorg.gradle.jvmargs=-Xmx2048m'
python3 "$project_root/apps/native/ci/verify_boundary.py"
cd "$android_dir"
python3 -m unittest discover -s . -p 'test_*.py'
cd "$native_dir"
lock_before=$(sha256sum Cargo.lock | cut -d ' ' -f 1)
cargo test --locked
# Release profile is required to execute cfg!(debug_assertions)==false rather than infer release rejection.
cargo test --locked --release config::tests
cargo tauri android init --ci --config "$android_dir/tauri.android.conf.json" --config "$native_dir/tauri.qa.conf.json"
python3 "$android_dir/customize_generated.py" "$native_dir/gen/android"
debug="$native_dir/gen/android/app/src/debug"
mkdir -p "$debug/res/xml" "$debug/res/raw"
cp "$android_dir/qa/AndroidManifest.xml" "$debug/AndroidManifest.xml"
cp "$android_dir/qa/elevateo_qa_network_security.xml" "$debug/res/xml/"
cp "$QA_CA_CERT" "$debug/res/raw/elevateo_qa_ca.pem"
python3 "$android_dir/pin_gradle.py" "$native_dir/gen/android/gradle/wrapper/gradle-wrapper.properties"
cargo tauri android build --debug --apk --target x86_64 --config "$android_dir/tauri.android.conf.json" \
  --config "$native_dir/tauri.qa.conf.json" -- --locked
[[ $(sha256sum Cargo.lock | cut -d ' ' -f 1) == "$lock_before" ]] || { echo 'Cargo.lock changed' >&2; exit 2; }
mapfile -d '' apks < <(find "$native_dir/gen/android/app/build/outputs/apk" -type f -name '*.apk' -print0)
[[ ${#apks[@]} -eq 1 ]] || { echo 'Expected one QA APK' >&2; exit 2; }
apk=${apks[0]}
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose --print-certs "$apk"
"$ANDROID_HOME/build-tools/36.0.0/aapt2" dump resources "$apk" > "$QA_BUILD_ROOT/packaged-resources.txt"
analyzer="$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer"
"$analyzer" manifest print "$apk" > "$QA_BUILD_ROOT/packaged-manifest.xml"
"$analyzer" resources xml --file /res/xml/elevateo_qa_network_security.xml "$apk" > "$QA_BUILD_ROOT/packaged-network.xml"
python3 "$android_dir/verify_qa_package.py" "$QA_BUILD_ROOT/packaged-manifest.xml" \
  "$QA_BUILD_ROOT/packaged-network.xml" "$apk" "$QA_CA_CERT" "$QA_BUILD_ROOT/packaged-resources.txt"
cp "$apk" "$QA_BUILD_ROOT/elevateo-android-x86_64-isolated-qa.apk"
sha256sum "$QA_BUILD_ROOT/elevateo-android-x86_64-isolated-qa.apk"
