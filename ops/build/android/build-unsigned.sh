#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Run only in Soren's fleet Docker lease; no host Gradle or Android build is authorized.
: "${ANDROID_HOME:?Android SDK root required}"
: "${GRADLE_HOME:?Pinned Gradle 8.11.1 root required}"
"$GRADLE_HOME/bin/gradle" --version | grep -F 'Gradle 8.11.1' >/dev/null
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --list_installed | grep -F 'platforms;android-35' >/dev/null
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --list_installed | grep -F 'build-tools;35.0.0' >/dev/null
cd "$(dirname "$0")/../../../apps/android"
"$GRADLE_HOME/bin/gradle" --no-daemon --console=plain :app:testDebugUnitTest :app:assembleDebug
sha256sum app/build/outputs/apk/debug/app-debug.apk
