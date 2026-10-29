#!/usr/bin/env bash
# AIDEV-NOTE: Local-only prepared packet; root chooses the fleet-02 slot and executes this after backend runtime4.
set -euo pipefail
cd -- "$(dirname -- "$0")"
OUT="${1:?Pass a fresh output basename, for example results-fe02-cd-561fa71d}"
sha256sum --check packet.sha256
# The accepted runner checks member hashes; this extra preflight also proves there are no unmanifested members.
cmp -- file-list.txt <(tar -tzf context.tar.gz | sed 's#^\./##' | LC_ALL=C sort)
bash runner/run-fleet-02.sh context.tar.gz "$OUT"
