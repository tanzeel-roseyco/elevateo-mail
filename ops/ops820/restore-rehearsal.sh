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
  for suffix in 08 09 10; do
    compgen -G "$source_root/apps/server/db/migrate/202610130000$suffix*.rb" >/dev/null || {
      echo "full gate blocked: migration $suffix absent" >&2; exit 66;
    }
  done
  compgen -G "$source_root/apps/server/db/migrate/20261015000011*.rb" >/dev/null || {
    echo 'full gate blocked: inbound migration 20261015000011 absent' >&2; exit 66;
  }
  compgen -G "$source_root/apps/server/db/migrate/20261015000018*.rb" >/dev/null || {
    echo 'full gate blocked: gateway migration 20261015000018 absent' >&2; exit 66;
  }
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
gateway_dir=$(mktemp -d)
gateway_env="$gateway_dir/gateway.env"
compose() { docker compose -p "$project" --env-file "$envfile" -f "$base/compose.yaml" "$@"; }
source "$packet/compose_absence.sh"
started=0
cleanup() {
  local job=$? clean=0
  if (( started )); then compose down --volumes --remove-orphans >/dev/null 2>&1 || clean=$?; fi
  ops820_compose_absent "$project" || clean=1
  rm -f -- "$envfile"
  rm -f -- "$gateway_env"
  rmdir -- "$gateway_dir" || clean=1
  echo "restore_job_exit=$job restore_cleanup_exit=$clean"
  (( clean == 0 )) || job=1
  exit "$job"
}
trap cleanup EXIT
cp "$snapshot/credentials.env" "$envfile"
# Fresh names and ports: restored credentials never connect this drill to a live network.
sed -i -e 's/^AUTH_PORT=.*/AUTH_PORT=18310/' \
  -e 's/^REST_PORT=.*/REST_PORT=18311/' -e 's/^STORAGE_PORT=.*/STORAGE_PORT=18312/' "$envfile"
python3 "$packet/gateway_runtime_env.py" "$envfile" "$gateway_env" >/dev/null
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
compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
  < "$packet/gateway-bootstrap-smoke.sql" >/dev/null
compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
  < "$packet/gateway-helper-smoke.sql" >/dev/null
for fixture in gateway_negative_private_schema.sql gateway_negative_private_function.sql; do
  set +e
  private_output=$(cat "$packet/$fixture" "$packet/gateway-helper-smoke.sql" |
    compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 2>&1)
  private_exit=$?
  set -e
  case "$fixture" in
    gateway_negative_private_schema.sql) expected='gateway private helper boundary failed' ;;
    gateway_negative_private_function.sql) expected='gateway helper effective grant drift' ;;
  esac
  if (( private_exit == 0 )) || [[ "$private_output" != *"$expected"* ]]; then
    echo "gateway private grant fixture failed expected oracle: $fixture exit=$private_exit" >&2
    exit 1
  fi
done
compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
  < "$packet/gateway-helper-smoke.sql" >/dev/null
docker run --rm --network "${project}_private" --read-only --cap-drop ALL \
  --env-file "$gateway_env" \
  -v "$packet/gateway-runtime-smoke.sql:/gateway-runtime-smoke.sql:ro" --entrypoint bash "$image" \
  -c 'exec psql "$ELEVATEO_ATTACHMENT_GATEWAY_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f /gateway-runtime-smoke.sql' >/dev/null
for fixture in gateway_negative_createrole.sql gateway_negative_membership.sql \
  gateway_negative_wrong_owner.sql; do
  set +e
  gateway_output=$(cat "$packet/$fixture" "$packet/gateway-bootstrap-smoke.sql" |
    compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 2>&1)
  gateway_exit=$?
  set -e
  if (( gateway_exit == 0 )) || [[ "$gateway_output" != *'gateway restricted login bootstrap smoke failed'* ]]; then
    echo "gateway negative fixture failed expected oracle: $fixture exit=$gateway_exit" >&2
    exit 1
  fi
done
compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
  < "$packet/gateway-bootstrap-smoke.sql" >/dev/null
compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 \
  < "$packet/role_reachability.sql" >/dev/null
set +e
negative_output=$(cat "$packet/role_negative_prefix.sql" "$packet/role_reachability.sql" |
  compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 2>&1)
negative_exit=$?
set -e
if (( negative_exit == 0 )) || [[ "$negative_output" != *'role reachability drift: unexpected SET path'* ]]; then
  echo "role negative fixture failed expected oracle; exit=$negative_exit" >&2
  exit 1
fi
absent=$(compose exec -T db psql -U supabase_admin -d postgres -X -At -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM pg_roles WHERE rolname='ops820_probe_bridge'")
[[ "$absent" == 0 ]] || { echo 'role negative fixture did not roll back' >&2; exit 1; }
set +e
direct_output=$(cat "$packet/direct_role_negative_prefix.sql" "$packet/post_restore.sql" |
  compose exec -T db psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 2>&1)
direct_exit=$?
set -e
if (( direct_exit == 0 )) || [[ "$direct_output" != *'runtime role privilege drift'* ]]; then
  echo "direct role negative fixture failed expected oracle; exit=$direct_exit" >&2
  exit 1
fi
replication=$(compose exec -T db psql -U supabase_admin -d postgres -X -At -v ON_ERROR_STOP=1 \
  -c "SELECT rolreplication FROM pg_roles WHERE rolname='elevateo_api'")
[[ "$replication" == f ]] || { echo 'direct role negative fixture did not roll back' >&2; exit 1; }
echo "PASS catalog/RLS/role reachability; negative_fixture_exit=$negative_exit direct_negative_exit=$direct_exit cleanup=0"
docker run --rm --network "${project}_private" --read-only --cap-drop ALL --memory 128m \
  --env-file "$envfile" -v "$base/drill-object.py:/drill.py:ro" --entrypoint python3 \
  sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a /drill.py verify
