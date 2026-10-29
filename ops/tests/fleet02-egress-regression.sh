#!/usr/bin/env bash
# AIDEV-NOTE: Docker-only synthetic inspection checks; no daemon/socket access and no acceptance claim.
set -euo pipefail
[[ -f /.dockerenv && ! -S /var/run/docker.sock ]]
lane=/src/ops/tests
registry=$(mktemp -d)
task=be01r1-synthetic
name=$task-tool
export task registry lane
jq -n --arg name "$name" '{name:$name,image:"sha256:fixture",cpus:500000000,memory:268435456,
  network:"none",networks:["none"],readonly:true,user:"10001:10001",hardened:true,
  command:["fixture.rb"],entrypoint:["ruby"],mounts:[{type:"bind",source:"/stage",target:"/src",rw:false}]}' > "$registry/$name.spec"
jq -n --arg name "$name" --arg task "$task" '[{Id:("a"*64),Name:("/"+$name),Image:"sha256:fixture",
  Config:{Labels:{"elevateo.lane":$task},User:"10001:10001",Cmd:["fixture.rb"],Entrypoint:["ruby"]},
  HostConfig:{NanoCpus:500000000,Memory:268435456,MemorySwap:268435456,PidsLimit:256,
    OomKillDisable:false,Privileged:false,CapAdd:null,CapDrop:["ALL"],SecurityOpt:["no-new-privileges"],
    NetworkMode:"none",ReadonlyRootfs:true,RestartPolicy:{Name:"no"}},
  Mounts:[{Type:"bind",Source:"/stage",Destination:"/src",RW:false}],NetworkSettings:{Networks:{none:{}}}}]' > "$registry/good.json"
accept() { jq -ce --arg task "$task" --slurpfile spec "$registry/$name.spec" -f "$lane/fleet02-egress-inspect.jq" "$1"; }
accept "$registry/good.json" > "$registry/good.pin"
count=0
for mutation in \
  '.[0].Config.Labels["elevateo.lane"]="unrelated"' \
  '.[0].Mounts[0].RW=true' \
  '.[0].Mounts[0].Source="/persistent"' \
  '.[0].Mounts[0].Type="volume"' \
  '.[0].HostConfig.NanoCpus=0' \
  '.[0].HostConfig.Memory=0' \
  '.[0].HostConfig.MemorySwap=-1' \
  '.[0].HostConfig.CapDrop=[]' \
  '.[0].HostConfig.SecurityOpt=[]' \
  '.[0].HostConfig.Privileged=true' \
  '.[0].NetworkSettings.Networks.extra={}' \
  '.[0].Id=""' \
  '.[0].HostConfig.Mounts=[{Type:"tmpfs",Target:"/unplanned",TmpfsOptions:{SizeBytes:0}}]'; do
  jq "$mutation" "$registry/good.json" > "$registry/bad.json"
  if accept "$registry/bad.json" >/dev/null 2>&1; then echo "FAIL mutation $count"; exit 1; fi
  count=$((count+1))
done
# A different valid ID passes profile checks but must not match the pinned immutable fingerprint.
jq '.[0].Id=("b"*64)' "$registry/good.json" > "$registry/replaced.json"
accept "$registry/replaced.json" > "$registry/replaced.pin"
# AIDEV-NOTE: Negated commands suppress errexit; an equal fingerprint must explicitly fail this regression.
if cmp -s "$registry/good.pin" "$registry/replaced.pin"; then
  echo 'FAIL replaced ID retained identical fingerprint'; exit 1
fi
source "$lane/fleet02-egress-resources.sh"
daemon() { [[ $1 == inspect ]] && cat "$registry/good.json"; }
pin_container "$name"
verify_container "$name"
# AIDEV-NOTE: Parent reproduced only false -> null OomKillDisable after start; retain all other fingerprint fields.
jq '.[0].HostConfig.OomKillDisable=null' "$registry/good.json" > "$registry/started.json"
daemon() {
  case "$1" in
    inspect) cat "$registry/started.json" ;;
    rm) [[ $2 == -f && $3 == $(printf 'a%.0s' {1..64}) ]] || return 1; printf '%s\n' "$3" > "$registry/removed" ;;
    container) [[ $2 == ls ]] ;;
    *) return 1 ;;
  esac
}
verify_container "$name"
remove_container "$name"
[[ $(cat "$registry/removed") == $(printf 'a%.0s' {1..64}) ]]
# Reverse serialization must also match a pin first observed with null.
pin_container "$name"
daemon() { [[ $1 == inspect ]] && cat "$registry/good.json"; }
verify_container "$name"
pin_container "$name"
# Security/execution settings beyond the minimum profile must still differ from the original pin.
for mutation in \
  '.[0].HostConfig.OomKillDisable=true' \
  '.[0].HostConfig.OomKillDisable="false"' \
  '.[0].Config.StdinOnce=true' \
  '.[0].Config.AttachStdin=true' \
  '.[0].Config.Env=["EXECUTION_CHANGED=1"]' \
  '.[0].Config.WorkingDir="/other"' \
  '.[0].Config.OpenStdin=true' \
  '.[0].HostConfig.MaskedPaths=[]' \
  '.[0].HostConfig.UsernsMode="host"' \
  '.[0].HostConfig.PidMode="host"' \
  '.[0].HostConfig.ExtraHosts=["external:1.2.3.4"]' \
  '.[0].HostConfig.SecurityOpt=[]' \
  '.[0].Mounts[0].RW=true'; do
  jq "$mutation" "$registry/started.json" > "$registry/changed.json"
  daemon() {
    if [[ $1 == inspect ]]; then cat "$registry/changed.json"
    else printf '%s\n' "$*" >> "$registry/security-mutation-attempts"; return 1; fi
  }
  if verify_container "$name"; then echo "FAIL accepted security drift: $mutation"; exit 1; fi
  if remove_container "$name"; then echo 'FAIL removed security-changed container'; exit 1; fi
done
[[ ! -e $registry/security-mutation-attempts ]]
daemon() { [[ $1 == inspect ]] && cat "$registry/replaced.json"; }
if verify_container "$name"; then echo 'FAIL replaced ID'; exit 1; fi
# Removal cannot reach the daemon mutation when identity has changed.
daemon() {
  if [[ $1 == inspect ]]; then cat "$registry/replaced.json"
  else printf '%s\n' "$*" >> "$registry/mutation-attempts"; return 1; fi
}
if remove_container "$name"; then echo 'FAIL unsafe removal'; exit 1; fi
[[ ! -e $registry/mutation-attempts ]]
# AIDEV-NOTE: Shared-network start changes only the tool hostname to its pinned donor's default short ID.
jq '.network=("container:"+("b"*64)) | .networks=[]' "$registry/$name.spec" > "$registry/shared.spec"
cp "$registry/shared.spec" "$registry/$name.spec"
jq '.[0].Config.Hostname=("a"*12) | .[0].HostConfig.NetworkMode=("container:"+("b"*64)) |
  .[0].NetworkSettings.Networks={}' "$registry/good.json" > "$registry/shared-before.json"
cp "$registry/shared-before.json" "$registry/shared-current.json"
daemon() {
  case "$1" in
    inspect) cat "$registry/shared-current.json" ;;
    rm) [[ $2 == -f && $3 == $(printf 'a%.0s' {1..64}) ]] || return 1; printf '%s\n' "$3" > "$registry/shared-removed" ;;
    container) [[ $2 == ls ]] ;;
    *) return 1 ;;
  esac
}
pin_container "$name"
jq '.[0].Config.Hostname=("b"*12) | .[0].HostConfig.OomKillDisable=null' \
  "$registry/shared-before.json" > "$registry/shared-started.json"
cp "$registry/shared-started.json" "$registry/shared-current.json"
verify_container "$name"
remove_container "$name"
[[ $(cat "$registry/shared-removed") == $(printf 'a%.0s' {1..64}) ]]
rm "$registry/shared-removed"
# Both lifecycle directions retain the same pin; arbitrary names, donors, identities and security drift do not.
pin_container "$name"
cp "$registry/shared-before.json" "$registry/shared-current.json"
verify_container "$name"
for mutation in \
  '.[0].Config.Hostname="foreign"' \
  '.[0].Config.Hostname=null' \
  '.[0].Config.Domainname="foreign"' \
  '.[0].HostConfig.NetworkMode=("container:"+("c"*64))' \
  '.[0].Id=("c"*64)' \
  '.[0].HostConfig.Memory=0' \
  '.[0].Config.Env=["EXECUTION_CHANGED=1"]'; do
  jq "$mutation" "$registry/shared-started.json" > "$registry/shared-current.json"
  if verify_container "$name"; then echo "FAIL shared-network drift: $mutation"; exit 1; fi
  if remove_container "$name"; then echo 'FAIL removed changed shared-network tool'; exit 1; fi
done
[[ ! -e $registry/shared-removed ]]
printf 'PASS profile baseline; %s invalid profiles; lifecycle removal; security drift/replacement rejection\n' "$count"
