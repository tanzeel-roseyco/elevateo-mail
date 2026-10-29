#!/bin/sh
# AIDEV-NOTE: Disposable launch7401 namespace; existing image, no pulls/builds/volumes or production network.
set -eu
exec 2>&1
stage=/tmp/elevateo-launch7401
image=sha256:94b8c87f0970c71e7a2b24fdeec849254ed30f4fd12f4402f4be3faada9e69e7
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -w 120 9
containers=$(docker ps -aq --filter name=^launch7401-db$)
networks=$(docker network ls -q --filter name=^launch7401-net$)
test -z "$containers"
test -z "$networks"
cleanup() {
  if docker container inspect launch7401-db >/dev/null 2>&1; then
    docker inspect --format '{{json .Mounts}}' launch7401-db
    docker inspect --format '{{json .HostConfig.Tmpfs}}' launch7401-db
  fi
  docker rm -f launch7401-db >/dev/null 2>&1 || true
  docker network rm launch7401-net >/dev/null 2>&1 || true
  # AIDEV-NOTE: A failed Docker query is not proof of absence; never print cleanup PASS after daemon errors.
  containers=$(docker ps -aq --filter name=^launch7401-db$) || return 1
  networks=$(docker network ls -q --filter name=^launch7401-net$) || return 1
  test -z "$containers" && test -z "$networks" || return 1
  echo 'CLEANUP: exact container/network absent; tmpfs removed; no volumes/images/build cache created'
}
finish() {
  result=$?
  trap - EXIT HUP INT TERM
  cleanup || result=1
  exit "$result"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM
docker run --rm --network none --entrypoint sh "$image" -c 'command -v python3; python3 --version; command -v psql'
docker network create --internal --label task=launch7401 launch7401-net >/dev/null
docker run -d --name launch7401-db --label task=launch7401 --network launch7401-net --network-alias db \
  --tmpfs /var/lib/postgresql/data --mount type=bind,src="$stage",dst=/source,readonly \
  -e POSTGRES_USER=supabase_admin -e POSTGRES_PASSWORD=disposable-test-only-62817-strong \
  -e POSTGRES_DB=postgres "$image" >/dev/null
ready=0
for attempt in $(seq 1 60); do
  if docker exec launch7401-db pg_isready -h db -U supabase_admin -d postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1
docker exec -e PGPASSWORD=disposable-test-only-62817-strong launch7401-db createdb --no-password -h db -U supabase_admin -T template0 launch7401_test
docker exec -w /source/ops/production/launch-controls \
  -e PYTHONDONTWRITEBYTECODE=1 -e PGHOST=db -e PGUSER=supabase_admin -e PGDATABASE=launch7401_test \
  -e PGPASSWORD=disposable-test-only-62817-strong -e INIT62817_TEST_ONLY=disposable \
  launch7401-db python3 -m unittest -v test_plan test_enrollment test_harness
