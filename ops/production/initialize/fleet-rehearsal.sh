#!/bin/bash
# AIDEV-NOTE: Disposable real-service restore rehearsal; no host ports, production networks or persistent volumes.
set -euo pipefail
stage=/tmp/elevateo-initrepair20261023
runner=${1:?combined immutable runner sha256 required}
[[ "$runner" =~ ^sha256:[0-9a-f]{64}$ ]]
prefix=initrepair20261023
pg=sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00
auth=sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232
storage=sha256:f1546fac6d1c7e345428ac904bfaa7be7cecd50a1f549fe1cf38c628a7b15c85
password=disposable-initrepair20261023-password-only
jwt=disposable-initrepair20261023-jwt-secret-only
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -w 180 9
for name in db restore auth storage run; do test -z "$(docker ps -aq --filter name=^$prefix-$name$)"; done
for name in source restored; do test -z "$(docker network ls -q --filter name=^$prefix-$name$)"; done
cleanup() {
  for name in run storage auth db restore; do
    if docker container inspect "$prefix-$name" >/dev/null 2>&1; then
      docker inspect --format '{{json .Mounts}} {{json .HostConfig.Tmpfs}}' "$prefix-$name"
      docker rm -f "$prefix-$name" >/dev/null
    fi
  done
  for name in source restored; do docker network rm "$prefix-$name" >/dev/null 2>&1 || true; done
  test -z "$(docker ps -aq --filter label=task=$prefix)"
  test -z "$(docker network ls -q --filter label=task=$prefix)"
  echo 'CLEANUP PASS: exact rehearsal containers/networks/tmpfs absent; no named volumes/build caches'
}
trap cleanup EXIT HUP INT TERM
mkdir -p "$stage/backups" "$stage/content-source" "$stage/content-restored"
chmod 777 "$stage/backups" "$stage/content-source" "$stage/content-restored"
for name in source restored; do docker network create --internal --label task=$prefix "$prefix-$name" >/dev/null; done
start_db() {
  docker run -d --name "$prefix-$1" --label task=$prefix --network "$prefix-$2" --network-alias db \
    --tmpfs /var/lib/postgresql/data \
    -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=postgres "$pg" \
    postgres -c config_file=/etc/postgresql/postgresql.conf -c log_min_messages=fatal >/dev/null
  for _ in $(seq 1 90); do
    if docker exec "$prefix-$1" pg_isready -h localhost -U supabase_admin -d postgres >/dev/null 2>&1; then return; fi
    test "$(docker inspect --format '{{.State.Running}}' "$prefix-$1")" = true || break
    sleep 1
  done
  docker logs "$prefix-$1"; return 1
}
psql_db() { docker exec -i -e PGPASSWORD="$password" "$prefix-$1" psql -X -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "${@:2}"; }
run() {
  docker run --rm --name "$prefix-run" --label task=$prefix --network "$prefix-$1" --read-only \
    --tmpfs /tmp --tmpfs /source/apps/server/tmp:uid=10001,gid=10001,mode=1770 \
    --tmpfs /source/apps/server/log:uid=10001,gid=10001,mode=1770 \
    --mount type=bind,src="$stage",dst=/source,readonly \
    -w /source/ops/production/initialize --entrypoint python3 \
    -e INITREPAIR_DISPOSABLE=$prefix -e PGPASSWORD="$password" \
    -e MIGRATOR_DB_PASSWORD="$password-migrator" -e API_DB_PASSWORD="$password-api" \
    -e WORKER_DB_PASSWORD="$password-worker" -e ATTACHMENT_GATEWAY_DB_PASSWORD="$password-gateway" \
    -e SECRET_KEY_BASE="$password-disposable-secret-key-base-at-least-sixty-four-bytes" \
    "$runner" -B rehearsal.py "$2"
}
start_db db source
psql_db db -q -c "ALTER ROLE supabase_auth_admin PASSWORD '$password'; ALTER ROLE supabase_storage_admin PASSWORD '$password';"
docker run -d --name "$prefix-auth" --label task=$prefix --network "$prefix-source" --network-alias auth \
  -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://auth:9999 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:$password@db:5432/postgres" \
  -e GOTRUE_SITE_URL=http://app.invalid -e GOTRUE_DISABLE_SIGNUP=true -e GOTRUE_JWT_SECRET="$jwt" \
  -e GOTRUE_JWT_ADMIN_ROLES=service_role -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=false -e GOTRUE_EXTERNAL_PHONE_ENABLED=false "$auth" >/dev/null
# Storage migrations use the real released service; no HTTP listener is published or provider configured.
docker run -d --name "$prefix-storage" --label task=$prefix --network "$prefix-source" --network-alias storage \
  --mount type=bind,src="$stage/content-source",dst=/var/lib/storage --tmpfs /tmp -e ANON_KEY=disposable -e SERVICE_KEY=disposable \
  -e POSTGREST_URL=http://unavailable.invalid -e AUTH_JWT_SECRET="$jwt" \
  -e DATABASE_URL="postgres://supabase_storage_admin:$password@db:5432/postgres" \
  -e STORAGE_PUBLIC_URL=http://storage:5000 -e STORAGE_BACKEND=file -e FILE_STORAGE_BACKEND_PATH=/var/lib/storage \
  -e GLOBAL_S3_BUCKET=stub -e TENANT_ID=$prefix -e REGION=local -e FILE_SIZE_LIMIT=10485760 \
  -e ENABLE_IMAGE_TRANSFORMATION=false "$storage" >/dev/null
ready=0
for _ in $(seq 1 90); do
  if docker run --rm --network "$prefix-source" --label task=$prefix --entrypoint python3 "$runner" -c \
    'import urllib.request; urllib.request.urlopen("http://auth:9999/health", timeout=3); urllib.request.urlopen("http://storage:5000/status", timeout=3)' >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if test "$ready" != 1; then docker logs "$prefix-auth"; docker logs "$prefix-storage"; exit 1; fi
docker stop "$prefix-auth" "$prefix-storage" >/dev/null
run source seed > "$stage/before.sha256"
# AIDEV-NOTE: The content sentinel is an explicit filesystem fixture, paired with actual Storage metadata.
docker start "$prefix-storage" >/dev/null
docker exec "$prefix-storage" sh -c 'mkdir -p /var/lib/storage/stub/initrepair20261023-preserve; printf "%s" initrepair-content-preserved > /var/lib/storage/stub/initrepair20261023-preserve/sentinel.txt'
docker stop "$prefix-storage" >/dev/null
docker run --rm --network none --label task=$prefix \
  --mount type=bind,src="$stage/content-source",dst=/content,readonly \
  --mount type=bind,src="$stage/backups",dst=/backup \
  --entrypoint sh "$storage" -c 'tar -C /content -cf /backup/storage.tar .'
docker exec -e PGPASSWORD="$password" "$prefix-db" pg_dump -h localhost -U supabase_admin -d postgres -Fc > "$stage/backups/database.dump"
docker exec -e PGPASSWORD="$password" "$prefix-db" pg_dumpall -h localhost -U supabase_admin --globals-only > "$stage/backups/globals.sql"
sha256sum "$stage/backups/database.dump" "$stage/backups/globals.sql" "$stage/backups/storage.tar"
start_db restore restored
# Fresh same-version Supabase already owns baseline roles; preserve ALTER/GRANT statements and create only missing roles.
sed '/^CREATE ROLE /d' "$stage/backups/globals.sql" > "$stage/backups/globals-existing.sql"
psql_db restore -q < "$stage/backups/globals-existing.sql"
docker cp "$stage/backups/database.dump" "$prefix-restore:/tmp/database.dump"
docker exec -e PGPASSWORD="$password" "$prefix-restore" pg_restore -h localhost -U supabase_admin -d postgres \
  --clean --if-exists --exit-on-error /tmp/database.dump
run restored snapshot > "$stage/restored.sha256"
cmp "$stage/before.sha256" "$stage/restored.sha256"
docker run --rm --network none --label task=$prefix \
  --mount type=bind,src="$stage/content-restored",dst=/content \
  --mount type=bind,src="$stage/backups",dst=/backup,readonly \
  --entrypoint sh "$storage" -c 'tar -C /content -xf /backup/storage.tar; test "$(cat /content/stub/initrepair20261023-preserve/sentinel.txt)" = initrepair-content-preserved; sha256sum /content/stub/initrepair20261023-preserve/sentinel.txt'
run restored forward > "$stage/forward.json"
run source snapshot > "$stage/source-after.sha256"
cmp "$stage/before.sha256" "$stage/source-after.sha256"
test "$(psql_db db -Atq -c "SELECT to_regnamespace('app') IS NULL")" = t
cat "$stage/forward.json"
echo 'PASS: actual Auth/Storage schemas, baseline backup+isolated restore, all Rails migrations, tenant rehearsal; source untouched'
