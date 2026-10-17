#!/usr/bin/env bash
set -euo pipefail
umask 077
IN=/tmp/be01diagnostic-delivery-30b0dcb8-3dcf-4d44-9e63-7a475256806a
export NONCE=30b0dcb8-3dcf-4d44-9e63-7a475256806a
export AUDIT=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01diagnostic-30b0dcb8-3dcf-4d44-9e63-7a475256806a
export SRC="$AUDIT/source"
export INPUT_SHA=380bc01a2bb830133cb385be4f5e825b514cb283635a28fad9b565767b3fd573
ROOT=/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012
HIST=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-full-services-d25b2424-838c-4c2e-8a7c-c8c7abdfa1ab/evidence/be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6.ahYiWs/resources/config.volume
volume=be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6-config
daemon() { timeout -k 3s 15s docker --context default "$@"; }
trap 'rc=$?; printf "invocation_exit=%s\n" "$rc" > "$IN/invocation.status"; exit "$rc"' EXIT
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
[[ $(daemon context inspect default --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
[[ ! -e $AUDIT && ! -L $AUDIT ]]
df -B1 "$ROOT" > "$IN/df.before"
[[ $(df -B1 --output=avail "$ROOT" | tail -1) -ge 2147483648 ]]
awk '/MemAvailable:/ {print; ok=($2>=524288)} END {exit !ok}' /proc/meminfo > "$IN/memory.before"
daemon container ls -a --no-trunc --format '{{json .}}' > "$IN/containers.before"
daemon container ls --format '{{.Names}}' > "$IN/running.before"
if grep -Ei '^(be01|fe01|perf)' "$IN/running.before"; then exit 1; fi
jq -se --arg n "be01diagnostic-$NONCE" 'all(.[]; .Names!=$n)' "$IN/containers.before" >/dev/null
daemon container ls -aq --no-trunc --filter "label=elevateo.r1.run=$NONCE" > "$IN/labels.before"
[[ ! -s $IN/labels.before ]]
(cd "$ROOT" && sha256sum -c "$IN/canonical.sha256" && while read -r hash path; do case "$path" in *.sha256) sha256sum -c "$path";; esac; done < "$IN/canonical.sha256") > "$IN/canonical.before.log"
printf 'canonical_before_exit=0\n' > "$IN/canonical.before.status"
for ref in ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2 moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a; do
  digest=${ref##*@}; daemon image inspect "$ref" > "$IN/$digest.before.json"
  jq -e --arg d "@$digest" 'length==1 and .[0].Os=="linux" and .[0].Architecture=="amd64" and (.[0].RepoDigests|any(endswith($d)))' "$IN/$digest.before.json" >/dev/null
done
daemon volume inspect "$volume" > "$IN/config.before.json"
# AIDEV-NOTE: historical oracle is an object; Docker inspect is a one-element array. Never coerce shapes.
jq -se --arg n "$volume" 'length==1 and (.[0]|type=="object" and .Name==$n and .Driver=="local" and .Scope=="local" and (.CreatedAt|type=="string" and length>0) and .Options==null and .Mountpoint==("/var/lib/docker/volumes/"+$n+"/_data") and .Labels=={"elevateo.lane":"be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6"})' "$HIST" >/dev/null
jq -se --arg n "$volume" 'length==1 and (.[0]|type=="array" and length==1 and (.[0]|type=="object" and .Name==$n and .Driver=="local" and .Scope=="local" and (.CreatedAt|type=="string" and length>0) and .Options==null and .Mountpoint==("/var/lib/docker/volumes/"+$n+"/_data") and .Labels=={"elevateo.lane":"be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6"}))' "$IN/config.before.json" >/dev/null
jq -S '{Name,Driver,Scope,CreatedAt,Labels,Options,Mountpoint}' "$HIST" > "$IN/config.historical.identity"
jq -S '.[0]|{Name,Driver,Scope,CreatedAt,Labels,Options,Mountpoint}' "$IN/config.before.json" > "$IN/config.before.identity"
cmp "$IN/config.historical.identity" "$IN/config.before.identity"
daemon container ls -aq --no-trunc --filter "volume=$volume" > "$IN/config-consumers.before"
[[ ! -s $IN/config-consumers.before ]]
daemon buildx ls --format '{{.Name}}' > "$IN/builders.before.raw"
sort -u "$IN/builders.before.raw" > "$IN/builders.before"
while IFS= read -r builder; do [[ $builder =~ ^[A-Za-z0-9_.-]+$ ]]; daemon buildx inspect "$builder" > "$IN/builder-$builder.before"; done < "$IN/builders.before"
printf '%s  %s\n' 1b2631a11e91e231399b71e18ac9a0fbcb783204bfcf6cd209f2b33a8978cf87 "$IN/delivery.tar" | sha256sum -c -
tar -tf "$IN/delivery.tar" > "$IN/members.actual"
cmp "$IN/members.txt" "$IN/members.actual"
tar -tvf "$IN/delivery.tar" > "$IN/types.actual"
[[ $(wc -l < "$IN/types.actual") == 11 ]]
awk 'substr($0,1,1)!="-" {exit 1}' "$IN/types.actual"
mkdir -m 0700 "$AUDIT"
tar --no-same-owner --no-same-permissions -xf "$IN/delivery.tar" -C "$AUDIT"
find "$AUDIT/source" -type d -exec chmod 0755 {} +
find "$AUDIT" -type f -exec chmod 0644 {} +
(cd "$AUDIT" && sha256sum -c "$IN/delivery.sha256") > "$AUDIT/delivery.log"
cp "$IN/config.before.json" "$AUDIT/retained-config.before.json"
cp "$IN/builders.before" "$AUDIT/builders.before"
daemon image ls -a -q --no-trunc > "$AUDIT/images.before.raw"
sort -u "$AUDIT/images.before.raw" > "$AUDIT/retained-image-ids.before"
[[ -s $AUDIT/retained-image-ids.before ]]
while IFS= read -r id; do [[ $id =~ ^sha256:[a-f0-9]{64}$ ]]; done < "$AUDIT/retained-image-ids.before"
printf 'preflight_exit=0 staging_exit=0 retention_before_exit=0\n' > "$IN/preflight.status"
set +e
bash "$AUDIT/dispatch.sh" </dev/null > "$AUDIT/process.log" 2>&1
process_exit=$?
set -e
printf 'process_exit=%s\n' "$process_exit" > "$AUDIT/process.status"
set +e
bash "$AUDIT/reconcile.sh" </dev/null > "$AUDIT/reconciliation.log" 2>&1
reconciliation_exit=$?
set -e
printf 'reconciliation_exit=%s\n' "$reconciliation_exit" > "$AUDIT/reconciliation.status"
(( process_exit == 0 && reconciliation_exit == 0 ))
