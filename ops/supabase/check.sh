#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=$(cd -- "$(dirname -- "$0")" && pwd)
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n 9 || exit 75
project=elevateo-mail-test
compose() { docker compose -p "$project" --env-file "$base/.env.test" -f "$base/compose.yaml" "$@"; }
name="ops402-check-$(date +%s)-$$"
mkdir -p "$base/.evidence"
envfile=$(mktemp "$base/.env.check.XXXXXX")
cleanup() {
  local job=$? clean=0
  docker rm -f "$name" >/dev/null 2>&1 || clean=$?
  compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c 'DROP POLICY IF EXISTS ops402_owner ON storage.objects' >/dev/null || clean=$?
  rm -f -- "$envfile" || clean=$?
  echo "job_exit=$job cleanup_exit=$clean"
  (( clean == 0 )) || job=1
  exit "$job"
}
trap cleanup EXIT
cp "$base/.env.test" "$envfile"
sed -n 's/^ANON_KEY=/FOREIGN_ANON_KEY=/p; s/^SERVICE_ROLE_KEY=/FOREIGN_SERVICE_KEY=/p' "$base/.env.live" >> "$envfile"
compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < "$base/acceptance.sql" >/dev/null
# Reuse exact existing immutable Python image; no host application tests or installs.
docker run --name "$name" --network "${project}_private" --read-only --cap-drop ALL \
  --security-opt no-new-privileges --memory 128m --cpus 0.5 --env-file "$envfile" \
  -v "$base/acceptance.py:/acceptance.py:ro" -v "$base/fixture_cleanup.py:/fixture_cleanup.py:ro" --entrypoint python3 \
  sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a /acceptance.py
