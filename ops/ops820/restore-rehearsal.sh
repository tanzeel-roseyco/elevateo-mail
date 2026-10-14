#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=$(cd -- "$(dirname -- "$0")/../supabase" && pwd)
packet=$(cd -- "$(dirname -- "$0")" && pwd)
snapshot=${1:?paired backup directory required}
[[ "$snapshot" = /* ]] || exit 66
mode=${2:-base}
case "$mode" in base|full) ;; *) echo 'usage: restore-rehearsal.sh SNAPSHOT base|full' >&2; exit 64;; esac
if [[ "$mode" == full ]]; then
  # AIDEV-NOTE: no partial full gate when owner migrations and identity fixtures are absent.
  source_root=$(cd -- "$packet/../.." && pwd)
  for suffix in 08 09 10 11; do
    compgen -G "$source_root/apps/server/db/migrate/202610130000$suffix*.rb" >/dev/null || {
      echo "full gate blocked: migration $suffix absent" >&2; exit 66;
    }
  done
  runner=${OPS820_FULL_RUNNER:-}
  [[ -n "$runner" && "$runner" == "$source_root"/* && -f "$runner" && -x "$runner" ]] || {
    echo 'full gate blocked: reviewed application runner absent' >&2; exit 66;
  }
fi
[[ -d "$snapshot" ]] || exit 66
snapshot=$(cd -- "$snapshot" && pwd)
python3 "$packet/verify_snapshot.py" "$snapshot" >/dev/null
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n 9 || exit 75
available=$(awk '/MemAvailable:/ {printf "%.0f\n", $2*1024}' /proc/meminfo)
awk -v a="$available" 'BEGIN {exit !(a >= 8589934592)}' || exit 75
project="ops402-restore-$(date +%s)-$$"
envfile=$(mktemp "$base/.env.restore.XXXXXX")
compose() { docker compose -p "$project" --env-file "$envfile" -f "$base/compose.yaml" "$@"; }
started=0
cleanup() {
  local job=$? clean=0
  if (( started )); then compose down --volumes --remove-orphans >/dev/null 2>&1 || clean=$?; fi
  if [[ -n $(docker ps -aq --filter "label=com.docker.compose.project=$project") ||
        -n $(docker volume ls -q --filter "label=com.docker.compose.project=$project") ||
        -n $(docker network ls -q --filter "label=com.docker.compose.project=$project") ]]; then clean=1; fi
  rm -f -- "$envfile"
  echo "restore_job_exit=$job restore_cleanup_exit=$clean"
  (( clean == 0 )) || job=1
  exit "$job"
}
trap cleanup EXIT
cp "$snapshot/credentials.env" "$envfile"
# Fresh names and ports: restored credentials never connect this drill to a live network.
sed -i -e 's/^AUTH_PORT=.*/AUTH_PORT=18310/' \
  -e 's/^REST_PORT=.*/REST_PORT=18311/' -e 's/^STORAGE_PORT=.*/STORAGE_PORT=18312/' "$envfile"
started=1
compose up -d --wait --wait-timeout 180 db mailpit
# Globals contain credentials: transform privately and pipe directly, never log SQL.
python3 "$base/restore-globals.py" "$snapshot/globals.sql" | compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 >/dev/null
compose exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists --exit-on-error < "$snapshot/database.dump"
image=$(compose images -q db)
docker run --rm --network none --user 0 --entrypoint tar \
  -v "${project}_storage-data:/objects" -v "$snapshot/objects.tar:/objects.tar:ro" "$image" \
  -C /objects -xf /objects.tar
compose up -d --wait --wait-timeout 180
if [[ "$mode" == full ]]; then
  "$runner" "$project" "$envfile" "$source_root"
fi
compose exec -T db psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 \
  -c "DO \$\$ BEGIN IF (SELECT count(*) FROM public.ops402_backup_marker WHERE value='paired-backup-marker') <> 1 OR (SELECT count(*) FROM public.ops402_backup_marker) <> 1 OR NOT pg_has_role('ops402_backup_member','ops402_backup_role','MEMBER') THEN RAISE EXCEPTION 'restore marker mismatch'; END IF; END \$\$;"
echo 'PASS database restore marker'
compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < "$packet/post_restore.sql"
echo 'PASS catalog privilege and FORCE RLS smoke'
docker run --rm --network "${project}_private" --read-only --cap-drop ALL --memory 128m \
  --env-file "$envfile" -v "$base/drill-object.py:/drill.py:ro" --entrypoint python3 \
  sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a /drill.py verify
