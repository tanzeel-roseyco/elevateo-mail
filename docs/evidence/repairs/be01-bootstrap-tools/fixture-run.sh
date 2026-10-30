# AIDEV-NOTE: Reuse frozen builder cleanup; normalize only observed false/null OomKillDisable representation.
snapshot() {
  docker inspect "$1" | jq -Sc '.[0] | {Id,Name,Image,Config,HostConfig} |
    if .HostConfig.OomKillDisable == null then .HostConfig.OomKillDisable = false else . end' | sha256sum
}
run_fixture() {
  local fixture="$TOOLS_SOURCE/docs/evidence/repairs/be01-diagnostic-bootstrap" status=0
  run_id=$(docker create --name "$name" --label "elevateo.r1.run=$nonce" \
    --network none --read-only --user 10001:10001 --cpus 0.5 --memory 256m --memory-swap 256m \
    --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges \
    --mount "type=bind,src=$fixture,dst=/fixture,readonly" \
    --tmpfs /tmp:rw,exec,nosuid,nodev,size=128m,mode=1777 \
    --entrypoint bash "$image_id" /fixture/checks.sh)
  printf '%s\n' "$run_id" > "$evidence/fixture.id"
  docker inspect "$run_id" > "$evidence/fixture.created.json"
  jq -e --arg src "$fixture" --arg nonce "$nonce" --arg image "$image_id" \
    --arg id "$run_id" --arg name "/$name" '
    length == 1 and (.[0] | .Id == $id and .Name == $name and .Image == $image and
    .Config.User == "10001:10001" and .Config.Labels["elevateo.r1.run"] == $nonce and
    .Config.Entrypoint == ["bash"] and .Config.Cmd == ["/fixture/checks.sh"] and
    (.Mounts | length == 1 and .[0].Type == "bind" and .[0].Source == $src and
     .[0].Destination == "/fixture" and .[0].RW == false) and
    (.HostConfig | .ReadonlyRootfs and (.AutoRemove == false) and .NetworkMode == "none" and
     .NanoCpus == 500000000 and .Memory == 268435456 and .MemorySwap == 268435456 and
     .PidsLimit == 128 and .Privileged == false and ((.CapAdd // []) | length == 0) and
     ((.Devices // []) | length == 0) and .CapDrop == ["ALL"] and .SecurityOpt == ["no-new-privileges"] and
     (.OomKillDisable == false or .OomKillDisable == null) and
     .Tmpfs == {"/tmp":"rw,exec,nosuid,nodev,size=128m,mode=1777"} and
     ((.PortBindings // {}) | length == 0)))' "$evidence/fixture.created.json" >/dev/null
  fingerprint=$(snapshot "$run_id")
  owned_run
  # Capture original test status; inspected stopped container remains until the inherited EXIT cleanup.
  timeout -k 10s 180s docker --context "$TOOLS_CONTEXT" start -a "$run_id" > "$evidence/checks.log" 2>&1 || status=$?
  finish_fixture "$status"
}
finish_fixture() {
  local status=$1 inspect_status=0 ownership_status=NOT_RUN report_status=0
  # AIDEV-NOTE: Verification must not replace a failed test; successful tests still fail on unverifiable state.
  printf 'test_exit=%s\n' "$status" > "$evidence/fixture.status" || report_status=$?
  docker inspect "$run_id" > "$evidence/fixture.after.json" || inspect_status=$?
  if (( inspect_status == 0 )); then
    ownership_status=0
    owned_run || ownership_status=$?
  fi
  printf 'inspect_exit=%s\nownership_exit=%s\n' "$inspect_status" "$ownership_status" \
    > "$evidence/fixture.verification.status" || report_status=$?
  if (( status != 0 )); then return "$status"; fi
  if (( report_status != 0 )); then return "$report_status"; fi
  if (( inspect_status != 0 )); then return "$inspect_status"; fi
  return "$ownership_status"
}
