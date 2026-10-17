#!/usr/bin/env bash
# AIDEV-NOTE: Exercise real prepare_stack with Compose normalization simulated; no daemon access in this oracle.
set -euo pipefail
root=${1:-/src}
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
adapter=$root/ops/tools/be01-services
task=be01services-regression
app=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
jq -n --arg task "$task" --arg app "$app" '
  {networks:{runtime:{external:true,name:($task+"-runtime")}},services:
    (["api","auth","bootstrap","db","mailpit","migrate","rest","storage","worker"] | map(. as $s |
      {key:$s,value:{container_name:($task+"-"+$s),labels:{"elevateo.lane":$task},
        networks:{runtime:{}},restart:"no",pids_limit:256,volumes:[],
        cpus:(if ["api","db","worker","migrate"]|index($s) then 2
          elif ["auth","rest","storage"]|index($s) then 1 else 0.5 end),
        image:(if ["api","worker","migrate"]|index($s) then $app else ("fixture@"+$app) end)}}) |
      from_entries | with_entries(.value.mem_limit=(.value.cpus*1073741824 |
        if .==536870912 then 268435456 else . end) | .value.memswap_limit=.value.mem_limit))}' > "$work/base.json"
run_case() {
  local name=$1 mutation=$2 expected=$3 stack=${4:-$adapter/stack.sh} status=0
  mkdir "$work/$name"
  evidence=$work/$name stack=$stack work=$work mutation=$mutation adapter=$adapter task=$task app=$app \
    bash -euo pipefail -c '
    source "$stack"
    compose_base() { cat "$work/base.json"; }
    compose() { jq "del(.volumes.state) | $mutation" "$evidence/stack.private.json"; }
    # A valid plan reaches registration, then stops before any daemon operation.
    absent() { : > "$evidence/reached-registration"; return 1; }
    daemon() { echo "Unexpected daemon call" >&2; exit 99; }
    prepare_stack
  ' > "$work/$name.log" 2>&1 || status=$?
  [[ $status == 1 ]] || { echo "FAIL $name status=$status"; exit 1; }
  if [[ $expected == accept ]]; then
    [[ -f $work/$name/reached-registration ]] || { echo "FAIL $name rejected"; exit 1; }
  else
    [[ ! -e $work/$name/reached-registration ]] || { echo "FAIL $name accepted"; exit 1; }
  fi
}
run_case normalized '.' accept
jq -e '.volumes|keys==["config","data","storage"]' "$work/normalized/stack.private.json" >/dev/null
# Reintroduce the exact historical predicate: normalized Compose must be rejected before registration.
sed 's/\["config","data","storage"\]/["config","data","state","storage"]/' "$adapter/stack.sh" > "$work/original.sh"
run_case original '.' reject "$work/original.sh"
run_case missing 'del(.volumes.config)' reject
run_case extra '.volumes.state={external:true,name:"be01services-regression-state"}' reject
run_case foreign '.volumes.data.name="unrelated-data"' reject
run_case internal '.volumes.storage.external=false' reject
run_case mount '.services.db.volumes[0].source="state"' reject
run_case privileged '.services.api.privileged=true' reject
run_case ports '.services.api.ports=[{target:3000,published:"3000"}]' reject
printf 'PASS normalized Compose volume plan, original discrimination and seven negative profiles\n'
