#!/bin/sh
# AIDEV-NOTE: Docker-only regression for run-baseline.sh guards; drives the script with a fake docker CLI, never a daemon.
# Launch ONLY inside a disposable container on fleet-02 after the Codex reservation is relayed (no new image: the
# already pinned ruby:3.4.11-slim-bookworm base has /bin/sh, coreutils, tar, awk, grep, sed):
#   docker run --rm --network none --label elevateo.perf.task=perf01 --label elevateo.perf.run=<run-id> \
#     --cpus 0.5 --memory 256m --pids-limit 128 --read-only --tmpfs /tmp:size=256m \
#     --mount type=bind,src=$HOME/<PERF01_PROJECT>,dst=/repo,readonly \
#     ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2 \
#     sh /repo/ops/perf/tests/run-baseline-guards.sh /repo
# The repo mount is read-only; each case works on a fresh copy of the harness paths under /tmp.
# Cases: (a) preflight rejection => zero `stop` invocations; (b) each invalid tunable and a deadline overflow
# => exit 2 before any docker call; (c) scripted stop failure => exit 6 + RETAINED with exact ids;
# (d) scripted perf-sql failure => exit 7 + INCOMPLETE + manifest status incomplete; (e) sampler cycles use
# distinct, never-deleted stop files and exit within the bounded wait; (f) docker stats failure => explicit
# stats-unavailable row; (g) docker exec partial/failed => explicit unavailable row, never blank numbers;
# (h) any failing inventory command => preflight exit 2 naming it; (i) docker call past PERF01_DOCKER_TIMEOUT =>
# exit=124 row and the sampler still stops; (j) failed `up` => run-labelled containers rediscovered and stopped,
# discovery failure => RETAINED + exit 6; (k) inspect failure after stop => state-unknown + exit 6;
# (m) clean run => exit 0, manifest complete, volume-proof.tsv holds exactly one seven-field row per volume with the
# generation each `volume create` carried, written by rename (no partial file, existing proof refused); (n) preflight
# records a synthetic foreign unlabelled volume as a total only, never as an exit-3 collision; (o) a held
# project-scoped lifecycle lease (<task root>/.perf01-lifecycle.lock) => exit 4 before any docker call; (p) a volume
# whose identity inspect lacks the generation label => no proof row for it, INCOMPLETE names volume-create/<volume>,
# exit 7, stack never started; (L3) a `volume create` hanging past the bounded PERF01_DOCKER_TIMEOUT => exit 7,
# INCOMPLETE records exit 124, zero proof rows, stack never started; (P3) with a fixed clock (fake `date`), a second
# invocation computing the same RUN_ID exits 4 while the lease is held and leaves the active run's files byte-identical,
# and exits 2 on an existing run directory with the lease free; (P4) after the trap, `sha256sum -c SHA256SUMS`
# verifies and lists exactly the files present including RETAINED, stop.log, host-after.txt, ABORTED; (P5) a hanging
# discovery ps, stop or post-stop inspect each yield exit 6 with the timeout named in RETAINED, and timeout <= grace+10
# is rejected before any docker call; (P6) a failing fixtures load or a fixture file changed after the load yields
# synthetic_only=false on every proof row and in the manifest; (Q1) a failed enumeration or a hash listing shorter
# than the enumeration publishes no SHA256SUMS, writes SHA256SUMS.FAILED naming the step and exits 8, and the test's
# own listing comparison is step-checked, not a pipeline; (Q2) every lease-held case uses an acquired handshake
# (marker file, bounded wait) instead of a fixed sleep.
# Exit 0 when every assertion passes, 1 otherwise. Wall time is several minutes (10 s minimum idle phase per
# full run, bounded sampler cycles, the P5 timeouts).
set -eu
REPO=${1:-/repo}
WORK=${TMPDIR:-/tmp}/perf01-guards-$$
mkdir -p "$WORK"
cp -r "$REPO/ops/perf/tests/fakebin" "$WORK/fakebin"
chmod 0755 "$WORK/fakebin/docker" "$WORK/fakebin/date"
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "ok   $*"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $*"; }
assert_eq() { if [ "$1" = "$2" ]; then ok "$3 ($1)"; else bad "$3: expected '$2' got '$1'"; fi; }
assert_file() { if [ -e "$1" ]; then ok "$2"; else bad "$2: missing $1"; fi; }
assert_no_file() { if [ ! -e "$1" ]; then ok "$2"; else bad "$2: unexpected $1"; fi; }
count_token() { grep -cw -- "$2" "$1" 2>/dev/null || true; }
TAB=$(printf '\t')

# hold_lease <task root>: a background holder takes the project lease and reports acquisition through a marker file;
# returns only once the marker exists (deadline 50 x 0.1 s, the case fails otherwise). No fixed sleeps, no guessing.
# release_lease: tells the holder to exit and waits for it.
hold_lease() {
  LEASE_ROOT=$1
  rm -f "$LEASE_ROOT/lease-acquired" "$LEASE_ROOT/lease-release"
  ( flock -n 9 && : > "$LEASE_ROOT/lease-acquired" && while [ ! -e "$LEASE_ROOT/lease-release" ]; do sleep 0.2; done ) \
    9> "$LEASE_ROOT/.perf01-lifecycle.lock" &
  LEASE_PID=$!
  i=0
  while [ ! -e "$LEASE_ROOT/lease-acquired" ]; do
    i=$((i + 1))
    if [ "$i" -gt 50 ]; then bad "lease holder did not acquire $LEASE_ROOT/.perf01-lifecycle.lock within 5 s"; return 1; fi
    sleep 0.1
  done
  ok "lease holder acquired $LEASE_ROOT/.perf01-lifecycle.lock"
}
release_lease() {
  : > "$LEASE_ROOT/lease-release"
  wait "$LEASE_PID" 2>/dev/null || true
  rm -f "$LEASE_ROOT/lease-acquired" "$LEASE_ROOT/lease-release"
}

new_case() { # new_case <name>: fresh writable copy with a fake source.json and a non-empty credential file
  dir="$WORK/$1"
  mkdir -p "$dir/ops/local"
  # ops/local may hold the task's generated credentials and evidence/ its results: neither enters a test copy.
  ( cd "$REPO" && tar --exclude=ops/local --exclude=evidence -cf - compose.yaml apps/server ops scripts ) | ( cd "$dir" && tar -xf - )
  echo '{"fake":true,"revision":"0000000000000000000000000000000000000000"}' > "$dir/source.json"
  echo 'FAKE=1' > "$dir/ops/local/.env"
  echo "$dir"
}

# run_rb <case-dir> <label> [VAR=value ...]: runs run-baseline.sh with the fake docker and a 10 s matrix; sets RC.
run_rb() {
  dir=$1; label=$2; shift 2
  : > "$dir/docker.log"
  RC=0
  env PATH="$WORK/fakebin:$PATH" FAKE_DOCKER_LOG="$dir/docker.log" \
    PERF01_RESERVATION=test-reservation PERF01_PROJECT=perf01-0123456789ab \
    PERF01_MAX_LOAD1=100000 PERF01_MIN_MEM_MB=1 PERF01_MIN_DISK_GB=0 \
    PERF01_IDLE_SECONDS=10 PERF01_WARMUP=0 PERF01_DURATION=5 PERF01_PASSES=1 PERF01_REPS=1 PERF01_TIERS=1 \
    PERF01_ENDPOINTS=health PERF01_MODES=keepalive PERF01_SAMPLE_INTERVAL=1 PERF01_SAMPLER_WAIT=5 \
    "$@" sh "$dir/ops/perf/run-baseline.sh" "$label" > "$dir/stdout.log" 2> "$dir/stderr.log" || RC=$?
  EVID=$(find "$dir/evidence" -maxdepth 1 -type d -name "perf01-*-$label" 2>/dev/null | head -1 || true)
}

echo "== (a) preflight rejection must not stop anything"
d=$(new_case case-a)
run_rb "$d" case-a FAKE_COLLISION=1
assert_eq "$RC" 3 "(a) exit code is preflight's 3"
assert_eq "$(count_token "$d/docker.log" stop)" 0 "(a) zero stop invocations"
assert_file "$EVID/ABORTED" "(a) ABORTED written"
assert_eq "$(wc -c < "$EVID/owned-containers.txt" | tr -d ' ')" 0 "(a) owned-containers.txt empty"

echo "== (b) invalid tunables exit 2 before any docker call"
for spec in PERF01_PASSES=0 PERF01_REPS=0 PERF01_DURATION=0 PERF01_TIERS=0 PERF01_ENDPOINTS= PERF01_MODES= \
            PERF01_MAX_ERROR_RATE=0 PERF01_MAX_ERROR_RATE=0.9 PERF01_DOCKER_TIMEOUT=4 PERF01_STOP_GRACE=0 \
            "PERF01_DOCKER_TIMEOUT=20 PERF01_STOP_GRACE=20" "PERF01_MAX_TOTAL_SECONDS=60 PERF01_SETUP_ALLOWANCE=60"; do
  d=$(new_case "case-b-$(echo "$spec" | tr -c 'A-Za-z0-9\n' '_')")
  # shellcheck disable=SC2086
  run_rb "$d" case-b $spec
  assert_eq "$RC" 2 "(b) $spec exits 2"
  assert_eq "$(wc -c < "$d/docker.log" | tr -d ' ')" 0 "(b) $spec made no docker call"
done

echo "== (c) stop failure => exit 6 and RETAINED"
d=$(new_case case-c)
run_rb "$d" case-c FAKE_STOP_EXIT=1 FAKE_RUNNING_AFTER_STOP=true
assert_eq "$RC" 6 "(c) exit code 6"
assert_file "$EVID/RETAINED" "(c) RETAINED written"
assert_eq "$(grep -c '^c1:running:' "$EVID/RETAINED" || true)" 1 "(c) RETAINED lists c1 as running"
assert_eq "$(grep -c '^c2:running:' "$EVID/RETAINED" || true)" 1 "(c) RETAINED lists c2 as running"
assert_eq "$(grep -c '^stop -t 10 c[12]$' "$d/docker.log" || true)" 2 "(c) stop attempted for exactly the owned ids with the default grace"
assert_eq "$(grep -c '^compose .* stop' "$d/docker.log" || true)" 0 "(c) no compose stop by project name"

echo "== (d) required EXPLAIN failure => exit 7, INCOMPLETE, manifest incomplete"
d=$(new_case case-d)
run_rb "$d" case-d FAKE_SQL_EXIT=1
assert_eq "$RC" 7 "(d) exit code 7"
assert_file "$EVID/INCOMPLETE" "(d) INCOMPLETE written"
assert_file "$EVID/manifest.json" "(d) manifest still written"
assert_file "$EVID/SHA256SUMS" "(d) SHA256SUMS still written"
assert_eq "$(grep -c '"status": "incomplete"' "$EVID/manifest.json" || true)" 1 "(d) manifest status incomplete"
assert_eq "$(grep -c '"required_steps_failed": \["sql/explain-rls"\]' "$EVID/manifest.json" || true)" 1 "(d) failed step named"
assert_eq "$(grep -c 'status=incomplete$' "$EVID/volume-proof.tsv" || true)" 3 "(d) every proof row carries status=incomplete"
assert_eq "$(grep -c 'status=complete$' "$EVID/volume-proof.tsv" || true)" 0 "(d) no proof row claims complete"

echo "== (e) sampler stop files are unique, never deleted, and the sampler exits within the bounded wait"
sdir="$WORK/sampler"; mkdir -p "$sdir"
: > "$sdir/docker.log"
sampler() { # sampler <out-dir> <stop-file> -> background pid in SPID
  env PATH="$WORK/fakebin:$PATH" FAKE_DOCKER_LOG="$sdir/docker.log" PERF01_RESERVATION=t PERF01_PROJECT=perf01-0123456789ab \
    sh "$REPO/ops/perf/sample.sh" "$1" "$2" 1 > "$1.out" 2>&1 &
  SPID=$!
}
wait_exit() { # wait_exit <pid> <max-s> -> 0 if exited in time
  n=0; while kill -0 "$1" 2>/dev/null && [ "$n" -lt "$2" ]; do sleep 1; n=$((n + 1)); done
  ! kill -0 "$1" 2>/dev/null
}
sampler "$sdir/one" "$sdir/one/.stop"; P1=$SPID
sleep 2; touch "$sdir/one/.stop"
if wait_exit "$P1" 10; then ok "(e) first sampler exited within 10 s"; else kill "$P1" 2>/dev/null || true; bad "(e) first sampler hung"; fi
sampler "$sdir/two" "$sdir/two/.stop"; P2=$SPID
sleep 2; touch "$sdir/two/.stop"
if wait_exit "$P2" 10; then ok "(e) second sampler exited within 10 s"; else kill "$P2" 2>/dev/null || true; bad "(e) second sampler hung"; fi
assert_file "$sdir/one/.stop" "(e) first stop file never deleted"
assert_file "$sdir/two/.stop" "(e) second stop file never deleted"
RC=0; env PATH="$WORK/fakebin:$PATH" FAKE_DOCKER_LOG="$sdir/docker.log" PERF01_RESERVATION=t PERF01_PROJECT=perf01-0123456789ab \
  sh "$REPO/ops/perf/sample.sh" "$sdir/one" "$sdir/one/.stop" 1 > /dev/null 2>&1 || RC=$?
assert_eq "$RC" 2 "(e) sampler refuses a preexisting stop file"
assert_eq "$(grep -c '^ts,' "$sdir/one/stats.csv" || true)" 1 "(e) first sampler wrote its CSV header"

# run_sampler <out-dir> <seconds> [VAR=value ...]: one bounded sampler cycle against the fake docker; sets SRC.
# Data rows must be either a full numeric row or an explicit unavailable row; a blank-field row fails the check.
run_sampler() {
  out=$1; secs=$2; shift 2
  : > "$out.docker.log"
  env PATH="$WORK/fakebin:$PATH" FAKE_DOCKER_LOG="$out.docker.log" PERF01_RESERVATION=t PERF01_PROJECT=perf01-0123456789ab \
    "$@" sh "$REPO/ops/perf/sample.sh" "$out" "$out/.stop" 1 > "$out.out" 2>&1 &
  SPID=$!
  sleep "$secs"; touch "$out/.stop"
  if wait_exit "$SPID" 15; then SRC=exited; else kill "$SPID" 2>/dev/null || true; SRC=hung; fi
}
blank_rows() { grep -Ev '^ts,|unavailable|^[^,]+(,[0-9]+){8}$|^[^,]+,c[12],fake-c[12],|,none,' "$1" | wc -l | tr -d ' '; }

echo "== (f) docker stats failure => explicit stats-unavailable row, never a sed-passed or blank row"
run_sampler "$WORK/sampler-f" 3 FAKE_STATS_EXIT=1
assert_eq "$SRC" exited "(f) sampler exited"
assert_eq "$(grep -c ',stats-unavailable,exit=1,' "$WORK/sampler-f/stats.csv" || true)" "$(grep -vc '^ts,' "$WORK/sampler-f/stats.csv" || true)" "(f) every data row is stats-unavailable exit=1"
assert_eq "$(grep -c 'fake-c1' "$WORK/sampler-f/stats.csv" || true)" 0 "(f) no stats data leaked through"
assert_eq "$(blank_rows "$WORK/sampler-f/stats.csv")" 0 "(f) no blank-field rows"

echo "== (g) docker exec partial output or failure => explicit unavailable row"
run_sampler "$WORK/sampler-g1" 3 FAKE_EXEC_MODE=partial
assert_eq "$SRC" exited "(g) partial: sampler exited"
assert_eq "$(grep -c ',unavailable,partial-proc-output' "$WORK/sampler-g1/worker-proc.csv" || true)" "$(grep -vc '^ts,' "$WORK/sampler-g1/worker-proc.csv" || true)" "(g) partial: every row says partial-proc-output"
assert_eq "$(blank_rows "$WORK/sampler-g1/worker-proc.csv")" 0 "(g) partial: no blank numeric rows"
run_sampler "$WORK/sampler-g2" 3 FAKE_EXEC_MODE=fail
assert_eq "$SRC" exited "(g) fail: sampler exited"
assert_eq "$(grep -c ',unavailable,exec-exit=1,' "$WORK/sampler-g2/worker-proc.csv" || true)" "$(grep -vc '^ts,' "$WORK/sampler-g2/worker-proc.csv" || true)" "(g) fail: every row says exec-exit=1"
run_sampler "$WORK/sampler-g3" 3
assert_eq "$SRC" exited "(g) full: sampler exited"
assert_eq "$(grep -Ec '^[^,]+,10,2,100,50,10,5,0,4096$' "$WORK/sampler-g3/worker-proc.csv" || true)" "$(grep -vc '^ts,' "$WORK/sampler-g3/worker-proc.csv" || true)" "(g) full: every row carries the eight numeric fields"

echo "== (h) one failing inventory command => preflight exit 2 naming it, never clean"
for failcmd in "volume ls" "network ls" "images" "ps -a"; do
  d=$(new_case "case-h-$(echo "$failcmd" | tr -c 'A-Za-z0-9\n' '_')")
  : > "$d/docker.log"
  RC=0
  env PATH="$WORK/fakebin:$PATH" FAKE_DOCKER_LOG="$d/docker.log" FAKE_FAIL_CMD="$failcmd" \
    PERF01_RESERVATION=t PERF01_PROJECT=perf01-0123456789ab PERF01_MAX_LOAD1=100000 PERF01_MIN_MEM_MB=1 PERF01_MIN_DISK_GB=0 \
    sh "$d/ops/perf/preflight.sh" "$d/pre" > "$d/pre.out" 2> "$d/pre.err" || RC=$?
  assert_eq "$RC" 2 "(h) '$failcmd' failure exits 2"
  assert_eq "$(grep -c "inventory command failed (docker $failcmd" "$d/pre.err" || true)" 1 "(h) '$failcmd' named in the error"
  assert_eq "$(grep -c 'clear to proceed' "$d/pre.out" || true)" 0 "(h) '$failcmd' never reported clean"
done

echo "== (i) docker call past the timeout => exit 124 row, sampler still stops on the stop file"
run_sampler "$WORK/sampler-i" 8 FAKE_SLEEP_CMDS=stats FAKE_SLEEP_SECONDS=60 PERF01_DOCKER_TIMEOUT=5
assert_eq "$SRC" exited "(i) sampler exited within the bounded wait despite a stuck docker stats"
assert_eq "$(grep -c ',stats-unavailable,exit=124,' "$WORK/sampler-i/stats.csv" || true)" "$(grep -vc '^ts,' "$WORK/sampler-i/stats.csv" || true)" "(i) every stats row records exit=124"
assert_eq "$(blank_rows "$WORK/sampler-i/stats.csv")" 0 "(i) no blank-field rows"

echo "== (j) failed up => containers carrying the run label are rediscovered, recorded and stopped"
d=$(new_case case-j1)
run_rb "$d" case-j1 FAKE_UP_EXIT=1
assert_eq "$RC" 1 "(j) up failure keeps compose's exit 1"
assert_eq "$(grep -c '^c1$' "$EVID/owned-containers.txt" || true)" 1 "(j) c1 recorded by rediscovery"
assert_eq "$(grep -c '^c2$' "$EVID/owned-containers.txt" || true)" 1 "(j) c2 recorded by rediscovery"
assert_eq "$(grep -c '^stop -t 10 c[12]$' "$d/docker.log" || true)" 2 "(j) rediscovered ids stopped"
assert_file "$EVID/ABORTED" "(j) ABORTED written"
assert_no_file "$EVID/RETAINED" "(j) nothing retained when stop succeeds"
d=$(new_case case-j2)
run_rb "$d" case-j2 FAKE_DISCOVERY_EXIT=1
assert_eq "$RC" 6 "(j) discovery failure on an otherwise clean run exits 6"
assert_eq "$(grep -c '^ownership-discovery-failed:' "$EVID/RETAINED" || true)" 1 "(j) RETAINED names the discovery failure"
assert_eq "$(grep -c '^stop -t 10 c[12]$' "$d/docker.log" || true)" 2 "(j) previously recorded ids still stopped"
# (P4) the seal is the trap's last step: it covers RETAINED, stop.log and host-after.txt and verifies in place.
RC=0; ( cd "$EVID" && sha256sum -c --status SHA256SUMS ) || RC=$?
assert_eq "$RC" 0 "(P4) sha256sum -c verifies every listed file after the trap finished"
for f in RETAINED stop.log host-after.txt ABORTED owned-containers.txt manifest.json volume-proof.tsv; do
  assert_eq "$(grep -c "  ./$f\$" "$EVID/SHA256SUMS" || true)" 1 "(P4) SHA256SUMS lists $f"
done
# (Q1c) the comparison itself uses no pipeline: every step is a checked command writing an intermediate file.
RC=0; ( cd "$EVID" && find . -type f ! -name 'SHA256SUMS*' ! -name '.*.tmp' > "$d/present.lst" ) || RC=$?
assert_eq "$RC" 0 "(P4) enumerating the run directory for the comparison succeeded"
RC=0; sort "$d/present.lst" > "$d/present.sorted" || RC=$?
assert_eq "$RC" 0 "(P4) sorting the present files succeeded"
RC=0; sed 's/^[0-9a-f]*  //' "$EVID/SHA256SUMS" > "$d/listed.lst" || RC=$?
assert_eq "$RC" 0 "(P4) extracting the listed names succeeded"
RC=0; sort "$d/listed.lst" > "$d/listed.sorted" || RC=$?
assert_eq "$RC" 0 "(P4) sorting the listed names succeeded"
assert_eq "$(wc -l < "$d/present.sorted" | tr -d ' ')" "$(wc -l < "$d/listed.sorted" | tr -d ' ')" "(P4) SHA256SUMS has as many lines as there are files"
RC=0; cmp -s "$d/present.sorted" "$d/listed.sorted" || RC=$?
assert_eq "$RC" 0 "(P4) SHA256SUMS lists exactly the files present, no more, no fewer"
assert_eq "$(find "$EVID" -maxdepth 1 \( -name '.seal-*.tmp' -o -name 'SHA256SUMS.tmp' \) | wc -l | tr -d ' ')" 0 "(Q1) no seal intermediate left behind"
assert_no_file "$EVID/SHA256SUMS.FAILED" "(P4) sealing did not fail"

echo "== (k) inspect failure after stop => state-unknown in RETAINED and exit 6"
d=$(new_case case-k)
run_rb "$d" case-k FAKE_INSPECT_RUNNING_EXIT=1
assert_eq "$RC" 6 "(k) exit code 6"
assert_eq "$(grep -c '^c1:state-unknown$' "$EVID/RETAINED" || true)" 1 "(k) c1 state-unknown"
assert_eq "$(grep -c '^c2:state-unknown$' "$EVID/RETAINED" || true)" 1 "(k) c2 state-unknown"
assert_eq "$(grep -c '"status": "complete"' "$EVID/manifest.json" || true)" 1 "(k) manifest itself was complete before the exit check"

echo "== (m) clean run => exit 0, manifest complete, one stop file per sample"
d=$(new_case case-m)
run_rb "$d" case-m
assert_eq "$RC" 0 "(m) exit code 0"
assert_eq "$(grep -c '"status": "complete"' "$EVID/manifest.json" || true)" 1 "(m) manifest status complete"
assert_eq "$(find "$EVID/load" -name 'p*-*.json' | wc -l | tr -d ' ')" 1 "(m) one load result for the 1x1x1x1x1 matrix"
assert_eq "$(find "$EVID" -name .stop | wc -l | tr -d ' ')" 2 "(m) idle + one run => two distinct stop files"
assert_eq "$(grep -c '^stop -t 10 c[12]$' "$d/docker.log" || true)" 2 "(m) owned ids stopped at exit"
assert_file "$EVID/fixtures-sha256.txt" "(m) fixture hash recorded before the load"
assert_file "$EVID/fixtures-ok" "(m) fixtures load marked ok"
assert_eq "$(grep -c '"synthetic_only": true' "$EVID/manifest.json" || true)" 1 "(m) manifest synthetic_only true on a clean run"
RC=0; ( cd "$EVID" && sha256sum -c --status SHA256SUMS ) || RC=$?
assert_eq "$RC" 0 "(m) SHA256SUMS verifies after the trap"
assert_eq "$(grep -c '^compose .* stop' "$d/docker.log" || true)" 0 "(m) no compose stop by project name"
assert_no_file "$EVID/RETAINED" "(m) nothing retained"
assert_no_file "$EVID/ABORTED" "(m) not aborted"
assert_no_file "$EVID/sampler-kills.txt" "(m) no sampler needed killing"
assert_eq "$(blank_rows "$EVID/idle/stats.csv")" 0 "(m) idle stats rows are data or explicit"
assert_eq "$(blank_rows "$EVID/idle/worker-proc.csv")" 0 "(m) idle worker rows are data or explicit"
# Producer side of the volume proof (E4): one labelled create per volume, identity inspected right after it, one
# well-formed seven-field row per volume carrying exactly the generation that was created, written by rename.
P=perf01-0123456789ab
assert_eq "$(grep -Ec "^volume create --label elevateo.perf.task=perf01 --label elevateo.perf.project=$P --label elevateo.perf.run=$P-[0-9]{8}T[0-9]{6}Z-case-m --label elevateo.perf.generation=[a-z0-9-]{8,64} $P-(db-data|db-config|storage-data)\$" "$d/docker.log" || true)" 3 "(m) three labelled volume creates with a generation nonce"
assert_eq "$(grep -c '^volume inspect --format .*CreatedAt.*elevateo.perf.generation' "$d/docker.log" || true)" 3 "(m) identity inspected once per volume right after creation"
assert_file "$EVID/volume-proof.tsv" "(m) volume-proof.tsv written"
assert_eq "$(wc -l < "$EVID/volume-proof.tsv" | tr -d ' ')" 3 "(m) exactly three proof rows"
assert_eq "$(grep -Ec "^$P$TAB$P-[0-9]{8}T[0-9]{6}Z-case-m$TAB$P-(db-data|db-config|storage-data)$TAB[a-z0-9-]{8,64}${TAB}2026-10-12T00:00:00Z${TAB}synthetic_only=true${TAB}status=complete\$" "$EVID/volume-proof.tsv" || true)" 3 "(m) every row has the seven fields, a valid generation and the inspected CreatedAt"
for s in db-data db-config storage-data; do
  created_gen=$(grep -o "elevateo.perf.generation=[a-z0-9-]* $P-$s\$" "$d/docker.log" | cut -d= -f2 | cut -d' ' -f1)
  assert_eq "$(awk -F'\t' -v v="$P-$s" '$3 == v { print $4 }' "$EVID/volume-proof.tsv")" "$created_gen" "(m) $s proof row carries the generation that was created"
done
assert_eq "$(find "$EVID" -name '.volume-proof.tsv.tmp*' | wc -l | tr -d ' ')" 0 "(m) no temporary proof file left behind"
assert_eq "$(grep -Fc 'mv "$tmp" "$EVID/volume-proof.tsv"' "$REPO/ops/perf/run-baseline.sh" || true)" 1 "(m) the proof is renamed into place"
assert_eq "$(grep -Ec '>>? *"\$EVID/volume-proof\.tsv"' "$REPO/ops/perf/run-baseline.sh" || true)" 0 "(m) the proof is never written in place"
assert_eq "$(grep -Fc '[ ! -e "$EVID/volume-proof.tsv" ] || perf01_die' "$REPO/ops/perf/run-baseline.sh" || true)" 1 "(m) an existing proof file is refused, never overwritten"
assert_eq "$(grep -c 'external: true' "$REPO/ops/perf/compose.perf.yaml" || true)" 3 "(m) the overlay declares the three volumes external (compose attaches, never creates)"
assert_eq "$(grep -c '^  dk volume create \|identity=$(dk volume inspect' "$REPO/ops/perf/run-baseline.sh" || true)" 2 "(m) volume create and inspect run through the bounded dk wrapper"
assert_eq "$(grep -c '^  \[ "$FINALIZED" -eq 0 \] || return 0$' "$REPO/ops/perf/run-baseline.sh" || true)" 1 "(m) finalize is guarded to run once"

echo "== (L3) a volume create that hangs past PERF01_DOCKER_TIMEOUT leaves the volume unproven, no proof row"
d=$(new_case case-l3)
run_rb "$d" case-l3 FAKE_SLEEP_CMDS=volume FAKE_SLEEP_SUB=create FAKE_SLEEP_SECONDS=30 PERF01_DOCKER_TIMEOUT=5
assert_eq "$RC" 7 "(L3) exit 7"
assert_eq "$(grep -c 'volume-create/perf01-0123456789ab-db-data' "$EVID/INCOMPLETE" || true)" 1 "(L3) INCOMPLETE names the first volume"
assert_eq "$(grep -c 'exit 124' "$EVID/INCOMPLETE" || true)" 1 "(L3) the timeout is recorded as exit 124"
assert_eq "$(wc -l < "$EVID/volume-proof.tsv" | tr -d ' ')" 0 "(L3) no proof row at all"
assert_eq "$(grep -c '^compose .* up ' "$d/docker.log" || true)" 0 "(L3) the stack was never started"
assert_eq "$(grep -c '"volume-proof.tsv"\|volume-proof.tsv$' "$EVID/SHA256SUMS" || true)" 1 "(m) proof listed in SHA256SUMS"

echo "== (P3) lease before any evidence write; the run directory is created exclusively"
FIXED_EPOCH=1760227200
FIXED_RUN="perf01-0123456789ab-$(date -u -d "@$FIXED_EPOCH" +%Y%m%dT%H%M%SZ)-case-p3"
seed_run_dir() { # seed_run_dir <case-dir>: an "active run" with pre-populated files, hashed; sets SEED_HASH
  mkdir -p "$1/evidence/$FIXED_RUN/load"
  printf 'c9\n' > "$1/evidence/$FIXED_RUN/owned-containers.txt"
  printf 'perf01-0123456789ab\t%s\tperf01-0123456789ab-db-data\tgen-live\t2026-10-12T00:00:00Z\n' "$FIXED_RUN" > "$1/evidence/$FIXED_RUN/volume-identity.tsv"
  SEED_HASH=$(cd "$1/evidence/$FIXED_RUN" && find . -type f | sort | xargs sha256sum | sha256sum)
}
d=$(new_case case-p3-lease)
seed_run_dir "$d"
hold_lease "$d" || true
run_rb "$d" case-p3 FAKE_DATE_EPOCH=$FIXED_EPOCH
assert_eq "$RC" 4 "(P3i) same RUN_ID while the first run holds the lease => exit 4"
assert_eq "$(wc -c < "$d/docker.log" | tr -d ' ')" 0 "(P3i) zero docker calls"
assert_eq "$(cd "$d/evidence/$FIXED_RUN" && find . -type f | sort | xargs sha256sum | sha256sum)" "$SEED_HASH" "(P3i) every byte of the active run's files is unchanged"
release_lease
d=$(new_case case-p3-collision)
seed_run_dir "$d"
run_rb "$d" case-p3 FAKE_DATE_EPOCH=$FIXED_EPOCH
assert_eq "$RC" 2 "(P3ii) lease free but the run directory exists => exit 2"
assert_eq "$(grep -c 'run id collision or evidence dir exists' "$d/stderr.log" || true)" 1 "(P3ii) refusal names the collision"
assert_eq "$(wc -c < "$d/docker.log" | tr -d ' ')" 0 "(P3ii) zero docker calls"
assert_eq "$(cd "$d/evidence/$FIXED_RUN" && find . -type f | sort | xargs sha256sum | sha256sum)" "$SEED_HASH" "(P3ii) directory contents untouched"
assert_eq "$(grep -c 'perf01-lifecycle.lock' "$d/stderr.log" || true)" 0 "(P3ii) the lease itself was free"

echo "== (P5) every exit-trap Docker call is bounded; a timeout is recorded as not proven"
d=$(new_case case-p5-ps)
run_rb "$d" case-p5 FAKE_SLEEP_MATCH="ps -aq --filter label=elevateo.perf.run=" FAKE_SLEEP_SECONDS=60 PERF01_DOCKER_TIMEOUT=11 PERF01_STOP_GRACE=1
assert_eq "$RC" 6 "(P5) ownership discovery timing out => exit 6"
assert_eq "$(grep -c '^ownership-discovery-failed:timeout$' "$EVID/RETAINED" || true)" 1 "(P5) RETAINED names the discovery timeout"
assert_eq "$(grep -c '^stop -t 1 c[12]$' "$d/docker.log" || true)" 2 "(P5) previously recorded ids still stopped with the configured grace"
d=$(new_case case-p5-stop)
run_rb "$d" case-p5 FAKE_SLEEP_CMDS=stop FAKE_SLEEP_SECONDS=60 PERF01_DOCKER_TIMEOUT=11 PERF01_STOP_GRACE=1
assert_eq "$RC" 6 "(P5) stop timing out => exit 6"
assert_eq "$(grep -c '^c1:stop-timeout$' "$EVID/RETAINED" || true)" 1 "(P5) RETAINED names c1 stop-timeout"
assert_eq "$(grep -c '^c2:stop-timeout$' "$EVID/RETAINED" || true)" 1 "(P5) RETAINED names c2 stop-timeout"
assert_eq "$(grep -c 'stop timed out for c1 after 11s' "$EVID/stop.log" || true)" 1 "(P5) stop.log records the timeout"
d=$(new_case case-p5-inspect)
run_rb "$d" case-p5 FAKE_SLEEP_MATCH="inspect --format {{.State.Running}}" FAKE_SLEEP_SECONDS=60 PERF01_DOCKER_TIMEOUT=11 PERF01_STOP_GRACE=1
assert_eq "$RC" 6 "(P5) post-stop inspect timing out => exit 6"
assert_eq "$(grep -c '^c1:state-unknown:timeout$' "$EVID/RETAINED" || true)" 1 "(P5) RETAINED names c1 state-unknown:timeout"
assert_eq "$(grep -c '^c2:state-unknown:timeout$' "$EVID/RETAINED" || true)" 1 "(P5) RETAINED names c2 state-unknown:timeout"

echo "== (P6) synthetic_only is provenance, not file existence"
d=$(new_case case-p6-fail)
run_rb "$d" case-p6 FAKE_FIXTURES_EXIT=1
assert_eq "$RC" 7 "(P6) fixtures load failure => exit 7"
assert_eq "$(grep -c 'required step fixtures failed' "$EVID/INCOMPLETE" || true)" 1 "(P6) INCOMPLETE names the fixtures step"
assert_no_file "$EVID/fixtures-ok" "(P6) no fixtures-ok marker"
assert_eq "$(wc -l < "$EVID/volume-proof.tsv" | tr -d ' ')" 3 "(P6) three proof rows still written"
assert_eq "$(grep -c "synthetic_only=false${TAB}status=incomplete\$" "$EVID/volume-proof.tsv" || true)" 3 "(P6) every row says synthetic_only=false, status=incomplete"
assert_eq "$(grep -c '"synthetic_only": false' "$EVID/manifest.json" || true)" 1 "(P6) manifest synthetic_only false"
assert_eq "$(grep -c '^compose .* up -d --wait auth' "$d/docker.log" || true)" 0 "(P6) the stack was not started after the failed load"
d=$(new_case case-p6-tamper)
run_rb "$d" case-p6 FAKE_FIXTURES_TAMPER="$d/ops/tests/db-fixtures.sql"
assert_eq "$RC" 0 "(P6) a run whose fixture file changed after the load still completes"
assert_eq "$(grep -c "synthetic_only=false${TAB}status=complete\$" "$EVID/volume-proof.tsv" || true)" 3 "(P6) but every proof row says synthetic_only=false"
assert_eq "$(grep -c '"synthetic_only": false' "$EVID/manifest.json" || true)" 1 "(P6) manifest synthetic_only false"
assert_eq "$(head -1 "$EVID/fixtures-sha256.txt")" "$(sha256sum "$REPO/ops/tests/db-fixtures.sql" | cut -d' ' -f1)" "(P6) the recorded hash is the pre-load hash of the untouched file"

echo "== (Q1) a failed or partial seal publishes no SHA256SUMS, names the step and exits 8"
# (Q1a) the enumeration step fails: a `find` shim ahead of the fake bin fails only the seal's -print0 listing and is
# the real find otherwise. PATH passed through run_rb's env list overrides its default (later assignments win).
d=$(new_case case-q1-enumerate)
mkdir -p "$d/shim"
cat > "$d/shim/find" <<'EOF'
#!/bin/sh
for a in "$@"; do
  if [ "$a" = -print0 ]; then echo "shim find: scripted enumeration failure" >&2; exit 1; fi
done
for real in /usr/bin/find /bin/find; do
  if [ -x "$real" ]; then exec "$real" "$@"; fi
done
exit 1
EOF
chmod 0755 "$d/shim/find"
run_rb "$d" case-q1a PATH="$d/shim:$WORK/fakebin:$PATH"
assert_eq "$RC" 8 "(Q1a) otherwise clean run whose enumeration failed => exit 8"
assert_eq "$(grep -c '"status": "complete"' "$EVID/manifest.json" || true)" 1 "(Q1a) the run itself was complete"
assert_no_file "$EVID/SHA256SUMS" "(Q1a) no SHA256SUMS published"
assert_file "$EVID/SHA256SUMS.FAILED" "(Q1a) SHA256SUMS.FAILED written"
assert_eq "$(grep -c 'failed at step enumerate ' "$EVID/SHA256SUMS.FAILED" || true)" 1 "(Q1a) the failure names the enumeration step"
assert_eq "$(find "$EVID" -maxdepth 1 \( -name '.seal-*.tmp' -o -name 'SHA256SUMS.tmp' \) | wc -l | tr -d ' ')" 0 "(Q1a) intermediates removed"
assert_no_file "$EVID/RETAINED" "(Q1a) nothing retained (the failure is the seal, not the stack)"
# (Q1b) the hash step processes fewer entries than enumerated: a `sha256sum` shim drops the last argument whenever
# it receives two or more (the single-file fixture hash is untouched), so the line count falls short by one.
d=$(new_case case-q1-short)
mkdir -p "$d/shim"
cat > "$d/shim/sha256sum" <<'EOF'
#!/bin/sh
for real in /usr/bin/sha256sum /bin/sha256sum; do
  if [ -x "$real" ]; then
    if [ $# -ge 2 ]; then
      # rotate the first n = $# - 1 arguments to the back, which leaves the last argument in front, then drop it
      n=$(($# - 1)); i=0
      while [ $i -lt $n ]; do set -- "$@" "$1"; shift; i=$((i + 1)); done
      shift
    fi
    exec "$real" "$@"
  fi
done
exit 1
EOF
chmod 0755 "$d/shim/sha256sum"
run_rb "$d" case-q1b PATH="$d/shim:$WORK/fakebin:$PATH"
assert_eq "$RC" 8 "(Q1b) a short hash listing => exit 8"
assert_eq "$(grep -c '"status": "complete"' "$EVID/manifest.json" || true)" 1 "(Q1b) the run itself was complete"
assert_no_file "$EVID/SHA256SUMS" "(Q1b) no SHA256SUMS published"
assert_eq "$(grep -c 'failed at step count-mismatch (enumerated [0-9]*, hashed [0-9]*)' "$EVID/SHA256SUMS.FAILED" || true)" 1 "(Q1b) the failure names the count mismatch with both counts"
assert_eq "$(find "$EVID" -maxdepth 1 \( -name '.seal-*.tmp' -o -name 'SHA256SUMS.tmp' \) | wc -l | tr -d ' ')" 0 "(Q1b) intermediates removed"
assert_eq "$(grep -Fc 'find . -type f ! -name '"'"'SHA256SUMS*'"'"' ! -name '"'"'.*.tmp'"'"' -print0 > .seal-list.tmp ||' "$REPO/ops/perf/run-baseline.sh" || true)" 1 "(Q1) the seal enumerates into a checked intermediate, not a pipeline"
assert_eq "$(grep -c '| sort -z | xargs -0 sha256sum' "$REPO/ops/perf/run-baseline.sh" || true)" 0 "(Q1) no seal pipeline remains in the producer"

echo "== (n) preflight: a foreign unlabelled volume is recorded as a total, never as a collision"
# Synthetic foreign resource (no task label, no project prefix); no claim about what exists on fleet-02.
FOREIGN=foreign-unlabelled-volume
d=$(new_case case-n)
: > "$d/docker.log"
RC=0
env PATH="$WORK/fakebin:$PATH" FAKE_DOCKER_LOG="$d/docker.log" FAKE_VOLUME_EXTRA=$FOREIGN \
  PERF01_RESERVATION=t PERF01_PROJECT=perf01-0123456789ab PERF01_MAX_LOAD1=100000 PERF01_MIN_MEM_MB=1 PERF01_MIN_DISK_GB=0 \
  sh "$d/ops/perf/preflight.sh" "$d/pre" > "$d/pre.out" 2> "$d/pre.err" || RC=$?
assert_eq "$RC" 0 "(n) preflight exits 0 with the foreign volume present"
assert_eq "$(wc -c < "$d/pre/existing.txt" | tr -d ' ')" 0 "(n) existing.txt is empty (no perf01 label, no project prefix)"
assert_eq "$(grep -c 'volume_count_total=1' "$d/pre/host.txt" || true)" 1 "(n) the foreign volume is counted in host.txt only"
assert_eq "$(grep -c "$FOREIGN" "$d/pre/existing.txt" "$d/pre.err" || true)" 0 "(n) never named as a collision"

echo "== (o) producer refuses to start while the project-scoped lifecycle lease is held"
d=$(new_case case-o)
hold_lease "$d" || true
run_rb "$d" case-o
assert_eq "$RC" 4 "(o) exit 4"
assert_eq "$(wc -c < "$d/docker.log" | tr -d ' ')" 0 "(o) no docker call made"
assert_eq "$(grep -c 'lifecycle lease held by another producer or cleanup for project perf01-0123456789ab' "$d/stderr.log" || true)" 1 "(o) refusal names the project lease"
release_lease

echo "== (p) a volume whose identity does not round-trip gets no proof row and the run stops incomplete"
d=$(new_case case-p)
run_rb "$d" case-p FAKE_VOLUME_NO_GEN=perf01-0123456789ab-db-config
assert_eq "$RC" 7 "(p) exit 7"
assert_file "$EVID/INCOMPLETE" "(p) INCOMPLETE written"
assert_eq "$(grep -c 'volume-create/perf01-0123456789ab-db-config' "$EVID/INCOMPLETE" || true)" 1 "(p) INCOMPLETE names the unproven volume"
assert_eq "$(grep -c '"status": "incomplete"' "$EVID/manifest.json" || true)" 1 "(p) manifest status incomplete"
assert_eq "$(grep -c 'volume-create/perf01-0123456789ab-db-config' "$EVID/manifest.json" || true)" 1 "(p) manifest names the failed step"
assert_file "$EVID/volume-proof.tsv" "(p) proof file still written (atomically) for the proven volume"
assert_eq "$(wc -l < "$EVID/volume-proof.tsv" | tr -d ' ')" 1 "(p) exactly one proof row (db-data)"
assert_eq "$(grep -c 'db-config' "$EVID/volume-proof.tsv" || true)" 0 "(p) no proof row for the unproven volume"
assert_eq "$(grep -c 'status=incomplete$' "$EVID/volume-proof.tsv" || true)" 1 "(p) the surviving row says incomplete"
assert_eq "$(grep -c '^volume create' "$d/docker.log" || true)" 2 "(p) creation stopped at the unproven volume"
assert_eq "$(grep -c '^compose .* up ' "$d/docker.log" || true)" 0 "(p) the stack was never started"
assert_eq "$(find "$EVID" -name '.volume-proof.tsv.tmp*' | wc -l | tr -d ' ')" 0 "(p) no temporary proof file left behind"

echo "passed=$PASS failed=$FAIL work=$WORK"
[ "$FAIL" -eq 0 ]
