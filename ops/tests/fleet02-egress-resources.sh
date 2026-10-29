# Sourced only by the parent-controlled Lane C driver.
# AIDEV-NOTE: Pre-register intent; uncertain create results are retained, never guessed from a name prefix.
# AIDEV-NOTE: Explicit context beats environment/default-daemon drift, including timed attached startup.
daemon_for() { local limit=$1; shift; timeout --signal=TERM --kill-after=2s "$limit" docker --context "$context" "$@"; }
daemon() { daemon_for 10s "$@"; }
resource_present() {
  local kind=$1 name=$2 inventory
  case $kind in
    container) inventory=$(daemon container ls -a --format '{{.Names}}') || return 2 ;;
    network) inventory=$(daemon network ls --format '{{.Name}}') || return 2 ;;
    *) return 2 ;;
  esac
  grep -Fx "$name" <<< "$inventory" >/dev/null
}
absent() { local status=0; resource_present "$1" "$2" || status=$?; [[ $status == 1 ]]; }
container_fingerprint() {
  daemon inspect "$1" | jq -ce --arg task "$task" --slurpfile spec "$registry/$1.spec" \
    -f "$lane/fleet02-egress-inspect.jq" | sha256sum | cut -d' ' -f1
}
pin_container() {
  local name=$1 snapshot
  snapshot=$(daemon inspect "$name" | jq -ce --arg task "$task" --slurpfile spec "$registry/$name.spec" \
    -f "$lane/fleet02-egress-inspect.jq") || return 1
  printf '%s\n' "$snapshot" | sha256sum | cut -d' ' -f1 > "$registry/$name.pin"
  printf '%s' "$snapshot" | jq -er '.Id' > "$registry/$name.id"
}
verify_container() {
  local name=$1 fingerprint
  [[ -s $registry/$name.pin && -s $registry/$name.id ]] || return 1
  fingerprint=$(container_fingerprint "$name") || return 1
  [[ $fingerprint == "$(cat "$registry/$name.pin")" ]]
}
remove_container() {
  verify_container "$1" || return 1
  daemon rm -f "$(cat "$registry/$1.id")" >/dev/null || return 1
  absent container "$1"
}
network_new() {
  local name=$1 internal=$2 args=()
  absent network "$name" || return 1
  [[ $internal != true ]] || args+=(--internal)
  printf '%s\n' "$internal" > "$registry/$name.network"
  daemon network create --label "elevateo.lane=$task" "${args[@]}" "$name" > "$registry/$name.netid"
}
verify_network() {
  local name=$1
  [[ -s $registry/$name.netid ]] || return 1
  daemon network inspect "$name" | jq -e --arg task "$task" --arg name "$name" \
    --arg id "$(cat "$registry/$name.netid")" --argjson internal "$(cat "$registry/$name.network")" \
    'length == 1 and (.[0] | .Id == $id and .Name == $name and .Labels["elevateo.lane"] == $task and
     .Driver == "bridge" and .Internal == $internal and (.Options // {} | length) == 0)' >/dev/null
}
tool_create() {
  local name=$1 image=$2 net=$3; shift 3
  absent container "$name" || return 1
  daemon image inspect "$image" | jq -e '(.[0].Config.Volumes // {} | length) == 0' >/dev/null || return 1
  local nets='[]' ports='{}' publish=()
  [[ $net == container:* ]] || nets=$(jq -cn --arg net "$net" '[$net]')
  if [[ -n ${LANE_PUBLISH:-} ]]; then
    ports=$(jq -cn --arg gateway "$LANE_PUBLISH" '{"8080/tcp":[{HostIp:$gateway,HostPort:""}]}')
    publish=(--publish "$LANE_PUBLISH::8080")
  fi
  jq -n --arg name "$name" --arg image "$image" --arg net "$net" --arg src "$src" \
    --argjson nets "$nets" --argjson ports "$ports" --args '{name:$name,image:$image,network:$net,networks:$nets,ports:$ports,
      cpus:500000000,memory:268435456,readonly:true,user:"10001:10001",entrypoint:["ruby"],
      hardened:true,
      command:$ARGS.positional, mounts:[{type:"bind",source:$src,target:"/src",rw:false}]}' \
    -- "$@" > "$registry/$name.spec"
  daemon create --name "$name" --label "elevateo.lane=$task" --network "$net" \
    --cpus 0.5 --memory 256m --memory-swap 256m --pids-limit 256 --read-only --user 10001:10001 \
    --cap-drop ALL --security-opt no-new-privileges --interactive \
    --mount "type=bind,src=$src,dst=/src,readonly" "${publish[@]}" --entrypoint ruby "$image" "$@" >/dev/null || return 1
  pin_container "$name"
}
tool_run() {
  local image=$1 net=$2; shift 2
  local name=$task-tool-$(cat /proc/sys/kernel/random/uuid) result=0
  tool_create "$name" "$image" "$net" "$@" || return 1
  verify_container "$name" || return 1
  daemon_for 12s start -ai "$(cat "$registry/$name.id")" || result=$?
  if [[ $result == 0 ]]; then
    [[ $(daemon inspect -f '{{.State.Running}}' "$name") == false ]] || return 1
    result=$(daemon inspect -f '{{.State.ExitCode}}' "$name") || return 1
  fi
  # AIDEV-NOTE: Preserve oracle exit 42; cleanup errors override success or semantic rejection.
  remove_container "$name" || return 1
  : > "$registry/$name.gone"
  return "$result"
}
cleanup_lane() {
  local initial=$? failed=0 file name status
  trap - EXIT INT TERM
  set +e
  for file in "$registry"/*.spec; do
    [[ -f $file ]] || continue
    name=${file##*/}; name=${name%.spec}; status=0
    [[ ! -f $registry/$name.gone ]] || continue
    resource_present container "$name" || status=$?
    if [[ $status == 0 ]]; then
      if remove_container "$name"; then printf 'removed_container=%s\n' "$name"
      else printf 'RETAIN container=%s identity_or_profile_uncertain\n' "$name"; failed=1; fi
    elif [[ $status != 1 ]]; then printf 'RETAIN container=%s inventory_failed\n' "$name"; failed=1; fi
  done
  for file in "$registry"/*.network; do
    [[ -f $file ]] || continue
    name=${file##*/}; name=${name%.network}; status=0
    resource_present network "$name" || status=$?
    if [[ $status == 0 ]]; then
      if verify_network "$name" && daemon network inspect "$name" | jq -e '.[0].Containers | length == 0' >/dev/null; then
        daemon network rm "$(cat "$registry/$name.netid")" >/dev/null && absent network "$name" || failed=1
      else printf 'RETAIN network=%s identity_or_endpoints_uncertain\n' "$name"; failed=1; fi
    elif [[ $status != 1 ]]; then printf 'RETAIN network=%s inventory_failed\n' "$name"; failed=1; fi
  done
  printf 'test_exit=%s cleanup_failed=%s evidence=%s shared_images_retained=true\n' "$initial" "$failed" "$evidence"
  [[ $initial != 0 ]] || initial=$failed
  exit "$initial"
}
