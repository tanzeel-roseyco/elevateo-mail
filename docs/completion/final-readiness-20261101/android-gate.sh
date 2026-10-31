#!/bin/bash
set -euo pipefail
# AIDEV-NOTE: Build an owned Linux copy; generated Android files must not mutate the shared checkout.
# AIDEV-NOTE: Restarting reuses owned caches and rebuilds the APK after copying the reviewed TV manifest repair.
if [[ -f /artifacts/elevateo-android-x86_64-qa.apk ]]; then
    cp /input/apps/android/customize_generated.py /input/apps/android/test_customize_generated.py /work/apps/android/
  chown 1000:1000 /work/apps/android/customize_generated.py /work/apps/android/test_customize_generated.py
  exec runuser -u elevateoqa -- env APK_BUILD_ROOT=/artifacts CARGO_BUILD_JOBS=1 \
    QA_CA_CERT=/artifacts/qa-trust/ca.pem bash /work/apps/android/build/build-apk.sh
fi
mkdir -p /work/apps /artifacts
cp -a /input/apps/native /input/apps/android /input/apps/shared /work/apps/
chown -R 1000:1000 /work /artifacts
exec runuser -u elevateoqa -- env APK_BUILD_ROOT=/artifacts CARGO_BUILD_JOBS=1 \
  bash /work/apps/android/build/build-apk.sh
