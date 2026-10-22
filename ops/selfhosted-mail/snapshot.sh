#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Mox snapshots can contain hardlinks; never edit them or run verifydata on live data.
: "${MAIL_ROOT:?private root required}"
here=$(cd -- "$(dirname -- "$0")" && pwd)
name="backup-$(date -u +%Y%m%dT%H%M%SZ)-$$"
umask 077
docker compose -f "$here/compose.yaml" exec -T mox mox backup "/mox/data/tmp/$name"
printf 'Private snapshot: %s/data/tmp/%s\nEncrypt and copy off-host before retention cleanup.\n' "$MAIL_ROOT" "$name"
