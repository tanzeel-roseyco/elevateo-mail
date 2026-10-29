#!/usr/bin/env bash
# AIDEV-NOTE: Synthetic persistent-volume inspection accepts the exact profile, rejects ownership and security drift.
set -euo pipefail
adapter=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d); trap 'rm -f "$tmp/spec" "$tmp/container" "$tmp/changed" "$tmp/original-spec"; rmdir "$tmp"' EXIT
jq -n '{name:"probe",image:"sha256:test",network:"none",networks:["none"],cpus:1000000000,memory:536870912,
  readonly:true,user:"0:0",entrypoint:["ruby"],command:["probe.rb"],hardened:true,capadd:["DAC_READ_SEARCH"],
  mounts:[{type:"volume",source:"task-data",target:"/acceptance",rw:false}]}' > "$tmp/spec"
jq -n '{Id:("a"*64),Name:"/probe",Image:"sha256:test",
  Config:{Labels:{"elevateo.lane":"task"},User:"0:0",Entrypoint:["ruby"],Cmd:["probe.rb"]},
  HostConfig:{NanoCpus:1000000000,Memory:536870912,MemorySwap:536870912,PidsLimit:256,
    Privileged:false,CapAdd:["DAC_READ_SEARCH"],CapDrop:["ALL"],SecurityOpt:["no-new-privileges"],
    NetworkMode:"none",ReadonlyRootfs:true,RestartPolicy:{Name:"no"},OomKillDisable:false},
  Mounts:[{Type:"volume",Name:"task-data",Source:"/daemon/volumes/task-data",Destination:"/acceptance",RW:false}],
  NetworkSettings:{Networks:{none:{}}}}|[.]' > "$tmp/container"
inspect() { jq -ce --arg task task --slurpfile spec "$tmp/spec" -f "$adapter/profile.jq" "$1"; }
before=$(inspect "$tmp/container")
jq '.[0].HostConfig.OomKillDisable=null' "$tmp/container" > "$tmp/changed"
[[ $(inspect "$tmp/changed") == "$before" ]]
# AIDEV-NOTE: Real Docker prefix serialization must preserve the exact capability set and fingerprint.
cp "$tmp/spec" "$tmp/original-spec"
for caps in '["DAC_READ_SEARCH"]' '["CHOWN","FOWNER"]' '[]'; do
  jq --argjson caps "$caps" '.capadd=$caps' "$tmp/original-spec" > "$tmp/spec"
  jq --argjson caps "$caps" '.[0].HostConfig.CapAdd=$caps' "$tmp/container" > "$tmp/changed"
  bare=$(inspect "$tmp/changed")
  jq --argjson caps "$caps" '.[0].HostConfig.CapAdd=($caps|reverse|map("CAP_"+.))' "$tmp/container" > "$tmp/changed"
  [[ $(inspect "$tmp/changed") == "$bare" ]]
  jq --argjson caps "$caps" '.capadd=($caps|map("CAP_"+.))' "$tmp/original-spec" > "$tmp/spec"
  [[ $(inspect "$tmp/changed") == "$bare" ]]
done
cp "$tmp/original-spec" "$tmp/spec"
for caps in '["CAP_DAC_READ_SEARCH","CHOWN"]' '["SYS_ADMIN"]' '["CAP_UNKNOWN"]' \
  '["CAP_CAP_DAC_READ_SEARCH"]' '["dac_read_search"]' '[false]' 'false' '"DAC_READ_SEARCH"' \
  '["DAC_READ_SEARCH","CAP_DAC_READ_SEARCH"]' '["DAC_READ_SEARCH","DAC_READ_SEARCH"]'; do
  jq --argjson caps "$caps" '.[0].HostConfig.CapAdd=$caps' "$tmp/container" > "$tmp/changed"
  if inspect "$tmp/changed" >/dev/null 2>&1; then echo 'FAIL invalid or extra capabilities' >&2; exit 1; fi
done
# Even matching malformed expected/actual sets cannot authorize capabilities outside this fixture's scope.
for caps in '["CAP_UNKNOWN"]' '["SYS_ADMIN"]' '["CHOWN","CAP_CHOWN"]' 'false'; do
  jq --argjson caps "$caps" '.capadd=$caps' "$tmp/original-spec" > "$tmp/spec"
  jq --argjson caps "$caps" '.[0].HostConfig.CapAdd=$caps' "$tmp/container" > "$tmp/changed"
  if inspect "$tmp/changed" >/dev/null 2>&1; then echo 'FAIL malformed expected set' >&2; exit 1; fi
done
cp "$tmp/original-spec" "$tmp/spec"
for change in '.[0].Config.Labels["elevateo.lane"]="other"' \
  '.[0].Mounts[0].Name="unrelated"' '.[0].Mounts[0].RW=true' \
  '.[0].HostConfig.Memory=1073741824' '.[0].HostConfig.CapAdd+=["SYS_ADMIN"]' \
  '.[0].HostConfig.SecurityOpt=[]' '.[0].HostConfig.OomKillDisable=true'; do
  jq "$change" "$tmp/container" > "$tmp/changed"
  if inspect "$tmp/changed" >/dev/null 2>&1; then echo 'FAIL accepted profile drift' >&2; exit 1; fi
done
printf 'PASS capability serialization, fourteen capability negatives and seven security rejection cases\n'
