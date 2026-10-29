#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=$(cd -- "$(dirname -- "$0")" && pwd)
snapshot=${1:?paired backup directory required}
[[ -d "$snapshot" ]] || exit 66
snapshot=$(cd -- "$snapshot" && pwd)
(cd "$snapshot"; sha256sum -c SHA256SUMS >/dev/null)
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n 9 || exit 75
available=$(awk '/MemAvailable:/ {printf "%.0f\n", $2*1024}' /proc/meminfo)
awk -v a="$available" 'BEGIN {exit !(a >= 8589934592)}' || exit 75
project="ops402-restore-$(date +%s)-$$"
envfile=$(mktemp "$base/.env.restore.XXXXXX")
cp "$snapshot/credentials.env" "$envfile"
# Fresh names and ports: restored credentials never connect this drill to a live network.
sed -i -e 's/^AUTH_PORT=.*/AUTH_PORT=18310/' \
  -e 's/^REST_PORT=.*/REST_PORT=18311/' -e 's/^STORAGE_PORT=.*/STORAGE_PORT=18312/' "$envfile"
compose() { docker compose -p "$project" --env-file "$envfile" -f "$base/compose.yaml" "$@"; }
cleanup() {
  local job=$? clean=0
  compose down --volumes --remove-orphans >/dev/null 2>&1 || clean=$?
  rm -f -- "$envfile"
  echo "restore_job_exit=$job restore_cleanup_exit=$clean"
  (( clean == 0 )) || job=1
  exit "$job"
}
trap cleanup EXIT
compose up -d --wait --wait-timeout 180 db mailpit
# Globals contain credentials: transform privately and pipe directly, never log SQL.
python3 "$base/restore-globals.py" "$snapshot/globals.sql" | compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 >/dev/null
compose exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists --exit-on-error < "$snapshot/database.dump"
image=$(compose images -q db)
docker run --rm --network none --user 0 --entrypoint tar \
  -v "${project}_storage-data:/objects" -v "$snapshot/objects.tar:/objects.tar:ro" "$image" \
  -C /objects -xf /objects.tar
compose up -d --wait --wait-timeout 180
compose exec -T db psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 \
  -c "DO \$\$ BEGIN IF (SELECT count(*) FROM public.ops402_backup_marker WHERE value='paired-backup-marker') <> 1 OR (SELECT count(*) FROM public.ops402_backup_marker) <> 1 OR NOT pg_has_role('ops402_backup_member','ops402_backup_role','MEMBER') THEN RAISE EXCEPTION 'restore marker mismatch'; END IF; END \$\$;"
echo 'PASS database restore marker'
docker run --rm --network "${project}_private" --read-only --cap-drop ALL --memory 128m \
  --env-file "$envfile" -v "$base/drill-object.py:/drill.py:ro" --entrypoint python3 \
  sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a /drill.py verify
