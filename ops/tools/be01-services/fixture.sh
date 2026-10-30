# AIDEV-NOTE: Helper command, mounts and minimal environment are registered before creation; never inherit all secrets.
fixture() {
  local phase=$1 file=$2 mode=${3:-} name=$task-probe-$(cat /proc/sys/kernel/random/uuid)
  local net=$runtime user=10001:10001 keys='' mounts args result=0
  local options=() command=()
  case $file in
    boundary_test) net=none ;;
    readiness) ;;
    credentials|regenerate) net=none ;;
    services) keys='SERVICE_ROLE_KEY ANON_KEY' ;;
    database) keys=POSTGRES_PASSWORD ;;
    authorized-storage) keys='API_DB_PASSWORD SERVICE_ROLE_KEY' ;;
    volume) net=none; user=0:0 ;;
    *) return 1 ;;
  esac
  mounts=$(jq -cn --arg src "$src" --arg state "$task-state" '
    [{type:"bind",source:$src,target:"/repo",rw:false},{type:"volume",source:$state,target:"/acceptance",rw:true},
     {type:"tmpfs",source:"",target:"/tmp",rw:true}]') || return 1
  options=(--mount "type=bind,src=$src,dst=/repo,readonly" --mount "type=volume,src=$task-state,dst=/acceptance")
  if [[ $file == credentials || $file == regenerate ]]; then
    mounts=$(jq --arg path "$evidence/disposable.env" '.+[{type:"bind",source:$path,target:"/credentials/local.env",rw:false}]' <<< "$mounts") || return 1
    options+=(--mount "type=bind,src=$evidence/disposable.env,dst=/credentials/local.env,readonly")
  fi
  if [[ $file == volume ]]; then
    [[ $mode =~ ^(init|check)-(data|config|storage|state)$ ]] || return 1
    local kind=${mode#*-} readonly=false
    [[ $mode == init-state ]] || readonly=true
    mounts=$(jq -cn --arg src "$src" --arg volume "$task-$kind" --argjson ro "$readonly" '
      [{type:"bind",source:$src,target:"/repo",rw:false},{type:"volume",source:$volume,target:"/acceptance",rw:($ro|not)},
       {type:"tmpfs",source:"",target:"/tmp",rw:true}]') || return 1
    options=(--mount "type=bind,src=$src,dst=/repo,readonly" --mount "type=volume,src=$task-$kind,dst=/acceptance,readonly=$readonly")
    [[ $mode != init-state ]] || options+=(--cap-add CHOWN --cap-add FOWNER)
    # AIDEV-NOTE: Read-only probes need traversal of service-owned 0700 directories, never write mounts.
    [[ $mode == init-state ]] || options+=(--cap-add DAC_READ_SEARCH)
    command=(/repo/ops/tools/be01-services/volume.rb "$mode")
  elif [[ $file == regenerate ]]; then
    command=(/repo/ops/bin/generate-secrets.rb /credentials/local.env)
  elif [[ $file == readiness ]]; then
    command=(/repo/ops/tools/be01-services/readiness.rb)
  else
    command=(-S bundle exec ruby "/repo/ops/tests/be01-services/$file.rb")
    [[ -z $mode ]] || command+=("$mode")
  fi
  local key value
  for key in $keys; do
    value=$(sed -n "s/^$key=//p" "$evidence/disposable.env") || return 1
    [[ $value =~ ^[A-Za-z0-9._-]+$ ]] || return 1
    options+=(--env "$key=$value")
  done
  absent container "$name" || return 1
  local capadd='[]'
  [[ $file != volume || $mode != init-state ]] || capadd='["CHOWN","FOWNER"]'
  [[ $file != volume || $mode == init-state ]] || capadd='["DAC_READ_SEARCH"]'
  jq -n --arg name "$name" --arg image "$app" --arg net "$net" --arg user "$user" --argjson mounts "$mounts" \
    --argjson capadd "$capadd" \
    --args '{name:$name,image:$image,network:$net,networks:[$net],cpus:1000000000,memory:536870912,
      readonly:true,user:$user,entrypoint:["ruby"],command:$ARGS.positional,mounts:$mounts,capadd:$capadd,
      tmpfs:[{target:"/tmp",size:67108864}],hardened:true}' -- "${command[@]}" > "$registry/$name.spec" || return 1
  daemon create --name "$name" --label "elevateo.lane=$task" --network "$net" --user "$user" \
    --cpus 1 --memory 512m --memory-swap 512m --pids-limit 256 --read-only --cap-drop ALL \
    --security-opt no-new-privileges --mount type=tmpfs,dst=/tmp,tmpfs-size=67108864 \
    --workdir /repo/apps/server --entrypoint ruby "${options[@]}" "$app" "${command[@]}" >/dev/null || return 1
  pin_container "$name" || return 1
  local deadline=180s
  [[ $file != volume ]] || deadline=30s
  daemon_for "$deadline" start -a "$(cat "$registry/$name.id")" > "$evidence/$phase.log" 2>&1 || result=$?
  verify_container "$name" || return 1
  [[ $(daemon inspect -f '{{.State.Status}}' "$name") == exited ]] || return 1
  if [[ $result == 0 ]]; then result=$(daemon inspect -f '{{.State.ExitCode}}' "$name") || return 1; fi
  remove_container "$name" || return 1
  # AIDEV-NOTE: Cleanup calls this function conditionally, so errexit cannot propagate marker failures.
  : > "$registry/$name.gone" || return 1
  return "$result"
}
