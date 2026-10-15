#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Two containers share one network-none namespace, never a public bridge or host port.
[[ $(cat /etc/machine-id) == 5992663e9659484e90c0129edd5bd24b ]] || exit 2
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker() { command docker --host unix:///var/run/docker.sock "$@"; }
run=${1:?unique run id required}
[[ $run =~ ^mail10(17|18)-app-r[0-9]{1,2}$ ]] || exit 3
base=/home/tanzeel/elevateo-mail-completion-20261015/control/mail1017
repo=/home/tanzeel/orca/workspaces/integration/completion-cassian-int801
root=$(cd -- "$(dirname -- "$0")" && pwd)
out=$base/$run
server=elevateo-$run-mox
client=elevateo-$run-ruby
python=python:3.12.9@sha256:48a11b7ba705fd53bf15248d1f94d36c39549903c5d59edcfa2f3f84126e7b44
ruby=${MAIL1017_RUBY_IMAGE:?pinned local dependency image required}
[[ $ruby =~ ^sha256:[a-f0-9]{64}$ ]] || exit 3
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n -x 9 || { echo 'Docker lease busy' >&2; exit 4; }
[[ ! -e $out && -d $root/tests && -d $repo/apps/server ]] || exit 5
[[ $(awk '/MemAvailable/ {print $2}' /proc/meminfo) -ge 2097152 ]] || exit 6
[[ $(df -B1 --output=avail "$base" | tail -1) -ge 2147483648 ]] || exit 7
[[ $(sha256sum "$base/release/mox" | cut -d' ' -f1) == 29f054f2b2bc0f191b22576ffbd95fbe74901dae31ac749058c7efb8f61e547c ]] || exit 8
containers=$(docker ps -a --format '{{.Names}}')
for name in "$server" "$client"; do ! grep -Fxq "$name" <<< "$containers" || exit 9; done
docker image inspect "$python" "$ruby" >/dev/null
umask 077
mkdir "$out"
find "$root" "$repo/apps/server/lib" "$repo/apps/server/sig" "$repo/apps/server/test" "$repo/apps/server/db" \
  -type f -print0 | sort -z | xargs -0 sha256sum > "$out/source-sha256.txt"
sha256sum "$repo/apps/server/Gemfile" "$repo/apps/server/Gemfile.lock" \
  "$repo/apps/server/Steepfile" >> "$out/source-sha256.txt"
git -C "$repo" rev-parse HEAD > "$out/app-head.txt"
printf 'nameserver 127.0.0.1\noptions timeout:1 attempts:1\n' > "$out/resolv.conf"
before=$(df -B1 --output=avail "$base" | tail -1)
cleanup() {
  status=$?
  trap - EXIT
  set +e
  failed=0
  containers=$(docker ps -a --format '{{.Names}}') || failed=1
  for name in "$client" "$server"; do
    if grep -Fxq "$name" <<< "$containers"; then
      label=$(docker inspect -f '{{index .Config.Labels "elevateo.task"}}' "$name")
      mounts=$(docker inspect -f '{{json .Mounts}}' "$name")
      printf '%s\n' "$mounts" > "$out/$name-mounts.json"
      if [[ $label == "$run" && -n $mounts && $mounts != '[]' ]]; then
        docker logs "$name" > "$out/$name.log" 2>&1 || failed=1
        docker inspect -f '{{json .State}}' "$name" > "$out/$name-state.json" || failed=1
        docker rm -f "$name" >> "$out/cleanup.log" 2>&1 || failed=1
      else failed=1; fi
    fi
  done
  # AIDEV-NOTE: Only this newly created run's exact synthetic credential file is disposable.
  rm -f -- "$out/fixture-credentials.json" || failed=1
  after=$(df -B1 --output=avail "$base" | tail -1)
  printf 'exit=%s\ncleanup_failed=%s\nfree_before=%s\nfree_after=%s\nshared_bases_retained=1\n' \
    "$status" "$failed" "$before" "$after" >> "$out/cleanup.log" || failed=1
  [[ $failed == 0 ]] || status=90
  exit "$status"
}
trap cleanup EXIT
docker create --name "$server" --label "elevateo.task=$run" --network none --read-only \
  --cap-drop ALL --cap-add CHOWN --cap-add SETUID --cap-add SETGID --cap-add DAC_OVERRIDE \
  --cap-add NET_BIND_SERVICE --cap-add FOWNER --cap-add KILL \
  --security-opt no-new-privileges --memory 1g --cpus 2 --pids-limit 128 \
  --tmpfs /tmp:rw,nosuid,size=536870912,mode=1777 \
  --mount "type=bind,src=$root,dst=/mailserver,readonly" \
  --mount "type=bind,src=$base/release/mox,dst=/release/mox,readonly" \
  --mount "type=bind,src=$out,dst=/evidence" \
  --mount "type=bind,src=$out/resolv.conf,dst=/etc/resolv.conf,readonly" \
  -e PYTHONDONTWRITEBYTECODE=1 -e GOMEMLIMIT=256MiB -e GOMAXPROCS=2 \
  --entrypoint python "$python" /mailserver/tests/app_fixture.py > "$out/server-id.txt"
docker start "$server" >/dev/null
for ((i=0; i<120; i++)); do
  [[ ! -e $out/ready ]] || break
  [[ $(docker inspect -f '{{.State.Running}}' "$server") == true ]] || exit 10
  sleep 0.5
done
[[ -e $out/ready ]] || exit 11
# AIDEV-NOTE: The owner-private checkout needs read/search capability; every client bind mount stays read-only.
docker create --name "$client" --label "elevateo.task=$run" --network "container:$server" \
  --read-only --user 0 --cap-drop ALL --cap-add DAC_READ_SEARCH --security-opt no-new-privileges \
  --memory 1g --cpus 1 --pids-limit 64 --tmpfs /tmp:rw,nosuid,size=134217728 \
  --mount "type=bind,src=$repo/apps/server,dst=/app,readonly" \
  --mount "type=bind,src=$root,dst=/mailserver,readonly" \
  --mount "type=bind,src=$out,dst=/evidence,readonly" \
  -e HOME=/tmp -e RUBOCOP_CACHE_ROOT=/tmp/rubocop \
  --workdir /app --entrypoint bash "$ruby" /mailserver/tests/app_checks.sh > "$out/client-id.txt"
timeout 300s docker --host unix:///var/run/docker.sock start -a "$client" > "$out/test.log" 2>&1
[[ $(docker inspect -f '{{.State.ExitCode}}' "$client") == 0 ]]
touch "$out/finished"
timeout 30s docker --host unix:///var/run/docker.sock wait "$server" > "$out/server-exit.txt"
[[ $(cat "$out/server-exit.txt") == 0 ]]
sha256sum -c "$out/source-sha256.txt" > "$out/source-verify.log"
cat "$out/test.log"
