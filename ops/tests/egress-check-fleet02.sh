# Sourced adapter of the frozen shell wrapper; shared Ruby probe/assertion oracles remain unchanged.
# AIDEV-NOTE: All fixture/tool resources use the same capped, identity-pinned lifecycle as actual Compose services.
assert_json() { tool_run "$ruby" none /src/ops/tests/egress_assert.rb "$@"; }
assert_open_rejected() {
  local status=0 rejection
  rejection=$(printf '%s' "$1" | assert_json outcome denied) || status=$?
  [[ $status == 42 && $rejection == R1_OPEN_CONTROL_REJECTED ]]
}
probe() { tool_run "$ruby" "container:$1" /src/ops/tests/egress_probe.rb "$2" "$3"; }
expect_probe() {
  local output
  output=$(probe "$1" "$2" "$3") || return 1
  printf '%s' "$output" | assert_json outcome "$4"
}
wait_local_ready() {
  local service=$1 port=$2 attempt id output
  # AIDEV-NOTE: Retry only startup refusal; tool/identity errors and negative egress checks remain fail-closed.
  for attempt in 1 2 3 4 5; do
    id=$(target "$service") || return 1
    output=$(probe "$id" 127.0.0.1 "$port") || return 1
    # AIDEV-NOTE: Slurp rejects JSON streams before last-result semantics can mask an earlier denial.
    jq -se 'length == 1 and (.[0] | type == "object" and
      (.outcome | type == "string") and (.default_route | type == "boolean"))' \
      <<< "$output" >/dev/null || return 1
    if jq -e '.outcome == "connected"' <<< "$output" >/dev/null; then
      printf '%s' "$output" | assert_json outcome connected
      return $?
    fi
    jq -e '.outcome == "invalid" and .reason == "Errno::ECONNREFUSED" and
      (.default_route | type == "boolean")' <<< "$output" >/dev/null || return 1
    [[ $attempt != 5 ]] || return 1
    sleep 1 || return 1
  done
}
target() {
  local service=$1 ids
  ids=$(daemon ps -q --no-trunc --filter "label=com.docker.compose.project=$task" \
    --filter "label=com.docker.compose.service=$service") || return 1
  [[ $ids == "$(cat "$registry/$task-$service.id")" ]] || return 1
  verify_container "$task-$service" || return 1
  daemon inspect "$ids" | assert_json target "$task" "$service" "$runtime" || return 1
  printf '%s\n' "$ids"
}
listener() {
  local name=$1 net=$2 port=$3 id
  tool_create "$name" "$ruby" "$net" /src/ops/tests/egress_listener.rb "$port" || return 1
  verify_container "$name" || return 1
  id=$(cat "$registry/$name.id")
  daemon start "$id" >/dev/null || return 1
  printf '%s\n' "$id"
}
external_listener() {
  local name=$task-external-listener
  # AIDEV-NOTE: Bind only the task bridge gateway; never expose the fixture on all host interfaces.
  LANE_PUBLISH=$gateway tool_create "$name" "$ruby" "$external" /src/ops/tests/egress_listener.rb 8080 || return 1
  daemon start "$(cat "$registry/$name.id")" >/dev/null || return 1
  daemon inspect "$name" | assert_json publication "$gateway" || return 1
  daemon inspect -f '{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}' "$name"
}
lane_egress() {
  local database database_ip external=$task-external internal=$task-internal open=$task-open
  local gateway port open_id internal_id output ready=false service id
  database=$(target db) || return 1
  database_ip=$(daemon inspect -f "{{(index .NetworkSettings.Networks \"$runtime\").IPAddress}}" "$database") || return 1
  network_new "$external" false && network_new "$internal" true && network_new "$open" false || return 1
  verify_network "$external" && verify_network "$internal" && verify_network "$open" || return 1
  gateway=$(daemon network inspect -f '{{(index .IPAM.Config 0).Gateway}}' "$external") || return 1
  port=$(external_listener) || return 1
  open_id=$(listener "$task-open-listener" "$open" 5432) || return 1
  internal_id=$(listener "$task-internal-listener" "$internal" 5432) || return 1
  for attempt in 1 2 3 4 5; do
    output=$(probe "$open_id" "$gateway" "$port") || return 1
    if printf '%s' "$output" | assert_json outcome unrestricted; then ready=true; break; fi
    sleep 1
  done
  [[ $ready == true ]] || return 1
  daemon network inspect "$internal" | assert_json network "$gateway" true || return 1
  daemon network inspect "$open" | assert_json network "$gateway" false || return 1
  expect_probe "$internal_id" 127.0.0.1 5432 connected && expect_probe "$internal_id" "$gateway" "$port" denied || return 1
  expect_probe "$open_id" 127.0.0.1 5432 connected || return 1
  assert_open_rejected "$output" || return 1
  daemon network inspect "$runtime" | assert_json network "$gateway" true || return 1
  for service in api worker auth mailpit storage rest; do
    id=$(target "$service") || return 1
    expect_probe "$id" "$database_ip" 5432 connected && expect_probe "$id" "$gateway" "$port" denied || return 1
    printf '%s: local connected; external no-route denial verified\n' "$service"
  done
  # AIDEV-NOTE: Reuse proven fixtures for the restored-worker check; do not recreate occupied names.
  restored_database_ip=$database_ip
  restored_gateway=$gateway
  restored_port=$port
}
