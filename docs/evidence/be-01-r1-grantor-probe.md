# BE-01-R1 legacy grantor probe — pending execution

Coordinator-approved remote test only. This does not authorize backend implementation or use existing databases.
Run from the remote repository containing commit `5a9d83ad4de7403f349131bf0c3e45df7fd97c28`.
All database assertions execute inside the pinned container. The password below is disposable fixture data.
No provider, network publication, persistent volume or existing credential file is needed.

```bash
#!/usr/bin/env bash
set -euo pipefail
base=5a9d83ad4de7403f349131bf0c3e45df7fd97c28
image=supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00
nonce=$(cat /proc/sys/kernel/random/uuid)
name="be01r1-grantor-$nonce"
scratch=$(mktemp -d)
cid=''
had_image=false
if docker image inspect "$image" >/dev/null 2>&1; then had_image=true; fi
cleanup() {
  result=$?
  trap - EXIT INT TERM
  if [ -n "$cid" ]; then
    actual=$(docker inspect -f '{{index .Config.Labels "elevateo.r1.probe"}}' "$cid")
    if [ "$actual" != "$nonce" ]; then
      echo 'STOP: cleanup ownership mismatch' >&2
      exit 1
    fi
    docker inspect -f '{{json .Mounts}}' "$cid"
    docker rm -f "$cid"
  fi
  if [ "$had_image" = false ]; then docker image rm "$image"; fi
  # Only the files authored below in this unique directory are disposable.
  rm -f "$scratch/bootstrap.sql" "$scratch/99-roles.sql" "$scratch/99-jwt.sql"
  rmdir "$scratch"
  docker system df
  df -h .
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if docker container inspect "$name" >/dev/null 2>&1; then
  echo 'STOP: fixture name collision' >&2
  exit 1
fi
git show "$base:ops/db/bootstrap.sql" > "$scratch/bootstrap.sql"
git show "$base:ops/supabase/db/99-roles.sql" > "$scratch/99-roles.sql"
git show "$base:ops/supabase/db/99-jwt.sql" > "$scratch/99-jwt.sql"
docker pull "$image"
docker image inspect -f '{{json .RepoDigests}}' "$image"
cid=$(docker create --name "$name" --label "elevateo.r1.probe=$nonce" \
  --network none --tmpfs /var/lib/postgresql/data --tmpfs /etc/postgresql-custom \
  -e POSTGRES_PASSWORD=r1-disposable-fixture-password \
  -e PGPASSWORD=r1-disposable-fixture-password -e PGDATABASE=postgres \
  -e POSTGRES_DB=postgres -e POSTGRES_HOST=/var/run/postgresql \
  -e PGPORT=5432 -e POSTGRES_PORT=5432 -e JWT_EXP=3600 \
  -e MIGRATOR_DB_PASSWORD=r1-disposable-migrator \
  -e API_DB_PASSWORD=r1-disposable-api -e WORKER_DB_PASSWORD=r1-disposable-worker \
  --mount "type=bind,src=$scratch/99-roles.sql,dst=/docker-entrypoint-initdb.d/init-scripts/99-roles.sql,readonly" \
  --mount "type=bind,src=$scratch/99-jwt.sql,dst=/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql,readonly" \
  --mount "type=bind,src=$scratch/bootstrap.sql,dst=/ops/bootstrap.sql,readonly" \
  "$image" postgres -c config_file=/etc/postgresql/postgresql.conf -c log_min_messages=fatal)
docker start "$cid" >/dev/null
ready=false
for attempt in $(seq 1 60); do
  if docker exec "$cid" pg_isready -h 127.0.0.1 -U supabase_admin -d postgres >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'STOP: database did not become ready' >&2; exit 1; fi
docker exec "$cid" psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -f /ops/bootstrap.sql
docker exec -i "$cid" psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT version(), session_user, current_user;
SELECT oid, rolname, rolsuper, rolcreaterole, rolbypassrls
FROM pg_roles WHERE oid = 10 OR rolname IN ('supabase_admin','elevateo_owner','elevateo_api');
SELECT r.rolname AS granted_role, m.rolname AS member, g.rolname AS grantor,
       am.admin_option, am.inherit_option, am.set_option, g.oid AS grantor_oid
FROM pg_auth_members am
JOIN pg_roles r ON r.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
JOIN pg_roles g ON g.oid = am.grantor
WHERE r.rolname IN ('elevateo_app_read','elevateo_owner')
ORDER BY granted_role, member, grantor;
SQL
```

Return the exact command, exit code, role/options output, image digest, mount inspection,
removed resources, Docker usage and host free space. Do not print environment values or raw database logs.
If the image creates an unexpected anonymous volume, stop for ownership inspection before deleting it;
the script deliberately does not use `docker rm -v` or any broad prune.
Grantor results are required before authoring the compatibility retirement step.
