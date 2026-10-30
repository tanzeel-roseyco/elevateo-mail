#!/bin/sh
# AIDEV-NOTE: One invocation = one fresh Compose project, one build, one evidence directory. Never removes anything.
# Orchestrates a PERF-01 measurement run on fleet-02 from inside ~/<PERF01_PROJECT>:
#   preflight -> secrets -> build -> volumes (fresh generation nonce each, identity inspected) -> db/bootstrap/
#   migrate/fixtures -> stack up -> idle worker sampling -> warmup -> load matrix (passes x endpoints x modes x
#   tiers x reps) -> EXPLAIN -> logs -> manifest + volume-proof.tsv (atomic) -> stop.
# Lifecycle lease: an exclusive flock on <task root>/.perf01-lifecycle.lock (project-scoped, shared with cleanup.sh)
# is held from before the first volume is created until after volume-proof.tsv is in place, so one producer or one
# cleanup runs at a time per task directory. Boundary: single host, single task directory per PERF01_PROJECT.
# The same script measures a candidate revision: transfer the candidate commit into a NEW project and run again
# with the same caps, fixtures and matrix. Pass 2 of each run is the unmodified repeat (noise floor).
#
# Usage: PERF01_RESERVATION=<id> PERF01_PROJECT=perf01-<hex> sh ops/perf/run-baseline.sh <label>
#   label: baseline | candidate-<slice> (letters, digits, dashes)
# Tunables (validated as bounded integers before any Docker call; defaults give roughly 35 minutes of load):
#   PERF01_PASSES=2 (1..4) PERF01_REPS=2 (1..5) PERF01_DURATION=20 (5..120 s) PERF01_WARMUP=15 (0..60 s)
#   PERF01_IDLE_SECONDS=120 (10..600) PERF01_SAMPLE_INTERVAL=2 (1..30) PERF01_TIERS="1 4 16" (each 1..64)
#   PERF01_ENDPOINTS="health ready" PERF01_MODES="keepalive new" PERF01_MAX_ERROR_RATE=0.05 (0 < r <= 0.5)
#   PERF01_MAX_TOTAL_SECONDS=3600 (60..7200) PERF01_SETUP_ALLOWANCE=900 (60..3600) PERF01_SAMPLER_WAIT=30 (5..120)
#   PERF01_DOCKER_TIMEOUT=20 (5..60 s): deadline for every dk call (volume create/inspect, manifest inspects, the
#   exit trap's ps/stop/inspect); PERF01_STOP_GRACE=10 (1..30 s) stop grace at exit, DOCKER_TIMEOUT >= grace + 10
# Order of first effects: validate -> take the project lease -> compute RUN_ID -> create the run directory
# EXCLUSIVELY (mkdir without -p; an existing directory is a run-id collision, exit 2, nothing touched) -> files.
# Nothing under evidence/ is created or written before the lease is held; the lock file lives at the task root.
# SHA256SUMS is sealed as the LAST step of the exit trap, after stop.log, host-after.txt, RETAINED and ABORTED.
# Exit: 0 complete; 2 guard/validation failure or run-id collision; 4 lifecycle lease held elsewhere (nothing created); 5 matrix
# aborted or incomplete (error rate, busy host, deadline, missing load files); 6 ownership or stop not proven at
# exit: an owned container still running, its state unknown because inspect failed, or ownership rediscovery
# failed (RETAINED written); 7 a required step failed: a volume whose identity did not round-trip after creation
# (no proof row is written for it), the fixtures load, or EXPLAIN (INCOMPLETE written, manifest status incomplete);
# 8 the final SHA256SUMS seal failed (SHA256SUMS.FAILED names the step; no SHA256SUMS published). Containers this invocation created are left
# STOPPED, not removed, so cleanup.sh can inspect mounts and record its own manifest.
set -eu
. "$(dirname -- "$0")/lib.sh"
perf01_require_reservation
perf01_require_project
LABEL=${1:?usage: run-baseline.sh <label>}
printf '%s\n' "$LABEL" | grep -Eq '^[a-z0-9][a-z0-9-]{0,40}$' || perf01_die "label must be lowercase letters, digits, dashes"
PERF01_ROOT=$(perf01_root)
perf01_assert_no_forbidden_commands "$PERF01_ROOT"
[ -f "$PERF01_ROOT/source.json" ] || perf01_die "source.json missing; run transfer.sh from the host first"

# --- Tunable validation: every value bounded, every list non-empty and allowlisted, before any Docker call. ---
int_in_range() { # int_in_range <name> <value> <min> <max>
  printf '%s\n' "$2" | grep -Eq '^[0-9]+$' || perf01_die "$1 must be an integer, got '$2'"
  [ "$2" -ge "$3" ] && [ "$2" -le "$4" ] || perf01_die "$1 must be within $3..$4, got $2"
}
count_words() { set -- $1; echo $#; }
subset_of() { # subset_of <name> <value-list> <allowed-list>
  [ "$(count_words "$2")" -ge 1 ] || perf01_die "$1 must not be empty"
  for item in $2; do
    found=0
    for allowed in $3; do [ "$item" = "$allowed" ] && found=1; done
    [ "$found" -eq 1 ] || perf01_die "$1 contains '$item'; allowed: $3"
  done
}
# `${VAR-default}` (not `:-`): an explicitly empty value is rejected by validation instead of silently defaulted.
PASSES=${PERF01_PASSES-2}; REPS=${PERF01_REPS-2}; DURATION=${PERF01_DURATION-20}
TIERS=${PERF01_TIERS-"1 4 16"}; ENDPOINTS=${PERF01_ENDPOINTS-"health ready"}; MODES=${PERF01_MODES-"keepalive new"}
WARMUP=${PERF01_WARMUP-15}; IDLE_SECONDS=${PERF01_IDLE_SECONDS-120}; MAX_ERROR_RATE=${PERF01_MAX_ERROR_RATE-0.05}
SAMPLE_INTERVAL=${PERF01_SAMPLE_INTERVAL-2}; MAX_TOTAL=${PERF01_MAX_TOTAL_SECONDS-3600}
SETUP_ALLOWANCE=${PERF01_SETUP_ALLOWANCE-900}; SAMPLER_WAIT=${PERF01_SAMPLER_WAIT-30}
DOCKER_TIMEOUT=${PERF01_DOCKER_TIMEOUT-20}; STOP_GRACE=${PERF01_STOP_GRACE-10}
int_in_range PERF01_DOCKER_TIMEOUT "$DOCKER_TIMEOUT" 5 60
int_in_range PERF01_STOP_GRACE "$STOP_GRACE" 1 30
# The stop grace must end well before the CLI deadline, or a legitimate graceful stop is killed by the wrapper.
[ "$DOCKER_TIMEOUT" -ge $((STOP_GRACE + 10)) ] \
  || perf01_die "PERF01_DOCKER_TIMEOUT ($DOCKER_TIMEOUT) must be at least PERF01_STOP_GRACE + 10 ($((STOP_GRACE + 10)))"
int_in_range PERF01_PASSES "$PASSES" 1 4
int_in_range PERF01_REPS "$REPS" 1 5
int_in_range PERF01_DURATION "$DURATION" 5 120
int_in_range PERF01_WARMUP "$WARMUP" 0 60
int_in_range PERF01_IDLE_SECONDS "$IDLE_SECONDS" 10 600
int_in_range PERF01_SAMPLE_INTERVAL "$SAMPLE_INTERVAL" 1 30
int_in_range PERF01_MAX_TOTAL_SECONDS "$MAX_TOTAL" 60 7200
int_in_range PERF01_SETUP_ALLOWANCE "$SETUP_ALLOWANCE" 60 3600
int_in_range PERF01_SAMPLER_WAIT "$SAMPLER_WAIT" 5 120
[ "$(count_words "$TIERS")" -ge 1 ] || perf01_die "PERF01_TIERS must not be empty"
for tier in $TIERS; do int_in_range PERF01_TIERS "$tier" 1 64; done
subset_of PERF01_ENDPOINTS "$ENDPOINTS" "health ready"
subset_of PERF01_MODES "$MODES" "keepalive new"
awk -v r="$MAX_ERROR_RATE" 'BEGIN { if (r !~ /^[0-9]*\.?[0-9]+$/ || r + 0 <= 0 || r + 0 > 0.5) exit 1 }' \
  || perf01_die "PERF01_MAX_ERROR_RATE must be a decimal in (0, 0.5], got '$MAX_ERROR_RATE'"

# Planned wall time: idle + warmups + every measured run (duration plus ~5 s sampler start/stop overhead) + setup.
SAMPLE_OVERHEAD=5
N_ENDPOINTS=$(count_words "$ENDPOINTS"); N_MODES=$(count_words "$MODES"); N_TIERS=$(count_words "$TIERS")
RUN_COUNT=$((PASSES * N_ENDPOINTS * N_MODES * N_TIERS * REPS))
PLANNED_SECONDS=$((IDLE_SECONDS + WARMUP * N_ENDPOINTS + RUN_COUNT * (DURATION + SAMPLE_OVERHEAD) + SETUP_ALLOWANCE))
[ "$PLANNED_SECONDS" -le "$MAX_TOTAL" ] \
  || perf01_die "planned ${PLANNED_SECONDS}s exceeds PERF01_MAX_TOTAL_SECONDS=$MAX_TOTAL; shrink the matrix or raise the cap (max 7200)"
START_EPOCH=$(date +%s)
DEADLINE_EPOCH=$((START_EPOCH + PLANNED_SECONDS))

command -v timeout >/dev/null 2>&1 || perf01_die "coreutils timeout is required for bounded Docker calls"
command -v flock >/dev/null 2>&1 || perf01_die "util-linux flock is required for the lifecycle lease"
dk() { timeout -k 5 "$DOCKER_TIMEOUT" docker "$@"; }   # bounded Docker call, 124 on timeout (as in cleanup.sh)
FIXTURES="$PERF01_ROOT/ops/tests/db-fixtures.sql"

# --- Lifecycle lease FIRST: exclusive for the whole run, shared with cleanup.sh. Project-scoped (task root,
# identical for every script invocation in this checkout whatever the run id), never run-local. Nothing under
# evidence/ is created or written before it is held, so a contender can never touch an active run's files. ---
LEASE="$PERF01_ROOT/.perf01-lifecycle.lock"
exec 9> "$LEASE" || perf01_die "cannot open lifecycle lease $LEASE"
flock -n 9 || perf01_die "lifecycle lease held by another producer or cleanup for project $PERF01_PROJECT ($LEASE); refusing to start" 4

# --- Run identity and an EXCLUSIVE run directory: RUN_ID has second resolution, so the directory is created
# without -p and an existing one is a collision, not a place to write into. ---
RUN_ID="$PERF01_PROJECT-$(perf01_now)-$LABEL"
export PERF01_RUN_ID="$RUN_ID"   # consumed by compose.perf.yaml as the per-invocation label elevateo.perf.run
EVID="$PERF01_ROOT/evidence/$RUN_ID"
mkdir -p "$PERF01_ROOT/evidence"
mkdir "$EVID" 2>/dev/null || perf01_die "run id collision or evidence dir exists ($EVID); nothing touched"
mkdir "$EVID/load" "$EVID/stats" "$EVID/idle"
OWNED="$EVID/owned-containers.txt"
: > "$OWNED"
SAMPLER_PID=''
SAMPLER_STOP=''
REQUIRED_FAILED=''
FINALIZED=0
ACTUAL_RUNS=0
TAB=$(printf '\t')
# Identity of every disposable volume as inspected right after its creation (project, run, volume, generation,
# CreatedAt); volume-proof.tsv is derived from it at the end, so an unproven volume can never gain a proof row.
VOLUME_IDENTITY="$EVID/volume-identity.tsv"
: > "$VOLUME_IDENTITY"

# --- Disposable volumes: created here (compose.perf.yaml declares them external) so each carries a fresh
# generation nonce. ---
new_generation() { # lowercase timestamp plus 128 random bits; validated against the proof grammar before use
  if [ -r /proc/sys/kernel/random/uuid ]; then rnd=$(tr -d '-' < /proc/sys/kernel/random/uuid)
  else rnd=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n'); fi   # POSIX sh has no $RANDOM; lowercase keeps the grammar
  echo "$(date -u +%Y%m%d%H%M%S)-$rnd"
}
IDENTITY_FORMAT='{{.Name}}|{{.CreatedAt}}|{{index .Labels "elevateo.perf.run"}}|{{index .Labels "elevateo.perf.generation"}}|{{index .Labels "elevateo.perf.project"}}'
create_volume() { # create_volume <suffix>: create, inspect, record identity; on a failed round-trip finalize as incomplete
  vname="${PERF01_PROJECT}-$1"
  gen=$(new_generation)
  printf '%s\n' "$gen" | grep -Eq '^[a-z0-9-]{8,64}$' || perf01_die "generated volume generation '$gen' is malformed"
  # Both calls are bounded (dk); a failure or timeout of either leaves the volume unproven, exactly like a
  # non-round-tripping identity, instead of guessing at its state.
  status=0
  dk volume create --label "$PERF01_LABEL" --label "elevateo.perf.project=$PERF01_PROJECT" \
    --label "elevateo.perf.run=$RUN_ID" --label "elevateo.perf.generation=$gen" \
    "$vname" >> "$EVID/volume-create.log" 2>&1 || status=$?
  if [ "$status" -ne 0 ]; then identity="create-failed (exit $status)"
  else identity=$(dk volume inspect --format "$IDENTITY_FORMAT" "$vname" 2>> "$EVID/volume-create.log") || identity="inspect-failed (exit $?)"; fi
  created=$(printf '%s' "$identity" | cut -d'|' -f2)
  if [ -z "$created" ] || [ "$identity" != "$vname|$created|$RUN_ID|$gen|$PERF01_PROJECT" ]; then
    # `volume create` on an existing name silently returns that volume: a foreign or stale volume shows up here
    # as labels that do not round-trip. It is unproven, gets no proof row, and the run stops as incomplete.
    REQUIRED_FAILED="$REQUIRED_FAILED volume-create/$vname"
    echo "$(perf01_iso) required step volume-create/$vname failed: identity did not round-trip (expected generation $gen, got '$identity'; 124 = timeout after ${DOCKER_TIMEOUT}s); volume unproven, no proof row written" >> "$EVID/INCOMPLETE"
    perf01_log "volume $vname unproven; finalizing as incomplete"
    finalize
  fi
  echo "$(perf01_iso) $vname created: $identity" >> "$EVID/volume-create.log"
  printf '%s\t%s\t%s\t%s\t%s\n' "$PERF01_PROJECT" "$RUN_ID" "$vname" "$gen" "$created" >> "$VOLUME_IDENTITY"
}

# --- Finalization: manifest and volume proof (atomic); exits 7 when any required step failed. The checksum seal
# is NOT written here: the exit trap writes stop.log, host-after.txt, RETAINED and ABORTED afterwards and seals last.
hash_or_null() { [ -f "$1" ] && printf '"%s"' "$(perf01_sha256 "$1")" || printf null; }
str_or_null() { [ -s "$1" ] && printf '"%s"' "$(head -1 "$1")" || printf null; }
finalize() {
  # Reachable from create_volume, the fixtures step and the end of the script: runs once, so the proof is written once.
  [ "$FINALIZED" -eq 0 ] || return 0
  FINALIZED=1
  if [ -z "$REQUIRED_FAILED" ]; then RUN_STATUS=complete; FAILED_JSON='[]'
  else RUN_STATUS=incomplete; FAILED_JSON=$(printf '%s\n' $REQUIRED_FAILED | sed 's/.*/"&"/' | paste -sd, - | sed 's/.*/[&]/'); fi
  images_after=''; [ -f "$EVID/images-after.txt" ] && images_after=$(tr '\n' ';' < "$EVID/images-after.txt")
  # synthetic_only=true only when all of: the fixture hash was recorded right before the fixtures step, that step
  # completed with exit 0 (fixtures-ok marker), the fixture file hashes identically now, and no required step
  # failed. Anything else is false: provenance of the volume contents is then not proven and cleanup retains.
  SYNTHETIC_ONLY=false
  if [ -z "$REQUIRED_FAILED" ] && [ -f "$EVID/fixtures-ok" ] && [ -s "$EVID/fixtures-sha256.txt" ] && [ -f "$FIXTURES" ] \
     && [ "$(perf01_sha256 "$FIXTURES")" = "$(head -1 "$EVID/fixtures-sha256.txt")" ]; then SYNTHETIC_ONLY=true; fi
  cat > "$EVID/manifest.json" <<EOF
{
  "run_id": $(perf01_json_str "$RUN_ID"),
  "label": $(perf01_json_str "$LABEL"),
  "status": "$RUN_STATUS",
  "required_steps_failed": $FAILED_JSON,
  "reservation": $(perf01_json_str "$PERF01_RESERVATION"),
  "project": $(perf01_json_str "$PERF01_PROJECT"),
  "source": $(cat "$EVID/source.json"),
  "lockfile_sha256": $(hash_or_null "$PERF01_ROOT/apps/server/Gemfile.lock"),
  "gemfile_sha256": $(hash_or_null "$PERF01_ROOT/apps/server/Gemfile"),
  "dockerfile_sha256": $(hash_or_null "$PERF01_ROOT/apps/server/Dockerfile"),
  "compose_sha256": $(hash_or_null "$PERF01_ROOT/compose.yaml"),
  "compose_perf_sha256": $(hash_or_null "$PERF01_ROOT/ops/perf/compose.perf.yaml"),
  "load_rb_sha256": $(hash_or_null "$PERF01_ROOT/ops/perf/load.rb"),
  "fixtures": { "file": "ops/tests/db-fixtures.sql", "sha256_before_load": $(str_or_null "$EVID/fixtures-sha256.txt"), "sha256_at_finalize": $(hash_or_null "$FIXTURES"),
                "load_ok": $([ -f "$EVID/fixtures-ok" ] && echo true || echo false), "synthetic_only": $SYNTHETIC_ONLY },
  "volumes": $(perf01_json_str "$(tr '\t\n' '| ' < "$VOLUME_IDENTITY")"),
  "server_image_id": $(perf01_json_str "$(dk image inspect --format '{{.Id}}' "${PERF01_PROJECT}-server:perf" 2>/dev/null || echo unavailable)"),
  "images_after": $(perf01_json_str "$images_after"),
  "owned_containers": $(perf01_json_str "$(tr '\n' ' ' < "$OWNED")"),
  "compose_config_sha256": $(perf01_json_str "$(perf01_compose config 2>/dev/null | sha256sum | cut -d' ' -f1)"),
  "matrix": { "passes": $PASSES, "reps": $REPS, "duration_s": $DURATION, "warmup_s": $WARMUP, "idle_seconds": $IDLE_SECONDS,
              "sample_interval_s": $SAMPLE_INTERVAL, "tiers": $(perf01_json_str "$TIERS"), "endpoints": $(perf01_json_str "$ENDPOINTS"),
              "modes": $(perf01_json_str "$MODES"), "max_error_rate": $MAX_ERROR_RATE,
              "expected_runs": $RUN_COUNT, "actual_runs": $ACTUAL_RUNS },
  "schedule": { "planned_seconds": $PLANNED_SECONDS, "max_total_seconds": $MAX_TOTAL, "setup_allowance_s": $SETUP_ALLOWANCE,
                "sample_overhead_s": $SAMPLE_OVERHEAD, "start_epoch": $START_EPOCH, "deadline_epoch": $DEADLINE_EPOCH },
  "timing_method": "client-side CLOCK_MONOTONIC in perf-load (see load json); server-side Rails 'Completed ... in Xms' in api-completed-ms.txt",
  "statistics_policy": "P50/P95/P99 nearest-rank only with >=1000 samples, else median/min/max/count; pass 2 is the unmodified repeat (noise floor)",
  "docker": $(perf01_json_str "$(dk version --format '{{.Server.Version}}' 2>/dev/null || echo unavailable) compose $(dk compose version --short 2>/dev/null || echo unavailable)"),
  "host": $(perf01_json_str "$(hostname) $(uname -r) nproc=$(nproc)"),
  "started_at": $(perf01_json_str "$(head -1 "$EVID/preflight/host.txt" | cut -d' ' -f2)"),
  "finished_at": "$(perf01_iso)"
}
EOF
  # Volume proof for cleanup.sh: one seven-field row per volume whose identity round-tripped, derived from
  # volume-identity.tsv, built in a temporary file in the same directory (rename is atomic only within one
  # filesystem) and moved into place exactly once; an existing proof file is never appended to or overwritten.
  tmp="$EVID/.volume-proof.tsv.tmp"
  awk -F "$TAB" -v OFS="$TAB" -v s="$SYNTHETIC_ONLY" -v st="$RUN_STATUS" \
    'NF == 5 { print $1, $2, $3, $4, $5, "synthetic_only=" s, "status=" st }' "$VOLUME_IDENTITY" > "$tmp"
  [ ! -e "$EVID/volume-proof.tsv" ] || perf01_die "volume-proof.tsv already exists in $EVID; refusing to overwrite a proof" 7
  mv "$tmp" "$EVID/volume-proof.tsv"
  if [ -n "$REQUIRED_FAILED" ]; then
    perf01_log "run INCOMPLETE: required steps failed:$REQUIRED_FAILED"
    exit 7
  fi
}
# Last step of either exit trap: checksums over every file in the run directory, including the trap's own writes.
# No pipeline: each step is checked on its own (a pipeline reports only its last command), and the number of hashed
# lines must equal the number of enumerated entries, so a failed or partial enumeration can never publish a short
# SHA256SUMS. The intermediate .seal-*.tmp files are excluded from the enumeration and removed afterwards. A failed
# seal publishes nothing (a stale SHA256SUMS is removed), leaves SHA256SUMS.FAILED naming the step, and exits 8 if
# the run was otherwise clean.
seal_evidence() {
  seal_step=$(
    cd "$EVID" || { echo chdir; exit 1; }
    rm -f SHA256SUMS.tmp .seal-list.tmp .seal-sorted.tmp
    find . -type f ! -name 'SHA256SUMS*' ! -name '.*.tmp' -print0 > .seal-list.tmp || { echo enumerate; exit 1; }
    sort -z .seal-list.tmp > .seal-sorted.tmp || { echo sort; exit 1; }
    xargs -0 sha256sum < .seal-sorted.tmp > SHA256SUMS.tmp || { echo hash; exit 1; }
    entries=$(tr -cd '\000' < .seal-sorted.tmp | wc -c | tr -d ' ')
    lines=$(wc -l < SHA256SUMS.tmp | tr -d ' ')
    [ "$entries" -gt 0 ] && [ "$lines" -eq "$entries" ] || { echo "count-mismatch (enumerated $entries, hashed $lines)"; exit 1; }
    mv SHA256SUMS.tmp SHA256SUMS || { echo publish; exit 1; }
  )
  rm -f "$EVID/.seal-list.tmp" "$EVID/.seal-sorted.tmp" "$EVID/SHA256SUMS.tmp"
  if [ -z "$seal_step" ]; then
    rm -f "$EVID/SHA256SUMS.FAILED"
  else
    rm -f "$EVID/SHA256SUMS"
    echo "sealing failed at step $seal_step at $(perf01_iso); no SHA256SUMS published" > "$EVID/SHA256SUMS.FAILED"
    [ "$code" -eq 0 ] && code=8
  fi
}

# --- Sampler lifecycle: one unique stop file per sample, never deleted, bounded wait then kill. ---
start_sampler() { # start_sampler <out-dir>
  mkdir -p "$1"
  SAMPLER_STOP="$1/.stop"
  [ ! -e "$SAMPLER_STOP" ] || perf01_die "sampler stop file already exists: $SAMPLER_STOP"
  sh "$PERF01_ROOT/ops/perf/sample.sh" "$1" "$SAMPLER_STOP" "$SAMPLE_INTERVAL" &
  SAMPLER_PID=$!
}
stop_sampler() {
  [ -n "$SAMPLER_PID" ] || return 0
  touch "$SAMPLER_STOP"
  waited=0
  while kill -0 "$SAMPLER_PID" 2>/dev/null && [ "$waited" -lt "$SAMPLER_WAIT" ]; do
    sleep 1
    waited=$((waited + 1))
  done
  if kill -0 "$SAMPLER_PID" 2>/dev/null; then
    kill "$SAMPLER_PID" 2>/dev/null || true
    echo "$(perf01_iso) sampler pid $SAMPLER_PID killed after ${waited}s; stop file $SAMPLER_STOP" >> "$EVID/sampler-kills.txt"
  fi
  wait "$SAMPLER_PID" 2>/dev/null || true
  SAMPLER_PID=''
  SAMPLER_STOP=''
}

# --- Exit handling. Before ownership exists the trap only records; afterwards it stops exactly the owned IDs. ---
record_owned() {
  docker ps -aq --filter "label=com.docker.compose.project=$PERF01_PROJECT" --filter "label=$PERF01_LABEL" \
    --filter "label=elevateo.perf.run=$RUN_ID" > "$OWNED.new"
  cat "$OWNED" "$OWNED.new" | grep -v '^$' | sort -u > "$OWNED.tmp"
  mv "$OWNED.tmp" "$OWNED"
  rm -f "$OWNED.new"
}
finish_before_ownership() {
  code=$?
  trap - EXIT INT TERM
  set +e
  perf01_host_snapshot > "$EVID/host-after.txt"
  [ "$code" -eq 0 ] || echo "exit=$code at $(perf01_iso) (before any resource was created)" > "$EVID/ABORTED"
  seal_evidence
  exit "$code"
}
finish() {
  code=$?
  trap - EXIT INT TERM
  set +e
  stop_sampler
  retained=''
  # A failed `up` can leave containers that record_owned never saw: rediscover by the per-invocation label
  # (unique to this run, so still exactly invocation-owned) and union them in. If discovery itself fails,
  # ownership is unknown and the run must not exit clean.
  # Every Docker call here is bounded (dk, exit 124 on timeout); a timeout is recorded as not proven, never as clean.
  discovered=$(dk ps -aq --filter "label=elevateo.perf.run=$RUN_ID" 2>> "$EVID/stop.log"); dstatus=$?
  if [ "$dstatus" -eq 124 ]; then
    retained="$retained ownership-discovery-failed:timeout"
  elif [ "$dstatus" -ne 0 ]; then
    retained="$retained ownership-discovery-failed:docker-ps-error"
  else
    printf '%s\n' $discovered | grep -v '^$' | cat "$OWNED" - | sort -u > "$OWNED.tmp" && mv "$OWNED.tmp" "$OWNED"
  fi
  for id in $(cat "$OWNED"); do
    dk stop -t "$STOP_GRACE" "$id" >> "$EVID/stop.log" 2>&1; sstatus=$?
    if [ "$sstatus" -eq 124 ]; then
      retained="$retained $id:stop-timeout"
      echo "stop timed out for $id after ${DOCKER_TIMEOUT}s" >> "$EVID/stop.log"
    elif [ "$sstatus" -ne 0 ]; then
      echo "stop failed for $id (exit $sstatus)" >> "$EVID/stop.log"
    fi
  done
  # Fail closed on the post-stop check: a failed, timed-out or unparsable inspect is state-unknown, not "not running".
  for id in $(cat "$OWNED"); do
    state=$(dk inspect --format '{{.State.Running}}' "$id" 2>/dev/null); istatus=$?
    if [ "$istatus" -eq 124 ]; then state=timeout; elif [ "$istatus" -ne 0 ]; then state=inspect-error; fi
    case $state in
      false) ;;
      true) retained="$retained $id:running:$(dk inspect --format '{{.Name}}' "$id" 2>/dev/null | sed 's#^/##')" ;;
      timeout) retained="$retained $id:state-unknown:timeout" ;;
      *) retained="$retained $id:state-unknown" ;;
    esac
  done
  perf01_host_snapshot > "$EVID/host-after.txt"
  if [ -n "$retained" ]; then
    for entry in $retained; do echo "$entry"; done > "$EVID/RETAINED"
    perf01_log "RETAINED: ownership or stop not proven:$retained"
    [ "$code" -eq 0 ] && code=6
  fi
  [ "$code" -eq 0 ] || echo "exit=$code at $(perf01_iso)" > "$EVID/ABORTED"
  seal_evidence
  perf01_log "evidence: $EVID (exit $code)"
  exit "$code"
}
trap finish_before_ownership EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# 1. Preflight (refuses existing perf01 resources, busy host, low disk) and build-cache/image snapshots.
sh "$PERF01_ROOT/ops/perf/preflight.sh" "$EVID/preflight"
cp "$PERF01_ROOT/source.json" "$EVID/source.json"

# 2. Disposable local secrets inside the task directory (ignored by git; never copied into evidence).
perf01_log "generating task-local secrets"
docker compose --project-name "$PERF01_PROJECT" -f "$PERF01_ROOT/ops/compose.secrets.yaml" \
  run --rm -T --label "$PERF01_LABEL" --label "elevateo.perf.run=$RUN_ID" secrets > "$EVID/secrets.log" 2>&1
[ -s "$PERF01_ROOT/ops/local/.env" ] || perf01_die "secrets generation produced no credential file"

# 3. Build the server image (only phase with network egress: apt + bundler from the pinned Ruby base).
perf01_log "building ${PERF01_PROJECT}-server:perf"
perf01_compose build --progress plain api > "$EVID/build.log" 2>&1
docker image inspect "${PERF01_PROJECT}-server:perf" > "$EVID/image-server.json"

# 4. Disposable volumes (fresh generation each, identity recorded), then the database. From here on the trap stops
# only the container IDs recorded in owned-containers.txt; volumes are left for cleanup.sh and its proof.
trap finish EXIT
for suffix in db-data db-config storage-data; do create_volume "$suffix"; done
perf01_log "starting db"
perf01_compose up -d --wait db > "$EVID/up-db.log" 2>&1
record_owned
perf01_compose run --rm -T bootstrap > "$EVID/bootstrap.log" 2>&1
perf01_compose run --rm -T migrate > "$EVID/migrate.log" 2>&1
# Fixture provenance: hash the fixture file immediately BEFORE loading it and mark the load's success; finalize
# recomputes the hash and grants synthetic_only=true only if both agree and nothing required failed.
[ -f "$FIXTURES" ] && perf01_sha256 "$FIXTURES" > "$EVID/fixtures-sha256.txt"
if perf01_compose run --rm -T perf-fixtures > "$EVID/fixtures.log" 2>&1; then
  echo "ok $(perf01_iso)" > "$EVID/fixtures-ok"
else
  REQUIRED_FAILED="$REQUIRED_FAILED fixtures"
  echo "$(perf01_iso) required step fixtures failed; see fixtures.log; volume contents are not proven synthetic" >> "$EVID/INCOMPLETE"
  perf01_log "fixtures load failed; finalizing as incomplete"
  finalize
fi
perf01_log "starting auth rest storage mailpit api worker"
perf01_compose up -d --wait auth rest storage mailpit api worker > "$EVID/up-stack.log" 2>&1
record_owned
perf01_compose ps --format json > "$EVID/ps.json"

# 5. Prove the stack shape before any load: pinned image ids, no published ports, caps applied, internal network.
for ref in $(cat "$EVID/preflight/pinned-refs.txt"); do
  docker image inspect --format '{{.Id}} {{join .RepoDigests ","}} {{.Size}}' "$ref" || echo "missing $ref"
done > "$EVID/images-after.txt"
docker buildx du --verbose 2>/dev/null | awk '/^ID:/ { print $2 }' | sort > "$EVID/buildcache-after.txt" || true
# shellcheck disable=SC2046
docker inspect --format '{{.Name}} ports={{json .NetworkSettings.Ports}} privileged={{.HostConfig.Privileged}} netmode={{.HostConfig.NetworkMode}} nanocpus={{.HostConfig.NanoCpus}} memory={{.HostConfig.Memory}} pids={{.HostConfig.PidsLimit}} restart={{.HostConfig.RestartPolicy.Name}}' $(cat "$OWNED") > "$EVID/hostconfig.txt"
if grep -Eq 'HostPort|privileged=true|netmode=host|nanocpus=0 |memory=0 ' "$EVID/hostconfig.txt"; then
  perf01_die "stack shape violates the brief (published port, privilege, host network or missing cap); see hostconfig.txt"
fi
docker network inspect --format 'internal={{.Internal}} driver={{.Driver}} containers={{len .Containers}}' "${PERF01_PROJECT}-runtime" > "$EVID/network.txt"
grep -q 'internal=true' "$EVID/network.txt" || perf01_die "runtime network is not internal"
perf01_compose logs --no-color api > "$EVID/api-boot.log" 2>&1
perf01_host_snapshot > "$EVID/host-before.txt"

# 6. Idle worker/heartbeat measurement: no HTTP load, sampler only.
perf01_log "idle sampling for ${IDLE_SECONDS}s"
start_sampler "$EVID/idle"
sleep "$IDLE_SECONDS"
stop_sampler

load() { # load <out.json> <args...>
  out=$1; shift
  perf01_compose run --rm -T perf-load "$@" > "$out" 2>> "$EVID/load/stderr.log"
}
check_deadline() {
  [ "$(date +%s)" -lt "$DEADLINE_EPOCH" ] || perf01_die "planned deadline (${PLANNED_SECONDS}s) passed before $1; matrix stopped" 5
}

# 7. Warmup (unrecorded) so JIT/caches/connection pools are populated before measurement.
for endpoint in $ENDPOINTS; do
  check_deadline "warmup-$endpoint"
  load "$EVID/load/warmup-$endpoint.json" --url "http://api:3000/$endpoint" --concurrency 4 --duration 1 \
    --warmup "$WARMUP" --mode keepalive --label "warmup-$endpoint" --no-samples || true
done

# 8. Measurement matrix. Pass 2 with identical settings is the unmodified repeat used as the noise floor.
perf01_log "matrix: passes=$PASSES endpoints=[$ENDPOINTS] modes=[$MODES] tiers=[$TIERS] reps=$REPS duration=${DURATION}s runs=$RUN_COUNT"
pass=1
while [ "$pass" -le "$PASSES" ]; do
  for endpoint in $ENDPOINTS; do
    for mode in $MODES; do
      for c in $TIERS; do
        rep=1
        while [ "$rep" -le "$REPS" ]; do
          name="p$pass-$endpoint-$mode-c$c-r$rep"
          check_deadline "$name"
          if ! perf01_host_quiet >> "$EVID/host-quiet-checks.txt"; then
            echo "$name: host busy, matrix aborted" >> "$EVID/host-quiet-checks.txt"
            perf01_die "host load exceeded caps before $name; stopping load to protect neighbours" 5
          fi
          start_sampler "$EVID/stats/$name"
          status=0
          load "$EVID/load/$name.json" --url "http://api:3000/$endpoint" --concurrency "$c" --duration "$DURATION" \
            --mode "$mode" --label "$name" --max-error-rate "$MAX_ERROR_RATE" || status=$?
          stop_sampler
          echo "$name exit=$status" >> "$EVID/load/exit-codes.txt"
          if [ "$status" -ne 0 ]; then
            perf01_die "load client exited $status on $name (3 = error-rate abort); matrix stopped" 5
          fi
          rep=$((rep + 1))
        done
      done
    done
  done
  pass=$((pass + 1))
done
ACTUAL_RUNS=$(find "$EVID/load" -name 'p*-*.json' -type f | wc -l | tr -d ' ')
[ "$ACTUAL_RUNS" -eq "$RUN_COUNT" ] || perf01_die "expected $RUN_COUNT load result files, found $ACTUAL_RUNS" 5

# 9. Query plans as the restricted role (REQUIRED), then server-side request timings from the Rails log.
perf01_log "EXPLAIN runs as elevateo_api"
for sqlfile in "$PERF01_ROOT"/ops/perf/sql/*.sql; do
  base=$(basename "$sqlfile" .sql)
  if ! perf01_compose run --rm -T perf-sql -f "/perf/sql/$base.sql" > "$EVID/explain-$base.txt" 2>&1; then
    REQUIRED_FAILED="$REQUIRED_FAILED sql/$base"
    echo "$(perf01_iso) required step sql/$base failed; see explain-$base.txt" >> "$EVID/INCOMPLETE"
  fi
done
perf01_compose logs --no-color api > "$EVID/api.log" 2>&1
grep -o 'Completed [0-9]* [A-Za-z ]* in [0-9.]*ms' "$EVID/api.log" | awk '{ print $2, $(NF) }' | sed 's/ms$//' > "$EVID/api-completed-ms.txt" || true
perf01_compose logs --no-color worker > "$EVID/worker.log" 2>&1

# 10. Manifest, volume proof and checksums: everything needed to reproduce or dispute the numbers (see finalize()
# above). Secrets never enter evidence.
finalize
perf01_log "run complete: $RUN_ID"
