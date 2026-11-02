#!/bin/bash
set -euo pipefail
export GRADLE_USER_HOME=/artifacts/gradle
export CARGO_HOME=/artifacts/cargo-home
export CARGO_TARGET_DIR=/artifacts/cargo-target
export CARGO_BUILD_JOBS=1
export ELEVATEO_WEB_ORIGIN=https://elevateo.qa.internal ELEVATEO_NATIVE_ARTIFACT=isolated-qa
export GRADLE_OPTS='-Dorg.gradle.daemon=false -Dorg.gradle.workers.max=1 -Dorg.gradle.jvmargs=-Xmx1024m'
cp /input/apps/android/test_customize_generated.py /work/apps/android/
cd /work/apps/android
if python3 -m unittest test_customize_generated.CustomizeGeneratedTest.test_removes_tv_advertising_but_preserves_mobile_and_other_intents; then
  echo 'ERROR: negative control unexpectedly passed'; exit 1
fi
cp /input/apps/android/customize_generated.py /work/apps/android/
python3 -m unittest test_customize_generated
python3 customize_generated.py /work/apps/native/src-tauri/gen/android
cd /work/apps/native/src-tauri/gen/android
# AIDEV-NOTE: Reuse the completed QA build; lint is a separate result from packaging verification.
exec ./gradlew --no-daemon --max-workers=1 :app:lintUniversalDebug
