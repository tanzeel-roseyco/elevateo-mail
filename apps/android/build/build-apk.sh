#!/usr/bin/env bash
set -euo pipefail
# Reproducible debug/QA APK build for the local Docker lane (linux/amd64).
# Runs inside the `build` stage of apps/android/build/Dockerfile; see apps/android/README.md.
# AIDEV-NOTE: Mirrors ops/build/android/build-isolated-qa.sh (fleet lane, coordinator-owned) with
# AIDEV-NOTE: local additions: synthetic QA CA generation and env-var-only release signing.
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
native_dir="$project_root/apps/native/src-tauri"
android_dir="$project_root/apps/android"
: "${ANDROID_HOME:?Android SDK required}"
: "${APK_BUILD_ROOT:?Task-owned output directory required}"
[[ $(id -u) -ne 0 && $APK_BUILD_ROOT != "$project_root"* ]] || { echo 'Run unprivileged with output outside the source tree' >&2; exit 2; }
[[ $(rustc --version) == 'rustc 1.90.0 '* && $(cargo tauri --version) == 'tauri-cli 2.12.2' ]] || { echo 'Rust 1.90.0 and Tauri CLI 2.12.2 required' >&2; exit 2; }
[[ $(javac -version 2>&1) == 'javac 17.'* ]] || { echo 'JDK 17 required' >&2; exit 2; }

# Release signing comes only from these four env vars. All four -> sign; none -> debug-signed QA
# APK marked UNSIGNED DRY RUN; a partial set is an operator error and must fail loudly.
signing_vars=(ELEVATEO_ANDROID_KEYSTORE_BASE64 ELEVATEO_ANDROID_KEYSTORE_PASSWORD \
              ELEVATEO_ANDROID_KEY_ALIAS ELEVATEO_ANDROID_KEY_PASSWORD)
signing_set=0
for name in "${signing_vars[@]}"; do
  [[ -n "${!name:-}" ]] && signing_set=$((signing_set + 1))
done
if [[ $signing_set -ne 0 && $signing_set -ne ${#signing_vars[@]} ]]; then
  echo "Partial release-signing environment: ${signing_set}/${#signing_vars[@]} of ${signing_vars[*]} set" >&2
  exit 2
fi

export CARGO_HOME="$APK_BUILD_ROOT/cargo-home"
export CARGO_TARGET_DIR="$APK_BUILD_ROOT/cargo-target"
# AIDEV-NOTE: Preserve caller throttling; Docker Desktop is shared with other verification workers.
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-1}"
export GRADLE_USER_HOME="$APK_BUILD_ROOT/gradle"
export GRADLE_OPTS="${GRADLE_OPTS:--Dorg.gradle.daemon=false -Dorg.gradle.workers.max=1 -Dorg.gradle.jvmargs=-Xmx1024m}"
export ELEVATEO_WEB_ORIGIN=https://elevateo.qa.internal ELEVATEO_NATIVE_ARTIFACT=isolated-qa
mkdir -p "$CARGO_HOME" "$CARGO_TARGET_DIR" "$GRADLE_USER_HOME"

# Synthetic trust for exactly elevateo.qa.internal. QA_CA_CERT may supply an existing public CA;
# otherwise generate a 7-day CA + server leaf and delete the CA key once the leaf is issued.
trust_dir="$APK_BUILD_ROOT/qa-trust"
if [[ -z "${QA_CA_CERT:-}" ]]; then
  mkdir -p "$trust_dir"
  openssl req -x509 -newkey rsa:3072 -nodes -days 7 -subj '/CN=Elevateo QA synthetic CA' \
    -keyout "$trust_dir/ca.key" -out "$trust_dir/ca.pem"
  openssl req -newkey rsa:3072 -nodes -subj '/CN=elevateo.qa.internal' \
    -keyout "$trust_dir/server.key" -out "$trust_dir/server.csr"
  openssl x509 -req -in "$trust_dir/server.csr" -CA "$trust_dir/ca.pem" -CAkey "$trust_dir/ca.key" \
    -CAcreateserial -days 7 -out "$trust_dir/server.pem" \
    -extfile <(printf 'subjectAltName=DNS:elevateo.qa.internal\nextendedKeyUsage=serverAuth\n')
  # AIDEV-NOTE: CA private key is deleted after issuing; only the public CA PEM enters the APK.
  rm -f "$trust_dir/ca.key" "$trust_dir/server.csr" "$trust_dir/ca.srl"
  QA_CA_CERT="$trust_dir/ca.pem"
fi
export QA_CA_CERT

python3 "$project_root/apps/native/ci/verify_boundary.py"
(cd "$android_dir" && python3 -m unittest discover -s . -p 'test_*.py')
(cd "$android_dir/build" && python3 -m unittest discover -s . -p 'test_*.py')
cd "$native_dir"
lock_before=$(sha256sum Cargo.lock | cut -d ' ' -f 1)
cargo test --locked
# Release profile executes cfg!(debug_assertions)==false instead of inferring release rejection.
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

tools="$ANDROID_HOME/build-tools/36.0.0"
"$tools/apksigner" verify --verbose --print-certs "$apk"
"$tools/aapt2" dump resources "$apk" > "$APK_BUILD_ROOT/packaged-resources.txt"
analyzer="$ANDROID_HOME/cmdline-tools/latest/bin/apkanalyzer"
"$analyzer" manifest print "$apk" > "$APK_BUILD_ROOT/packaged-manifest.xml"
"$analyzer" resources xml --file /res/xml/elevateo_qa_network_security.xml "$apk" > "$APK_BUILD_ROOT/packaged-network.xml"
python3 "$android_dir/verify_qa_package.py" "$APK_BUILD_ROOT/packaged-manifest.xml" \
  "$APK_BUILD_ROOT/packaged-network.xml" "$apk" "$QA_CA_CERT" "$APK_BUILD_ROOT/packaged-resources.txt"
python3 "$android_dir/verify_manifest_tree.py" "$tools/aapt" "$apk"

out_apk="$APK_BUILD_ROOT/elevateo-android-x86_64-qa.apk"
cp "$apk" "$out_apk"
if [[ $signing_set -eq ${#signing_vars[@]} ]]; then
  # AIDEV-NOTE: keystore material lives only in a private 0700 temp dir removed on every exit path
  # (release-signing.sh); it never touches APK_BUILD_ROOT, and is never logged or copied.
  # shellcheck source=release-signing.sh
  source "$android_dir/build/release-signing.sh"
  sign_release_apk "$out_apk" "$tools"
  "$tools/apksigner" verify --verbose --print-certs "$out_apk"
  echo 'RELEASE-SIGNED APK (still the QA-origin debug build; not a production release)'
else
  echo 'UNSIGNED DRY RUN: no release-signing environment; QA APK keeps the ephemeral debug signature'
fi
sha256sum "$out_apk"
