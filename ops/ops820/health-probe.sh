#!/usr/bin/env bash
# AIDEV-NOTE: no host publication; API and probes share only the disposable restore network.
set -Eeuo pipefail
project=${1:?disposable restore project required}
envfile=${2:?private environment required}
root=${3:?source root required}
[[ "$project" == ops402-restore-* && "$envfile" = /* && "$root" = /* ]] || exit 66
image=${OPS820_SERVER_IMAGE:?pinned server image required}
[[ "$image" == sha256:* || "$image" == *@sha256:* ]] || exit 66
name="${project}-ops820-api"
cleanup() {
  local job=$? clean=0
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker inspect "$name" >/dev/null 2>&1 && clean=1
  echo "health_job_exit=$job health_cleanup_exit=$clean"
  (( clean == 0 )) || job=1
  exit "$job"
}
trap cleanup EXIT
docker run -d --rm --name "$name" --network "${project}_private" --network-alias api \
  --read-only --cap-drop ALL --user 10001:10001 --memory 768m --pids-limit 256 \
  --env-file "$envfile" -e RAILS_ENV=test -e ELEVATEO_MODE=local \
  -e ELEVATEO_OUTBOUND_HOLD=true -e ELEVATEO_SEND_API_ENABLED=false \
  -e ELEVATEO_DB_HOST=db -e ELEVATEO_DB_NAME=postgres -e ELEVATEO_DB_ROLE=elevateo_api \
  -e ELEVATEO_PROCESS=api -e ELEVATEO_AUTH_URL=http://auth:9999 \
  -e ELEVATEO_STORAGE_URL=http://storage:5000 -e ELEVATEO_MAILPIT_URL=http://mailpit:8025 \
  -e ELEVATEO_SMTP_HOST=mailpit -e ELEVATEO_SMTP_PORT=1025 \
  -e ELEVATEO_BROWSER_ORIGIN=http://api:3000 -e ELEVATEO_COOKIE_SECURE=false \
  -e ELEVATEO_LOCAL_HTTP=true \
  -e ELEVATEO_AUTH_JWT_AUDIENCE=authenticated -e ELEVATEO_AUTH_JWT_ALGORITHM=HS256 \
  -e ELEVATEO_AUTH_PASSWORD_MINIMUM=12 \
  -v "$root/apps/server:/workspace/apps/server:ro" \
  --tmpfs /workspace/apps/server/tmp:uid=10001,gid=10001,mode=1770 \
  --tmpfs /workspace/apps/server/log:uid=10001,gid=10001,mode=1770 \
  --tmpfs /tmp --workdir /workspace/apps/server --entrypoint bundle \
  "$image" exec rails server -b 0.0.0.0 -p 3000 >/dev/null
docker run --rm --network "${project}_private" --read-only --cap-drop ALL \
  --memory 128m --entrypoint ruby "$image" -rjson -rnet/http -e '
deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 60
loop do
  begin
    live = Net::HTTP.get_response(URI("http://api:3000/health"))
    ready = Net::HTTP.get_response(URI("http://api:3000/ready"))
    body = JSON.parse(ready.body)
    if live.code == "200" && ready.code == "200" && body["outbound_hold"] == true
      puts "PASS isolated API health and readiness with outbound hold"
      break
    end
  rescue Errno::ECONNREFUSED, SocketError, JSON::ParserError
  end
  abort "health/readiness failed" if Process.clock_gettime(Process::CLOCK_MONOTONIC) >= deadline
  sleep 1
end'
