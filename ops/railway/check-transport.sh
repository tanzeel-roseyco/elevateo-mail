#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Only disposable fake services and keys enter this network; never attach production networks.
cd "$(dirname "$0")/../.."
task=elevateo-launch-20261023-transport
work=/tmp/$task
image=$task:check
network=$task
mkdir -p "$work"
exec 9>"$work/lease"
flock -n 9 || { echo 'Transport lease occupied' >&2; exit 1; }
containers=("$task-client" "$task-ssh" "$task-api" "$task-oauth")
builder=$task
volume=buildx_buildkit_${builder}0_state
builder_container=buildx_buildkit_${builder}0
# AIDEV-NOTE: Checked inventories distinguish absence from Docker/permission failures before mutation.
inventory() {
  docker buildx ls --format '{{.Name}}' > "$work/builders.txt" &&
  docker container ls -a --format '{{.Names}}' > "$work/containers.txt" &&
  docker network ls --format '{{.Name}}' > "$work/networks.txt" &&
  docker image ls --format '{{.Repository}}:{{.Tag}}' > "$work/images.txt" &&
  docker volume ls --format '{{.Name}}' > "$work/volumes.txt"
}
present() { grep -Fxq -- "$2" "$work/$1.txt"; }
inventory
for resource in "$builder"; do
  if present builders "$resource"; then echo 'Refusing existing builder' >&2; exit 1; fi
done
for kind in images volumes networks; do
  case $kind in images) resource=$image;; volumes) resource=$volume;; networks) resource=$network;; esac
  if present "$kind" "$resource"; then echo "Refusing existing $kind" >&2; exit 1; fi
done
if [[ -d "$work/keys" && -n $(find "$work/keys" -mindepth 1 -maxdepth 1 -print -quit) ]]; then
  echo 'Refusing nonempty key directory' >&2; exit 1
fi
for container in "${containers[@]}" "$builder_container"; do
  if present containers "$container"; then echo "Refusing existing resource: $container" >&2; exit 1; fi
done
cleanup() {
  result=$?
  trap - EXIT
  set +e
  if inventory; then
    # AIDEV-NOTE: Inspect task-owned mounts before removal; every failed removal keeps cleanup failed.
    for container in "${containers[@]}" "$builder_container"; do
      if present containers "$container"; then
        docker inspect --format '{{json .Mounts}}' "$container" || result=1
      fi
    done
    if present builders "$builder"; then docker buildx rm "$builder" || result=1; fi
    for container in "${containers[@]}"; do
      if present containers "$container"; then docker rm -f "$container" || result=1; fi
    done
    if present networks "$network"; then docker network rm "$network" || result=1; fi
    if present images "$image"; then docker image rm "$image" || result=1; fi
    # Buildx normally removes this volume. Only an inspected, unattached exact leftover may be removed.
    if inventory; then
      if present volumes "$volume"; then
        if docker volume inspect "$volume" &&
          docker container ls -a --filter "volume=$volume" --format '{{.Names}}' > "$work/volume-users.txt" &&
          [[ ! -s "$work/volume-users.txt" ]]; then
          docker volume rm "$volume" || result=1
        else result=1; fi
      fi
    else result=1; fi
  else result=1; fi
  rm -f "$work"/keys/{client,client.pub,ssh_host_ed25519_key,ssh_host_ed25519_key.pub,authorized_keys,known_hosts,wrong_hosts} || result=1
  if inventory; then
    for container in "${containers[@]}" "$builder_container"; do
      if present containers "$container"; then result=1; fi
    done
    if present builders "$builder" || present images "$image" || present volumes "$volume" ||
      present networks "$network"; then result=1; fi
  else result=1; fi
  echo "CLEANUP exit=$result"
  exit "$result"
}
trap cleanup EXIT
# AIDEV-NOTE: A task-owned builder makes cache deletion safe without pruning another worker's build cache.
docker buildx create --name "$builder" --driver docker-container >/dev/null
docker buildx build --builder "$builder" --load -t "$image" -f ops/railway/transport.Dockerfile .
mkdir -p "$work/keys"
docker run --rm --user 0 -v "$work/keys:/keys" --entrypoint bash "$image" -ec '
  ssh-keygen -q -t ed25519 -N "" -f /keys/client
  ssh-keygen -q -t ed25519 -N "" -f /keys/ssh_host_ed25519_key
  cp /keys/client.pub /keys/authorized_keys
  chmod 755 /keys; chmod 644 /keys/authorized_keys
  printf "[transport]:2222 " > /keys/known_hosts
  cat /keys/ssh_host_ed25519_key.pub >> /keys/known_hosts
  printf "[transport]:2222 " > /keys/wrong_hosts
  cat /keys/client.pub >> /keys/wrong_hosts'
docker network create --internal "$network" >/dev/null
for pair in 'api 3000 launch-api' 'oauth 8080 oauth-proxy'; do
  read -r suffix port alias <<< "$pair"
  docker run -d --name "$task-$suffix" --network "$network" --network-alias "$alias" \
    --read-only --cap-drop ALL --security-opt no-new-privileges:true --entrypoint node "$image" \
    -e "require('http').createServer((q,s)=>s.end('$alias')).listen($port,'0.0.0.0')" >/dev/null
done
docker run -d --name "$task-ssh" --network "$network" --network-alias transport \
  --read-only --cap-drop ALL --cap-add SETUID --cap-add SETGID --cap-add SYS_CHROOT \
  --security-opt no-new-privileges:true --pids-limit 32 --memory 96m --cpus .25 \
  --tmpfs /run:mode=0755 --tmpfs /run/sshd:mode=0755 --tmpfs /tmp:mode=1777 \
  -v "$work/keys:/run/keys:ro" "$image" -o LogLevel=DEBUG1 >/dev/null
docker run -d --name "$task-client" --network "$network" --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --tmpfs /tmp -v "$work/keys:/keys:ro" \
  --entrypoint sleep "$image" 300 >/dev/null
docker exec "$task-ssh" /usr/sbin/sshd -T -f /etc/ssh/elevateo_sshd_config > "$work/effective-config.txt"
docker inspect "$task-ssh" > "$work/container-inspect.json"
docker exec -d "$task-ssh" node -e 'require("net").createServer(s=>s.end("forbidden")).listen("/tmp/forbidden.sock")'
docker exec "$task-ssh" node -e '
let attempts=0;function probe(){const s=require("net").connect("/tmp/forbidden.sock");
s.on("data",d=>{if(d.toString()!=="forbidden")process.exit(1);console.log("PASS Unix fixture reachable inside server")});
s.on("error",e=>{if(++attempts===20)throw e;setTimeout(probe,100)})}probe()'
# AIDEV-NOTE: Prove the forwarding user can bind this directory, excluding filesystem-denial false positives.
docker exec --user forward "$task-ssh" node -e '
const s=require("net").createServer();s.listen("/tmp/listener-probe.sock",()=>s.close());s.on("error",()=>process.exit(1))'
docker exec "$task-ssh" test ! -e /tmp/denied-listener.sock
grep -qx 'allowstreamlocalforwarding no' "$work/effective-config.txt"
docker exec -i "$task-client" bash -s <<'CLIENT'
set -euo pipefail
sshargs=(-F /dev/null -i /keys/client -p 2222 -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/keys/known_hosts -o ConnectTimeout=3)
for attempt in {1..30}; do
  if printf 'GET / HTTP/1.0\r\n\r\n' | timeout 4 ssh "${sshargs[@]}" -W launch-api:3000 forward@transport >/dev/null 2>/tmp/ready; then break; fi
  sleep .2
done
for destination in launch-api:3000 oauth-proxy:8080; do
  response=$(printf 'GET / HTTP/1.0\r\n\r\n' | timeout 5 ssh "${sshargs[@]}" -W "$destination" forward@transport)
  [[ "$response" == *"${destination%:*}"* ]]
  echo "PASS allowed $destination"
done
deny() {
  label=$1; shift
  set +e
  timeout 5 "$@" >/tmp/denied.out 2>/tmp/denied.err
  status=$?
  set -e
  [[ $status -ne 0 && $status -ne 124 ]]
  cat /tmp/denied.err
  echo "PASS denied $label"
}
deny shell ssh "${sshargs[@]}" forward@transport id
grep -q 'open failed' /tmp/denied.err
deny arbitrary ssh "${sshargs[@]}" -W launch-api:8080 forward@transport
grep -q 'administratively prohibited' /tmp/denied.err
deny loopback ssh "${sshargs[@]}" -W 127.0.0.1:2222 forward@transport
deny remote ssh "${sshargs[@]}" -o ExitOnForwardFailure=yes -N -R 9000:launch-api:3000 forward@transport
grep -q 'remote port forwarding failed' /tmp/denied.err
# AIDEV-NOTE: A fresh listener path prevents EADDRINUSE from impersonating a policy rejection.
deny remote-unix ssh -v "${sshargs[@]}" -o ExitOnForwardFailure=yes -N -R /tmp/denied-listener.sock:launch-api:3000 forward@transport
grep -q 'remote port forwarding failed for listen path /tmp/denied-listener.sock' /tmp/denied.err
grep -q 'Server has disabled streamlocal forwarding' /tmp/denied.err
# First supplied option wins in OpenSSH, so pin rejection uses an independent argument list.
deny wrong-pin ssh -F /dev/null -i /keys/client -p 2222 -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=/keys/wrong_hosts forward@transport
grep -q 'HOST IDENTIFICATION HAS CHANGED' /tmp/denied.err
deny unauthorized-key ssh -F /dev/null -i /keys/ssh_host_ed25519_key -p 2222 -o BatchMode=yes \
  -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/keys/known_hosts \
  -W launch-api:3000 forward@transport
grep -q 'Permission denied (publickey)' /tmp/denied.err
ssh "${sshargs[@]}" -N -L 127.0.0.1:9001:/tmp/forbidden.sock forward@transport 2>/tmp/unix.err &
tunnel=$!
sleep 1
node -e 'const s=require("net").connect(9001,"127.0.0.1");s.on("error",e=>{if(e.code==="ECONNREFUSED")process.exit(1)});s.on("data",()=>process.exit(1));s.on("connect",()=>s.write("probe"));setTimeout(()=>s.destroy(),500)'
sleep .5
kill "$tunnel"; wait "$tunnel" || true
cat /tmp/unix.err
grep -q 'open failed' /tmp/unix.err
echo 'PASS denied local-unix'
CLIENT
docker logs "$task-ssh" > "$work/sshd.log" 2>&1
grep -q 'refused streamlocal port forward' "$work/sshd.log"
docker exec "$task-ssh" node -e '
const fs=require("fs");const status=fs.readFileSync("/proc/1/status","utf8");
if(!/CapEff:\s+00000000000400c0/.test(status)||!/NoNewPrivs:\s+1/.test(status))process.exit(1);
try{fs.writeFileSync("/etc/forbidden","x");process.exit(1)}catch(e){if(e.code!=="EROFS")throw e}
try{fs.writeFileSync("/run/keys/forbidden","x");process.exit(1)}catch(e){if(e.code!=="EROFS")throw e}
console.log("PASS caps, no-new-privileges, read-only root and keys");'
[[ $(docker inspect --format '{{len .NetworkSettings.Networks}}' "$task-ssh") == 1 ]]
[[ $(docker inspect --format '{{len .Mounts}}' "$task-ssh") == 1 ]]
echo 'PASS single isolated network; no host or Docker authority'
echo 'PASS transport checks'
