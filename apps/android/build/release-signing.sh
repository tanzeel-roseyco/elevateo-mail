#!/usr/bin/env bash
# AIDEV-NOTE: release signing for build-apk.sh, sourced so test_acceptance_results.py can run it with a
# stubbed apksigner. The keystore exists only in a private 0700 temp dir that an EXIT trap removes on
# success AND failure (bad base64, wrong password, apksigner error); it never touches APK_BUILD_ROOT.

# Signs $1 in place with apksigner from $2 using the ELEVATEO_ANDROID_* signing environment.
sign_release_apk() (
  set -euo pipefail
  local apk="$1" tools="$2"
  umask 077
  local keydir
  keydir=$(mktemp -d "${TMPDIR:-/tmp}/elevateo-android-signing.XXXXXX")
  # Registered before any secret is written, so every exit path removes the material.
  trap 'rm -rf "$keydir"' EXIT
  local keystore="$keydir/release-keystore.jks"
  printf '%s' "$ELEVATEO_ANDROID_KEYSTORE_BASE64" | base64 -d > "$keystore"
  "$tools/apksigner" sign --ks "$keystore" --ks-pass env:ELEVATEO_ANDROID_KEYSTORE_PASSWORD \
    --ks-key-alias "$ELEVATEO_ANDROID_KEY_ALIAS" --key-pass env:ELEVATEO_ANDROID_KEY_PASSWORD "$apk"
)
