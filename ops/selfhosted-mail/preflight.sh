#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Read-only local checks; DNS ownership, port25 reachability and delivery need operator evidence.
: "${MAIL_ROOT:?absolute private root required}"
[[ $MAIL_ROOT == /* && -d $MAIL_ROOT && ! -L $MAIL_ROOT ]]
here=$(cd -- "$(dirname -- "$0")" && pwd)
export PYTHONPATH="$here"
# AIDEV-NOTE: TLS preflight also rejects symlinked/private-path escapes and untrusted certificate chains.
python3 "$here/tls_preflight.py" "$MAIL_ROOT"
docker compose -f "$here/compose.yaml" config --quiet
# Mox parser validates DKIM keys, destinations and listener config without starting a server.
docker compose -f "$here/compose.yaml" run --rm --no-deps --entrypoint mox mox config test
echo 'Local configuration PASS; activation evidence still required (see README).'
