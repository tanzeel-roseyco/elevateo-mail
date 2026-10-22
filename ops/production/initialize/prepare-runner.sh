#!/bin/bash
# AIDEV-NOTE: Add tools to the coordinated immutable backend image without shared build caches or source edits.
set -euo pipefail
stage=/tmp/elevateo-initrepair20261023
image=${1:?immutable backend sha256 image required}
[[ "$image" =~ ^sha256:[0-9a-f]{64}$ ]]
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -w 180 9
test -z "$(docker ps -aq --filter name=^initrepair20261023-toolprep$)"
trap 'docker rm -f initrepair20261023-toolprep >/dev/null 2>&1 || true' EXIT
docker run --name initrepair20261023-toolprep --label task=initrepair20261023 --user 0 --network bridge --entrypoint bash "$image" -ec '
apt-get update
apt-get install -y --no-install-recommends python3 curl ca-certificates
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/keyrings/pgdg.asc
printf "%s\n" "deb [signed-by=/usr/share/keyrings/pgdg.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt-get update
apt-get install -y --no-install-recommends postgresql-client-17
rm -rf /var/lib/apt/lists/*
python3 --version
psql --version
ruby --version
'
docker commit --change 'USER 10001:10001' initrepair20261023-toolprep initrepair20261023-runner:disposable > "$stage/runner.id"
docker image inspect --format '{{.Id}}' initrepair20261023-runner:disposable
