#!/bin/sh
# Soren executes inside a task-owned fleet Docker container; this never creates a release package.
set -eu
cd "$(dirname "$0")/../src-tauri"
export ELEVATEO_WEB_ORIGIN=https://app.elevateo.invalid
export ELEVATEO_NATIVE_ARTIFACT=compile-only-fixture
printf '%s\n' 'NONRELEASE COMPILE ONLY: https://app.elevateo.invalid; launch is intentionally denied.'
cargo test --locked
cargo check --locked
