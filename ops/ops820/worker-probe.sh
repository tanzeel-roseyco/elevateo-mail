#!/usr/bin/env bash
# AIDEV-NOTE: worker starts held on a disposable restore network; no provider identity is injected.
set -Eeuo pipefail
project=${1:?disposable restore project required}
envfile=${2:?private environment required}
root=${3:?source root required}
[[ "$project" == ops402-restore-* && "$envfile" = /* && "$root" = /* ]] || exit 66
image=${OPS820_SERVER_IMAGE:?pinned server image required}
[[ "$image" == sha256:* || "$image" == *@sha256:* ]] || exit 66
name="${project}-ops820-worker"
cleanup() {
  local job=$? clean=0
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker inspect "$name" >/dev/null 2>&1 && clean=1
  echo "worker_job_exit=$job worker_cleanup_exit=$clean"
  (( clean == 0 )) || job=1
  exit "$job"
}
trap cleanup EXIT
docker run -d --rm --name "$name" --network "${project}_private" \
  --read-only --cap-drop ALL --user 10001:10001 --memory 768m --pids-limit 256 \
  --env-file "$envfile" -e RAILS_ENV=test -e ELEVATEO_MODE=local \
  -e ELEVATEO_OUTBOUND_HOLD=true -e ELEVATEO_SEND_API_ENABLED=false \
  -e ELEVATEO_DB_HOST=db -e ELEVATEO_DB_NAME=postgres -e ELEVATEO_DB_ROLE=elevateo_worker \
  -e ELEVATEO_PROCESS=worker -e ELEVATEO_AUTH_URL=http://auth:9999 \
  -e ELEVATEO_STORAGE_URL=http://storage:5000 -e ELEVATEO_MAILPIT_URL=http://mailpit:8025 \
  -e ELEVATEO_SMTP_HOST=mailpit -e ELEVATEO_SMTP_PORT=1025 \
  -e ELEVATEO_BROWSER_ORIGIN=http://api:3000 -e ELEVATEO_COOKIE_SECURE=false \
  -e ELEVATEO_LOCAL_HTTP=true -e ELEVATEO_AUTH_JWT_ISSUER=http://auth:9999 \
  -e ELEVATEO_AUTH_JWT_AUDIENCE=authenticated -e ELEVATEO_AUTH_JWT_ALGORITHM=HS256 \
  -e ELEVATEO_AUTH_PASSWORD_MINIMUM=12 \
  -v "$root/apps/server:/workspace/apps/server:ro" \
  --tmpfs /workspace/apps/server/tmp:uid=10001,gid=10001,mode=1770 \
  --tmpfs /workspace/apps/server/log:uid=10001,gid=10001,mode=1770 \
  --tmpfs /tmp:uid=10001,gid=10001,mode=1770 \
  --workdir /workspace/apps/server --entrypoint bundle \
  "$image" exec ruby bin/worker >/dev/null
deadline=$((SECONDS + 30))
until docker exec "$name" ruby bin/worker-health >/dev/null 2>&1; do
  (( SECONDS < deadline )) || { echo 'worker heartbeat unavailable' >&2; exit 1; }
  sleep 1
done
echo 'PASS isolated held worker heartbeat'
