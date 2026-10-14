#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=$(cd -- "$(dirname -- "$0")" && pwd)
stack=${1:-}; action=${2:-}
case "$stack" in live|test) ;; *) echo 'usage: stack.sh live|test init|up|status|restart|stop|backup' >&2; exit 64;; esac
project="elevateo-mail-$stack"
state="$base/.env.$stack"
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n 9 || { echo 'Docker mutation lease occupied' >&2; exit 75; }
admit() {
  local available disk
  available=$(awk '/MemAvailable:/ {printf "%.0f\n", $2*1024}' /proc/meminfo)
  disk=$(df -B1 --output=avail "$base" | tail -1)
  awk -v a="$available" 'BEGIN {exit !(a >= 8589934592)}' || { echo 'RAM admission denied' >&2; exit 75; }
  (( disk >= 21474836480 )) || { echo 'Disk admission denied' >&2; exit 75; }
}
compose() { docker compose --project-name "$project" --env-file "$state" -f "$base/compose.yaml" "$@"; }
case "$action" in
init)
  [[ ! -e "$state" ]] || { echo 'Existing credentials preserved' >&2; exit 73; }
  python3 - "$state" "$stack" <<'PY'
import base64,hashlib,hmac,json,os,secrets,sys,time
path,stack=sys.argv[1:]; key=secrets.token_hex(32)
def token(role):
    enc=lambda x:base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).rstrip(b'=')
    head=enc({'alg':'HS256','typ':'JWT'}); body=enc({'role':role,'iss':'supabase','iat':int(time.time()),'exp':int(time.time())+31536000})
    msg=head+b'.'+body
    return (msg+b'.'+base64.urlsafe_b64encode(hmac.new(key.encode(),msg,hashlib.sha256).digest()).rstrip(b'=')).decode()
port=18210 if stack=='live' else 18220
values={'STACK_ID':'elevateo-mail-'+stack,'POSTGRES_PASSWORD':secrets.token_hex(32),'AUTH_DB_PASSWORD':secrets.token_hex(32),'REST_DB_PASSWORD':secrets.token_hex(32),'STORAGE_DB_PASSWORD':secrets.token_hex(32),'JWT_SECRET':key,'ANON_KEY':token('anon'),'SERVICE_ROLE_KEY':token('service_role'),'AUTH_PORT':str(port),'REST_PORT':str(port+1),'STORAGE_PORT':str(port+2)}
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write(''.join(k+'='+v+'\n' for k,v in values.items()))
PY
  ;;
up)
  admit
  compose up -d --wait --wait-timeout 180 db mailpit
  image=$(compose images -q db)
  docker run --rm --network "${project}_private" --env-file "$state" \
    -v "$base/db/98-service-identities.sql:/identities.sql:ro" --entrypoint bash "$image" \
    -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h db -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /identities.sql' >/dev/null
  compose up -d --wait --wait-timeout 180
  ;;
status) compose ps ;;
restart) admit; compose restart; compose up -d --wait --wait-timeout 180 ;;
stop) compose stop ;;
backup)
  [[ -f "$state" ]] || exit 66
  admit
  mkdir -p "$base/.backups/$stack"
  dest=$(mktemp -d "$base/.backups/$stack/$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")
  # AIDEV-NOTE: callers must hold all external DB writers; this stops owned HTTP writers.
  running=$(compose ps --services --status running | awk '/^(auth|rest|storage)$/')
  resume() { local result=$?; if [[ -n "$running" ]]; then compose start $running >/dev/null || result=1; fi; exit "$result"; }
  trap resume EXIT
  compose stop auth rest storage
  compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid())
  THEN RAISE EXCEPTION 'backup requires all external database clients held'; END IF;
END $$;
SQL
  compose exec -T db pg_dump -U supabase_admin -d postgres -Fc > "$dest/database.dump"
  compose exec -T db pg_dumpall -U supabase_admin --globals-only > "$dest/globals.sql"
  cp "$state" "$dest/credentials.env"
  image=$(compose images -q db)
  docker run --rm --network none --read-only --user 0 --entrypoint tar \
    -v "${project}_storage-data:/objects:ro" "$image" -C /objects -cf - . > "$dest/objects.tar"
  (cd "$dest"; sha256sum database.dump globals.sql objects.tar credentials.env > SHA256SUMS)
  echo 'Paired local backup complete; external writer hold and off-host copy remain operator duties.'
  ;;
*) echo 'Unknown action' >&2; exit 64;;
esac
