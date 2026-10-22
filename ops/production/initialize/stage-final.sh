#!/bin/bash
# AIDEV-NOTE: Bind final reviewed migration to the owned snapshot; the runner supplies identical locked gems only.
set -euo pipefail
stage=/tmp/elevateo-initrepair20261023
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -w 180 9
# AIDEV-NOTE: Reject symlinks before cp; even a final-file link can write outside the disposable snapshot.
for entry in /tmp "$stage" "$stage/apps" "$stage/apps/server" "$stage/apps/server/db" "$stage/apps/server/db/migrate"; do
  [[ -d "$entry" && ! -L "$entry" ]]
done
[[ "$(realpath -e "$stage")" == "$stage" && "$(stat -c %u "$stage")" == "$(id -u)" ]]
for entry in "$stage/migration42.reviewed.rb" "$stage/apps/server/db/migrate/20261023000042_allow_verified_enrollment_lock.rb" "$stage/backend-final-source.sha256"; do
  [[ ! -L "$entry" ]]
  [[ ! -e "$entry" || -f "$entry" ]]
  [[ ! -e "$entry" || "$(stat -c %h "$entry")" == 1 ]]
done
cd "$stage"
printf '%s\n' '82e7c115e8714145b1e59c20f22c75864559e38b09afcc2d61c58fa95030277a  migration42.reviewed.rb' | sha256sum -c -
cp migration42.reviewed.rb apps/server/db/migrate/20261023000042_allow_verified_enrollment_lock.rb
cd "$stage/apps/server"
find . -type f -print0 | sort -z | xargs -0 sha256sum > "$stage/backend-final-source.sha256"
