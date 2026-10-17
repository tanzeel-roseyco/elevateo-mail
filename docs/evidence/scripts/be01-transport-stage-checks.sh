#!/usr/bin/env bash
# AIDEV-NOTE: Socket-free Python fixture only; source and delivery stay read-only, all writes use tmpfs.
set -euo pipefail
[[ $(id -u) == 10001 && $# == 0 ]]
cd /delivery
printf '%s  %s\n' \
 d5f9a669c2a413ed5b03faf39f9fde5baaeac95073792a407be305c2b44eb222 be01-transport-stage.py \
 42cff9fd6c3c566817f86ceca2d37bcdb421c929822bb08af2f4d081ec6af347 be01-transport-stage-regression.py \
 0dde1cfc01484f32020e6c4f5ee8b91f76b614075c1bb1bb7abd323fdc336c54 be01-transport-check-8a9613df.tar | sha256sum -c -
cd /src
printf '%s  %s\n' 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b ops/tests/fleet02-egress-source.sha256 | sha256sum -c -
sha256sum -c --quiet ops/tests/fleet02-egress-source.sha256
for tool in python3 sha256sum; do command -v "$tool" >/dev/null; done
PYTHONDONTWRITEBYTECODE=1 timeout -k 5s 180s python3 -B /delivery/be01-transport-stage-regression.py
sha256sum -c --quiet ops/tests/fleet02-egress-source.sha256
printf 'PASS seven-member staging regression; source unchanged\n'
