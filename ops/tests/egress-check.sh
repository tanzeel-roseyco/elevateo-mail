#!/bin/sh
# AIDEV-NOTE: Host orchestration only; shared Ruby assertions run in disposable Docker tools.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
PROJECT=${1:?usage: egress-check.sh exact-compose-project}
RUBY=ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2
NONCE=$(cat /proc/sys/kernel/random/uuid)
PREFIX="be01r1-$NONCE"
CONTAINERS=''
NETWORKS=''
CREATED=''
docker image inspect "$RUBY" >/dev/null
assert_json() {
  docker run --rm -i --network none --label "elevateo.r1.invocation=$NONCE" \
    --mount "type=bind,src=$ROOT/ops/tests,dst=/tests,readonly" \
    "$RUBY" ruby /tests/egress_assert.rb "$@"
}
assert_open_rejected() {
  status=0
  rejection=$(printf '%s' "$1" | assert_json outcome denied) || status=$?
  [ "$status" -eq 42 ] && [ "$rejection" = R1_OPEN_CONTROL_REJECTED ] || {
    echo "denial checker did not establish semantic rejection; inconclusive" >&2; return 1;
  }
}
cleanup() {
  result=$?
  trap - EXIT INT TERM
  set +e
  for id in $CONTAINERS; do
    inspection=$(docker inspect "$id")
    if [ $? -eq 0 ] && printf '%s' "$inspection" | assert_json owned "$NONCE" container; then
      docker rm -f "$id" >/dev/null || result=1
    else
      echo "cleanup retained container: ownership/mount verification failed" >&2
      result=1
    fi
  done
  for id in $NETWORKS; do
    inspection=$(docker network inspect "$id")
    if [ $? -eq 0 ] && printf '%s' "$inspection" | assert_json owned "$NONCE" network; then
      docker network rm "$id" >/dev/null || result=1
    else
      echo "cleanup retained network: ownership verification failed" >&2
      result=1
    fi
  done
  docker system df
  df -h "$ROOT"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
new_network() {
  name=$1; shift
  if docker network inspect "$name" >/dev/null 2>&1; then echo "network collision" >&2; exit 1; fi
  CREATED=$(docker network create --label "elevateo.r1.invocation=$NONCE" "$@" "$name")
  NETWORKS="$CREATED $NETWORKS"
}
new_listener() {
  name=$1; network=$2; port=$3; shift 3
  if docker inspect "$name" >/dev/null 2>&1; then echo "container collision" >&2; exit 1; fi
  CREATED=$(docker create --name "$name" --label "elevateo.r1.invocation=$NONCE" \
    --network "$network" --mount "type=bind,src=$ROOT/ops/tests,dst=/tests,readonly" \
    "$@" "$RUBY" ruby /tests/egress_listener.rb "$port")
  CONTAINERS="$CREATED $CONTAINERS"
  docker start "$CREATED" >/dev/null
}
probe() {
  docker run --rm --network "container:$1" --label "elevateo.r1.invocation=$NONCE" \
    --mount "type=bind,src=$ROOT/ops/tests,dst=/tests,readonly" \
    "$RUBY" ruby /tests/egress_probe.rb "$2" "$3"
}
expect_probe() {
  output=$(probe "$1" "$2" "$3") || { echo "probe Docker failure" >&2; exit 1; }
  printf '%s' "$output" | assert_json outcome "$4"
}
resolve_target() {
  ids=$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=$1")
  set -- $ids
  [ "$#" -eq 1 ] || { echo "target missing or ambiguous" >&2; exit 1; }
  TARGET=$1
}
network_ids=$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT" --filter label=com.docker.compose.network=runtime)
set -- $network_ids
[ "$#" -eq 1 ] || { echo "runtime network missing or ambiguous" >&2; exit 1; }
RUNTIME_ID=$1
RUNTIME=$(docker network inspect -f '{{.Name}}' "$RUNTIME_ID")
resolve_target db
DB=$TARGET
inspection=$(docker inspect "$DB")
printf '%s' "$inspection" | assert_json target "$PROJECT" db "$RUNTIME"
DB_IP=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$RUNTIME\").IPAddress}}" "$DB")
new_network "$PREFIX-external"
EXTERNAL=$CREATED
GATEWAY=$(docker network inspect -f '{{(index .IPAM.Config 0).Gateway}}' "$EXTERNAL")
new_listener "$PREFIX-external" "$EXTERNAL" 8080 -p "$GATEWAY::8080"
LISTENER=$CREATED
inspection=$(docker inspect "$LISTENER")
printf '%s' "$inspection" | assert_json publication "$GATEWAY"
PORT=$(docker inspect -f '{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}' "$LISTENER")
new_network "$PREFIX-internal" --internal
INTERNAL=$CREATED
new_network "$PREFIX-open"
OPEN=$CREATED
new_listener "$PREFIX-internal" "$INTERNAL" 5432
INTERNAL_TARGET=$CREATED
new_listener "$PREFIX-open" "$OPEN" 5432
OPEN_TARGET=$CREATED
# Readiness retries apply only to the positive fixture, never turn a failed denial probe into a pass.
ready=false
for attempt in 1 2 3 4 5; do
  output=$(probe "$OPEN_TARGET" "$GATEWAY" "$PORT")
  if printf '%s' "$output" | assert_json outcome unrestricted; then ready=true; break; fi
  sleep 1
done
[ "$ready" = true ] || { echo "gateway publication unsupported or fixture failed: return to design gate" >&2; exit 1; }
for pair in "$INTERNAL:$INTERNAL_TARGET:denied:true" "$OPEN:$OPEN_TARGET:connected:false"; do
  network=${pair%%:*}; rest=${pair#*:}; target=${rest%%:*}; rest=${rest#*:}; expected=${rest%%:*}; internal=${rest##*:}
  inspection=$(docker network inspect "$network")
  printf '%s' "$inspection" | assert_json network "$GATEWAY" "$internal"
  expect_probe "$target" 127.0.0.1 5432 connected
  expect_probe "$target" "$GATEWAY" "$PORT" "$expected"
  if [ "$expected" = connected ]; then
    output=$(probe "$target" "$GATEWAY" "$PORT")
    printf '%s' "$output" | assert_json outcome unrestricted
    assert_open_rejected "$output"
  fi
done
echo 'controls: internal denied; equivalent open connected (checker violation)'
inspection=$(docker network inspect "$RUNTIME_ID")
printf '%s' "$inspection" | assert_json network "$GATEWAY" true
for service in api worker auth mailpit storage rest; do
  resolve_target "$service"
  inspection=$(docker inspect "$TARGET")
  printf '%s' "$inspection" | assert_json target "$PROJECT" "$service" "$RUNTIME"
  expect_probe "$TARGET" "$DB_IP" 5432 connected
  expect_probe "$TARGET" "$GATEWAY" "$PORT" denied
  echo "$service: local control connected; external no-route denial verified"
done
