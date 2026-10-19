#!/usr/bin/env bash
# AIDEV-NOTE: Soren-only disposable source; never target persistent test/live projects.
set -Eeuo pipefail
umask 077
base=$(cd -- "$(dirname -- "$0")/../supabase" && pwd)
root=$(cd -- "$base/../.." && pwd)
snapshot=${1:?private snapshot destination required}
[[ "$snapshot" = /* ]] || exit 66
# AIDEV-NOTE: admit an existing immutable image before any stack or private environment is created.
python_image=${OPS820_PYTHON_IMAGE:?pinned local Python image required}
[[ "$python_image" =~ ^sha256:[a-f0-9]{64}$ ]] || exit 66
docker image inspect "$python_image" >/dev/null 2>&1 || { echo 'Python image unavailable' >&2; exit 66; }
env_source=${OPS820_PRIVATE_TEST_ENV:?private disposable test env required}
runner=${OPS820_SOURCE_RUNNER:?reviewed source runner required}
[[ "$env_source" = /* && -f "$env_source" && ! -L "$env_source" ]] || exit 66
[[ "$runner" = "$root"/* && -f "$runner" && -x "$runner" ]] || exit 66
[[ ! -e "$snapshot" ]] || exit 73
[[ "$env_source" != "$base/.env.test" && "$env_source" != "$base/.env.live" ]] || exit 66
[[ $(awk -F= '$1=="OPS820_TASK_OWNED" {print $2}' "$env_source") == 1 ]] || exit 66
[[ $(awk -F= '$1=="STACK_ID" {print $2}' "$env_source") == elevateo-mail-test ]] || exit 66
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n 9 || exit 75
available=$(awk '/MemAvailable:/ {printf "%.0f\n", $2*1024}' /proc/meminfo)
awk -v a="$available" 'BEGIN {exit !(a >= 8589934592)}' || exit 75
project="ops820-source-$(date +%s)-$$"
printf 'drill_project=%s\n' "$project"
envfile=$(mktemp "$base/.env.ops820-source.XXXXXX")
started=0
made_snapshot=0
compose() { docker compose -p "$project" --env-file "$envfile" -f "$base/compose.yaml" "$@"; }
source "$root/ops/ops820/compose_absence.sh"
cleanup() {
  local job=$? clean=0
  if (( started )); then
    # AIDEV-NOTE: inspect exact task mounts/volume ownership before any destructive Compose cleanup.
    if python3 "$root/ops/ops820/cleanup_ownership.py" "$project" "$root"; then
      compose down --volumes --remove-orphans >/dev/null 2>&1 || clean=$?
    else clean=1; fi
  fi
  ops820_compose_absent "$project" || clean=1
  rm -f -- "$envfile"
  if (( job || clean )) && (( made_snapshot )); then
    rm -f -- "$snapshot/database.dump" "$snapshot/globals.sql" "$snapshot/objects.tar" \
      "$snapshot/credentials.env" "$snapshot/SHA256SUMS" || clean=1
    rmdir -- "$snapshot" || clean=1
  fi
  echo "source_job_exit=$job source_cleanup_exit=$clean"
  (( clean == 0 )) || job=1
  exit "$job"
}
trap cleanup EXIT
cp -- "$env_source" "$envfile"
# Ports stay loopback and are reserved only while Soren holds the lease.
sed -i -e 's/^AUTH_PORT=.*/AUTH_PORT=18320/' \
  -e 's/^REST_PORT=.*/REST_PORT=18321/' -e 's/^STORAGE_PORT=.*/STORAGE_PORT=18322/' "$envfile"
started=1
compose up -d --wait --wait-timeout 180
"$runner" "$project" "$envfile" "$root"
compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE TABLE public.ops402_backup_marker(value text);
INSERT INTO public.ops402_backup_marker VALUES ('paired-backup-marker');
CREATE ROLE ops402_backup_role NOLOGIN;
CREATE ROLE ops402_backup_member NOLOGIN;
GRANT ops402_backup_role TO ops402_backup_member;
SQL
image=$(compose images -q db)
docker run --rm --network "${project}_private" --read-only --cap-drop ALL --memory 128m \
  --env-file "$envfile" -v "$base/drill-object.py:/drill.py:ro" --entrypoint python3 \
  "$python_image" /drill.py create
if [[ ${OPS1040_RECOVERY_FIXTURE:-0} == 1 ]]; then
# AIDEV-NOTE: Include real Resend queue/route and pending draft metadata in the paired backup.
compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 < "$root/ops/ops820/resend-recovery-seed.sql"
docker run --rm --network "${project}_private" --read-only --cap-drop ALL --memory 128m \
  --env-file "$envfile" -v "$root/ops/ops820/resend-recovery-object.py:/recovery.py:ro" --entrypoint python3 \
  "$python_image" /recovery.py create
fi
compose stop auth rest storage
compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid())
  THEN RAISE EXCEPTION 'source snapshot requires all external database clients held'; END IF;
END $$;
SQL
mkdir -m 700 -- "$snapshot"
made_snapshot=1
compose exec -T db pg_dump -U supabase_admin -d postgres -Fc > "$snapshot/database.dump"
compose exec -T db pg_dumpall -U supabase_admin --globals-only > "$snapshot/globals.sql"
cp -- "$envfile" "$snapshot/credentials.env"
docker run --rm --network none --read-only --user 0 --entrypoint tar \
  -v "${project}_storage-data:/objects:ro" "$image" -C /objects -cf - . > "$snapshot/objects.tar"
(cd -- "$snapshot" && sha256sum database.dump globals.sql objects.tar credentials.env > SHA256SUMS)
python3 "$root/ops/ops820/verify_snapshot.py" "$snapshot" >/dev/null
echo 'PASS disposable source snapshot integrity'
