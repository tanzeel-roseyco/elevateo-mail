#!/usr/bin/env bash
# AIDEV-NOTE: Fixed reviewed socket-free parent only; recovery of the old services task is separate.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 20s 1500s bash "$0" --bounded; fi
: "${CAPABILITY_CHECK_APPROVED:?Coordinator reservation required}" "${CHECK_AUDIT:?Fresh absolute audit directory}"
[[ $CAPABILITY_CHECK_APPROVED == capability-socket-free ]]
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra
[[ $CHECK_AUDIT == "$root/"* && $(realpath -m "$CHECK_AUDIT") == "$CHECK_AUDIT" && ! -e $CHECK_AUDIT && ! -L $CHECK_AUDIT ]]
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base && -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
umask 077
mkdir -m 0700 "$CHECK_AUDIT"
d() { timeout -k 3s 15s docker --context default "$@"; }
phase=preflight; parent_exit=unrun; source_exit=unrun
finish() { local code=$?; trap - EXIT; printf 'launcher_exit=%s parent_exit=%s source_exit=%s phase=%s independent_cleanup=pending\n' "$code" "$parent_exit" "$source_exit" "$phase" > "$CHECK_AUDIT/launcher.status"; exit "$code"; }
trap finish EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
[[ $(d context inspect default --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
export TOOLS_SOURCE=$root/lane-c-20261012 TOOLS_EVIDENCE=$root TOOLS_HOST=Ubuntu-noble-latest-amd64-base TOOLS_CONTEXT=default
export VOLUME_CHECK_PACKAGE_SHA=af243965b395e7defd021b9f249958ab77b01e881bc2bae30811b63928ca99ad
cd "$TOOLS_SOURCE"
authenticate() {
  printf '%s  %s\n' f2499630b41ddbbfcabe018bc6e00740cbcef20e36cdc3aad4d2cc40a10076c2 ops/tools/be01-services-volume-check/parent-run.sh "$VOLUME_CHECK_PACKAGE_SHA" ops/tools/be01-services-volume-check/package.sha256 | sha256sum -c - || return 1
  for manifest in ops/tools/be01-services-volume-check/package.sha256 ops/tools/be01-services/package.sha256 ops/tools/be01-services/dependencies.sha256 ops/tests/be01-services/package.sha256 ops/tests/fleet02-egress-source.sha256 ops/tools/be01-services-app/package.sha256 ops/tools/lane-c-app/app.sha256; do
    sha256sum -c --quiet "$manifest" || return 1
  done
}
authenticate > "$CHECK_AUDIT/source.before"
df -B1 "$root" > "$CHECK_AUDIT/space.before"
[[ $(df -B1 --output=avail "$root" | tail -n1) -ge 10737418240 ]]
d container ls -a --no-trunc --format '{{json .}}' > "$CHECK_AUDIT/containers.before"
# Shared workloads and retained Created probes are inventory, not global-vacancy requirements.
d container ls --format '{{.Names}}' > "$CHECK_AUDIT/running.before"
if grep -E '^(be01|fe01|perf)' "$CHECK_AUDIT/running.before" >/dev/null; then exit 1; fi
for image in ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2 moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea; do
  d image inspect "$image" --format '{{.Id}} {{json .RepoDigests}}' >> "$CHECK_AUDIT/bases.before"
done
phase=parent
set +e
bash ops/tools/be01-services-volume-check/parent-run.sh < /dev/null > "$CHECK_AUDIT/parent.log" 2>&1
parent_exit=$?
set -e
printf 'parent_exit=%s\n' "$parent_exit" > "$CHECK_AUDIT/parent.status"
phase=postflight
source_exit=0; authenticate > "$CHECK_AUDIT/source.after" 2>&1 || source_exit=$?
df -B1 "$root" > "$CHECK_AUDIT/space.after"
d container ls -a --no-trunc --format '{{json .}}' > "$CHECK_AUDIT/containers.after"
# Parent's original test/cleanup line is evidence, never replaced by an inferred success.
grep '^test_exit=' "$CHECK_AUDIT/parent.log" > "$CHECK_AUDIT/child-status-lines" || true
phase=complete
((parent_exit == 0 && source_exit == 0))
