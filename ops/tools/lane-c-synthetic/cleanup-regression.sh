#!/usr/bin/env bash
# AIDEV-NOTE: Docker-only, socket-free recovery regression; mocks never create daemon resources.
set -euo pipefail
[[ -f /.dockerenv && ! -S /var/run/docker.sock ]]
source /src/ops/tools/lane-c-synthetic/cleanup.sh
evidence=$(mktemp -d)
nonce=test-nonce; cache=test-cache; image=be01tools-test:tools; builder=test-builder
TOOLS_CONTEXT=selected; endpoint=unix:///selected; name=test-run; build_container=test-build
probe_name=test-probe; probe_id=''; base_id=sha256:base; image_id=''; run_id=''; fingerprint=''
candidate_id=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
: > "$evidence/preexisting-images"
mode=empty
docker() {
  printf '%s\n' "$*" >> "$evidence/calls"
  case "$1 $2" in
    'container ls') [[ ! -f $evidence/probe ]] || echo "$probe_name" ;;
    'volume ls') echo "$cache" ;;
    'volume inspect')
      local owner=$nonce; [[ $mode != foreign-cache ]] || owner=other
      jq -nc --arg cache "$cache" --arg owner "$owner" \
        '[{Name:$cache,Driver:"local",Scope:"local",Options:{},Labels:{"elevateo.r1.run":$owner}}]' ;;
    'volume rm'|'buildx rm'|'image rm') return 0 ;;
    'buildx inspect') return 125 ;; # Unsupported in v0.35: never fabricate successful inspect JSON.
    'buildx ls') [[ $* == 'buildx ls --format json' ]] || return 99; jq -nc --arg builder "$builder" --arg endpoint "$endpoint" \
      '{Name:$builder,Driver:"docker-container",Nodes:[{Name:($builder+"0"),Endpoint:$endpoint}]}' ;;
    'image ls') [[ $mode != inventory-error ]] || return 124; echo "$candidate_id" ;;
    'image inspect')
      local owner=$nonce tag=$image
      [[ $mode != foreign-image ]] || owner=other
      [[ $mode != shared-image ]] || tag=unrelated:keep
      jq -nc --arg id "$candidate_id" --arg owner "$owner" --arg tag "$tag" \
        '[{Id:$id,Config:{Labels:{"elevateo.r1.run":$owner}},RepoTags:[$tag],RepoDigests:[]}]' ;;
    'create --rm') touch "$evidence/probe"; echo probe-id ;;
    'inspect probe-id')
      local memory=268435456; [[ $mode != bad-cap ]] || memory=0
      jq -nc --arg name "/$probe_name" --arg nonce "$nonce" --arg image "$base_id" --arg cache "$cache" \
        --argjson memory "$memory" '[{Id:"probe-id",Name:$name,Image:$image,
        Config:{Labels:{"elevateo.r1.run":$nonce},User:"10001:10001",Entrypoint:["ruby"],
          Cmd:["-e","exit(Dir.children(\"/cache\").empty? ? 0 : 1)"]},
        Mounts:[{Type:"volume",Name:$cache,Destination:"/cache",RW:false}],
        HostConfig:{AutoRemove:true,ReadonlyRootfs:true,NetworkMode:"none",Privileged:false,
          NanoCpus:500000000,Memory:$memory,MemorySwap:268435456,PidsLimit:32,CapDrop:["ALL"],
          SecurityOpt:["no-new-privileges"]}}]' ;;
    'inspect -f') echo probe-id ;;
    'start -a') [[ $mode != nonempty && $mode != probe-timeout ]] || return 124 ;;
    'rm -f') rm -f "$evidence/probe" ;;
    'system df') return 0 ;;
    *) echo "unexpected mock call: $*" >&2; return 99 ;;
  esac
}
must_call() { grep -Fx -- "$1" "$evidence/calls" >/dev/null; }
must_not_call() { if grep -F -- "$1" "$evidence/calls" >/dev/null; then echo "unexpected $1" >&2; exit 1; fi; }
# Early bootstrap failure: no builder container, labelled empty cache, no captured image ID.
: > "$evidence/calls"
set +e
( (exit 23); cleanup_tools ) > "$evidence/bootstrap.log" 2>&1
status=$?
set -e
[[ $status == 23 ]]
must_call "volume rm $cache"
must_call "image rm $candidate_id"
grep -F 'test_exit=23 cleanup_failed=0' "$evidence/bootstrap.log" >/dev/null
for mode in nonempty probe-timeout foreign-cache bad-cap; do
  : > "$evidence/calls"; rm -f "$evidence/probe"
  set +e
  ( (exit 23); cleanup_tools ) > "$evidence/$mode.log" 2>&1
  status=$?
  set -e
  [[ $status == 23 ]]
  must_not_call 'volume rm'
  grep -F 'cleanup_failed=1' "$evidence/$mode.log" >/dev/null
  if [[ $mode == probe-timeout ]]; then must_call 'rm -f probe-id'; fi
done
for mode in foreign-image shared-image inventory-error; do
  : > "$evidence/calls"
  if recover_images; then echo "unexpected recovery: $mode" >&2; exit 1; fi
  must_not_call 'image rm'
done
mode=empty
printf '%s\n' "$candidate_id" > "$evidence/preexisting-images"
: > "$evidence/calls"
recover_images
must_not_call 'image rm'
# Exercise the actual adapter definitions with a timeout mock, without invoking Docker or a host test.
source <(sed -n '/^daemon_for() /p; /^docker() /p' /src/ops/tools/lane-c-synthetic/parent-run.sh)
timeout() { printf '%s\n' "$*" >> "$evidence/timeouts"; }
docker inspect item
daemon_for 420 buildx build
grep -Fx -- '-k 3s 10s docker --context selected inspect item' "$evidence/timeouts" >/dev/null
grep -Fx -- '-k 3s 420s docker --context selected buildx build' "$evidence/timeouts" >/dev/null
grep -Fx 'if [[ ${1:-} != --bounded ]]; then exec timeout -k 180s 900s bash "$0" --bounded; fi' \
  /src/ops/tools/lane-c-synthetic/parent-run.sh >/dev/null
echo 'PASS tools recovery and deadline adapter synthetic regression'
