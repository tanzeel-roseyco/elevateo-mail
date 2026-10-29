#!/usr/bin/env bash
set -euo pipefail
base=/home/tanzeel/elevateo-mail-wave-20261014
for pid in 379286 379279 375715; do
  if test -r "/proc/$pid/cmdline" && tr '\0' ' ' < "/proc/$pid/cmdline" | grep -qE 'model-probe-0160-last.md|incoming/probe-remote-model.sh'; then kill -TERM "$pid"; fi
done
for name in soren rowan elara mira nadia; do
  cd "$base/$name"
  git fetch "$base/incoming/unified-incremental.bundle" integrate/cassian-unified:refs/remotes/cassian/unified
  git merge --ff-only refs/remotes/cassian/unified > "$base/reports/$name-baseline-merge.log"
  printf '%s %s\n' "$name" "$(git rev-parse HEAD)"
done
