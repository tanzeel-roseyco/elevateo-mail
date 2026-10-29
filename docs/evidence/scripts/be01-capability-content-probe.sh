#!/usr/bin/env bash
# AIDEV-NOTE: Sourced only by pinned volume recovery; failures retain probes, never force-stop or retry.
content_probe() {
  local kind=$1 name=$task-recovery-$(cat /proc/sys/kernel/random/uuid) id
  local out=$evidence/content-$1
  mkdir -m 0700 "$out"
  d container ls -a --no-trunc --format '{{json .}}' > "$out/inventory.before"
  jq -se --arg name "$name" 'all(.[]; .Names!=$name)' "$out/inventory.before" >/dev/null
  jq -n --arg name "$name" --arg image "$image" --arg src "$src" --arg volume "$task-$kind" --arg mode "check-$kind" '
    {name:$name,image:$image,network:"none",networks:["none"],cpus:1000000000,memory:536870912,
     readonly:true,user:"0:0",entrypoint:["ruby"],command:["/repo/ops/tools/be01-services/volume.rb",$mode],
     capadd:["DAC_READ_SEARCH"],hardened:true,tmpfs:[{target:"/tmp",size:67108864}],
     mounts:[{type:"bind",source:$src,target:"/repo",rw:false},
       {type:"volume",source:$volume,target:"/acceptance",rw:false},{type:"tmpfs",source:"",target:"/tmp",rw:true}]}' > "$out/spec"
  volume_identity "$kind" "$out/volume.before"
  # Register intent before create; failed/ambiguous create is reconciled by exact name/spec, never retried.
  printf '%s\n' "$name" > "$out/name"
  d create --name "$name" --label "elevateo.lane=$task" --network none --user 0:0 \
    --cpus 1 --memory 512m --memory-swap 512m --pids-limit 256 --read-only --cap-drop ALL \
    --cap-add DAC_READ_SEARCH --security-opt no-new-privileges --restart no \
    --mount type=tmpfs,dst=/tmp,tmpfs-size=67108864 \
    --mount "type=bind,src=$src,dst=/repo,readonly" \
    --mount "type=volume,src=$task-$kind,dst=/acceptance,readonly,volume-nocopy" \
    --workdir /repo/apps/server --entrypoint ruby "$image" /repo/ops/tools/be01-services/volume.rb "check-$kind" > "$out/id"
  id=$(cat "$out/id"); [[ $id =~ ^[0-9a-f]{64}$ ]]
  volume_identity "$kind" "$out/volume.created"
  probe_snapshot "$id" "$out" before created
  timeout -k 3s 30s docker --context default start -a "$id" > "$out/content.log" 2>&1
  probe_snapshot "$id" "$out" after exited
  cmp -s "$out/before" "$out/after"
  printf 'PASS volume check-%s\n' "$kind" > "$out/expected"
  cmp -s "$out/expected" "$out/content.log"
  volume_identity "$kind" "$out/volume.after"
  authenticate
  probe_snapshot "$id" "$out" fresh exited
  cmp -s "$out/before" "$out/fresh"
  d rm "$id" > "$out/remove.log"
  d container ls -a --no-trunc --format '{{json .}}' > "$out/inventory.after"
  jq -se --arg id "$id" --arg name "$name" 'all(.[]; .ID!=$id and .Names!=$name)' "$out/inventory.after" >/dev/null
  printf 'content_exit=0 probe_cleanup_exit=0 absence_exit=0\n' > "$out/status"
}
probe_snapshot() {
  local id=$1 out=$2 suffix=$3 state=$4
  d inspect "$id" > "$out/$suffix.raw" || return 1
  jq -e --arg id "$id" --arg state "$state" 'length==1 and (.[0]|.Id==$id and .State.Status==$state and
    .State.Running==false and .State.Paused==false and .State.Restarting==false and .State.Dead==false and
    .State.Pid==0 and .State.ExitCode==0 and
    ([.HostConfig.Mounts[]|select(.Type=="volume")|.VolumeOptions.NoCopy]==[true]))' "$out/$suffix.raw" >/dev/null || return 1
  jq -ce --arg task "$task" --slurpfile spec "$out/spec" -f "$RECOVERY_INSPECTOR" "$out/$suffix.raw" > "$out/$suffix" || return 1
}
