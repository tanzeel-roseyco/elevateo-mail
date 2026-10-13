#!/usr/bin/env bash
# Parent-only Docker lane; run in a prebuilt, pinned Ruby + PowerShell tools image.
set -euo pipefail
[[ -f /.dockerenv && ! -S /var/run/docker.sock ]] || exit 2
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root/ops/tests"
# AIDEV-NOTE: Exercise frozen wrapper functions with synthetic Docker; no daemon access or downloads are needed.
sha256sum --check --status <<'HASHES'
d31859d7747c9035b994f167bd84c5f80268af2d2d5c499514183838a5f237bf  egress_test.rb
8b527c18cbde5616c2384a7c4b974087455a8ac85ee2f910d91900a101b9c18e  egress-check.sh
ac7e97a468a830cfda441b089d5a469d670cf7ca9fe26642b0a23de2a5887732  egress-check.ps1
39ff773d684f6bf9d82acb8f21ecf86bf841f41cdb33c6e04c6ede9b9dd64120  egress_assert.rb
61c131badb6f0fe89e15a5f67318572703cc1bd4aa2ff28b3182ba5bab69f82c  egress_probe.rb
HASHES
export R1_POWERSHELL
R1_POWERSHELL=$(command -v pwsh)
export POWERSHELL_TELEMETRY_OPTOUT=1 POWERSHELL_UPDATECHECK=Off
ruby --version
"$R1_POWERSHELL" -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
# AIDEV-NOTE: Keep the existing full matrix and reject a green run that silently skipped PowerShell.
log=$(mktemp)
timeout --signal=TERM --kill-after=5s 90s ruby egress_test.rb 2>&1 | tee "$log"
grep -E '9 (runs|tests), 48 assertions, 0 failures, 0 errors, 0 skips' "$log" >/dev/null
printf 'PASS frozen Bash/PowerShell assertion protocol: no skips; Linux PowerShell only\n'
