#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Production Mox serve is tested only on fleet-02 with no external network or host ports.
[[ $(cat /etc/machine-id) == 5992663e9659484e90c0129edd5bd24b ]] || exit 2
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker() { command docker --host unix:///var/run/docker.sock "$@"; }
run=${1:?unique run id required}
[[ $run =~ ^mail1017-r[0-9]{1,3}$ ]] || exit 3
base=/home/tanzeel/elevateo-mail-completion-20261015/control/mail1017
root=$(cd -- "$(dirname -- "$0")" && pwd)
out=$base/$run
tag=elevateo-$run
image=python:3.12.9@sha256:48a11b7ba705fd53bf15248d1f94d36c39549903c5d59edcfa2f3f84126e7b44
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n -x 9 || { echo 'Docker lease busy' >&2; exit 4; }
[[ ! -e $out && -d $root/tests && -f $base/release/mox ]] || exit 5
[[ $(awk '/MemAvailable/ {print $2}' /proc/meminfo) -ge 4194304 ]] || exit 6
[[ $(df -B1 --output=avail "$base" | tail -1) -ge 5368709120 ]] || exit 7
[[ $(sha256sum "$base/release/mox" | cut -d' ' -f1) == 29f054f2b2bc0f191b22576ffbd95fbe74901dae31ac749058c7efb8f61e547c ]] || exit 8
containers=$(docker ps -a --format '{{.Names}}')
! grep -Fxq "$tag" <<< "$containers" || exit 9
# AIDEV-NOTE: Reuse an existing pinned base; this harness creates no image or build cache.
docker image inspect "$image" >/dev/null
umask 077
mkdir "$out"
find "$root" -type f -print0 | sort -z | xargs -0 sha256sum > "$out/source-sha256.txt"
printf 'nameserver 127.0.0.1\noptions timeout:1 attempts:1\n' > "$out/resolv.conf"
before=$(df -B1 --output=avail "$base" | tail -1)
cleanup() {
  status=$?
  trap - EXIT
  set +e
  failed=0
  containers=$(docker ps -a --format '{{.Names}}') || failed=1
  if grep -Fxq "$tag" <<< "$containers"; then
    label=$(docker inspect -f '{{index .Config.Labels "elevateo.task"}}' "$tag")
    mounts=$(docker inspect -f '{{range .Mounts}}{{.Type}} {{.Source}} {{.Destination}}{{println}}{{end}}' "$tag")
    printf '%s\n' "$mounts" > "$out/mounts.log"
    if [[ $label == "$tag" && -n $mounts ]]; then
      docker logs "$tag" > "$out/container.log" 2>&1 || failed=1
      docker inspect -f '{{json .State}}' "$tag" > "$out/state.json" || failed=1
      docker rm -f "$tag" >> "$out/cleanup.log" 2>&1 || failed=1
    else failed=1; fi
  fi
  after=$(df -B1 --output=avail "$base" | tail -1)
  [[ $after =~ ^[[:space:]]*[0-9]+$ ]] || failed=1
  printf 'exit=%s\ncleanup_failed=%s\nfree_before=%s\nfree_after=%s\nshared_base_retained=1\n' \
    "$status" "$failed" "$before" "$after" >> "$out/cleanup.log" || failed=1
  [[ $failed == 0 ]] || status=90
  exit "$status"
}
trap cleanup EXIT
docker create --name "$tag" --label "elevateo.task=$tag" --network none --read-only \
  --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID --cap-add DAC_OVERRIDE \
  --cap-add NET_BIND_SERVICE --cap-add FOWNER --cap-add KILL \
  --security-opt no-new-privileges --memory 2g --cpus 2 --pids-limit 128 \
  --tmpfs /tmp:rw,nosuid,size=1073741824,mode=1777 \
  --mount "type=bind,src=$root,dst=/mailserver,readonly" \
  --mount "type=bind,src=$base/release/mox,dst=/release/mox,readonly" \
  --mount "type=bind,src=$out,dst=/evidence" \
  --mount "type=bind,src=$out/resolv.conf,dst=/etc/resolv.conf,readonly" \
  -e PYTHONDONTWRITEBYTECODE=1 -e GOMEMLIMIT=384MiB -e GOMAXPROCS=2 \
  --entrypoint python "$image" /mailserver/tests/run.py > "$out/container-id.txt"
timeout 900s docker --host unix:///var/run/docker.sock start -a "$tag" > "$out/run.log" 2>&1
[[ $(docker inspect -f '{{.State.ExitCode}}' "$tag") == 0 ]]
cat "$out/result.json"
