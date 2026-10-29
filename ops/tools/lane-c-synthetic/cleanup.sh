# AIDEV-NOTE: Recovery requires successful inventory plus exact task ownership; uncertainty retains resources.
verify_cache() {
  docker volume inspect "$cache" | jq -e --arg cache "$cache" --arg nonce "$nonce" '
    length == 1 and (.[0] | .Name == $cache and .Driver == "local" and .Scope == "local" and
      .Labels["elevateo.r1.run"] == $nonce and ((.Options // {}) | length == 0))' >/dev/null
}
registry_inventory() {
  # AIDEV-NOTE: Buildx v0.35 supports ls JSON, not inspect --format; validate inventory before use.
  local raw
  raw=$(docker buildx ls --format json) || return 1
  jq -se '
    length > 0 and all(.[]; type == "object" and (.Name | type == "string" and length > 0) and
      (.Driver | type == "string") and (.Nodes | type == "array")) and
    ((map(.Name) | unique | length) == length)
  ' <<< "$raw" >/dev/null || return 1
  jq -s '.' <<< "$raw"
}
remove_builder_registration() {
  local inventory details
  inventory=$(registry_inventory) || return 1
  details=$(jq -c --arg builder "$builder" '[.[] | select(.Name == $builder)]' <<< "$inventory") || return 1
  [[ $details != '[]' ]] || return 0
  # Node status/errors are not ownership: registry identity survives removal of its builder container.
  jq -e --arg builder "$builder" --arg context "$TOOLS_CONTEXT" --arg endpoint "$endpoint" '
    length == 1 and (.[0] | .Name == $builder and .Driver == "docker-container" and (.Nodes | length == 1) and
    .Nodes[0].Name == ($builder + "0") and
    (.Nodes[0].Endpoint == $context or .Nodes[0].Endpoint == $endpoint))' <<< "$details" >/dev/null || return 1
  docker buildx rm --keep-daemon --keep-state "$builder"
}
empty_cache() {
  local status=1 inventory actual
  verify_cache || return 1
  # Read-only empty-directory oracle in the already pinned base; never start or mount an unverified resource.
  probe_id=$(docker create --rm --name "$probe_name" --label "elevateo.r1.run=$nonce" \
    --network none --read-only --user 10001:10001 --cpus 0.5 --memory 256m --memory-swap 256m \
    --pids-limit 32 --cap-drop ALL --security-opt no-new-privileges \
    --mount "type=volume,src=$cache,dst=/cache,readonly,volume-nocopy" \
    --entrypoint ruby "$base_id" -e 'exit(Dir.children("/cache").empty? ? 0 : 1)') || return 1
  docker inspect "$probe_id" | jq -e --arg id "$probe_id" --arg name "/$probe_name" \
    --arg nonce "$nonce" --arg image "$base_id" --arg cache "$cache" '
    .[0] | .Id == $id and .Name == $name and .Image == $image and
    .Config.Labels["elevateo.r1.run"] == $nonce and .Config.User == "10001:10001" and
    .Config.Entrypoint == ["ruby"] and .Config.Cmd == ["-e","exit(Dir.children(\"/cache\").empty? ? 0 : 1)"] and
    (.Mounts | length == 1 and .[0].Type == "volume" and .[0].Name == $cache and
      .[0].Destination == "/cache" and .[0].RW == false) and
    (.HostConfig | .AutoRemove and .ReadonlyRootfs and .NetworkMode == "none" and .Privileged == false and
      .NanoCpus == 500000000 and .Memory == 268435456 and .MemorySwap == 268435456 and
      .PidsLimit == 32 and .CapDrop == ["ALL"] and .SecurityOpt == ["no-new-privileges"] and
      ((.CapAdd // []) | length == 0) and ((.Devices // []) | length == 0) and
      ((.Tmpfs // {}) | length == 0) and ((.PortBindings // {}) | length == 0))' >/dev/null || return 1
  probe_fingerprint=$(snapshot "$probe_id") || return 1
  if verify_cache && [[ $(snapshot "$probe_id") == "$probe_fingerprint" ]]; then
    docker start -a "$probe_id" > "$evidence/cache-empty.log" 2>&1 && status=0
  fi
  inventory=$(docker container ls -a --format '{{.Names}}') || return 1
  if grep -Fx "$probe_name" <<< "$inventory" >/dev/null; then
    actual=$(docker inspect -f '{{.Id}}' "$probe_name") || return 1
    [[ $actual == "$probe_id" && $(snapshot "$probe_id") == "$probe_fingerprint" ]] || return 1
    docker rm -f "$probe_id" || return 1
  fi
  return "$status"
}
recover_images() {
  local ids candidate metadata failed=0 expected
  # Recover even when load timed out before assigning image_id; filter plus reinspection prevents name-only deletion.
  ids=$(docker image ls -aq --no-trunc --filter "label=elevateo.r1.run=$nonce") || return 1
  for candidate in $(sort -u <<< "$ids"); do
    [[ $candidate =~ ^sha256:[a-f0-9]{64}$ ]] || { failed=1; continue; }
    if grep -Fx "$candidate" "$evidence/preexisting-images" >/dev/null; then continue; fi
    metadata=$(docker image inspect "$candidate") || { failed=1; continue; }
    if ! jq -e --arg id "$candidate" --arg nonce "$nonce" --arg tag "$image" '
      length == 1 and (.[0] | .Id == $id and .Config.Labels["elevateo.r1.run"] == $nonce and
        all((.RepoTags // [])[]; . == $tag))' <<< "$metadata" >/dev/null; then
      echo "RETAIN changed/shared image=$candidate"; failed=1; continue
    fi
    # Non-force ID removal also rejects surviving container references; recheck metadata immediately before deletion.
    expected=$(jq -Sc '.[0] | {Id,RepoTags,RepoDigests,Config}' <<< "$metadata") || { failed=1; continue; }
    metadata=$(docker image inspect "$candidate" | jq -Sc '.[0] | {Id,RepoTags,RepoDigests,Config}') || { failed=1; continue; }
    if [[ $metadata == "$expected" ]]; then docker image rm "$candidate" || failed=1
    else echo "RETAIN changed image=$candidate"; failed=1; fi
  done
  return "$failed"
}
snapshot() {
  docker inspect "$1" | jq -Sc '.[0] | {Id,Name,Image,Config,HostConfig}' | sha256sum
}
owned_run() {
  [[ -n $run_id && -n $fingerprint ]] || return 1
  [[ $(docker inspect -f '{{.Id}}' "$name") == "$run_id" ]] || return 1
  [[ $(snapshot "$run_id") == "$fingerprint" ]]
}
cleanup_tools() {
  local original=$? failed=0 inventory content=0 builder_gone=0
  trap - EXIT INT TERM
  set +e
  inventory=$(docker container ls -a --format '{{.Names}}')
  if [[ $? != 0 ]]; then
    echo 'RETAIN resources: container inventory failed'; failed=1
  else
    if grep -Fx "$name" <<< "$inventory" >/dev/null; then
      if owned_run; then docker rm -f "$run_id" || failed=1
      else echo "RETAIN unverified container=$name"; failed=1; fi
    fi
    if grep -Fx "$build_container" <<< "$inventory" >/dev/null; then
      if verify_builder; then
        docker exec "$builder_id" sh -c 'test -d /var/lib/buildkit && du -sk /var/lib/buildkit' \
          > "$evidence/cache-size.log" && content=1
        if verify_builder; then docker rm -f "$builder_id" || failed=1; fi
      else echo "RETAIN unverified builder=$build_container"; failed=1; fi
    fi
    inventory=$(docker container ls -a --format '{{.Names}}')
    if [[ $? == 0 ]] && ! grep -Fx "$build_container" <<< "$inventory" >/dev/null; then builder_gone=1; fi
    if ((builder_gone)); then
      if ! remove_builder_registration; then
        echo "RETAIN cache=$cache builder registry unverified"; builder_gone=0; failed=1
      fi
      # Recover a precreated empty cache even if bootstrap never produced a usable builder.
      inventory=$(docker volume ls --format '{{.Name}}')
      if [[ $? != 0 ]]; then failed=1
      elif ((builder_gone)) && grep -Fx "$cache" <<< "$inventory" >/dev/null; then
        if ((content == 0)) && verify_cache && empty_cache; then content=1; fi
        if ((content)) && verify_cache; then docker volume rm "$cache" || failed=1
        else echo "RETAIN cache=$cache content unverified or ownership changed"; failed=1; fi
      fi
    else echo "RETAIN builder registry and cache=$cache"; failed=1; fi
  fi
  recover_images || failed=1
  docker system df > "$evidence/docker-space.after" || failed=1
  df -h "$evidence" > "$evidence/host-space.after" || failed=1
  printf 'test_exit=%s cleanup_failed=%s evidence=%s\n' "$original" "$failed" "$evidence"
  ((original == 0 && failed != 0)) && original=1
  exit "$original"
}
