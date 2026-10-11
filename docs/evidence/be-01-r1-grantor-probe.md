# BE-01-R1 legacy grantor probe — revised script, not executed

Coordinator dispatch is required. This tests a fresh isolated database, not backend implementation or existing data.
Run in the remote repository containing `5a9d83ad4de7403f349131bf0c3e45df7fd97c28`. Passwords are disposable fixture data.
The only new named volume is nonce-owned disposable configuration; PostgreSQL data remains in tmpfs. No ports or external network.

## Failed original attempt

The coordinator reports that the original container exited before the 60 readiness attempts completed; no grantor SQL result exists.
Raw database logs were not captured; exact task resources were removed. The original command mounted empty tmpfs at `/etc/postgresql-custom`.
Configuration masking is a **hypothesis**, not a proven failure cause. The [tagged Dockerfile](https://raw.githubusercontent.com/supabase/postgres/17.6.1.136/Dockerfile-17) installs required files there and enables includes.
[Docker documents](https://docs.docker.com/engine/storage/volumes/) default image-content copying into empty volumes. The script verifies the actual pinned image rather than assuming tag/source equivalence.
No catalog behavior, startup success, repair acceptance or precise billing attribution follows from the failed attempt.

## Revised isolated script

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077
base=5a9d83ad4de7403f349131bf0c3e45df7fd97c28
image=supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00
nonce=$(cat /proc/sys/kernel/random/uuid)
name="be01r1-grantor-$nonce"
config_volume="$name-config"
scratch=$(mktemp -d)
cid='' helper='' helper_profile='' volume_created=false image_created=false
fail() { printf '%s\n' "$1" >&2; exit 1; }
verify_owned() {
  local resource=$1 profile=$2 actual expected owned rw=true
  owned=$(docker inspect -f '{{index .Config.Labels "elevateo.r1.probe"}}|{{if .HostConfig.Tmpfs}}{{len .HostConfig.Tmpfs}}{{else}}0{{end}}' "$resource") || return 1
  [[ "$owned" = "$nonce|0" ]] || return 1
  actual=$(docker inspect -f '{{range .Mounts}}{{.Type}}|{{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}}|{{.Destination}}|{{.RW}}{{println}}{{end}}' "$resource") || return 1
  case "$profile" in
    bare) expected='' ;;
    config-rw|config-ro|database)
      owned=$(docker volume inspect -f '{{index .Labels "elevateo.r1.probe"}}' "$config_volume") || return 1
      [[ "$owned" = "$nonce" ]] || return 1
      [[ "$profile" != config-ro ]] || rw=false
      expected="volume|$config_volume|/etc/postgresql-custom|$rw"
      if [ "$profile" = database ]; then
        printf -v expected '%s\n%s\n%s\n%s\n%s' "$expected" \
          "bind|$scratch/99-roles.sql|/docker-entrypoint-initdb.d/init-scripts/99-roles.sql|false" \
          "bind|$scratch/99-jwt.sql|/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql|false" \
          "bind|$scratch/bootstrap.sql|/ops/bootstrap.sql|false" \
          'tmpfs||/var/lib/postgresql/data|true'
      fi ;;
    *) return 1 ;;
  esac
  actual=$(printf '%s\n' "$actual" | LC_ALL=C sort) || return 1
  expected=$(printf '%s\n' "$expected" | LC_ALL=C sort) || return 1
  [[ "$actual" = "$expected" ]] || return 1
  printf 'verified_container=%s profile=%s\n%s\n' "$resource" "$profile" "$actual"
}
remove_owned() {
  # AIDEV-NOTE: Every removal fails closed on ownership/mount inspection, including cleanup with errexit disabled.
  if ! verify_owned "$1" "$2"; then printf 'RETAIN: container=%s; verification failed\n' "$1" >&2; return 1; fi
  docker rm -f "$1"
}
inspect_config() {
  # AIDEV-NOTE: Overridden entrypoint has no DB credentials; output is fixed paths/metadata, never file contents.
  helper_profile=$1; shift
  helper=$(docker create --network none --label "elevateo.r1.probe=$nonce" \
    --user postgres --entrypoint sh "$@" "$image" -ceu '
    test -r /etc/postgresql/postgresql.conf
    test -d /etc/postgresql-custom/conf.d
    for file in supautils.conf wal-g.conf read-replica.conf; do
      test -r "/etc/postgresql-custom/$file"
      printf "config_metadata %s " "$file"
      stat -c "%u %g %a %s" "/etc/postgresql-custom/$file"
    done
    files=$(find /etc/postgresql-custom -xdev -type f)
    printf "config_file_count="
    printf "%s\n" "$files" | wc -l
    printf "config_readable=true\n"') || return 1
  local status=0
  verify_owned "$helper" "$helper_profile" || return 1
  docker start -a "$helper" || status=$?
  remove_owned "$helper" "$helper_profile" || return 1
  helper=''
  return "$status"
}
cleanup() {
  local result=$? actual
  trap - EXIT INT TERM
  set +e
  if [ -n "$helper" ]; then remove_owned "$helper" "$helper_profile" && helper='' || result=1; fi
  if [ -n "$cid" ]; then remove_owned "$cid" database && cid='' || result=1; fi
  if [ "$volume_created" = true ]; then
    actual=$(docker volume inspect -f '{{index .Labels "elevateo.r1.probe"}}' "$config_volume" 2>/dev/null)
    if [[ -z "$helper$cid" && "$actual" = "$nonce" ]] && inspect_config config-ro \
      --mount "type=volume,src=$config_volume,dst=/etc/postgresql-custom,readonly,volume-nocopy"; then
      docker volume rm "$config_volume" || result=1
    else
      printf 'RETAIN: volume=%s helper=%s; inspection failed\n' "$config_volume" "$helper" >&2; result=1
    fi
  fi
  if [ "$image_created" = true ]; then docker image rm "$image" || result=1; fi
  if [ -z "$helper$cid" ]; then
    rm -f "$scratch/bootstrap.sql" "$scratch/99-roles.sql" "$scratch/99-jwt.sql"
    rmdir "$scratch" || result=1
  else printf 'RETAIN: scratch=%s; container retained\n' "$scratch" >&2; result=1; fi
  docker system df
  df -h .
  exit "$result"
}
diagnose() {
  docker inspect -f 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}' "$cid"
  # AIDEV-NOTE: Classify bounded logs in memory; never echo matched/unmatched lines or attempt generic redaction.
  docker logs --tail 200 "$cid" 2>&1 | awk '
    /could not open configuration/ { config=1 }
    /Permission denied/ { permission=1 }
    /initdb: error/ { init=1 }
    END { printf "startup_categories config=%d permission=%d initdb=%d unclassified=%d\n",
          config, permission, init, !(config || permission || init) }
  ' || printf 'diagnostic_capture_failed=true\n'
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
command -v awk >/dev/null || fail 'STOP: awk unavailable'
command -v sort >/dev/null || fail 'STOP: sort unavailable'
if docker container inspect "$name" >/dev/null 2>&1 || docker volume inspect "$config_volume" >/dev/null 2>&1; then
  fail 'STOP: fixture name collision'
fi
git show "$base:ops/db/bootstrap.sql" > "$scratch/bootstrap.sql"
git show "$base:ops/supabase/db/99-roles.sql" > "$scratch/99-roles.sql"
git show "$base:ops/supabase/db/99-jwt.sql" > "$scratch/99-jwt.sql"
# These fixed source files contain no runtime credentials and must be readable by the image's postgres UID.
chmod 0644 "$scratch/bootstrap.sql" "$scratch/99-roles.sql" "$scratch/99-jwt.sql"
if ! docker image inspect "$image" >/dev/null 2>&1; then
  docker pull "$image"
  image_created=true
fi
docker image inspect -f '{{json .RepoDigests}}' "$image"
image_volumes=$(docker image inspect -f '{{json .Config.Volumes}}' "$image")
[[ "$image_volumes" = null || "$image_volumes" = '{}' ]] || fail 'STOP: unexpected image volumes'
inspect_config bare || fail 'STOP: image configuration preflight failed'
docker volume create --label "elevateo.r1.probe=$nonce" "$config_volume" >/dev/null
volume_created=true
[[ $(docker volume inspect -f '{{index .Labels "elevateo.r1.probe"}}' "$config_volume") = "$nonce" ]] \
  || fail 'STOP: configuration volume ownership mismatch'
# AIDEV-NOTE: Default copy-up preserves image configuration; PGDATA stays isolated and disposable in tmpfs.
inspect_config config-rw --mount "type=volume,src=$config_volume,dst=/etc/postgresql-custom" \
  || fail 'STOP: copied configuration preflight failed'
cid=$(docker create --name "$name" --label "elevateo.r1.probe=$nonce" \
  --network none --mount type=tmpfs,dst=/var/lib/postgresql/data \
  --mount "type=volume,src=$config_volume,dst=/etc/postgresql-custom,volume-nocopy" \
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
verify_owned "$cid" database || fail 'STOP: database ownership/mount verification failed'
docker start "$cid" >/dev/null 2>&1 || { diagnose; fail 'STOP: database start failed'; }
ready=false
for attempt in $(seq 1 60); do
  if [[ $(docker inspect -f '{{.State.Running}}' "$cid") != true ]]; then
    diagnose; fail 'STOP: database exited before readiness'
  fi
  if docker exec "$cid" pg_isready -h 127.0.0.1 -U supabase_admin -d postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then diagnose; fail 'STOP: database readiness timeout'; fi
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

Return script SHA/exit, unchanged SQL observations, image digest, fixed diagnostics, removed/retained resource IDs and host/Docker usage.
No secrets, raw logs, environment dumps, existing volume deletion, `docker rm -v`, broad prune or automatic retry.
Content/ownership inspection failures deliberately retain the disposable volume for coordinator inspection; report them.
All container removals require matching labels and exact mounts, including bind sources/read-only flags; failed checks retain resources.
The explicit `--mount type=tmpfs` form makes PGDATA visible in `.Mounts` for verification ([Docker documentation](https://docs.docker.com/engine/storage/tmpfs/)).
Grantor results remain required before authoring the compatibility retirement step. The revised script has not been run.
