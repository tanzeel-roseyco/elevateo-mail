# AIDEV-NOTE: Only volumes registered absent before this task and pinned after create are eligible for removal.
volume_present() {
  local inventory
  inventory=$(daemon volume ls --format '{{.Name}}') || return 2
  grep -Fx "$1" <<< "$inventory" >/dev/null
}
volume_snapshot() {
  daemon volume inspect "$task-$1" | jq -ce --arg name "$task-$1" --arg task "$task" '
    if length==1 and (.[0]|.Name==$name and .Driver=="local" and .Scope=="local" and
      .Labels["elevateo.lane"]==$task and (.Options//{}|length)==0)
    then .[0]|{Name,Driver,Scope,Labels,Options,Mountpoint,CreatedAt} else error("volume identity") end'
}
volume_verify() {
  local current
  [[ -s $registry/$1.volume ]] || return 1
  current=$(volume_snapshot "$1") || return 1
  [[ $current == "$(cat "$registry/$1.volume")" ]]
}
volumes_new() {
  local kind status
  for kind in data config storage state; do
    status=0; volume_present "$task-$kind" || status=$?
    [[ $status == 1 ]] || return 1
    : > "$registry/$kind.volume-intent"
    daemon volume create --driver local --label "elevateo.lane=$task" "$task-$kind" >/dev/null || return 1
    volume_snapshot "$kind" > "$registry/$kind.volume" || return 1
  done
}
finish_services() {
  local initial=$? failed=0 source_ok=1 file name status kind
  trap - EXIT INT TERM
  set +e
  authenticate > "$evidence/source.after.log" 2>&1 || { source_ok=0; failed=1; [[ $initial != 0 ]] || initial=1; }
  # Changed inspector/probe bytes cannot authorize deletion. Preserve all resources for reconciliation.
  if [[ $source_ok != 1 ]]; then
    printf 'test_exit=%s cleanup_failed=1 RETAIN source_authentication evidence=%s\n' "$initial" "$evidence"
    exit "$initial"
  fi
  # Remove verified consumers first. Never recover an unpinned container by guessing its identity.
  for file in "$registry"/*.spec; do
    [[ -f $file ]] || continue
    name=${file##*/}; name=${name%.spec}
    status=0; resource_present container "$name" || status=$?
    if [[ $status == 0 ]]; then
      remove_container "$name" || { echo "RETAIN container=$name"; failed=1; }
    elif [[ $status != 1 ]]; then failed=1; fi
  done
  for file in "$registry"/*.volume-intent; do
    [[ -f $file ]] || continue
    kind=${file##*/}; kind=${kind%.volume-intent}
    status=0; volume_present "$task-$kind" || status=$?
    [[ $status != 1 ]] || continue
    if [[ $status != 0 ]] || ! volume_verify "$kind"; then echo "RETAIN volume=$task-$kind identity"; failed=1; continue; fi
    local users
    users=$(daemon ps -aq --filter "volume=$task-$kind") || { failed=1; continue; }
    if [[ -n $users ]]; then echo "RETAIN volume=$task-$kind consumers"; failed=1; continue; fi
    # The read-only content probe is itself capped, registered and removed before the second identity check.
    if fixture "cleanup-$kind" volume "check-$kind" && volume_verify "$kind"; then
      users=$(daemon ps -aq --filter "volume=$task-$kind") || { failed=1; continue; }
      if [[ -z $users ]]; then daemon volume rm "$task-$kind" >/dev/null || failed=1
      else failed=1; fi
    else echo "RETAIN volume=$task-$kind content"; failed=1; fi
  done
  if [[ -f $registry/$runtime.network ]]; then
    if verify_network "$runtime" && daemon network inspect "$runtime" | jq -e '.[0].Containers|length==0' >/dev/null; then
      daemon network rm "$(cat "$registry/$runtime.netid")" >/dev/null || failed=1
    else echo "RETAIN network=$runtime"; failed=1; fi
  fi
  daemon ps -a --filter "label=elevateo.lane=$task" --format '{{.ID}} {{.Names}}' > "$evidence/containers.after" || failed=1
  daemon volume ls --filter "label=elevateo.lane=$task" --format '{{.Name}}' > "$evidence/volumes.after" || failed=1
  daemon network ls --filter "label=elevateo.lane=$task" --format '{{.ID}} {{.Name}}' > "$evidence/networks.after" || failed=1
  for file in containers volumes networks; do [[ ! -s $evidence/$file.after ]] || failed=1; done
  # Fresh exact-name checks catch retained objects even if their ownership label changed.
  : > "$evidence/exact.after"
  for file in "$registry"/*.spec; do
    [[ -f $file ]] || continue
    name=${file##*/}; name=${name%.spec}; status=0
    resource_present container "$name" || status=$?
    printf 'container %s inventory_status=%s\n' "$name" "$status" >> "$evidence/exact.after"
    [[ $status == 1 ]] || failed=1
  done
  for kind in data config storage state; do
    status=0; volume_present "$task-$kind" || status=$?
    printf 'volume %s inventory_status=%s\n' "$task-$kind" "$status" >> "$evidence/exact.after"
    [[ $status == 1 ]] || failed=1
  done
  absent network "$runtime" || failed=1
  daemon image ls --no-trunc > "$evidence/images.after" || failed=1
  daemon_for 15s buildx ls > "$evidence/builders.after" || failed=1
  df -B1 "$evidence" > "$evidence/host-space.after" || failed=1
  printf 'test_exit=%s cleanup_failed=%s evidence=%s preexisting_images_retained=true\n' "$initial" "$failed" "$evidence"
  [[ $initial != 0 ]] || initial=$failed
  exit "$initial"
}
