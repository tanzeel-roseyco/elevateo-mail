#!/usr/bin/env bash
# AIDEV-NOTE: bootstrap and Rails migrations run only on the caller's disposable Compose network.
set -Eeuo pipefail
project=${1:?disposable project required}
envfile=${2:?private environment required}
root=${3:?source root required}
[[ "$project" == ops820-source-* && "$envfile" = /* && "$root" = /* ]] || exit 66
[[ -f "$envfile" && -d "$root/apps/server" ]] || exit 66
server_image=${OPS820_SERVER_IMAGE:?pinned server image required}
[[ "$server_image" == sha256:* || "$server_image" == *@sha256:* ]] || exit 66
db_image=$(docker compose -p "$project" --env-file "$envfile" \
  -f "$root/ops/supabase/compose.yaml" images -q db)
[[ -n "$db_image" ]] || exit 66
scratch=$(mktemp -d)
trap 'rm -f -- "$scratch/runtime.env"; rmdir -- "$scratch"' EXIT
python3 "$root/ops/ops820/runtime_env.py" "$envfile" "$scratch/runtime.env" >/dev/null
docker run --rm --network "${project}_private" --read-only --cap-drop ALL \
  --env-file "$envfile" -e PGHOST=db -e PGUSER=supabase_admin -e PGDATABASE=postgres \
  -v "$root/ops/db:/ops:ro" --entrypoint bash "$db_image" \
  -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -v ON_ERROR_STOP=1 -f /ops/bootstrap.sql' >/dev/null
docker run --rm --network "${project}_private" --read-only --cap-drop ALL \
  --env-file "$envfile" -e PGHOST=db -e PGUSER=supabase_admin -e PGDATABASE=postgres \
  -v "$root/ops/db:/ops:ro" --entrypoint bash "$db_image" \
  -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -v ON_ERROR_STOP=1 -f /ops/bootstrap-send.sql' >/dev/null
docker run --rm --network "${project}_private" --read-only --cap-drop ALL \
  --env-file "$envfile" -e PGHOST=db -e PGUSER=supabase_admin -e PGDATABASE=postgres \
  -v "$root/ops/db:/ops:ro" --entrypoint bash "$db_image" \
  -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -v ON_ERROR_STOP=1 -f /ops/bootstrap-auth-grants.sql' >/dev/null
docker run --rm --network "${project}_private" --read-only --cap-drop ALL \
  --user 10001:10001 --memory 768m --pids-limit 256 \
  --env-file "$scratch/runtime.env" -e RAILS_ENV=test -e ELEVATEO_MODE=local \
  -e ELEVATEO_OUTBOUND_HOLD=true -e ELEVATEO_SEND_API_ENABLED=false \
  -e ELEVATEO_DB_HOST=db -e ELEVATEO_DB_NAME=postgres \
  -e ELEVATEO_DB_ROLE=elevateo_migrator -e ELEVATEO_PROCESS=migrate \
  -e ELEVATEO_AUTH_URL=http://auth:9999 -e ELEVATEO_STORAGE_URL=http://storage:5000 \
  -e ELEVATEO_MAILPIT_URL=http://mailpit:8025 \
  -e ELEVATEO_SMTP_HOST=mailpit -e ELEVATEO_SMTP_PORT=1025 \
  -v "$root/apps/server:/workspace/apps/server:ro" \
  --tmpfs /workspace/apps/server/tmp:uid=10001,gid=10001,mode=1770 \
  --tmpfs /workspace/apps/server/log:uid=10001,gid=10001,mode=1770 \
  --tmpfs /tmp --workdir /workspace/apps/server --entrypoint bundle \
  "$server_image" exec rails db:migrate
echo 'PASS disposable source migrations'
