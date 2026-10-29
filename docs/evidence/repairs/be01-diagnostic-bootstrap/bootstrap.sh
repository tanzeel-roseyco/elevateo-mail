#!/usr/bin/env bash
set -euo pipefail
umask 077
# AIDEV-NOTE: Literal stdin avoids Windows-to-SSH nested shell quoting; invocation retains all workload gates.
IN=/tmp/be01diagnostic-delivery-30b0dcb8-3dcf-4d44-9e63-7a475256806a
AUDIT=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01diagnostic-30b0dcb8-3dcf-4d44-9e63-7a475256806a
trap 'rc=$?; printf "bootstrap_exit=%s\n" "$rc" >&2; exit "$rc"' EXIT
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base ]]
[[ $(id -un) == tanzeel ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
[[ $(timeout -k 3s 15s docker --context default context inspect default --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
[[ ! -e $IN && ! -L $IN ]]
[[ ! -e $AUDIT && ! -L $AUDIT ]]
mkdir -m 0700 -- "$IN"
[[ $(stat -c '%a:%U' -- "$IN") == 700:tanzeel ]]
printf 'delivery_created=%s\n' "$IN"
