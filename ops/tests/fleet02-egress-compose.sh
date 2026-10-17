# AIDEV-NOTE: Compose resolves only the frozen base plus capped overlay, with a clean interpolation environment.
compose() {
  timeout --signal=TERM --kill-after=2s 25s env -i PATH="$PATH" HOME="$HOME" \
    DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}" R1_PROJECT="$task" R1_APP_IMAGE="$app" \
    docker --context "$context" compose --project-directory "$src" --project-name "$task" \
    --env-file "$evidence/disposable.env" -f "$src/compose.yaml" -f "$override" --profile tools "$@"
}
prepare_compose() {
  compose config --format json > "$evidence/compose.private.json" || return 1
  jq -e --arg task "$task" --arg app "$app" '
    (.services | keys) == ["api","auth","bootstrap","db","mailpit","migrate","rest","storage","worker"] and
    (.volumes // {} | length) == 0 and (.networks | keys) == ["runtime"] and
    .networks.runtime.external == true and .networks.runtime.name == ($task + "-runtime") and
    all(.services | to_entries[]; .key as $s | .value |
      .container_name == ($task + "-" + $s) and .labels["elevateo.lane"] == $task and
      (.networks | keys) == ["runtime"] and (.ports // [] | length) == 0 and
      (.volumes // [] | all(.type == "tmpfs" or (.type == "bind" and .read_only == true))) and
      (.privileged // false) == false and (.cap_add // [] | length) == 0 and
      .restart == "no" and .pids_limit == 256 and
      (.build == null) and
      (if ["api","worker","migrate","db"] | index($s) then
         (.cpus|tonumber) == 2 and (.mem_limit|tonumber) == 2147483648
       elif ["auth","rest","storage"] | index($s) then
         (.cpus|tonumber) == 1 and (.mem_limit|tonumber) == 1073741824
       else (.cpus|tonumber) == 0.5 and (.mem_limit|tonumber) == 268435456 end) and
      .memswap_limit == .mem_limit and
      (if ["api","worker","migrate"] | index($s) then .image == $app
       else (.image | test("@sha256:[0-9a-f]{64}$")) end))' "$evidence/compose.private.json" >/dev/null || return 1
  local service name reference image
  for service in db bootstrap migrate auth rest storage mailpit api worker; do
    name=$task-$service
    absent container "$name" || return 1
    reference=$(jq -r --arg s "$service" '.services[$s].image' "$evidence/compose.private.json")
    image=$(daemon image inspect -f '{{.Id}}' "$reference") || return 1
    # AIDEV-NOTE: Reject inherited anonymous volumes before create; never leave unregistered persistent data.
    daemon image inspect "$image" | jq -e --slurpfile config "$evidence/compose.private.json" --arg s "$service" \
      '($config[0].services[$s].volumes // [] | map(.target)) as $targets |
       all(.[0].Config.Volumes // {} | keys[]; . as $path | $targets | index($path) != null)' >/dev/null || return 1
    daemon image inspect "$image" | jq --slurpfile config "$evidence/compose.private.json" \
      --arg s "$service" --arg name "$name" --arg image "$image" --arg net "$runtime" '
      .[0].Config as $i | $config[0].services[$s] as $c |
      {name:$name,service:$s,image:$image,network:$net,networks:[$net],cpus:(($c.cpus|tonumber)*1000000000),
       memory:($c.mem_limit|tonumber),readonly:($c.read_only // false),user:($c.user // $i.User // ""),
       tmpfs:[$c.volumes[]? | select(.type == "tmpfs") | {target:.target,size:(.tmpfs.size|tonumber)}],
       command:($c.command // (if $c.entrypoint != null then null else $i.Cmd end)),entrypoint:($c.entrypoint // $i.Entrypoint),
       mounts:[$c.volumes[]? | {type:.type,source:(.source // ""),target:.target,rw:(.read_only != true)}]}' \
      > "$registry/$name.spec" || return 1
  done
}
create_services() {
  local service
  local services=(db bootstrap migrate auth rest storage mailpit api worker)
  # AIDEV-NOTE: create includes dependencies; register the entire closed service set before any creation.
  for service in "${services[@]}"; do
    jq -e --arg name "$task-$service" --arg service "$service" \
      '.name == $name and .service == $service' "$registry/$task-$service.spec" >/dev/null || return 1
    absent container "$task-$service" || return 1
  done
  network_new "$runtime" true || return 1
  verify_network "$runtime" || return 1
  # One supported create call avoids later dependency reconciliation changing already pinned containers.
  compose create --no-build --pull never "${services[@]}" > "$evidence/create-services.log" 2>&1 || return 1
  for service in "${services[@]}"; do
    pin_container "$task-$service" || return 1
  done
}
start_service() {
  verify_network "$runtime" && verify_container "$task-$1" || return 1
  daemon start "$(cat "$registry/$task-$1.id")" >/dev/null
}
healthy() {
  local name=$task-$1 state
  for ((attempt=0; attempt<60; attempt++)); do
    verify_container "$name" || return 1
    state=$(daemon inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$name") || return 1
    [[ $state != 'running|healthy' ]] || return 0
    [[ $state == 'running|starting' ]] || return 1
    sleep 1
  done
  return 1
}
oneshot() {
  local name=$task-$1 result=0
  verify_container "$name" || return 1
  daemon_for 60s start -a "$(cat "$registry/$name.id")" \
    > "$evidence/$1.log" 2>&1 || result=$?
  verify_container "$name" || return 1
  [[ $result == 0 && $(daemon inspect -f '{{.State.Status}}|{{.State.ExitCode}}' "$name") == 'exited|0' ]]
}
