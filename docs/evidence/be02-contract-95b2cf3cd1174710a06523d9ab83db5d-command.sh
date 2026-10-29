#!/bin/sh
set -eu
task=be02-contract-95b2cf3cd1174710a06523d9ab83db5d
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra/$task
image=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
cd "$root"
test "$(hostname -s)" = Ubuntu-noble-latest-amd64-base
test "$(docker context show)" = default
docker image inspect "$image" >/dev/null
test "$(sha256sum input.tar | cut -d ' ' -f1)" = 9d4af94e0e37c89d4cda05907eac34b6218d99481dc5c89861b4d37c2c567ed5
mkdir -p input out1 out2
tar -xf input.tar -C input
before=$(df -B1 --output=avail "$root" | tail -n 1 | tr -d ' ')
active=
cleanup() {
  status=$?
  trap - EXIT
  if [ -n "$active" ]; then
    ids=$(docker ps -aq --filter "name=^/$active$" --filter "label=elevateo.task=$task") || exit 91
    if [ -n "$ids" ]; then docker rm -f "$ids" >/dev/null || exit 92; fi
  fi
  remaining=$(docker ps -aq --filter "label=elevateo.task=$task") || exit 93
  after=$(df -B1 --output=avail "$root" | tail -n 1 | tr -d ' ')
  printf 'test_exit=%s\nremaining=%s\nfree_before=%s\nfree_after=%s\n' "$status" "$remaining" "$before" "$after"
  test -z "$remaining" || exit 94
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
for run in 1 2; do
  active="$task-$run"
  test -z "$(docker ps -aq --filter "name=^/$active$")"
  timeout --signal=TERM --kill-after=5s 240s docker run --rm --pull=never --name "$active" --label "elevateo.task=$task" --user "$(id -u):$(id -g)" --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 128 --memory 1g --cpus 1 --tmpfs /work:rw,exec,size=512m,mode=1777 --tmpfs /tmp:rw,size=128m,mode=1777 --mount "type=bind,src=$root/input,dst=/input,readonly" --mount "type=bind,src=$root/out$run,dst=/output" --workdir /work "$image" sh -eu -c 'cp -R /input/contracts /work/contracts; mkdir -p /work/apps/web/src/data/generated; cd /work/contracts/tooling; npm ci --ignore-scripts --cache /tmp/npm; npm run generate:web; cp /work/apps/web/src/data/generated/api.d.ts /output/api.d.ts'
  active=
done
cmp out1/api.d.ts out2/api.d.ts
sha256sum out1/api.d.ts out2/api.d.ts input/contracts/v1/openapi.json
