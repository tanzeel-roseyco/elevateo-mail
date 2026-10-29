#!/usr/bin/env bash
# AIDEV-NOTE: Exact disposable container only; unknown create/cleanup state requires independent reconciliation.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 30s 300s bash "$0" --bounded </dev/null; fi
umask 077
: "${AUDIT:?}" "${SRC:?}" "${NONCE:?}" "${INPUT_SHA:?}"
[[ $NONCE =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]]
[[ $INPUT_SHA =~ ^[a-f0-9]{64}$ ]]
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
[[ $(realpath "$SRC") == "$SRC" && $(realpath "$AUDIT") == "$AUDIT" && $SRC == "$AUDIT/source" ]]
[[ $SRC != *','* && $SRC != *':'* && $SRC != *$'\n'* ]]
[[ $(stat -c %a "$AUDIT") == 700 && $(stat -c %a "$SRC") == 755 ]]
[[ ! -e $AUDIT/status && ! -L $AUDIT/status ]]
name=be01diagnostic-$NONCE
base=ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
daemon() { timeout -k 3s 15s docker --context default "$@"; }
authenticate() {
  (cd "$SRC" && printf '%s  inputs.sha256\n' "$INPUT_SHA" | sha256sum -c - && sha256sum -c inputs.sha256)
}
[[ $(daemon context inspect default --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
authenticate > "$AUDIT/source.before.log"
df -B1 "$AUDIT" > "$AUDIT/df.before"
[[ $(df -B1 --output=avail "$AUDIT" | tail -1) -ge 2147483648 ]]
awk '/MemAvailable:/ {ok=($2>=524288)} END {exit !ok}' /proc/meminfo
daemon image inspect "$base" > "$AUDIT/base.before.json"
jq -e 'length==1 and .[0].Os=="linux" and .[0].Architecture=="amd64" and
 (.[0].RepoDigests | any(endswith("@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2")))' "$AUDIT/base.before.json" >/dev/null
image=$(jq -r '.[0].Id' "$AUDIT/base.before.json")
[[ $image =~ ^sha256:[a-f0-9]{64}$ ]]
daemon container ls -a --no-trunc --format '{{json .}}' > "$AUDIT/containers.before"
jq -se --arg n "$name" 'all(.[]; .Names!=$n)' "$AUDIT/containers.before" >/dev/null
daemon container ls -a --no-trunc --filter "label=elevateo.r1.run=$NONCE" -q > "$AUDIT/labels.before"
[[ ! -s $AUDIT/labels.before ]]
id=''; attempted=0; test_exit=NOT_RUN; create_exit=NOT_RUN
profile() {
  daemon inspect "$id" > "$1" || return $?
  jq -e --arg id "$id" --arg n "/$name" --arg im "$image" --arg nonce "$NONCE" --arg src "$SRC" '
    length==1 and (.[0] | .Id==$id and .Name==$n and .Image==$im and
    .Config.User=="10001:10001" and .Config.Labels["elevateo.r1.run"]==$nonce and
    .Config.Entrypoint==["bash"] and .Config.Cmd==["/src/checks.sh"] and
    (.Mounts | length==1 and .[0].Type=="bind" and .[0].Source==$src and .[0].Destination=="/src" and .[0].RW==false) and
    (.HostConfig | .NetworkMode=="none" and .ReadonlyRootfs and .Privileged==false and
    .NanoCpus==500000000 and .Memory==268435456 and .MemorySwap==268435456 and .PidsLimit==128 and
    .CapDrop==["ALL"] and ((.CapAdd//[])|length==0) and ((.Devices//[])|length==0) and
    ((.PortBindings//{})|length==0) and .SecurityOpt==["no-new-privileges"] and
    .Tmpfs=={"/tmp":"rw,noexec,nosuid,nodev,size=96m,mode=1777"}))' "$1" >/dev/null
}
finish() {
  process_exit=$?; trap - EXIT; trap '' INT TERM; set +e
  cleanup_exit=0
  if [[ $id =~ ^[a-f0-9]{64}$ ]]; then
    if profile "$AUDIT/cleanup.inspect.json"; then
      daemon rm -f "$id" > "$AUDIT/remove.log" 2>&1 || cleanup_exit=1
    else cleanup_exit=1; fi
  elif [[ $attempted == 1 ]]; then cleanup_exit=1; fi
  daemon container ls -a --no-trunc --format '{{json .}}' > "$AUDIT/containers.after"
  inventory_exit=$?
  if [[ $inventory_exit == 0 ]]; then
    jq -se --arg id "$id" --arg n "$name" 'all(.[]; .ID!=$id and .Names!=$n)' "$AUDIT/containers.after" >/dev/null || inventory_exit=1
  fi
  daemon container ls -a --no-trunc --filter "label=elevateo.r1.run=$NONCE" -q > "$AUDIT/labels.after"
  if [[ $? != 0 || -s $AUDIT/labels.after ]]; then inventory_exit=1; fi
  authenticate > "$AUDIT/source.after.log" 2>&1; source_exit=$?
  daemon image inspect "$base" > "$AUDIT/base.after.json"; base_exit=$?
  if [[ $base_exit == 0 ]]; then
    jq -e --arg im "$image" 'length==1 and .[0].Id==$im' "$AUDIT/base.after.json" >/dev/null || base_exit=1
  fi
  df -B1 "$AUDIT" > "$AUDIT/df.after"; space_exit=$?
  set -e
  printf 'process_exit=%s create_exit=%s test_exit=%s cleanup_exit=%s inventory_exit=%s source_exit=%s base_exit=%s space_exit=%s\n' \
    "$process_exit" "$create_exit" "$test_exit" "$cleanup_exit" "$inventory_exit" "$source_exit" "$base_exit" "$space_exit" > "$AUDIT/status"
  if [[ $process_exit != 0 ]]; then exit "$process_exit"; fi
  [[ $cleanup_exit == 0 && $inventory_exit == 0 && $source_exit == 0 && $base_exit == 0 && $space_exit == 0 ]] || exit 1
  exit 0
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
attempted=1
set +e
daemon create --pull never --name "$name" --label "elevateo.r1.run=$NONCE" \
  --user 10001:10001 --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 256m --memory-swap 256m --cpus 0.5 --pids-limit 128 \
  --mount "type=bind,src=$SRC,dst=/src,readonly" --tmpfs /tmp:rw,noexec,nosuid,nodev,size=96m,mode=1777 \
  --env HOME=/tmp --env GEM_HOME=/tmp/gems --env GEM_PATH=/tmp/gems:/usr/local/bundle \
  --entrypoint bash "$image" /src/checks.sh > "$AUDIT/container.id" 2> "$AUDIT/create.log"
create_exit=$?
set -e
id=$(cat "$AUDIT/container.id")
[[ $create_exit == 0 ]] || exit "$create_exit"
[[ $id =~ ^[a-f0-9]{64}$ ]]
profile "$AUDIT/created.json"
set +e
timeout -k 10s 180s docker --context default start -a "$id" > "$AUDIT/checks.log" 2>&1
test_exit=$?
set -e
exit "$test_exit"
