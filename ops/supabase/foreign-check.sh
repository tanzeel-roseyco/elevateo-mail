#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=$(cd -- "$(dirname -- "$0")" && pwd)
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n 9 || exit 75
file=$(mktemp "$base/.env.foreign.XXXXXX")
trap 'rm -f -- "$file"' EXIT
cp "$base/.env.live" "$file"
sed -n 's/^ANON_KEY=/FOREIGN_ANON_KEY=/p; s/^SERVICE_ROLE_KEY=/FOREIGN_SERVICE_KEY=/p' "$base/.env.test" >> "$file"
docker run --rm --network elevateo-mail-live_private --read-only --cap-drop ALL --memory 128m \
  --env-file "$file" -v "$base/foreign-check.py:/foreign.py:ro" --entrypoint python3 \
  sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a /foreign.py
