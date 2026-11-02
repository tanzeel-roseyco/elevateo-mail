#!/bin/bash
set -uo pipefail
# AIDEV-NOTE: Tauri generates schema files beside source; keep the checkout read-only and build an owned copy.
mkdir -p /work/apps
cp -a /src/apps/native /src/apps/shared /work/apps/ || exit 1
cd /work/apps/native/src-tauri || exit 1
export ELEVATEO_WEB_ORIGIN=https://app.elevateo.invalid ELEVATEO_NATIVE_ARTIFACT=compile-only-fixture
export CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=/tmp/native-target
failures=0
run() { echo "=== $*"; "$@"; status=$?; echo "GATE_EXIT=$status"; if [ "$status" -ne 0 ]; then failures=$((failures+1)); fi; }
run rustup component add rustfmt clippy
run cargo fmt --all -- --check
run cargo test --locked
run cargo check --locked
# AIDEV-NOTE: Enforce Clippy rules; report existing compiler dead-code warnings separately in the receipt.
run cargo clippy --locked --all-targets -- -D clippy::all
run python3 ../ci/verify_boundary.py
cd /work/apps/native || exit 1
run python3 -m unittest test_macos_release test_validate_macos_config
cd /src/apps/android || exit 1
run python3 -m unittest discover -s . -p 'test_*.py'
cd build || exit 1
run python3 -m unittest discover -s . -p 'test_*.py'
echo "FAILED_GATES=$failures"
exit "$failures"
