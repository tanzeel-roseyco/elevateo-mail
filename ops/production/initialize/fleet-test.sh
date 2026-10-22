#!/bin/sh
# AIDEV-NOTE: Only disposable namespace init62817; pinned existing image, no pulls/builds/volumes or production network.
set -eu
exec 2>&1
stage=/tmp/elevateo-init62817
image=sha256:94b8c87f0970c71e7a2b24fdeec849254ed30f4fd12f4402f4be3faada9e69e7
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -w 120 9
test -z "$(docker ps -aq --filter name=^init62817-db$)"
test -z "$(docker network ls -q --filter name=^init62817-net$)"
cleanup() {
  if docker container inspect init62817-db >/dev/null 2>&1; then
    docker inspect --format '{{json .Mounts}}' init62817-db
    docker inspect --format '{{json .HostConfig.Tmpfs}}' init62817-db
  fi
  docker rm -f init62817-db >/dev/null 2>&1 || true
  docker network rm init62817-net >/dev/null 2>&1 || true
  test -z "$(docker ps -aq --filter name=^init62817-db$)"
  test -z "$(docker network ls -q --filter name=^init62817-net$)"
  echo 'CLEANUP: exact container/network absent; tmpfs removed; no volumes/images/build cache created'
}
trap cleanup EXIT HUP INT TERM
docker run --rm --network none --entrypoint sh "$image" -c 'command -v python3; python3 --version; command -v psql'
docker network create --internal --label task=init62817 init62817-net >/dev/null
docker run -d --name init62817-db --label task=init62817 --network init62817-net --network-alias db \
  --tmpfs /var/lib/postgresql/data --mount type=bind,src="$stage",dst=/source,readonly \
  -e POSTGRES_USER=supabase_admin -e POSTGRES_PASSWORD=disposable-test-only-62817-strong \
  -e POSTGRES_DB=postgres "$image" >/dev/null
ready=0
for attempt in $(seq 1 60); do
  if docker exec init62817-db pg_isready -h db -U supabase_admin -d postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
docker exec -e PGPASSWORD=disposable-test-only-62817-strong init62817-db createdb --no-password -h db -U supabase_admin -T template0 init62817_test
docker exec -w /source/ops/production/initialize \
  -e PYTHONDONTWRITEBYTECODE=1 -e PGHOST=db -e PGUSER=supabase_admin -e PGDATABASE=init62817_test \
  -e PGPASSWORD=disposable-test-only-62817-strong -e INIT62817_TEST_ONLY=disposable \
  init62817-db python3 -m unittest -v test_admission test_tenant
