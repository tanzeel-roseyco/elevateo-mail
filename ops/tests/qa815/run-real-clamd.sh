#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-real-clamd.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
pin=clamav/clamav@sha256:638d90201ee7ee6a82d249a2fc23b132e578673b5f1f2766852b127676ca1ef6
python_image=sha256:48a11b7ba705fd53bf15248d1f94d36c39549903c5d59edcfa2f3f84126e7b44
nonce=$(python3 -c 'import secrets; print(secrets.token_hex(4))')
prefix=qa815-clamd-$short-$nonce
network=$prefix-net
volume=$prefix-signatures
server=$prefix-server
client=$prefix-client
context=$(mktemp -d /tmp/qa815-real-clamd.XXXXXXXX)
fixtures=$(mktemp -d /tmp/qa815-clamd-fixtures.XXXXXXXX)
log="$root/docs/completion/qa815-evidence/real-clamd-$short.txt"
exec 9>"$lock"
flock -x 9
image_was_present=0
if docker image inspect "$pin" >/dev/null 2>&1; then image_was_present=1; fi
printf 'source=%s\npin=%s\npython_image=%s\nstarted=%s\nimage_was_present=%s\n' \
  "$candidate" "$pin" "$python_image" "$(date -u +%FT%TZ)" "$image_was_present" > "$log"
cleanup() {
  status=$?
  set +e
  for name in "$client" "$server"; do
    if docker container inspect "$name" >/dev/null 2>&1; then
      owner=$(docker container inspect --format '{{index .Config.Labels "qa815.owner"}}' "$name")
      if [[ $owner == soren-real-clamd ]]; then
        docker rm -f "$name" >> "$log" 2>&1 || status=90
      else
        printf 'cleanup_error=unexpected container label %s\n' "$name" >> "$log"
        status=91
      fi
    fi
  done
  if docker network inspect "$network" >/dev/null 2>&1; then
    owner=$(docker network inspect --format '{{index .Labels "qa815.owner"}}' "$network")
    if [[ $owner == soren-real-clamd ]]; then
      docker network rm "$network" >> "$log" 2>&1 || status=92
    else
      printf 'cleanup_error=unexpected network label\n' >> "$log"
      status=93
    fi
  fi
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    owner=$(docker volume inspect --format '{{index .Labels "qa815.owner"}}' "$volume")
    if [[ $owner == soren-real-clamd ]]; then
      docker volume rm "$volume" >> "$log" 2>&1 || status=94
    else
      printf 'cleanup_error=unexpected volume label\n' >> "$log"
      status=95
    fi
  fi
  if [[ $image_was_present == 0 ]] && docker image inspect "$pin" >/dev/null 2>&1; then
    docker image rm "$pin" >> "$log" 2>&1 || status=96
  fi
  find "$context" -mindepth 1 -depth -delete
  rmdir "$context"
  find "$fixtures" -mindepth 1 -depth -delete
  rmdir "$fixtures"
  printf 'run_exit=%s\nsource_archive_absent=%s\nfixtures_absent=%s\nremaining_containers=%s\nremaining_network=%s\nremaining_volume=%s\nremaining_pulled_pin=%s\nfinished=%s\n' \
    "$status" "$([[ ! -e $context ]] && echo yes || echo no)" \
    "$([[ ! -e $fixtures ]] && echo yes || echo no)" \
    "$(docker ps -a --filter "name=$prefix" -q | wc -l)" \
    "$(docker network ls --filter "name=^$network$" -q | wc -l)" \
    "$(docker volume ls --filter "name=^$volume$" -q | wc -l)" \
    "$(docker image inspect "$pin" >/dev/null 2>&1 && echo yes || echo no)" \
    "$(date -u +%FT%TZ)" >> "$log"
  exit "$status"
}
trap cleanup EXIT
git archive "$candidate" | tar -x -C "$context"
test -f "$context/ops/ops820/clamav_probe.py"
test "$(docker image inspect --format '{{.Id}}' "$python_image")" = "$python_image"
timeout 600s docker pull --platform linux/amd64 "$pin" >> "$log" 2>&1
printf 'clamd_image_id=%s\nclamd_image_bytes=%s\nclamd_arch=%s\nclamd_repo_digests=%s\n' \
  "$(docker image inspect --format '{{.Id}}' "$pin")" \
  "$(docker image inspect --format '{{.Size}}' "$pin")" \
  "$(docker image inspect --format '{{.Architecture}}' "$pin")" \
  "$(docker image inspect --format '{{json .RepoDigests}}' "$pin")" >> "$log"
test "$(docker image inspect --format '{{.Architecture}}' "$pin")" = amd64
docker image inspect --format '{{json .RepoDigests}}' "$pin" | grep -Fq "$pin"
docker network create --internal --label qa815.owner=soren-real-clamd "$network" >> "$log"
docker volume create --label qa815.owner=soren-real-clamd "$volume" >> "$log"
timeout 30s docker run -d --name "$server" --label qa815.owner=soren-real-clamd \
  --network "$network" --network-alias clamav --memory 2g --memory-swap 2g --cpus 2 \
  --pids-limit 256 --env CLAMAV_NO_FRESHCLAMD=true \
  --mount "type=volume,source=$volume,target=/var/lib/clamav" "$pin" >> "$log" 2>&1
printf 'clamd_port_bindings=%s\nclamd_networks=%s\n' \
  "$(docker container inspect --format '{{json .HostConfig.PortBindings}}' "$server")" \
  "$(docker container inspect --format '{{json .NetworkSettings.Networks}}' "$server" | python3 -c 'import json,sys; print(",".join(json.load(sys.stdin)))')" >> "$log"
test "$(docker container inspect --format '{{json .HostConfig.PortBindings}}' "$server")" = '{}'
docker exec "$server" sh -ceu \
  'find /var/lib/clamav -maxdepth 1 -type f \( -name "*.cvd" -o -name "*.cld" \) | grep -q .; for file in /var/lib/clamav/*; do test ! -f "$file" || sha256sum "$file"; done; clamd --version' \
  >> "$log" 2>&1
timeout 30s docker run --rm --name "$client" --label qa815.owner=soren-real-clamd \
  --network none --memory 512m --memory-swap 512m --cpus 1 --pids-limit 64 \
  --user "$(id -u):$(id -g)" --env PYTHONDONTWRITEBYTECODE=1 \
  --mount "type=bind,source=$context/ops/ops820,target=/workspace,readonly" \
  --mount "type=bind,source=$fixtures,target=/fixtures" \
  "$python_image" python3 /workspace/clamav_probe.py prepare /fixtures/bytes >> "$log" 2>&1
timeout 150s docker run --rm --name "$client" --label qa815.owner=soren-real-clamd \
  --network "$network" --memory 512m --memory-swap 512m --cpus 1 --pids-limit 64 \
  --user "$(id -u):$(id -g)" --env PYTHONDONTWRITEBYTECODE=1 \
  --mount "type=bind,source=$context/ops/ops820,target=/workspace,readonly" \
  --mount "type=bind,source=$fixtures,target=/fixtures,readonly" \
  "$python_image" sh -ceu '
    python3 - <<"PY"
import socket,time
for attempt in range(60):
    try:
        with socket.create_connection(("clamav",3310),timeout=2) as connection:
            connection.sendall(b"zPING\0")
            if connection.recv(16)==b"PONG\0":
                print("clamd_health=PONG")
                break
    except OSError:
        pass
    time.sleep(2)
else:
    raise SystemExit("clamd health unavailable")
PY
    python3 /workspace/clamav_probe.py verify /fixtures/bytes
  ' >> "$log" 2>&1
