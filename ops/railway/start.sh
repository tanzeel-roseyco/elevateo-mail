#!/bin/bash
set -euo pipefail
# AIDEV-NOTE: Transport secrets are server-only; fail closed and terminate both children if either exits.
# AIDEV-NOTE: Bound canonical decimal input before arithmetic to exclude octal and integer overflow.
validate_port() {
  if [[ ! $1 =~ ^[1-9][0-9]{0,4}$ ]] || (( 10#$1 > 65535 )); then
    printf '%s must be a canonical decimal port in 1..65535\n' "$2" >&2
    exit 1
  fi
}
validate_port "${PORT:-}" PORT
validate_port "${FLEET_SSH_PORT:-}" FLEET_SSH_PORT
[[ ${FLEET_SSH_HOST:-} =~ ^[a-zA-Z0-9.-]+$ ]]
[[ ${FLEET_FORWARD_USER:-} =~ ^[a-z_][a-z0-9_-]*$ ]]
: "${FLEET_FORWARD_KEY_BASE64:?required}" "${FLEET_KNOWN_HOSTS_BASE64:?required}"
umask 077
install -d -m 0700 /tmp/elevateo-ssh
printf '%s' "$FLEET_FORWARD_KEY_BASE64" | base64 -d > /tmp/elevateo-ssh/key
printf '%s' "$FLEET_KNOWN_HOSTS_BASE64" | base64 -d > /tmp/elevateo-ssh/known_hosts
unset FLEET_FORWARD_KEY_BASE64 FLEET_KNOWN_HOSTS_BASE64
envsubst '${PORT}' < /etc/nginx/elevateo.conf.template > /tmp/nginx.conf
ssh -NT -p "$FLEET_SSH_PORT" -L 127.0.0.1:4710:launch-api:3000 \
  -L 127.0.0.1:4711:oauth-proxy:8080 \
  -o BatchMode=yes -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=/tmp/elevateo-ssh/known_hosts -o IdentitiesOnly=yes \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -i /tmp/elevateo-ssh/key "$FLEET_FORWARD_USER@$FLEET_SSH_HOST" &
transport_pid=$!
nginx -c /tmp/nginx.conf -g 'daemon off;' &
web_pid=$!
cleanup() { kill "$transport_pid" "$web_pid" 2>/dev/null || true; wait "$transport_pid" "$web_pid" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 143' TERM INT
set +e
wait -n "$transport_pid" "$web_pid"
exit 1
