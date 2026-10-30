#!/bin/sh
# AIDEV-NOTE: Resource sampler for the task project only. Reads docker stats and the worker's /proc; never writes
# to any container or changes state. Runs on fleet-02 in the background; stops when the stop file appears.
# Usage: PERF01_RESERVATION=<id> PERF01_PROJECT=perf01-<hex> sh ops/perf/sample.sh <out-dir> <stop-file> [interval-s]
# The stop file is unique per sample (the caller uses <out-dir>/.stop). This script never deletes it and refuses
# to start if it already exists, so a stop signal can never be lost to a slow-starting sampler.
# Every Docker call is bounded by `timeout -k 5 $PERF01_DOCKER_TIMEOUT` (default 20 s, 5..60) and its exit status
# is checked explicitly; a failed or timed-out (124) call writes an explicit unavailable row, never blank fields
# that look like data. The stop file is re-checked between every call so shutdown cannot hang on a stuck daemon.
# Outputs (CSV, UTC timestamps):
#   stats.csv        ts,container_id,name,cpu_perc,mem_usage,mem_perc,net_io,block_io,pids   (docker stats --no-stream)
#                    or ts,<ps|stats>-unavailable,exit=<n>,,,,,,
#   worker-proc.csv  ts,voluntary_ctxt_switches,nonvoluntary_ctxt_switches,rchar,wchar,syscr,syscw,read_bytes,write_bytes
#                    or ts,unavailable,<reason>,,,,,,
#   host.csv         ts,load1,load5,load15,mem_available_mb
# Notes: `docker stats --no-stream` takes about one second per call and its own CPU; the worker's cgroup also
# contains the compose healthcheck (`ruby bin/worker-health` every 5 s), so worker CPU includes those execs.
set -eu
. "$(dirname -- "$0")/lib.sh"
perf01_require_reservation
perf01_require_project
OUT=${1:?out-dir}
STOP=${2:?stop-file}
INTERVAL=${3:-2}
DOCKER_TIMEOUT=${PERF01_DOCKER_TIMEOUT-20}
printf '%s\n' "$INTERVAL" | grep -Eq '^[0-9]+$' && [ "$INTERVAL" -ge 1 ] && [ "$INTERVAL" -le 30 ] || perf01_die "interval must be 1..30"
printf '%s\n' "$DOCKER_TIMEOUT" | grep -Eq '^[0-9]+$' && [ "$DOCKER_TIMEOUT" -ge 5 ] && [ "$DOCKER_TIMEOUT" -le 60 ] \
  || perf01_die "PERF01_DOCKER_TIMEOUT must be 5..60"
command -v timeout >/dev/null 2>&1 || perf01_die "coreutils timeout is required for bounded Docker calls"
mkdir -p "$OUT"
[ ! -e "$STOP" ] || perf01_die "stop file already exists: $STOP (stop files are unique per sample and never deleted)"
echo "ts,container_id,name,cpu_perc,mem_usage,mem_perc,net_io,block_io,pids" > "$OUT/stats.csv"
echo "ts,voluntary_ctxt_switches,nonvoluntary_ctxt_switches,rchar,wchar,syscr,syscw,read_bytes,write_bytes" > "$OUT/worker-proc.csv"
echo "ts,load1,load5,load15,mem_available_mb" > "$OUT/host.csv"

dk() { timeout -k 5 "$DOCKER_TIMEOUT" docker "$@"; }   # exit 124 on timeout, propagated to the caller
stopped() { [ -e "$STOP" ]; }

# Container stats: the docker exit status is tested before any transformation, so a failure is never masked by sed.
sample_stats() { # sample_stats <ts>
  status=0
  ids=$(dk ps -q --filter "label=com.docker.compose.project=$PERF01_PROJECT" --filter "label=$PERF01_LABEL") || status=$?
  if [ "$status" -ne 0 ]; then echo "$1,ps-unavailable,exit=$status,,,,,," >> "$OUT/stats.csv"; return 0; fi
  if [ -z "$ids" ]; then echo "$1,none,,,,,,," >> "$OUT/stats.csv"; return 0; fi
  stopped && return 0
  status=0
  # shellcheck disable=SC2086
  raw=$(dk stats --no-stream --format '{{.Container}},{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}},{{.PIDs}}' $ids) || status=$?
  if [ "$status" -ne 0 ] || [ -z "$raw" ]; then
    echo "$1,stats-unavailable,exit=$status,,,,,," >> "$OUT/stats.csv"
  else
    printf '%s\n' "$raw" | sed "s/^/$1,/" >> "$OUT/stats.csv"
  fi
}

# Worker /proc counters: requires exit 0, the `---` separator and all eight numeric fields, else an explicit reason.
# /proc/1/io needs ptrace-read access to PID 1; docker exec runs as the image user (10001), the same uid as the worker.
sample_worker() { # sample_worker <ts>
  status=0
  wid=$(dk ps -q --filter "label=com.docker.compose.project=$PERF01_PROJECT" --filter label=com.docker.compose.service=worker --filter "label=$PERF01_LABEL") || status=$?
  if [ "$status" -ne 0 ]; then echo "$1,unavailable,ps-exit=$status,,,,,," >> "$OUT/worker-proc.csv"; return 0; fi
  [ -n "$wid" ] || return 0
  [ "$(printf '%s\n' "$wid" | wc -l | tr -d ' ')" -eq 1 ] || { echo "$1,unavailable,ambiguous-worker,,,,,," >> "$OUT/worker-proc.csv"; return 0; }
  stopped && return 0
  status=0
  raw=$(dk exec "$wid" sh -c 'cat /proc/1/status; echo ---; cat /proc/1/io' 2>/dev/null) || status=$?
  if [ "$status" -ne 0 ]; then echo "$1,unavailable,exec-exit=$status,,,,,," >> "$OUT/worker-proc.csv"; return 0; fi
  printf '%s\n' "$raw" | awk -v ts="$1" '
    function num(x) { return x ~ /^[0-9]+$/ }
    /^---$/ { sep = 1 }
    /^voluntary_ctxt_switches:/ { v = $2 } /^nonvoluntary_ctxt_switches:/ { nv = $2 }
    /^rchar:/ { rc = $2 } /^wchar:/ { wc = $2 } /^syscr:/ { sr = $2 } /^syscw:/ { sw = $2 }
    /^read_bytes:/ { rb = $2 } /^write_bytes:/ { wb = $2 }
    END {
      if (sep != 1) { print ts ",unavailable,partial-proc-output no-separator,,,,,,"; exit }
      if (!(num(v) && num(nv) && num(rc) && num(wc) && num(sr) && num(sw) && num(rb) && num(wb))) {
        print ts ",unavailable,partial-proc-output missing-fields,,,,,,"; exit
      }
      print ts "," v "," nv "," rc "," wc "," sr "," sw "," rb "," wb
    }' >> "$OUT/worker-proc.csv"
}

sample_host() { # sample_host <ts>
  set -- "$1" $(cat /proc/loadavg)
  echo "$1,$2,$3,$4,$(awk '/MemAvailable/ { printf "%d", $2 / 1024 }' /proc/meminfo)" >> "$OUT/host.csv"
}

until stopped; do
  ts=$(perf01_iso)
  sample_stats "$ts"
  stopped && break
  sample_worker "$ts"
  stopped && break
  sample_host "$ts"
  stopped && break
  sleep "$INTERVAL"
done
echo "sampler stopped $(perf01_iso)" >> "$OUT/host.csv"
