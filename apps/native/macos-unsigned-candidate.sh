#!/bin/sh
# MAC-814: unsigned, test-only DMG path; never a release or Gatekeeper acceptance claim.
set -eu
exec "$(dirname "$0")/macos-release.sh" --unsigned-candidate
