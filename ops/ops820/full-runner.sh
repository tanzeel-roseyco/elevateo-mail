#!/usr/bin/env bash
# AIDEV-NOTE: destructive migration reversal is confined to the disposable restored project.
set -Eeuo pipefail
umask 077
project=${1:?disposable project required}
envfile=${2:?private environment required}
root=${3:?source root required}
[[ "$project" == ops402-restore-* && "$envfile" = /* && "$root" = /* ]] || exit 66
image=${OPS820_SERVER_IMAGE:?pinned server image required}
[[ "$image" == sha256:* || "$image" == *@sha256:* ]] || exit 66
[[ -f "$envfile" && -d "$root/apps/server/db/migrate" ]] || exit 66
versions=()
# AIDEV-NOTE: Reverse the complete tail so newer foreign keys/functions cannot outlive their prerequisites.
for file in "$root"/apps/server/db/migrate/*.rb; do
  name=${file##*/}
  [[ -f $file && $name =~ ^([0-9]{14})_[a-z0-9_]+\.rb$ ]] || exit 66
  version=${BASH_REMATCH[1]}
  if (( version >= 20261013000008 )); then versions+=("$version"); fi
done
(( ${#versions[@]} > 0 )) || exit 66
mapfile -t versions < <(printf '%s\n' "${versions[@]}" | sort -n)
previous=0
for version in "${versions[@]}"; do
  (( version > previous )) || exit 66
  previous=$version
done
for required in 20261013000008 20261013000009 20261013000010 20261015000011 20261015000018; do
  [[ " ${versions[*]} " == *" $required "* ]] || exit 66
done
rails() {
  docker run --rm --network "${project}_private" --read-only --cap-drop ALL \
    --user 10001:10001 --memory 768m --pids-limit 256 --env-file "$scratch/migrator.env" \
    -e RAILS_ENV=test -e ELEVATEO_MODE=local -e ELEVATEO_OUTBOUND_HOLD=true \
    -e ELEVATEO_SEND_API_ENABLED=false -e ELEVATEO_DB_HOST=db \
    -e ELEVATEO_DB_NAME=postgres -e ELEVATEO_DB_ROLE=elevateo_migrator \
    -e ELEVATEO_PROCESS=migrate -e ELEVATEO_AUTH_URL=http://auth:9999 \
    -e ELEVATEO_STORAGE_URL=http://storage:5000 -e ELEVATEO_MAILPIT_URL=http://mailpit:8025 \
    -e ELEVATEO_SMTP_HOST=mailpit -e ELEVATEO_SMTP_PORT=1025 \
    -v "$root/apps/server:/workspace/apps/server:ro" \
    --tmpfs /workspace/apps/server/tmp:uid=10001,gid=10001,mode=1770 \
    --tmpfs /workspace/apps/server/log:uid=10001,gid=10001,mode=1770 \
    --tmpfs /tmp --workdir /workspace/apps/server --entrypoint bundle \
    "$image" exec rails "$@"
}
compose() { docker compose -p "$project" --env-file "$envfile" -f "$root/ops/supabase/compose.yaml" "$@"; }
scratch=$(mktemp -d)
trap 'rm -f -- "$scratch/before" "$scratch/after" "$scratch/migrator.env" "$scratch/api.env" "$scratch/worker.env"; rmdir -- "$scratch"' EXIT
for role in migrator api worker; do
  python3 "$root/ops/ops820/runtime_env.py" "$envfile" "$scratch/$role.env" "$role" >/dev/null
done
# AIDEV-NOTE: One fresh key makes comparison-only dumps repeatable; these files are never restored or executed.
restrict_key=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
schema_dump() {
  compose exec -T db pg_dump -U supabase_admin -d postgres --schema-only -n 'app*' --restrict-key="$restrict_key"
  compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
    < "$root/ops/ops820/data_fingerprint.sql"
}
schema_dump > "$scratch/before"
for ((index=${#versions[@]}-1; index>=0; index--)); do
  rails db:migrate:down "VERSION=${versions[index]}"
  if [[ ${versions[index]} == 20261015000018 ]]; then
    compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
      < "$root/ops/ops820/gateway-down-smoke.sql" >/dev/null
  fi
done
for version in "${versions[@]}"; do
  rails db:migrate:up "VERSION=$version"
done
schema_dump > "$scratch/after"
cmp -s -- "$scratch/before" "$scratch/after" || {
  echo 'restored app schema/data changed after down/up' >&2; exit 1;
}
compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < "$root/ops/ops820/post_restore.sql" >/dev/null
docker run --rm --network "${project}_private" --read-only --cap-drop ALL \
  --user 10001:10001 --memory 256m --env-file "$scratch/api.env" \
  -e ELEVATEO_MODE=local -e ELEVATEO_OUTBOUND_HOLD=true \
  -e ELEVATEO_SEND_API_ENABLED=false -e ELEVATEO_DB_HOST=db \
  -e ELEVATEO_DB_NAME=postgres -e ELEVATEO_DB_ROLE=elevateo_api \
  -e ELEVATEO_PROCESS=api -e ELEVATEO_AUTH_URL=http://auth:9999 \
  -e ELEVATEO_STORAGE_URL=http://storage:5000 -e ELEVATEO_MAILPIT_URL=http://mailpit:8025 \
  -e ELEVATEO_SMTP_HOST=mailpit -e ELEVATEO_SMTP_PORT=1025 \
  -e ELEVATEO_BROWSER_ORIGIN=http://api:3000 -e ELEVATEO_COOKIE_SECURE=false \
  -e ELEVATEO_LOCAL_HTTP=true \
  -e ELEVATEO_AUTH_JWT_AUDIENCE=authenticated -e ELEVATEO_AUTH_JWT_ALGORITHM=HS256 \
  -e ELEVATEO_AUTH_PASSWORD_MINIMUM=12 \
  -v "$root/apps/server:/workspace/apps/server:ro" \
  -v "$root/ops/ops820:/workspace/ops/ops820:ro" \
  --entrypoint ruby "$image" /workspace/ops/ops820/config-check.rb
docker run --rm --network none --read-only --cap-drop ALL --user 10001:10001 \
  --memory 128m -v "$root/apps/server:/workspace/apps/server:ro" \
  --entrypoint ruby "$image" -I/workspace/apps/server/lib \
  -relevateo/administration_roster -e 'roster = Elevateo::AdministrationRoster.load; abort "roster not unbound" unless roster.fetch("people").length == 12 && roster.fetch("people").all? { |p| p["auth_user_id"].nil? && p["email"].nil? } && roster.fetch("mailbox_grants") == [] && roster.fetch("live_activation") == false'
"$root/ops/ops820/health-probe.sh" "$project" "$scratch/api.env" "$root"
"$root/ops/ops820/worker-probe.sh" "$project" "$scratch/worker.env" "$root"
echo 'PASS disposable migrations down/up and app schema/data fingerprint'
