# AIDEV-NOTE: Preflight and assertions share the same inspected, capped container profile.
run_container() {
run_id=$(docker create --rm --name "$name" --label "elevateo.r1.run=$nonce" \
  --network none --read-only --user 10001:10001 --cpus 0.5 --memory 256m --memory-swap 256m \
  --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,src=$TOOLS_SOURCE,dst=/src,readonly" \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777 \
  "$image_id" "$@")
docker inspect "$run_id" | jq -e --arg src "$TOOLS_SOURCE" --arg nonce "$nonce" --arg image "$image_id" \
  --arg id "$run_id" --arg name "/$name" '
  .[0] | .Id == $id and .Name == $name and .Image == $image and .Config.User == "10001:10001" and
  .Config.Labels["elevateo.r1.run"] == $nonce and
  (.Mounts | length == 1 and .[0].Type == "bind" and .[0].Source == $src and
   .[0].Destination == "/src" and .[0].RW == false) and
  (.HostConfig | .ReadonlyRootfs and .AutoRemove and .NetworkMode == "none" and
   .NanoCpus == 500000000 and .Memory == 268435456 and .MemorySwap == 268435456 and
   .PidsLimit == 128 and .Privileged == false and ((.CapAdd // []) | length == 0) and
   ((.Devices // []) | length == 0) and .CapDrop == ["ALL"] and .SecurityOpt == ["no-new-privileges"] and
   .Tmpfs == {"/tmp":"rw,noexec,nosuid,nodev,size=32m,mode=1777"} and
   ((.PortBindings // {}) | length == 0))' > /dev/null
fingerprint=$(snapshot "$run_id")
owned_run
daemon_for 120 start -a "$run_id" > "$evidence/$phase.log" 2>&1
}
