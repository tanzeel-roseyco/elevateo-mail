# AIDEV-NOTE: Frozen Lane C lifecycle is reused only after a separate exact persistent-mount plan is registered.
compose_base() {
  clean_compose --project-directory "$src" --project-name "$task" --env-file "$evidence/disposable.env" \
    -f "$src/compose.yaml" -f "$src/ops/compose.fleet02-egress.yaml" --profile tools "$@"
}
compose() {
  clean_compose --project-directory "$src" --project-name "$task" --env-file "$evidence/disposable.env" \
    -f "$evidence/stack.private.json" --profile tools "$@"
}
clean_compose() {
  # AIDEV-NOTE: Ambient product credentials must not override this task's generated env file.
  env -i PATH="$PATH" HOME="$HOME" DOCKER_CONFIG="${DOCKER_CONFIG:-$HOME/.docker}" \
    R1_PROJECT="$task" R1_APP_IMAGE="$app" \
    timeout -k 5s 25s docker --context "$context" compose "$@"
}
prepare_stack() {
  export R1_PROJECT=$task R1_APP_IMAGE=$app
  compose_base config --format json > "$evidence/base.private.json"
  jq --arg task "$task" -f "$adapter/config.jq" "$evidence/base.private.json" > "$evidence/stack.private.json"
  compose config --format json > "$evidence/compose.private.json"
  jq -e --arg task "$task" --arg app "$app" '
    (.services|keys)==["api","auth","bootstrap","db","mailpit","migrate","rest","storage","worker"] and
    (.networks|keys)==["runtime"] and .networks.runtime.external==true and
    .networks.runtime.name==($task+"-runtime") and
    (.volumes|keys)==["config","data","storage"] and
    all(.volumes|to_entries[]; .value.external==true and .value.name==($task+"-"+.key)) and
    all(.services|to_entries[]; .key as $s | .value |
      .container_name==($task+"-"+$s) and .labels["elevateo.lane"]==$task and
      (.networks|keys)==["runtime"] and (.ports//[]|length)==0 and .build==null and
      .restart=="no" and .pids_limit==256 and (.privileged//false)==false and
      (.cap_add//[]|length)==0 and .memswap_limit==.mem_limit and
      (if ["db","api","worker","migrate"]|index($s) then (.cpus|tonumber)==2 and (.mem_limit|tonumber)==2147483648
       elif ["auth","rest","storage"]|index($s) then (.cpus|tonumber)==1 and (.mem_limit|tonumber)==1073741824
       else (.cpus|tonumber)==0.5 and (.mem_limit|tonumber)==268435456 end) and
      (if ["api","worker","migrate"]|index($s) then .image==$app else (.image|test("@sha256:[0-9a-f]{64}$")) end) and
      all(.volumes[]?; if .type=="volume" then
        ($s=="db" and ((.source=="data" and .target=="/var/lib/postgresql/data") or
          (.source=="config" and .target=="/etc/postgresql-custom"))) or
        ($s=="storage" and .source=="storage" and .target=="/var/lib/storage")
        else .type=="tmpfs" or (.type=="bind" and .read_only==true) end))' "$evidence/compose.private.json" >/dev/null
  local service name reference image
  for service in db bootstrap migrate auth rest storage mailpit api worker; do
    name=$task-$service; absent container "$name" || return 1
    reference=$(jq -r --arg s "$service" '.services[$s].image' "$evidence/compose.private.json")
    image=$(daemon image inspect -f '{{.Id}}' "$reference") || return 1
    daemon image inspect "$image" | jq -e --slurpfile config "$evidence/compose.private.json" --arg s "$service" '
      ($config[0].services[$s].volumes//[]|map(.target)) as $targets |
      all(.[0].Config.Volumes//{}|keys[]; . as $p | $targets|index($p)!=null)' >/dev/null || return 1
    daemon image inspect "$image" | jq --slurpfile config "$evidence/compose.private.json" \
      --arg s "$service" --arg name "$name" --arg image "$image" --arg net "$runtime" '
      .[0].Config as $i | $config[0] as $all | $all.services[$s] as $c |
      {name:$name,service:$s,image:$image,network:$net,networks:[$net],cpus:(($c.cpus|tonumber)*1000000000),
       memory:($c.mem_limit|tonumber),readonly:($c.read_only//false),user:($c.user//$i.User//""),
       command:($c.command//(if $c.entrypoint!=null then null else $i.Cmd end)),entrypoint:($c.entrypoint//$i.Entrypoint),
       tmpfs:[$c.volumes[]?|select(.type=="tmpfs")|{target:.target,size:(.tmpfs.size|tonumber)}],
       mounts:[$c.volumes[]?|{type:.type,source:(if .type=="volume" then $all.volumes[.source].name else (.source//"") end),
         target:.target,rw:(.read_only!=true)}]}' > "$registry/$name.spec" || return 1
  done
}
container_fingerprint() {
  daemon inspect "$1" | jq -ce --arg task "$task" --slurpfile spec "$registry/$1.spec" \
    -f "$adapter/profile.jq" | sha256sum | cut -d' ' -f1
}
pin_container() {
  local snapshot
  snapshot=$(daemon inspect "$1" | jq -ce --arg task "$task" --slurpfile spec "$registry/$1.spec" \
    -f "$adapter/profile.jq") || return 1
  printf '%s\n' "$snapshot" | sha256sum | cut -d' ' -f1 > "$registry/$1.pin"
  printf '%s' "$snapshot" | jq -er '.Id' > "$registry/$1.id"
}
