#!/bin/sh
set -eu
# AIDEV-NOTE: Coordinator grants a distinct fleet lease; fake Auth uses only an isolated internal Docker network.
image=nginx:1.28.3-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
network=elevateo-sso-proxy-test
auth=elevateo-sso-proxy-fake
proxy=elevateo-sso-proxy-check
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# AIDEV-NOTE: Refuse stale names before installing cleanup so another run's resources can never be removed.
for name in "$proxy" "$auth"; do
  ids=$(docker container ls -aq --filter "name=^/$name$") || { echo 'Proxy preflight listing failed' >&2; exit 1; }
  if [ -n "$ids" ]; then echo 'Proxy test container already exists; inspect ownership' >&2; exit 1; fi
done
ids=$(docker network ls -q --filter "name=^$network$") || { echo 'Proxy preflight listing failed' >&2; exit 1; }
if [ -n "$ids" ]; then echo 'Proxy test network already exists; inspect ownership' >&2; exit 1; fi
cleanup() {
  # AIDEV-NOTE: Listing must succeed; inspect failure alone cannot distinguish absence from daemon failure.
  failed=0
  for name in "$proxy" "$auth"; do
    ids=$(docker container ls -aq --filter "name=^/$name$") || { failed=1; continue; }
    if [ -n "$ids" ]; then docker rm -f "$name" >/dev/null || failed=1; fi
    ids=$(docker container ls -aq --filter "name=^/$name$") || { failed=1; continue; }
    [ -z "$ids" ] || failed=1
  done
  ids=$(docker network ls -q --filter "name=^$network$") || return 1
  if [ -n "$ids" ]; then docker network rm "$network" >/dev/null || failed=1; fi
  ids=$(docker network ls -q --filter "name=^$network$") || return 1
  [ -z "$ids" ] || failed=1
  [ "$failed" = 0 ]
}
finish() {
  result=$?
  trap - EXIT INT TERM
  if ! cleanup; then echo 'Proxy cleanup failed or absence could not be verified' >&2; result=1; fi
  exit "$result"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker network create --internal --label elevateo.task=task_8bef3d83f3ab "$network" >/dev/null
docker run -d --rm --name "$auth" --network "$network" --network-alias auth \
  --label elevateo.task=task_8bef3d83f3ab --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges --user 10001:10001 --entrypoint nginx \
  -v "$directory/auth-proxy-fake.conf:/etc/nginx/test.conf:ro" "$image" \
  -c /etc/nginx/test.conf -g 'daemon off;' >/dev/null
docker run -d --rm --name "$proxy" --network "$network" \
  --label elevateo.task=task_8bef3d83f3ab --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges --user 10001:10001 --entrypoint nginx \
  -v "$directory/auth-browser-proxy.conf:/etc/nginx/test.conf:ro" "$image" \
  -c /etc/nginx/test.conf -g 'daemon off;' >/dev/null
docker exec "$proxy" nginx -t -c /etc/nginx/test.conf
docker exec -i "$proxy" sh /dev/stdin <<'CHECKS'
set -eu
for attempt in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:8080/authorize >/dev/null; then break; fi
  sleep 1
done
curl -fsS -D /tmp/headers 'http://127.0.0.1:8080/authorize?state=secret-state&code_challenge=challenge' \
  -H 'X-Forwarded-Proto: http' -H 'Forwarded: host=evil' -H 'Authorization: Bearer secret' \
  -H 'Cookie: flow=opaque' > /tmp/body
grep -F 'path=/authorize?state=secret-state&code_challenge=challenge' /tmp/body
grep -F 'host=mail.elevateoco.com proto=https cookie=flow=opaque auth= forwarded=' /tmp/body
grep -Fi 'cache-control: no-store' /tmp/headers
grep -Fi 'referrer-policy: no-referrer' /tmp/headers
test "$(curl -sS -o /dev/null -w '%{http_code}' 'http://127.0.0.1:8080/callback?code=private-code')" = 302
curl -sS -D /tmp/headers -o /dev/null 'http://127.0.0.1:8080/callback?code=private-code'
grep -Fi 'location: https://mail.elevateoco.com/v1/auth/sso/callback?code=opaque' /tmp/headers
grep -Fi 'set-cookie: auth=opaque; HttpOnly' /tmp/headers
for path in /token /admin /user /auth/v1/authorize /callback/; do
  test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:8080$path")" = 404
done
test "$(curl -sS -X POST -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/authorize)" = 403
CHECKS
if ! logs=$(docker logs "$proxy" 2>&1); then
  echo 'Proxy log capture failed' >&2
  exit 1
fi
if printf '%s\n' "$logs" | grep -E 'secret-state|private-code|secret'; then
  echo 'OAuth query leaked into proxy logs' >&2
  exit 1
fi
cleanup
trap - EXIT INT TERM
echo 'AUTH_PROXY_CHECKS_PASS'
