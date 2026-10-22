#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: No host ports or egress, no production mounts, no image builds/pulls; shared lease fences Docker.
[[ $(cat /etc/machine-id) == 5992663e9659484e90c0129edd5bd24b ]]
base=/tmp/elevateo-mailruntime20261023
[[ $(realpath "$base") == "$base" && -d $base/source && -d $base/evidence ]]
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -x -w 120 9 || { echo 'fleet Docker lease busy' >&2; exit 4; }
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker() { command docker --host unix:///var/run/docker.sock "$@"; }
image=mcr.microsoft.com/playwright@sha256:35246d87a7c88ea9b771c65d33171b2611b02a8253b4b12ce6f94376c55f99f2
mox=/home/tanzeel/elevateo-mail-completion-20261015/control/mail1017/release/mox
name=mailruntime20261023
docker image inspect "$image" > "$base/evidence/image.json"
[[ $(sha256sum "$mox" | cut -d' ' -f1) == 29f054f2b2bc0f191b22576ffbd95fbe74901dae31ac749058c7efb8f61e547c ]]
! docker container inspect "$name" >/dev/null 2>&1
printf 'nameserver 127.0.0.1\noptions timeout:1 attempts:1\n' > "$base/resolv.conf"
df -B1 /tmp > "$base/evidence/space-before.txt"
cleanup() {
  status=$?
  trap - EXIT
  if docker container inspect "$name" >/dev/null 2>&1; then
    [[ $(docker inspect -f '{{index .Config.Labels "elevateo.task"}}' "$name") == "$name" ]] || exit 91
    docker inspect -f '{{json .Mounts}}' "$name" > "$base/evidence/mounts.json"
    docker rm -f "$name" > "$base/evidence/cleanup.txt" || exit 92
  fi
  ! docker container inspect "$name" >/dev/null 2>&1 || exit 93
  df -B1 /tmp > "$base/evidence/space-after.txt"
  printf 'exit=%s\ncontainer_absent=1\nno_images_builds_volumes_created=1\n' "$status" >> "$base/evidence/cleanup.txt"
  exit "$status"
}
trap cleanup EXIT
find "$base/source" -type f -print0 | sort -z | xargs -0 sha256sum > "$base/evidence/source-sha256.txt"
rm -f "$base/evidence/runtime-result.json"
docker run --rm --name "$name" --label "elevateo.task=$name" --network none --read-only \
  --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID --cap-add DAC_OVERRIDE \
  --cap-add NET_BIND_SERVICE --cap-add FOWNER --cap-add KILL --security-opt no-new-privileges \
  --memory 2g --cpus 2 --pids-limit 128 --tmpfs /tmp:rw,nosuid,size=1073741824,mode=1777 \
  --mount "type=bind,src=$base/source,dst=/src,readonly" \
  --mount "type=bind,src=$mox,dst=/release/mox,readonly" \
  --mount "type=bind,src=$base/evidence,dst=/evidence" \
  --mount "type=bind,src=$base/resolv.conf,dst=/etc/resolv.conf,readonly" \
  --add-host mail.dispatch.company.com:127.0.0.1 -w /src \
  -e PYTHONDONTWRITEBYTECODE=1 -e MOX_BINARY=/release/mox -e GOMEMLIMIT=384MiB -e GOMAXPROCS=2 \
  --entrypoint bash "$image" -c 'python3 -m unittest discover -s /src -v && timeout 240 python3 /src/runtime_acceptance.py' \
  > "$base/evidence/run.log" 2>&1
cat "$base/evidence/runtime-result.json"
