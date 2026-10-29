#!/bin/sh
# AIDEV-NOTE: Docker-only regression for cleanup.sh fail-closed rules; drives the script with a fake docker CLI, never a daemon.
# Launch ONLY inside a disposable container on fleet-02 after the Codex reservation is relayed, as a NON-ROOT user:
#   docker run --rm --network none --user 65534:65534 --label elevateo.perf.task=perf01 --label elevateo.perf.run=<run-id> \
#     --cpus 0.5 --memory 256m --pids-limit 128 --read-only --tmpfs /tmp:size=256m \
#     --mount type=bind,src=$HOME/<PERF01_PROJECT>,dst=/repo,readonly \
#     ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2 \
#     sh /repo/ops/perf/tests/cleanup-guards.sh /repo
# Cases: (D1) volume-proof.tsv missing / wrong run_id / wrong volume name / extra field => volumes retained with the
# reason, zero `volume rm`; (D2) --remove-pulled-images rejected before any docker call; an absent-at-preflight
# image is never removed even with a pulled_by_this_run manifest record; (D3) image id differs at execution =>
# retained, zero `image rm`; volume CreatedAt differs at execution => retained, zero `volume rm`; (D4) a failure
# whose stderr says "context not found" aborts with exit 4 instead of reading as absence; (D5) volumes used only by
# the planned containers are planned and removed on a clean execute, one foreign user retains them; (D6) a docker
# call past PERF01_DOCKER_TIMEOUT aborts with exit 4 recorded as a timeout; (E1) a conflicting, duplicate, eight- or
# six-field or CR-terminated target proof row retains the volume; (E2) a foreign tag on the server image id or any
# tag on a dangling id at execution retains it with zero `image rm`; (E3) timeout <= grace + 10 is rejected before
# any docker call and a stop taking grace + 2 s completes without a timeout record; (E4) a live generation,
# CreatedAt or missing generation label that differs from the seven-field proof row retains the volume, a malformed
# generation in the proof retains it, a failing identity inspect retains per volume, a held project-scoped lifecycle
# lease exits 4 with zero docker calls (also when held via another run of the same project), a PERF01_RUN_ID that
# differs from the evidence run exits 2, an evidence directory relocated outside <task root>/evidence/ exits 2
# (L1), and a clean execute inspects the identity twice per volume; (P1) a symlinked volume-proof.tsv retains all
# three volumes; (P2) a successful stop records "stopped", a failing rm records "failed" and aborts with exit 4 before
# any further deletion; (Q2) the lease-held cases (d)/(d2) use an acquired handshake, not a fixed sleep; (g) a synthetic
# foreign unlabelled volume leaked into listings is never planned, inspected, removed or recorded; (4) daemon failures on ps, images,
# volume inspect, network ls abort before any removal; (5) dry run plans six actions and removes nothing, clean
# execute removes exactly the task containers, network and built image by id; (7) a foreign mount retains the
# container; (2) --remove-build-cache rejected and build cache always retained. Exit 0 when every assertion passes.
set -eu
REPO=${1:-/repo}
WORK=${TMPDIR:-/tmp}/perf01-cleanup-guards-$$
mkdir -p "$WORK"
cp -r "$REPO/ops/perf/tests/fakebin" "$WORK/fakebin"
chmod 0755 "$WORK/fakebin/docker" "$WORK/fakebin/date"
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "ok   $*"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $*"; }
assert_eq() { if [ "$1" = "$2" ]; then ok "$3 ($1)"; else bad "$3: expected '$2' got '$1'"; fi; }
PROJECT=perf01-0123456789ab
RUN="$PROJECT-20261012T000000Z-test"
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

GEN=gen-0123456789abcdef                      # the fake identity inspect reports this generation by default
CREATED=2026-10-12T00:00:00Z                  # and this CreatedAt (until FAKE_VOLUME_FP_FLIP_AFTER flips it)
proof_line() { printf '%s\t%s\t%s\t%s\t%s\tsynthetic_only=true\tstatus=complete\n' "$1" "$2" "$3" "$GEN" "$CREATED"; }
new_case() { # new_case <name>: harness copy plus a valid evidence directory for one run
  dir="$WORK/$1"
  mkdir -p "$dir/ops/local" "$dir/evidence/$RUN/preflight"
  ( cd "$REPO" && tar --exclude=ops/local --exclude=evidence -cf - compose.yaml apps/server ops scripts ) | ( cd "$dir" && tar -xf - )
  printf '{\n  "run_id": "%s",\n  "status": "complete",\n  "project": "%s",\n  "finished_at": "2026-10-12T00:00:00Z"\n}\n' "$RUN" "$PROJECT" > "$dir/evidence/$RUN/manifest.json"
  for s in db-data db-config storage-data; do proof_line "$PROJECT" "$RUN" "$PROJECT-$s"; done > "$dir/evidence/$RUN/volume-proof.tsv"
  printf 'absent supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00 -\npresent ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2 sha256:rubyid\n' \
    > "$dir/evidence/$RUN/preflight/images-before.txt"
  echo "$dir"
}
# run_cu <case-dir> "<flags>" [VAR=value ...]: runs cleanup.sh against the fake docker; sets RC, LOG, NDJSON.
run_cu() {
  dir=$1; flags=$2; shift 2
  LOG="$dir/docker.log"; : > "$LOG"; rm -f "$LOG.removed" "$LOG.fpcount"
  RC=0
  # shellcheck disable=SC2086
  env PATH="$WORK/fakebin:$PATH" FAKE_DOCKER_LOG="$LOG" PERF01_RESERVATION=test-reservation PERF01_PROJECT=$PROJECT \
    PERF01_RUN_ID="$RUN" FAKE_RUNNING_AFTER_STOP=true "$@" sh "$dir/ops/perf/cleanup.sh" "$dir/evidence/$RUN" $flags > "$dir/stdout.log" 2> "$dir/stderr.log" || RC=$?
  NDJSON=$(find "$dir/evidence/$RUN" -name 'cleanup-*.ndjson' | head -1 || true)
}
logc() { grep -Ec -- "$1" "$LOG" || true; }
ndc() { grep -Ec -- "$1" "$NDJSON" || true; }
removals() { logc '^(stop |rm |network rm|image rm|volume rm)'; }
VOLFLAGS="--execute --volumes-proven-synthetic"

echo "== (D1) volume proof must bind project, run id and exact volume name on one well-formed line"
d=$(new_case d1-missing); rm "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(D1) missing proof => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(D1) missing: zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*volume-proof.tsv missing')" 3 "(D1) missing: three volumes retained with reason"
d=$(new_case d1-runid)
for s in db-data db-config storage-data; do proof_line "$PROJECT" "$PROJECT-20261012T000000Z-other" "$PROJECT-$s"; done > "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(D1) wrong run id => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(D1) wrong run id: zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*no proof row for')" 3 "(D1) wrong run id: retained with reason"
d=$(new_case d1-name)
awk -F"$TAB" -v OFS="$TAB" '{ $3 = $3 "-x"; print }' "$d/evidence/$RUN/volume-proof.tsv" > "$d/p.tmp" && mv "$d/p.tmp" "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(D1) wrong volume name => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(D1) wrong volume name: zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*no proof row for')" 3 "(D1) wrong volume name: retained with reason"
d=$(new_case d1-extra)
awk '{ print $0 "\textra" }' "$d/evidence/$RUN/volume-proof.tsv" > "$d/p.tmp" && mv "$d/p.tmp" "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(D1) extra field => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(D1) extra field: zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*conflicting or malformed proof rows.*field count 8')" 3 "(D1) extra field: retained with reason"

echo "== (E1) conflicting, duplicate or malformed target rows never pass"
d=$(new_case e1-conflict)
printf '%s\t%s\t%s\t%s\t%s\tsynthetic_only=false\tstatus=complete\n' "$PROJECT" "$RUN" "$PROJECT-db-data" "$GEN" "$CREATED" >> "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(E1) conflicting false row => exit 1"
assert_eq "$(logc "^volume rm $PROJECT-db-data\$")" 0 "(E1) conflicting: db-data not removed"
assert_eq "$(ndc '"name":"'"$PROJECT"'-db-data".*"action":"retained".*conflicting or malformed proof rows')" 1 "(E1) conflicting: retained with reason"
d=$(new_case e1-duplicate)
proof_line "$PROJECT" "$RUN" "$PROJECT-db-config" >> "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(E1) duplicate identical rows => exit 1"
assert_eq "$(logc "^volume rm $PROJECT-db-config\$")" 0 "(E1) duplicate: db-config not removed"
assert_eq "$(ndc '"name":"'"$PROJECT"'-db-config".*"action":"retained".*conflicting or malformed proof rows')" 1 "(E1) duplicate: retained with reason"
d=$(new_case e1-eightfield)
awk -F"$TAB" -v OFS="$TAB" -v v="$PROJECT-storage-data" '$3 == v { $0 = $0 OFS "extra" } { print }' "$d/evidence/$RUN/volume-proof.tsv" > "$d/p.tmp" && mv "$d/p.tmp" "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(E1) eight-field target row => exit 1"
assert_eq "$(logc "^volume rm $PROJECT-storage-data\$")" 0 "(E1) eight-field: storage-data not removed"
assert_eq "$(ndc '"name":"'"$PROJECT"'-storage-data".*"action":"retained".*conflicting or malformed proof rows.*field count 8')" 1 "(E1) eight-field: retained with reason"
assert_eq "$(logc '^volume rm')" 2 "(E1) eight-field: the two well-formed volumes were still removed"
d=$(new_case e1-sixfield)
awk -F"$TAB" -v OFS="$TAB" -v v="$PROJECT-storage-data" '$3 == v { NF = 6 } { print }' "$d/evidence/$RUN/volume-proof.tsv" > "$d/p.tmp" && mv "$d/p.tmp" "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(E1) six-field target row => exit 1"
assert_eq "$(logc "^volume rm $PROJECT-storage-data\$")" 0 "(E1) six-field: storage-data not removed"
assert_eq "$(ndc '"name":"'"$PROJECT"'-storage-data".*"action":"retained".*conflicting or malformed proof rows.*field count 6')" 1 "(E1) six-field: retained with reason"
d=$(new_case e1-cr)
awk '{ printf "%s\r\n", $0 }' "$d/evidence/$RUN/volume-proof.tsv" > "$d/p.tmp" && mv "$d/p.tmp" "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(E1) CR line endings => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(E1) CR: zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*contains CR')" 3 "(E1) CR: retained with reason"

echo "== (E2) references are revalidated at execution even for an unchanged id"
d=$(new_case e2-foreign-tag)
run_cu "$d" "--execute" FAKE_IMAGE_TAGS_AT_EXEC="$PROJECT-server:perf other/workload:latest"
assert_eq "$RC" 1 "(E2) foreign tag on the server image id => exit 1"
assert_eq "$(logc '^image rm')" 0 "(E2) foreign tag: zero image rm"
assert_eq "$(ndc '"kind":"image".*"action":"retained".*foreign reference present at execution: .*other/workload:latest')" 1 "(E2) foreign tag: retained naming the refs"
DANGLING_ID=sha256:dead0000000000000000000000000000000000000000000000000000000000ab
d=$(new_case e2-dangling-tagged)
run_cu "$d" "--execute" FAKE_DANGLING="$DANGLING_ID" FAKE_DANGLING_TAGS_AT_EXEC="someone/else:tag"
assert_eq "$RC" 1 "(E2) dangling id tagged at execution => exit 1"
assert_eq "$(logc "^image rm $DANGLING_ID\$")" 0 "(E2) tagged dangling layer not removed"
assert_eq "$(logc '^image rm sha256:fade')" 1 "(E2) server image still removed"
assert_eq "$(ndc '"id":"'"$DANGLING_ID"'".*"action":"retained".*foreign reference present at execution')" 1 "(E2) dangling: retained naming the tag"
d=$(new_case e2-dangling-clean)
run_cu "$d" "--execute" FAKE_DANGLING="$DANGLING_ID"
assert_eq "$RC" 0 "(E2) untagged dangling layer => exit 0"
assert_eq "$(logc "^image rm $DANGLING_ID\$")" 1 "(E2) untagged dangling layer removed by id"

echo "== (E3) stop grace ends before the CLI deadline"
d=$(new_case e3-relation)
run_cu "$d" "--execute" PERF01_DOCKER_TIMEOUT=20 PERF01_STOP_GRACE=20
assert_eq "$RC" 2 "(E3) timeout equal to grace => exit 2"
assert_eq "$(wc -c < "$LOG" | tr -d ' ')" 0 "(E3) rejected before any docker call"
d=$(new_case e3-slow-stop)
run_cu "$d" "--execute" FAKE_SLEEP_CMDS=stop FAKE_SLEEP_SECONDS=12
assert_eq "$RC" 0 "(E3) stop taking grace+2 s completes under default settings"
assert_eq "$(logc '^stop -t 10 c[12]$')" 2 "(E3) both stops issued with the 10 s grace"
assert_eq "$(ndc 'timeout after')" 0 "(E3) no timeout recorded"

echo "== (E4) the proof binds a generation, not a mutable name; producer and cleanup are serialized by a lease"
d=$(new_case e4-generation)
run_cu "$d" "$VOLFLAGS" FAKE_VOLUME_GEN=gen-fedcba9876543210
assert_eq "$RC" 1 "(E4a) live generation g2 for a proof row with g1 => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(E4a) zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*generation mismatch or unverifiable')" 3 "(E4a) three volumes retained with reason"
d=$(new_case e4-createdat)
run_cu "$d" "$VOLFLAGS" FAKE_VOLUME_FP_FLIP_AFTER=0
assert_eq "$RC" 1 "(E4b) same generation, different CreatedAt => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(E4b) zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*generation mismatch or unverifiable')" 3 "(E4b) three volumes retained with reason"
d=$(new_case e4-nolabel)
run_cu "$d" "$VOLFLAGS" FAKE_VOLUME_NO_GEN="$PROJECT-db-data $PROJECT-db-config $PROJECT-storage-data"
assert_eq "$RC" 1 "(E4c) generation label absent on the volume => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(E4c) zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*generation mismatch or unverifiable.*<no value>')" 3 "(E4c) retained naming the missing label"
d=$(new_case e4-badgen)
awk -F"$TAB" -v OFS="$TAB" '{ $4 = "Gen_Bad"; print }' "$d/evidence/$RUN/volume-proof.tsv" > "$d/p.tmp" && mv "$d/p.tmp" "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(E4) malformed generation in the proof => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(E4) malformed generation: zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*generation .Gen_Bad. malformed')" 3 "(E4) malformed generation: retained with reason"
d=$(new_case e4-lease)
# The lease is project-scoped: <task root>/.perf01-lifecycle.lock, the same file for every run id of this checkout.
hold_lease "$d" || true
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 4 "(E4d) lifecycle lease held by another process => exit 4"
assert_eq "$(wc -c < "$LOG" | tr -d ' ')" 0 "(E4d) zero docker calls"
assert_eq "$(find "$d/evidence/$RUN" -name 'cleanup-*' | wc -l | tr -d ' ')" 0 "(E4d) no cleanup manifest or plan written"
assert_eq "$(grep -c "lifecycle lease held by another producer or cleanup for project $PROJECT" "$d/stderr.log" || true)" 1 "(E4d) refusal names the project lease"
# (d2) a second run of the same project under the same task root resolves to the same lock.
RUN_B="$PROJECT-20261012T010000Z-testb"
cp -r "$d/evidence/$RUN" "$d/evidence/$RUN_B"
sed -i "s/$RUN/$RUN_B/g" "$d/evidence/$RUN_B/volume-proof.tsv" "$d/evidence/$RUN_B/manifest.json"
LOG="$d/docker-b.log"; : > "$LOG"; RC=0
env PATH="$WORK/fakebin:$PATH" FAKE_DOCKER_LOG="$LOG" PERF01_RESERVATION=test-reservation PERF01_PROJECT=$PROJECT \
  PERF01_RUN_ID="$RUN_B" sh "$d/ops/perf/cleanup.sh" "$d/evidence/$RUN_B" --execute --volumes-proven-synthetic > "$d/stdout-b.log" 2> "$d/stderr-b.log" || RC=$?
assert_eq "$RC" 4 "(E4d2) lock held via run A, cleanup of run B => exit 4"
assert_eq "$(wc -c < "$LOG" | tr -d ' ')" 0 "(E4d2) zero docker calls for run B"
assert_eq "$(find "$d/evidence/$RUN_B" -name 'cleanup-*' | wc -l | tr -d ' ')" 0 "(E4d2) nothing written for run B"
release_lease
d=$(new_case e4-inspect-fails)
run_cu "$d" "$VOLFLAGS" FAKE_FAIL_CMD='volume inspect --format {{.Name}}|'
assert_eq "$RC" 1 "(E4) identity inspect failing => exit 1 (that volume unverifiable)"
assert_eq "$(logc '^volume rm')" 0 "(E4) inspect failure: zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*generation mismatch or unverifiable.*identity inspect failed')" 3 "(E4) inspect failure: retained per volume with the failure named"
assert_eq "$(ndc '"action":"aborted"')" 0 "(E4) inspect failure: no abort record (the labels inspect still succeeded)"
d=$(new_case e4-runid)
run_cu "$d" "$VOLFLAGS" PERF01_RUN_ID="$PROJECT-20261012T000000Z-other"
assert_eq "$RC" 2 "(E4) PERF01_RUN_ID differing from the evidence run => exit 2"
assert_eq "$(wc -c < "$LOG" | tr -d ' ')" 0 "(E4) run id mismatch: zero docker calls"
# (L1) a copied evidence directory outside <task root>/evidence/ is refused: the proof is read only in place.
d=$(new_case e4-relocated)
mkdir -p "$WORK/elsewhere"; cp -r "$d/evidence/$RUN" "$WORK/elsewhere/$RUN"
LOG="$d/docker-reloc.log"; : > "$LOG"; RC=0
env PATH="$WORK/fakebin:$PATH" FAKE_DOCKER_LOG="$LOG" PERF01_RESERVATION=test-reservation PERF01_PROJECT=$PROJECT \
  PERF01_RUN_ID="$RUN" sh "$d/ops/perf/cleanup.sh" "$WORK/elsewhere/$RUN" --execute --volumes-proven-synthetic > "$d/stdout-reloc.log" 2> "$d/stderr-reloc.log" || RC=$?
assert_eq "$RC" 2 "(L1) relocated evidence directory => exit 2"
assert_eq "$(wc -c < "$LOG" | tr -d ' ')" 0 "(L1) relocated: zero docker calls"
assert_eq "$(grep -c 'a relocated proof is not read' "$d/stderr-reloc.log" || true)" 1 "(L1) relocated: refusal names the rule"
assert_eq "$(find "$WORK/elsewhere/$RUN" -name 'cleanup-*' | wc -l | tr -d ' ')" 0 "(L1) relocated: nothing written there"
rm -rf "$WORK/elsewhere/$RUN"
d=$(new_case e4-lease-released)
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 0 "(E4) with the lease free and identities matching the clean execute exits 0"
assert_eq "$(logc "^volume rm $PROJECT-(db-data|db-config|storage-data)\$")" 3 "(E4) three volumes removed"
assert_eq "$(logc '^volume inspect --format .*CreatedAt')" 6 "(E4) identity inspected at plan and again before each rm"

echo "== (P1) the proof must be the regular file at its canonical place, never a symlink"
d=$(new_case p1-symlink)
mv "$d/evidence/$RUN/volume-proof.tsv" "$d/outside-proof.tsv"           # a valid proof, kept outside evidence/
ln -s "$d/outside-proof.tsv" "$d/evidence/$RUN/volume-proof.tsv"
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 1 "(P1) symlinked proof => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(P1) symlinked proof: zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*synthetic proof failed: volume-proof.tsv is a symlink')" 3 "(P1) three volumes retained naming the symlink"

echo "== (P2) a stop records stopped, an rm records removed, a failure records failed and aborts"
d=$(new_case p2-rm-fails)
run_cu "$d" "--execute" FAKE_FAIL_CMD="rm c1"
assert_eq "$RC" 4 "(P2) rm failure => exit 4"
assert_eq "$(ndc '"id":"c1".*"action":"stopped"')" 1 "(P2) exactly one stopped record for c1"
assert_eq "$(ndc '"id":"c1".*"action":"failed"')" 1 "(P2) exactly one failed record for c1"
assert_eq "$(ndc '"action":"removed"')" 0 "(P2) zero removed records"
assert_eq "$(logc '^stop -t 10 c2$')" 0 "(P2) no further deletions after the failure"
assert_eq "$(logc '^rm c2$')" 0 "(P2) c2 never removed"

echo "== (g) a foreign unlabelled volume listed alongside the run's volumes is not a task resource"
# Synthetic case: the fake name stands for any volume without elevateo.perf.* labels that a leaky listing returns.
# It makes no claim about what is present on fleet-02.
FOREIGN=foreign-unlabelled-volume
d=$(new_case g-foreign-volume)
run_cu "$d" "$VOLFLAGS" FAKE_VOLUME_EXTRA=$FOREIGN
assert_eq "$RC" 0 "(g) clean execute exits 0"
assert_eq "$(logc "^volume rm $PROJECT-(db-data|db-config|storage-data)\$")" 3 "(g) exactly the three task volumes removed"
assert_eq "$(logc "$FOREIGN")" 0 "(g) the foreign volume is never inspected or removed (never named in a docker call)"
assert_eq "$(ndc "$FOREIGN")" 0 "(g) the foreign volume appears nowhere in the manifest"
assert_eq "$(grep -c "$FOREIGN" "$d/evidence/$RUN"/cleanup-*.plan || true)" 0 "(g) the foreign volume is not in the plan"

echo "== (D2) pulled pinned images are never removable"
d=$(new_case d2-flag)
run_cu "$d" "--execute --remove-pulled-images"
assert_eq "$RC" 2 "(D2) --remove-pulled-images rejected with exit 2"
assert_eq "$(wc -c < "$LOG" | tr -d ' ')" 0 "(D2) rejection happened before any docker call"
d=$(new_case d2-record)
sed -i "s/\"status\": \"complete\",/\"status\": \"complete\",\n  \"pulled_by_this_run\": [\"supabase\/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00\"],/" "$d/evidence/$RUN/manifest.json"
run_cu "$d" "--execute"
assert_eq "$RC" 0 "(D2) clean run with a pulled_by_this_run record exits 0"
assert_eq "$(logc '^image rm')" 1 "(D2) exactly one image rm (the task-built image)"
assert_eq "$(logc '^image rm sha256:fade')" 1 "(D2) that removal is by exact id"
assert_eq "$(ndc '"action":"retained".*shared pinned image pulled after preflight; never removed')" 1 "(D2) pulled pinned image recorded retained"

echo "== (D3) removal targets are re-verified by id and fingerprint at execution"
d=$(new_case d3-image)
run_cu "$d" "--execute" FAKE_IMAGE_ID_AT_EXEC=sha256:0000000000000000000000000000000000000000000000000000000000000001
assert_eq "$RC" 1 "(D3) image id changed => exit 1"
assert_eq "$(logc '^image rm')" 0 "(D3) zero image rm"
assert_eq "$(ndc '"kind":"image".*"action":"retained".*changed at execution')" 1 "(D3) image retained with reason"
d=$(new_case d3-volume)
run_cu "$d" "$VOLFLAGS" FAKE_VOLUME_FP_FLIP_AFTER=3
assert_eq "$RC" 1 "(D3) volume CreatedAt changed between plan and execution => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(D3) zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*generation mismatch or unverifiable')" 3 "(D3) volumes retained with reason"

echo "== (D4) error text never means absence"
d=$(new_case d4)
run_cu "$d" "$VOLFLAGS" FAKE_FAIL_CMD="volume ls" FAKE_FAIL_STDERR="docker: context not found"
assert_eq "$RC" 4 "(D4) exit 4"
assert_eq "$(removals)" 0 "(D4) zero removal invocations"
assert_eq "$(ndc '"action":"aborted".*docker volume ls.*context not found')" 1 "(D4) aborted record names the command and stderr"

echo "== (D5) volume users limited to the containers planned for removal"
d=$(new_case d5-clean)
run_cu "$d" "$VOLFLAGS"
assert_eq "$RC" 0 "(D5) clean execute exit 0"
assert_eq "$(ndc '"kind":"volume-rm".*"action":"planned"')" 3 "(D5) three volumes planned despite users c1 c2"
assert_eq "$(logc "^volume rm $PROJECT-(db-data|db-config|storage-data)\$")" 3 "(D5) three volumes removed after their containers"
d=$(new_case d5-foreign)
run_cu "$d" "$VOLFLAGS" FAKE_VOLUME_USERS="c1 c2 zz"
assert_eq "$RC" 1 "(D5) foreign user => exit 1"
assert_eq "$(logc '^volume rm')" 0 "(D5) foreign user: zero volume rm"
assert_eq "$(ndc '"kind":"volume".*"action":"retained".*not planned for removal')" 3 "(D5) foreign user: retained with reason"

echo "== (D6) every daemon call has a deadline"
d=$(new_case d6)
run_cu "$d" "--execute" FAKE_SLEEP_CMDS=ps FAKE_SLEEP_SECONDS=30 PERF01_DOCKER_TIMEOUT=5
assert_eq "$RC" 4 "(D6) timeout => exit 4"
assert_eq "$(removals)" 0 "(D6) zero removal invocations"
assert_eq "$(ndc '"action":"aborted".*docker ps.*timeout after 5s')" 1 "(D6) aborted record says timeout"

echo "== (4) daemon failure aborts before any removal"
for failcmd in "ps" "images" "volume inspect" "network ls"; do
  d=$(new_case "c4-$(echo "$failcmd" | tr -c 'A-Za-z0-9\n' '_')")
  run_cu "$d" "$VOLFLAGS" FAKE_FAIL_CMD="$failcmd"
  assert_eq "$RC" 4 "(4) '$failcmd' failure => exit 4"
  assert_eq "$(removals)" 0 "(4) '$failcmd': zero removal invocations"
  assert_eq "$(ndc "\"action\":\"aborted\".*docker $failcmd")" 1 "(4) '$failcmd': aborted command recorded"
done

echo "== (5) dry run plans only; clean --execute removes exactly the task containers, network and built image"
d=$(new_case c5-dry)
run_cu "$d" ""
assert_eq "$RC" 0 "(5) dry run exit 0"
assert_eq "$(removals)" 0 "(5) dry run: zero removal invocations"
assert_eq "$(ndc '"action":"planned"')" 6 "(5) dry run: 2 stops + 2 container rms + network + built image planned"
d=$(new_case c5-exec)
run_cu "$d" "--execute"
assert_eq "$RC" 0 "(5) execute exit 0"
assert_eq "$(logc '^stop -t 10 c[12]$')" 2 "(5) both running containers stopped with the default 10 s grace"
assert_eq "$(logc '^rm c[12]$')" 2 "(5) both containers removed"
assert_eq "$(logc '^network rm n1$')" 1 "(5) task network removed"
assert_eq "$(logc '^image rm sha256:fade')" 1 "(5) built server image removed by exact id"
assert_eq "$(logc "^image rm $PROJECT")" 0 "(5) never removed by mutable name"
assert_eq "$(logc '^volume rm')" 0 "(5) no volume removed without the flag"
assert_eq "$(ndc '"action":"stopped"')" 2 "(5) two stops recorded as stopped"
assert_eq "$(ndc '"action":"removed"')" 4 "(5) four removals recorded (2 containers, network, image)"
assert_eq "$(ndc '"kind":"volume".*flag --volumes-proven-synthetic not given')" 3 "(5) volumes kept by policy"

echo "== (7) foreign mount retains the container"
d=$(new_case c7)
run_cu "$d" "--execute" FAKE_BAD_MOUNT=1
assert_eq "$RC" 1 "(7) exit 1"
assert_eq "$(logc '^rm c[12]$')" 0 "(7) containers with a foreign mount are not removed"
assert_eq "$(ndc '"kind":"container".*"action":"retained".*unexpected mount')" 2 "(7) both retained with the mount named"

echo "== (2) build cache is never pruned"
d=$(new_case c2-flag)
run_cu "$d" "--execute --remove-build-cache"
assert_eq "$RC" 2 "(2) --remove-build-cache rejected with exit 2"
assert_eq "$(wc -c < "$LOG" | tr -d ' ')" 0 "(2) rejection happened before any docker call"
d=$(new_case c2-clean)
run_cu "$d" "--execute"
assert_eq "$(logc '^buildx')" 0 "(2) zero buildx invocations"
assert_eq "$(ndc '"kind":"buildcache".*"action":"retained".*unattributable')" 1 "(2) build cache recorded retained as unattributable"

echo "passed=$PASS failed=$FAIL work=$WORK"
[ "$FAIL" -eq 0 ]
