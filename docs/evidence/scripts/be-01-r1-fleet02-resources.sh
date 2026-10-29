# Fleet-02 adaptation; frozen be-01-r1-resources.sh remains unchanged for provenance.
# AIDEV-NOTE: Bound each task container on the shared VPS; inspection gates execution and cleanup alike.
container_state() {
  local inventory
  inventory=$(timeout 3s docker container ls -a --format '{{.Names}}') || return 2
  grep -Fx "$1" <<< "$inventory" >/dev/null
}
network_state() {
  local inventory
  inventory=$(timeout 3s docker network ls --format '{{.Name}}') || return 2
  grep -Fx "$1" <<< "$inventory" >/dev/null
}
image_state() {
  local inventory reference=$1
  inventory=$(timeout 3s docker image ls -a --no-trunc --digests --format '{{json .}}') || return 2
  # Digest-qualified references may contain a tag; Docker's inventory separates repository and digest.
  [[ $reference != *@* ]] || reference="${reference%%:*}@${reference##*@}"
  jq -se --arg image "$1" --arg reference "$reference" \
    'any(.[]; .ID == $image or (.Repository + ":" + .Tag) == $image or (.Repository + "@" + .Digest) == $reference)' <<< "$inventory"
}
record() {
  local label=$1 status=0; shift
  "$@" > "$evidence/$label.log" 2>&1 || status=$?
  printf 'check=%s exit=%s log=%s\n' "$label" "$status" "$evidence/$label.log"
  if ((status)); then failures=$((failures+1)); fi
}
verify_container() {
  local name=$1 expected actual profile=${profiles[$1]} tmp='{}' net=none
  local cpus=2000000000 memory=2147483648
  [[ $(docker inspect -f '{{index .Config.Labels "elevateo.r1.run"}}' "$name") == "$nonce" ]] || return 1
  case "$profile" in
    app-none|app-runtime)
      expected="bind|$src|/src|false"
      tmp='{"/app/log":"rw,uid=10001,gid=10001","/app/tmp":"rw,uid=10001,gid=10001","/tmp":"rw,uid=10001,gid=10001"}'
      [[ $(docker inspect -f '{{.Config.User}}|{{.HostConfig.ReadonlyRootfs}}' "$name") == '10001|true' ]] || return 1
      [[ $profile != app-runtime ]] || net=$network ;;
    config-rw|config-ro)
      cpus=500000000; memory=268435456
      local rw=true; [[ $profile != config-ro ]] || rw=false
      expected="volume|$config|/etc/postgresql-custom|$rw" ;;
    database)
      net=$network
      printf -v expected '%s\n%s\n%s\n%s\n%s' \
        "volume|$config|/etc/postgresql-custom|true" "bind|$src/ops|/ops|false" \
        "bind|$src/ops/supabase/db/99-roles.sql|/docker-entrypoint-initdb.d/init-scripts/99-roles.sql|false" \
        "bind|$src/ops/supabase/db/99-jwt.sql|/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql|false" \
        'tmpfs||/var/lib/postgresql/data|true' ;;
    *) return 1 ;;
  esac
  actual=$(docker inspect -f '{{range .Mounts}}{{.Type}}|{{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}}|{{.Destination}}|{{.RW}}{{println}}{{end}}' "$name") || return 1
  [[ $(printf '%s\n' "$actual" | sort) == $(printf '%s\n' "$expected" | sort) ]] || return 1
  docker inspect "$name" | jq -e --argjson tmp "$tmp" --arg net "$net" \
    --argjson cpus "$cpus" --argjson memory "$memory" \
    '.[0].HostConfig | (.Tmpfs // {}) == $tmp and .NetworkMode == $net and
     .NanoCpus == $cpus and .Memory == $memory and .MemorySwap == $memory and
     ((.PortBindings // {}) | length == 0)' >/dev/null || return 1
}
verify_builder() {
  local actual
  actual=$(docker inspect -f '{{.Id}}' "$build_container") || return 1
  [[ -z $builder_id || $builder_id == "$actual" ]] || return 1
  [[ $(docker volume inspect -f '{{index .Labels "elevateo.r1.run"}}' "$cache") == "$nonce" ]] || return 1
  docker inspect "$build_container" | jq -e \
    '.[0].HostConfig | .Memory == 2147483648 and .CpuPeriod == 100000 and .CpuQuota == 200000' >/dev/null || return 1
  docker inspect "$build_container" | jq -e --arg cache "$cache" \
    '.[0] | .Mounts | length == 1 and .[0].Type == "volume" and .[0].Name == $cache and .[0].Destination == "/var/lib/buildkit" and .[0].RW' >/dev/null || return 1
  builder_id=$actual
  build_image=$(docker inspect -f '{{.Image}}' "$build_container") || return 1
}
run_app() {
  local label=$1 process=$2 role=$3 pool=$4 name=$task-$1 net=none; shift 4
  local args=()
  profiles[$name]=app-none
  if [[ $process != none ]]; then
    net=$network; profiles[$name]=app-runtime
    args=(-e RAILS_ENV=test -e ELEVATEO_MODE=local -e ELEVATEO_OUTBOUND_HOLD=true
      -e ELEVATEO_DB_HOST=db -e ELEVATEO_DB_NAME=postgres -e "ELEVATEO_DB_ROLE=elevateo_$role"
      -e "ELEVATEO_PROCESS=$process" -e "ELEVATEO_DB_POOL=$pool"
      -e ELEVATEO_AUTH_URL=http://auth:9999 -e ELEVATEO_STORAGE_URL=http://storage:5000
      -e ELEVATEO_MAILPIT_URL=http://mailpit:8025 -e ELEVATEO_SMTP_HOST=mailpit -e ELEVATEO_SMTP_PORT=1025
      -e SECRET_KEY_BASE=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)
    case $role in
      api) args+=(-e API_DB_PASSWORD=r1-disposable-api) ;;
      worker) args+=(-e WORKER_DB_PASSWORD=r1-disposable-worker) ;;
      migrator) args+=(-e MIGRATOR_DB_PASSWORD=r1-disposable-migrator) ;;
      *) return 1 ;;
    esac
  fi
  docker create --rm --name "$name" --label "elevateo.r1.run=$nonce" --network "$net" \
    --cpus 2 --memory 2g --memory-swap 2g \
    --read-only --user 10001 --cap-drop ALL --security-opt no-new-privileges --workdir /app \
    --tmpfs /tmp:rw,uid=10001,gid=10001 --tmpfs /app/tmp:rw,uid=10001,gid=10001 \
    --tmpfs /app/log:rw,uid=10001,gid=10001 --mount "type=bind,src=$src,dst=/src,readonly" \
    -e HOME=/tmp -e BUNDLE_APP_CONFIG=/tmp/bundle -e BUNDLE_FROZEN=true "${args[@]}" "$app_image" "$@" >/dev/null || return 1
  verify_container "$name" || return 1
  local status=0 state=0
  timeout 45s docker start -a "$name" || status=$?
  container_state "$name" || state=$?
  if [[ $state == 0 ]]; then
    if verify_container "$name"; then timeout 5s docker rm -f "$name" >/dev/null || exit 1
    else printf 'RETAIN container=%s verification_failed\n' "$name"; exit 1; fi
  elif [[ $state != 1 ]]; then
    printf 'RETAIN container=%s inventory_failed\n' "$name"; exit 1
  fi
  return "$status"
}
inspect_config() {
  local mode=$1 name=$task-config-check options='' status=0
  [[ $mode != ro ]] || options=',readonly,volume-nocopy'
  profiles[$name]=config-$mode
  docker create --name "$name" --label "elevateo.r1.run=$nonce" --network none --user postgres \
    --cpus 0.5 --memory 256m --memory-swap 256m \
    --mount "type=volume,src=$config,dst=/etc/postgresql-custom$options" --entrypoint sh "$pg" -ceu '
    test -r /etc/postgresql/postgresql.conf
    test -d /etc/postgresql-custom/conf.d
    for file in supautils.conf wal-g.conf read-replica.conf; do
      test -r "/etc/postgresql-custom/$file"
      stat -c "%n %u %g %a %s" "/etc/postgresql-custom/$file"
    done
    find /etc/postgresql-custom -xdev -type f | wc -l' >/dev/null || return 1
  verify_container "$name" || return 1
  timeout 10s docker start -a "$name" || status=$?
  # AIDEV-NOTE: Cleanup calls this after its container sweep; reap a timed-out probe only after full verification.
  verify_container "$name" || return 1
  timeout 5s docker rm -f "$name" >/dev/null || return 1
  return "$status"
}
cleanup() {
  local result=$? name image current state cache_checked=false builder_removed=false
  trap - EXIT INT TERM
  set +e
  # AIDEV-NOTE: Inspect actual daemon resources after killed CLI calls; never delete by prefix or prune shared state.
  for name in "${!profiles[@]}"; do
    state=0; container_state "$name" || state=$?
    if [[ $state == 0 ]]; then
      if verify_container "$name"; then timeout 5s docker rm -f "$name" >/dev/null && printf 'removed_container=%s\n' "$name" || result=1
      else printf 'RETAIN container=%s verification_failed\n' "$name"; result=1; fi
    elif [[ $state != 1 ]]; then
      printf 'RETAIN container=%s inventory_failed\n' "$name"; result=1
    fi
  done
  state=0; container_state "$build_container" || state=$?
  if [[ $state == 0 ]]; then
    if verify_builder; then
      if timeout 5s docker exec "$builder_id" sh -c 'test -d /var/lib/buildkit; du -sk /var/lib/buildkit' > "$evidence/build-cache-metadata.log"; then cache_checked=true; fi
      if verify_builder && timeout 5s docker rm -f "$builder_id" >/dev/null; then builder_removed=true; else result=1; fi
    else printf 'RETAIN builder=%s verification_failed\n' "$build_container"; result=1; fi
  elif [[ $state != 1 ]]; then
    printf 'RETAIN builder=%s inventory_failed\n' "$build_container"; result=1
  fi
  # AIDEV-NOTE: Registry removal follows verified daemon removal; inventory errors never authorize dependent deletion.
  state=0; container_state "$build_container" || state=$?
  if [[ $builder_removed == true && $state == 1 ]]; then
    timeout 5s docker buildx rm --keep-daemon --keep-state "$builder" >/dev/null 2>&1 || result=1
  fi
  if [[ $cache_checked == true && $builder_removed == true && $state == 1 ]] && \
      [[ $(timeout 3s docker volume inspect -f '{{index .Labels "elevateo.r1.run"}}' "$cache" 2>/dev/null) == "$nonce" ]]; then
    timeout 5s docker volume rm "$cache" || result=1
  else
    printf 'RETAIN cache=%s content_or_ownership_not_verified\n' "$cache"; result=1
  fi
  state=0; container_state "$db" || state=$?
  if [[ $config_ready == true && $state == 1 ]]; then
    if [[ $(docker volume inspect -f '{{index .Labels "elevateo.r1.run"}}' "$config") == "$nonce" ]] && inspect_config ro; then
      timeout 5s docker volume rm "$config" || result=1
    else printf 'RETAIN volume=%s verification_failed\n' "$config"; result=1; fi
  elif [[ $config_ready == true ]]; then
    printf 'RETAIN volume=%s database_absence_not_verified\n' "$config"; result=1
  fi
  state=0; network_state "$network" || state=$?
  if [[ $state == 0 ]]; then
    if timeout 3s docker network inspect "$network" | jq -e --arg nonce "$nonce" \
      '.[0] | .Labels["elevateo.r1.run"] == $nonce and .Internal and (.Containers | length == 0)' >/dev/null; then
      timeout 5s docker network rm "$network" >/dev/null || result=1
    else printf 'RETAIN network=%s verification_failed\n' "$network"; result=1; fi
  elif [[ $state != 1 ]]; then
    printf 'RETAIN network=%s inventory_failed\n' "$network"; result=1
  fi
  # AIDEV-NOTE: Only observed task images qualify; pre-existing IDs and referenced images survive non-force removal.
  for image in "$app_image" "$pg" "$build_image" 'ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2'; do
    [[ -n $image ]] || continue
    state=0; image_state "$image" || state=$?
    [[ $state != 1 ]] || continue
    if [[ $state != 0 ]]; then printf 'RETAIN image=%s inventory_failed\n' "$image"; result=1; continue; fi
    if ! current=$(timeout 3s docker image inspect -f '{{.Id}}' "$image" 2>/dev/null); then
      printf 'RETAIN image=%s inspection_failed\n' "$image"; result=1; continue
    fi
    if ! grep -Fx "$current" "$evidence/preexisting-images" >/dev/null; then
      timeout 5s docker image rm "$image" || result=1
    fi
  done
  timeout 3s docker system df
  df -h "$evidence"
  printf 'cleanup_exit=%s retained_evidence=%s final_acceptance=pending\n' "$result" "$evidence"
  exit "$result"
}
