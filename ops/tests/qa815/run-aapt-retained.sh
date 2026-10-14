#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
apk=/home/tanzeel/elevateo-mail-completion-20261015/control/qa815-artifacts/android-32d043fbce8e-permission-rejected-unsigned.apk
log="$root/docs/completion/qa815-evidence/android-32d043fbce8e-aapt-dump.txt"
name=qa815-aapt-32d043fbce8e
image=python:3.12.9-slim-bookworm
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
exec 9>"$lock"
flock -x 9
test "$(sha256sum "$apk" | cut -d' ' -f1)" = 743046f42bb8fd6d3eb662cc7708ed06612839b1582a5323dc896a6913458c83
printf 'apk=%s\napk_sha256=%s\nimage=%s\nstarted=%s\n' "$apk" \
  "$(sha256sum "$apk" | cut -d' ' -f1)" "$image" "$(date -u +%FT%TZ)" > "$log"
set +e
timeout 420s docker run --rm --name "$name" --memory 1g --memory-swap 1g --cpus 1 --pids-limit 128 \
  --tmpfs /tmp:rw,size=128m --tmpfs /var/lib/apt/lists:rw,size=128m \
  --tmpfs /var/cache/apt:rw,size=128m --tmpfs /var/log:rw,size=16m \
  -v "$apk":/input.apk:ro "$image" bash -ceu '
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends aapt >/tmp/aapt-install.log
    printf "aapt_version="; aapt version
    printf "=== xmltree ===\n"
    aapt dump xmltree /input.apk AndroidManifest.xml
    printf "=== permissions ===\n"
    aapt dump permissions /input.apk
  ' >> "$log" 2>&1
status=$?
set -e
printf 'run_exit=%s\nfinished=%s\n' "$status" "$(date -u +%FT%TZ)" >> "$log"
remaining=$(docker ps -a --filter "name=^/$name$" -q | wc -l)
printf 'remaining_task_containers=%s\n' "$remaining" >> "$log"
test "$remaining" -eq 0
exit "$status"
