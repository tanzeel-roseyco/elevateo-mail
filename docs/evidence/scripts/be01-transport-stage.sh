#!/usr/bin/env bash
# AIDEV-NOTE: Staging only; no container allocation, image acquisition, recovery or cleanup is permitted here.
set -euo pipefail
exec </dev/null
umask 077
MODE=${1:?stage or reconcile}; AUDIT=${2:?absolute evidence directory}; ARCHIVE=${3:-}
S=/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012
HERE=$(cd -- "$(dirname -- "$0")" && pwd -P)
STAGER=d5f9a669c2a413ed5b03faf39f9fde5baaeac95073792a407be305c2b44eb222
PACKAGE=8a9613df9d49c86a4f05748a75365a51b0cac7d60e406d30efb2598103fb40a7
CANONICAL=03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b
APP=sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8
RUBY=ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
BUILDKIT=moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea
[[ $MODE == stage || $MODE == reconcile ]]
[[ $AUDIT == /home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-transport-stage-* ]]
[[ $(realpath -m "$AUDIT") == "$AUDIT" && ! -L $AUDIT ]]
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base && -z ${DOCKER_HOST:-} ]]
d() { timeout -k 3s 10s docker --context default "$@"; }
[[ $(d context inspect default --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
printf '%s  %s\n' "$STAGER" "$HERE/be01-transport-stage.py" | sha256sum -c -
source_check() {
  (cd "$S" && printf '%s  %s\n' "$CANONICAL" ops/tests/fleet02-egress-source.sha256 | sha256sum -c - &&
    timeout -k 3s 60s sha256sum -c --quiet ops/tests/fleet02-egress-source.sha256)
}
snapshot() {
  local out=$1 kind
  mkdir -m 0700 "$out" || return
  df -B1 "$S" > "$out/df" || return
  df -B1 --output=avail "$S" | tail -n 1 > "$out/free-bytes" || return
  d container ls -a --no-trunc --format '{{.ID}} {{.Names}} {{.Labels}}' > "$out/containers" || return
  d container ls --format '{{.Names}}' > "$out/running" || return
  d volume ls --format '{{.Name}}' > "$out/volumes" || return
  d image ls --no-trunc --digests > "$out/images" || return
  d buildx ls --format json > "$out/builders.raw" || return
  jq -scS '[.[]|{Name,Driver,Nodes:[.Nodes[]|{Name,Endpoint}]}]|sort_by(.Name)' "$out/builders.raw" > "$out/builders" || return
  for kind in config data state storage; do
    d volume inspect "be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b-$kind" |
      jq -ecS 'if length==1 then .[0]|{Name,Driver,Labels,Options,Scope,Mountpoint,CreatedAt} else error("volume count") end' > "$out/$kind" || return
  done
  d image inspect "$APP" "$RUBY" "$BUILDKIT" |
    jq -ecS 'if length==3 then [.[]|{Id,RepoDigests:((.RepoDigests//[])|sort),Labels:.Config.Labels}]|sort_by(.Id) else error("image count") end' > "$out/identities" || return
}
verify_staged() {
  (cd "$S" && printf '%s  %s\n' "$PACKAGE" ops/tools/be01-transport-check/package.sha256 | sha256sum -c - &&
    timeout -k 3s 60s sha256sum -c --quiet ops/tools/be01-transport-check/package.sha256) || return
  [[ $(stat -c %a "$S/ops/tools/be01-transport-check") == 755 ]] || return
  local path
  for path in "$S"/ops/tools/be01-transport-check/{parent-run.sh,checks.sh,dependency-regression.sh,run-container.sh,package.sha256} \
    "$S"/docs/evidence/scripts/be01-capability-volume-transport{,-regression}.sh; do
    [[ -f $path && ! -L $path && $(stat -c %a "$path") == 644 ]] || return
  done
}
reconcile() {
  local out=$1 kind
  snapshot "$out" || return
  for kind in config data state storage identities; do cmp "$AUDIT/before/$kind" "$out/$kind" || return; done
  # AIDEV-NOTE: Shared inventory ordering/activity may change; compare exact retained identities, not whole listings.
  jq -en --slurpfile old "$AUDIT/before/builders" --slurpfile fresh "$out/builders" \
    'all($old[0][]; . as $b | any($fresh[0][]; . == $b))' > "$out/builder-retention" || return
  if grep -Eq ' be01serviceschecks-' "$out/containers"; then return 1; else [[ $? == 1 ]] || return; fi
  source_check > "$out/source.log" || return
  verify_staged > "$out/staged.log" || return
  printf 'inventory_exit=0 retained_exit=0 source_exit=0 staged_exit=0\n' > "$out/components.status"
}
if [[ $MODE == reconcile ]]; then
  [[ -d $AUDIT/before && ! -L $AUDIT/before ]]
  OUT=$(mktemp -d "$AUDIT/independent.XXXXXXXX")
  set +e; (set -e; reconcile "$OUT/snapshot") > "$OUT/console.log" 2>&1; rc=$?; set -e
  printf 'independent_reconciliation_exit=%s\n' "$rc" > "$OUT/status"
  printf '%s\n' "$OUT"; exit "$rc"
fi
[[ ! -e $AUDIT && ! -L $AUDIT && -f $ARCHIVE && ! -L $ARCHIVE ]]
mkdir -m 0700 "$AUDIT"
staging_exit=NOT_RUN; source_exit=NOT_RUN; inventory_exit=NOT_RUN; before_ready=0
finish() {
  local original=$?
  trap - EXIT
  set +e
  if [[ $before_ready == 1 ]]; then (set -e; reconcile "$AUDIT/after") > "$AUDIT/reconciliation.log" 2>&1; inventory_exit=$?; fi
  source_check > "$AUDIT/source.final.log" 2>&1; source_exit=$?
  set -e
  printf 'process_exit=%s staging_exit=%s source_exit=%s inventory_exit=%s\n' "$original" "$staging_exit" "$source_exit" "$inventory_exit" > "$AUDIT/status"
  if [[ $original != 0 ]]; then exit "$original"; fi
  [[ $source_exit == 0 && $inventory_exit == 0 ]] || exit 1
}
trap finish EXIT
snapshot "$AUDIT/before"
before_ready=1
(( $(cat "$AUDIT/before/free-bytes") >= 10737418240 ))
(( $(awk '/^MemAvailable:/{print $2}' /proc/meminfo) >= 4194304 ))
if grep -Eq '^(be01|fe01|perf)' "$AUDIT/before/running"; then exit 1; else [[ $? == 1 ]]; fi
if grep -Eq ' be01serviceschecks-' "$AUDIT/before/containers"; then exit 1; else [[ $? == 1 ]]; fi
if grep -Eq '^be01serviceschecks-' "$AUDIT/before/volumes"; then exit 1; else [[ $? == 1 ]]; fi
jq -e 'all(.[]; (.Name|startswith("be01serviceschecks-"))|not)' "$AUDIT/before/builders" > "$AUDIT/builders-conflict.log"
source_check > "$AUDIT/source.before.log"
# Archive/package authentication, inherited pins and absence checks all precede exclusive writes inside the stager.
set +e
 timeout -k 5s 120s python3 "$HERE/be01-transport-stage.py" "$S" "$ARCHIVE" > "$AUDIT/staging.log" 2>&1
staging_exit=$?
set -e
[[ $staging_exit == 0 ]]
printf 'STAGING_COMPLETE\n'
