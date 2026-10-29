#!/usr/bin/env bash
set -Eeuo pipefail
base=$(cd -- "$(dirname -- "$0")" && pwd)
phase=${1:?create|verify|cleanup}
case "$phase" in create|verify|cleanup) ;; *) exit 64;; esac
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n 9 || exit 75
compose() { docker compose -p elevateo-mail-test --env-file "$base/.env.test" -f "$base/compose.yaml" "$@"; }
case "$phase" in
create) compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "CREATE TABLE public.ops402_backup_marker(value text); INSERT INTO public.ops402_backup_marker VALUES ('paired-backup-marker'); CREATE ROLE ops402_backup_role NOLOGIN; CREATE ROLE ops402_backup_member NOLOGIN; GRANT ops402_backup_role TO ops402_backup_member;" ;;
verify) compose exec -T db psql -U supabase_admin -d postgres -At -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF (SELECT count(*) FROM public.ops402_backup_marker WHERE value='paired-backup-marker') <> 1 OR (SELECT count(*) FROM public.ops402_backup_marker) <> 1 OR NOT pg_has_role('ops402_backup_member','ops402_backup_role','MEMBER') THEN RAISE EXCEPTION 'persistence marker mismatch'; END IF; END \$\$;" ;;
cleanup) compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c 'DROP TABLE IF EXISTS public.ops402_backup_marker; DROP ROLE IF EXISTS ops402_backup_member; DROP ROLE IF EXISTS ops402_backup_role' ;;
esac
docker run --rm --network elevateo-mail-test_private --read-only --cap-drop ALL --memory 128m \
  --env-file "$base/.env.test" -v "$base/drill-object.py:/drill.py:ro" --entrypoint python3 \
  sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a /drill.py "$phase"
