#!/bin/sh
set -eu
# AIDEV-NOTE: The controller uses only Docker Desktop's mounted Unix socket and task-owned POSIX staging.
unset DOCKER_HOST DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export HOME=/tmp/controller-home DOCKER_CONTEXT=desktop-linux
mkdir -p "$HOME"
docker context create desktop-linux --docker host=unix:///var/run/docker.sock
cd /var/lib/docker/volumes/elevateo-client-backend-stage-20261101/_data/repo
python3 ops/tests/be02/run.py --context desktop-linux --expect-host "$(hostname -s)" \
  --acceptance --acceptance-diagnostic --acceptance-lanes playwright \
  --acceptance-browsers chromium --acceptance-dispatch-id final_readiness_20261101
