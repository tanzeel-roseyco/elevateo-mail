#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Fleet-only offline release admission; no host ports, production state or mail traffic.
[[ $(cat /etc/machine-id) == 5992663e9659484e90c0129edd5bd24b ]] || { echo 'fleet-02 required' >&2; exit 2; }
# AIDEV-NOTE: The SSH alias alone does not constrain Docker's ambient remote context.
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker() { command docker --host unix:///var/run/docker.sock "$@"; }
tag=elevateo-mail1017-inspect
base=/home/tanzeel/elevateo-mail-completion-20261015/control/mail1017
out=$base/release
image=r.xmox.nl/mox@sha256:831c6f11b3c2ee1633077052e6d4b7ae53f73972adf4bf08be0a740121d24cc7
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n -x 9 || { echo 'Docker lease busy' >&2; exit 3; }
[[ ! -e $out ]] || { echo 'Evidence destination exists' >&2; exit 4; }
[[ $(awk '/MemAvailable/ {print $2}' /proc/meminfo) -ge 8388608 ]] || exit 5
[[ $(df -B1 --output=avail "$base" | tail -1) -ge 10737418240 ]] || exit 6
containers=$(docker ps -a --format '{{.Names}}')
! grep -Fxq "$tag" <<< "$containers" || exit 7
umask 077
mkdir "$out"
before=$(df -B1 --output=avail "$base" | tail -1)
preexisting=0
images=$(docker image ls --digests --format '{{.Repository}}@{{.Digest}}')
grep -Fxq "$image" <<< "$images" && preexisting=1
cleanup() {
  status=$?
  trap - EXIT
  set +e
  failed=0
  containers=$(docker ps -a --format '{{.Names}}') || failed=1
  if grep -Fxq "$tag" <<< "$containers"; then
    label=$(docker inspect -f '{{index .Config.Labels "elevateo.task"}}' "$tag")
    mounts=$(docker inspect -f '{{len .Mounts}}' "$tag")
    if [[ $label == "$tag" && $mounts == 0 ]]; then
      docker rm -f "$tag" >> "$out/cleanup.log" 2>&1 || failed=1
    else failed=1; fi
  fi
  images=$(docker image ls --digests --format '{{.Repository}}@{{.Digest}}') || failed=1
  if [[ $preexisting == 0 ]] && grep -Fxq "$image" <<< "$images"; then
    docker image rm "$image" >> "$out/cleanup.log" 2>&1 || failed=1
  fi
  after=$(df -B1 --output=avail "$base" | tail -1)
  [[ $after =~ ^[[:space:]]*[0-9]+$ ]] || failed=1
  printf 'exit=%s\ncleanup_failed=%s\nfree_before=%s\nfree_after=%s\npreexisting_image=%s\n' \
    "$status" "$failed" "$before" "$after" "$preexisting" >> "$out/cleanup.log" || failed=1
  [[ $failed == 0 ]] || status=90
  exit "$status"
}
trap cleanup EXIT
timeout 120s docker --host unix:///var/run/docker.sock pull --platform linux/amd64 "$image" > "$out/pull.log" 2>&1
docker image inspect "$image" > "$out/image.json"
docker create --name "$tag" --label "elevateo.task=$tag" --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges --memory 256m --cpus 1 --pids-limit 32 \
  --entrypoint /bin/mox "$image" version > "$out/container-id.txt"
timeout 30s docker --host unix:///var/run/docker.sock start -a "$tag" > "$out/version.txt" 2>&1
[[ $(docker inspect -f '{{.State.ExitCode}}' "$tag") == 0 ]]
docker cp "$tag:/bin/mox" "$out/mox"
# AIDEV-NOTE: The exported OCI/Docker archive is immutable release evidence, not a modified server image.
timeout 90s docker --host unix:///var/run/docker.sock image save "$image" -o "$out/mox-image.tar"
sha256sum "$out/mox" "$out/mox-image.tar" > "$out/sha256.txt"
printf 'No build cache or volumes created; release archive retained as research evidence.\n' >> "$out/cleanup.log"
