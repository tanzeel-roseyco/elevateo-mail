#!/usr/bin/env bash
# AIDEV-NOTE: Existing pinned base only; one isolated socket-free check container, no builder or image mutation.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 30s 240s bash "$0" --bounded; fi
umask 077
: "${TOOLS_SOURCE:?}" "${TOOLS_CONTEXT:?}" "${TOOLS_EVIDENCE:?}" "${APP_CHECK_PACKAGE_SHA:?}"
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
[[ $(realpath "$TOOLS_SOURCE") == "$TOOLS_SOURCE" && -d $TOOLS_EVIDENCE ]]
[[ $TOOLS_SOURCE != *','* && $TOOLS_SOURCE != *':'* && $TOOLS_SOURCE != *$'\n'* ]]
[[ $APP_CHECK_PACKAGE_SHA =~ ^[a-f0-9]{64}$ ]]
daemon() { timeout -k 3s 15s docker --context "$TOOLS_CONTEXT" "$@"; }
[[ $(daemon context inspect "$TOOLS_CONTEXT" --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
cd "$TOOLS_SOURCE"
check_sources() {
  # AIDEV-NOTE: Cleanup disables errexit; every authentication failure must return explicitly.
  printf '%s  %s\n' "$APP_CHECK_PACKAGE_SHA" ops/tools/be01-services-app-check/package.sha256 | sha256sum -c - || return $?
  printf '%s  %s\n' 6721b35694543a6e758df4547fa145491e737f8f9bb05a3e2ef7ffaefd35238f ops/tools/be01-services-app/package.sha256 | sha256sum -c - || return $?
  printf '%s  %s\n' 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b ops/tests/fleet02-egress-source.sha256 | sha256sum -c - || return $?
  printf '%s  %s\n' 3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787 ops/tools/be01-services/package.sha256 | sha256sum -c - || return $?
  printf '%s  %s\n' 1eeeca5c896bc1082e43202478b5816e8d909efdf0c40e712c367df4ad50f9c4 ops/tools/lane-c-app/app.sha256 | sha256sum -c - || return $?
  for p in ops/tools/lane-c-app/app.sha256 ops/tools/be01-services-app-check/package.sha256 ops/tools/be01-services-app/package.sha256 ops/tests/fleet02-egress-source.sha256 ops/tools/be01-services/package.sha256 ops/tools/be01-services/dependencies.sha256 ops/tests/be01-services/package.sha256; do sha256sum -c "$p" || return $?; done
}
check_sources
base=ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
image=$(daemon image inspect -f '{{.Id}}' "$base")
[[ $image =~ ^sha256:[a-f0-9]{64}$ ]]
nonce=$(cat /proc/sys/kernel/random/uuid); name=be01appcheck-$nonce
evidence=$(mktemp -d "$TOOLS_EVIDENCE/$name.XXXXXX")
daemon container ls -a --no-trunc --format '{{.Names}}' > "$evidence/names.before"
! grep -Fx "$name" "$evidence/names.before"
id=''; fingerprint=''
snapshot() {
  daemon inspect "$id" | jq -Sc '.[0] | {Id,Name,Image,Config,HostConfig,Mounts} | if .HostConfig.OomKillDisable == null then .HostConfig.OomKillDisable=false else . end' | sha256sum | cut -d' ' -f1
}
cleanup() {
  test_exit=$?; trap - EXIT; set +e
  cleanup_failed=0
  if [[ -n $id && -n $fingerprint ]]; then
    actual=$(snapshot)
    if [[ $? == 0 && $actual == "$fingerprint" ]]; then daemon rm -f "$id" > "$evidence/remove.log" 2>&1 || cleanup_failed=1
    else cleanup_failed=1; fi
  else cleanup_failed=1; fi
  daemon container ls -a --no-trunc --format '{{json .}}' > "$evidence/containers.after"
  if [[ $? != 0 ]] || ! jq -se --arg id "$id" --arg name "$name" 'all(.[]; .ID != $id and .Names != $name)' "$evidence/containers.after" >/dev/null; then cleanup_failed=1; fi
  check_sources > "$evidence/source.after.log" 2>&1; source_exit=$?
  printf 'test_exit=%s cleanup_failed=%s source_exit=%s evidence=%s\n' "$test_exit" "$cleanup_failed" "$source_exit" "$evidence" | tee "$evidence/status"
  # AIDEV-NOTE: EXIT trap return does not replace the process status; preserve failed tests, promote cleanup drift.
  if [[ $test_exit != 0 ]]; then exit "$test_exit"; fi
  if [[ $cleanup_failed != 0 || $source_exit != 0 ]]; then exit 1; fi
  exit 0
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
id=$(daemon create --name "$name" --label "elevateo.r1.run=$nonce" --network none --read-only --user 10001:10001 --cpus 0.5 --memory 256m --memory-swap 256m --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --mount "type=bind,src=$TOOLS_SOURCE,dst=/src,readonly" --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777 --entrypoint bash "$image" /src/ops/tools/be01-services-app-check/checks.sh)
printf 'id=%s name=%s image=%s nonce=%s\n' "$id" "$name" "$image" "$nonce" > "$evidence/identities"
daemon inspect "$id" > "$evidence/created.json"
jq -e --arg id "$id" --arg name "/$name" --arg image "$image" --arg nonce "$nonce" --arg src "$TOOLS_SOURCE" '.[0] |
 .Id==$id and .Name==$name and .Image==$image and .Config.User=="10001:10001" and .Config.Labels["elevateo.r1.run"]==$nonce and .Config.Entrypoint==["bash"] and .Config.Cmd==["/src/ops/tools/be01-services-app-check/checks.sh"] and
 (.Mounts | length==1 and .[0].Type=="bind" and .[0].Source==$src and .[0].Destination=="/src" and .[0].RW==false) and
 (.HostConfig | .NetworkMode=="none" and .ReadonlyRootfs and .Privileged==false and .NanoCpus==500000000 and .Memory==268435456 and .MemorySwap==268435456 and .PidsLimit==128 and .CapDrop==["ALL"] and ((.CapAdd//[])|length==0) and ((.Devices//[])|length==0) and ((.PortBindings//{})|length==0) and .SecurityOpt==["no-new-privileges"] and .Tmpfs=={"/tmp":"rw,noexec,nosuid,nodev,size=32m,mode=1777"})' "$evidence/created.json" >/dev/null
fingerprint=$(snapshot)
timeout -k 5s 120s docker --context "$TOOLS_CONTEXT" start -a "$id" > "$evidence/checks.log" 2>&1
