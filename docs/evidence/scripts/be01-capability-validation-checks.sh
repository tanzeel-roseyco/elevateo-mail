#!/usr/bin/env bash
# AIDEV-NOTE: Only parse recovery scripts; execute the socket-free extracted-function regression, never recovery.
set -euo pipefail
cd /src
[[ $(id -u) == 10001 ]]
for tool in bash sha256sum sed mktemp cat rm; do command -v "$tool" >/dev/null; done
sha256sum -c validation.sha256
for file in be01-capability-content-probe.sh be01-capability-volume-recovery.sh be01-capability-image-recovery.sh be01-capability-image-recovery-regression.sh; do
  bash -n "$file"
done
IMAGE_RECOVERY_SOURCE=/src/be01-capability-image-recovery.sh bash /src/be01-capability-image-recovery-regression.sh
sha256sum -c validation.sha256
