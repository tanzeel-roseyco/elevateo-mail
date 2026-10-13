#!/bin/sh
# AIDEV-NOTE: Removes only resources whose labels, names and mounts prove this project created them. Dry-run by default.
# Two phases, fail closed throughout:
#   A. Plan: every Docker call runs through dq(), which wraps `timeout -k 5 $PERF01_DOCKER_TIMEOUT docker ...`,
#      captures stdout and exit status separately and ABORTS (exit 4, recorded in the manifest, 124 = timeout) on
#      any non-zero status, so a failed or hung listing can never read as "nothing to clean". Absence is never
#      inferred from error text: typed inventories (`ls -q --filter`) with zero lines mean absent. Counts are
#      validated digits-only. No removal happens in phase A.
#   B. Execute (only with --execute): each planned removal is re-verified immediately before the rm: images by
#      exact ID, label and permitted references only (never by mutable name; a foreign tag or digest on the ID
#      retains it), the network by zero attached containers, volumes by exact name, the bound proof row re-read,
#      the live identity (name|CreatedAt|run|generation|project labels) equal to that row, labels and zero users.
#      Any Docker failure aborts the remaining deletions (exit 4), except the identity inspect, whose failure
#      retains that one volume as unverifiable.
# Lifecycle lease: an exclusive flock on <task root>/.perf01-lifecycle.lock (project-scoped: the same file for every
# run id and every script invocation in this checkout, held by run-baseline.sh for the whole producer run) is taken
# before the first Docker call and held to exit; if it is held elsewhere the script exits 4 having touched nothing.
# Supported ownership boundary: single host, single task directory per PERF01_PROJECT, one producer or one cleanup
# at a time. A same-project stack started from a different task directory is outside that boundary, which is why
# the generation + run label + CreatedAt match at plan time and immediately before rm stays mandatory and retains
# the volume whenever exclusion cannot be established. Without the lease and a generation match, volumes are
# retained by design.
# Usage (inside ~/<PERF01_PROJECT>):
#   PERF01_RESERVATION=<id> PERF01_PROJECT=perf01-<hex> PERF01_RUN_ID=<run-id> sh ops/perf/cleanup.sh <evidence-run-dir> [flags]
#   The evidence directory name is the run id; PERF01_RUN_ID must equal it; the directory must resolve to
#   <task root>/evidence/<run id> (exit 2 otherwise); the volume proof is bound to it.
# Flags:
#   --execute                   actually remove; without it every action is recorded as "planned"
#   --volumes-proven-synthetic  remove the three task volumes only when evidence/<run>/volume-proof.tsv carries one
#                               exact TAB-separated line per volume: project, run_id, volume_name, generation,
#                               created_at, synthetic_only=true, status=complete (written by run-baseline.sh from
#                               the identity it inspected right after creating the volume; docs 7.1 D1/E1/E4); any
#                               second row for the same volume, conflicting or malformed, retains it, and the live
#                               volume must still carry exactly that generation, CreatedAt, run and project
#   PERF01_STOP_GRACE (1..30, default 10) and PERF01_DOCKER_TIMEOUT (5..60, default 20, must be >= grace + 10)
#   --remove-pulled-images      REJECTED (exit 2): a shared pinned image can be pulled by any workload, so no record
#                               can prove exclusive ownership; pulled pinned images are always retained
#   --remove-build-cache        REJECTED (exit 2): cache on the shared default builder is unattributable; retained
# Removable at all: this project's labelled containers, its network, the task-built image and task-labelled dangling
# layers (by exact ID), and, with the flag and proof, its three volumes.
# Exit: 0 clean (policy retentions do not fail); 1 something task-owned could not be proven or removed; 2 usage or
# guard; 4 lifecycle lease held elsewhere, or a Docker command failed or timed out (aborted before further action).
# Never: docker system prune, docker volume prune, compose down -v, image prune -a, anything outside this project.
# The task directory itself (secrets, evidence) is removed by hand from the host after evidence is fetched.
set -eu
. "$(dirname -- "$0")/lib.sh"
perf01_require_reservation
perf01_require_project
PERF01_ROOT=$(perf01_root)
perf01_assert_no_forbidden_commands "$PERF01_ROOT"
EVID=${1:?usage: cleanup.sh <evidence-run-dir> [flags]}; shift
[ -d "$EVID" ] || perf01_die "evidence directory not found"
RUN_ID=$(basename "$EVID")
printf '%s\n' "$RUN_ID" | grep -Eq "^${PERF01_PROJECT}-[0-9]{8}T[0-9]{6}Z-[a-z0-9][a-z0-9-]{0,40}$" \
  || perf01_die "evidence directory name '$RUN_ID' is not a run id of project $PERF01_PROJECT"
# The caller must name the run explicitly as well: a mistyped evidence path can never select another run's volumes.
[ "${PERF01_RUN_ID-}" = "$RUN_ID" ] \
  || perf01_die "PERF01_RUN_ID ('${PERF01_RUN_ID-}') must equal the evidence directory's run id ($RUN_ID)"
# The proof is read only from its original location: the evidence directory must resolve (symlinks followed) to
# <task root>/evidence/<run id>, so a relocated or copied evidence tree can neither supply a proof nor take a
# different lifecycle lease than the producer did.
EVID_REAL=$(CDPATH= cd -- "$EVID" && pwd -P)
ROOT_REAL=$(CDPATH= cd -- "$PERF01_ROOT" && pwd -P)
[ "$EVID_REAL" = "$ROOT_REAL/evidence/$RUN_ID" ] \
  || perf01_die "evidence directory must be $ROOT_REAL/evidence/$RUN_ID (got $EVID_REAL); a relocated proof is not read"
EXECUTE=0; VOLUMES=0
for flag in "$@"; do
  case $flag in
    --execute) EXECUTE=1 ;;
    --volumes-proven-synthetic) VOLUMES=1 ;;
    --remove-pulled-images) perf01_die "--remove-pulled-images is not supported: shared pinned images cannot be proven exclusively task-owned and are always retained" ;;
    --remove-build-cache) perf01_die "--remove-build-cache is not supported: build cache on the shared default builder is unattributable and is always retained" ;;
    *) perf01_die "unknown flag $flag" ;;
  esac
done
DOCKER_TIMEOUT=${PERF01_DOCKER_TIMEOUT-20}
printf '%s\n' "$DOCKER_TIMEOUT" | grep -Eq '^[0-9]+$' && [ "$DOCKER_TIMEOUT" -ge 5 ] && [ "$DOCKER_TIMEOUT" -le 60 ] \
  || perf01_die "PERF01_DOCKER_TIMEOUT must be 5..60"
# The stop grace must end well before the CLI deadline, or a legitimate graceful stop would be killed by the
# wrapper at the grace boundary and misrecorded as a timeout.
STOP_GRACE=${PERF01_STOP_GRACE-10}
printf '%s\n' "$STOP_GRACE" | grep -Eq '^[0-9]+$' && [ "$STOP_GRACE" -ge 1 ] && [ "$STOP_GRACE" -le 30 ] \
  || perf01_die "PERF01_STOP_GRACE must be 1..30"
[ "$DOCKER_TIMEOUT" -ge $((STOP_GRACE + 10)) ] \
  || perf01_die "PERF01_DOCKER_TIMEOUT ($DOCKER_TIMEOUT) must be at least PERF01_STOP_GRACE + 10 ($((STOP_GRACE + 10)))"
command -v timeout >/dev/null 2>&1 || perf01_die "coreutils timeout is required for bounded Docker calls"
command -v flock >/dev/null 2>&1 || perf01_die "util-linux flock is required for the lifecycle lease"
# Exclusive lifecycle lease shared with run-baseline.sh: one file per task directory (PERF01_ROOT), so producer and
# cleanup for the same project resolve to the same lock whatever the run id or invocation directory. Taken before
# any Docker call or evidence write and held on fd 9 until exit; a producer still running, or another cleanup,
# means every volume is retained because nothing can be proven while its identity may be changing.
LEASE="$PERF01_ROOT/.perf01-lifecycle.lock"
exec 9> "$LEASE" || perf01_die "cannot open lifecycle lease $LEASE"
flock -n 9 || perf01_die "lifecycle lease held by another producer or cleanup for project $PERF01_PROJECT; retaining all volumes ($LEASE)" 4
STAMP=$(perf01_now)
MANIFEST="$EVID/cleanup-$STAMP.ndjson"
SUMMARY="$EVID/cleanup-$STAMP.txt"
PLAN="$EVID/cleanup-$STAMP.plan"
: > "$MANIFEST"; : > "$SUMMARY"; : > "$PLAN"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
TAB=$(printf '\t')
RESULT=0
SERVER_IMAGE="${PERF01_PROJECT}-server:perf"
: > "$TMP/planned-containers"

record() { # record kind id name action reason
  printf '{"time":"%s","kind":"%s","id":%s,"name":%s,"action":"%s","reason":%s,"execute":%s}\n' \
    "$(perf01_iso)" "$1" "$(perf01_json_str "$2")" "$(perf01_json_str "$3")" "$4" "$(perf01_json_str "$5")" "$EXECUTE" >> "$MANIFEST"
  echo "$4 $1 $3 ($2) $5" | tee -a "$SUMMARY"
}
is_digits() { printf '%s\n' "$1" | grep -Eq '^[0-9]+$'; }
dk() { timeout -k 5 "$DOCKER_TIMEOUT" docker "$@"; }   # 124 on timeout, propagated
# dq <outfile> <docker args...>: bounded call; capture stdout; abort on any non-zero status, naming the command.
dq() {
  outf=$1; shift
  status=0
  dk "$@" > "$outf" 2> "$TMP/err" || status=$?
  [ "$status" -eq 0 ] && return 0
  if [ "$status" -eq 124 ]; then why="timeout after ${DOCKER_TIMEOUT}s (exit 124)"; else why="exit $status"; fi
  record docker "-" "docker $1 ${2-}" aborted "$why before any further action: $(tr '\n' ' ' < "$TMP/err" | cut -c1-300)"
  perf01_die "docker $1 ${2-} failed ($why); cleanup aborted, nothing further was touched" 4
}
# count_file <file> -> validated number of non-empty lines, or abort.
count_file() {
  n=$(grep -c . "$1" || true)
  is_digits "$n" || perf01_die "non-numeric count while reading $1; aborting" 4
  echo "$n"
}
plan() { # plan kind id name reason  (phase A: record planned, queue for phase B)
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$PLAN"
  record "$1" "$2" "$3" planned "$4"
}
retain() { record "$1" "$2" "$3" retained "$4"; RESULT=1; }      # ownership/verification not proven: fails the run
keep() { record "$1" "$2" "$3" retained "$4"; }                   # policy retention: recorded, does not fail the run
label_ok() { # label_ok <labels as "k=v" lines>
  printf '%s\n' "$1" | grep -Fqx "$PERF01_LABEL" && printf '%s\n' "$1" | grep -Fqx "elevateo.perf.project=$PERF01_PROJECT"
}
# Typed presence checks: a successful listing with zero lines means absent; anything else is exact or aborts.
# volume_present <name> / image_ids_for <reference> write the matching lines to $TMP/present.
volume_present() {
  dq "$TMP/vls" volume ls -q --filter "name=^$1\$"
  grep -Fx -- "$1" "$TMP/vls" > "$TMP/present" || true
}
image_ids_for() {
  dq "$TMP/ils" image ls -q --no-trunc --filter "reference=$1"
  grep -E '^sha256:[0-9a-f]{64}$' "$TMP/ils" | sort -u > "$TMP/present" || true
}
# Volume proof bound to THIS project, THIS run id, THIS exact volume and THIS generation of it: one TAB-separated line
#   project <TAB> run_id <TAB> volume_name <TAB> generation <TAB> created_at <TAB> synthetic_only=true <TAB> status=complete
# in evidence/<run>/volume-proof.tsv, compared field by field against already-validated values; exactly one match.
# Selection first, then validation: every row whose first three fields name this project, run and volume is a
# target row, whatever its remaining fields say. Exactly one target row may exist, and that row must be exactly
# seven non-empty fields with a well-formed generation nonce and RFC 3339 created_at, synthetic_only=true and
# status=complete. A conflicting, duplicate or malformed second row can therefore never be hidden behind one good
# row. A volume NAME is a mutable identity (a replacement volume inherits it), so the generation and CreatedAt from
# the row are compared against the live volume by volume_identity() at plan time and again before the rm.
volume_proof() { # volume_proof <vname> -> PROOF_FAIL empty on success; PROOF_GEN and PROOF_CREATED from the row
  f="$EVID/volume-proof.tsv"
  PROOF_FAIL=''; PROOF_GEN=''; PROOF_CREATED=''
  # The proof must be the regular file at its canonical place: no symlink (checked before -e/-f, which follow
  # links) and a resolved path equal to <evidence>/volume-proof.tsv, so a link to a proof elsewhere is not read.
  [ ! -L "$f" ] || { PROOF_FAIL="volume-proof.tsv is a symlink"; return 0; }
  [ -e "$f" ] || { PROOF_FAIL="volume-proof.tsv missing"; return 0; }
  [ -f "$f" ] || { PROOF_FAIL="volume-proof.tsv is not a regular file"; return 0; }
  f_real="$(CDPATH= cd -- "$(dirname -- "$f")" && pwd -P)/$(basename -- "$f")"
  [ "$f_real" = "$EVID_REAL/volume-proof.tsv" ] || { PROOF_FAIL="volume-proof.tsv resolves to $f_real, not $EVID_REAL/volume-proof.tsv"; return 0; }
  head -c 1 "$f" > /dev/null 2>&1 || { PROOF_FAIL="volume-proof.tsv unreadable"; return 0; }
  if grep -q "$(printf '\r')" "$f"; then PROOF_FAIL="volume-proof.tsv contains CR characters"; return 0; fi
  awk -F "$TAB" -v p="$PERF01_PROJECT" -v r="$RUN_ID" -v v="$1" '$1 == p && $2 == r && $3 == v' "$f" > "$TMP/proof-rows"
  rows=$(count_file "$TMP/proof-rows")
  if [ "$rows" -eq 0 ]; then PROOF_FAIL="no proof row for $1 and run $RUN_ID"; return 0; fi
  if [ "$rows" -ne 1 ]; then PROOF_FAIL="conflicting or malformed proof rows for $1 ($rows target rows)"; return 0; fi
  verdict=$(awk -F "$TAB" '
    { if (NF != 7) { print "field count " NF; exit }
      for (i = 1; i <= NF; i++) if ($i == "") { print "empty field " i; exit }
      if ($6 != "synthetic_only=true") { print "field 6 is " $6; exit }
      if ($7 != "status=complete") { print "field 7 is " $7; exit }
      print "ok" }' "$TMP/proof-rows")
  [ "$verdict" = ok ] || { PROOF_FAIL="conflicting or malformed proof rows for $1 ($verdict)"; return 0; }
  gen=$(cut -f4 "$TMP/proof-rows"); created=$(cut -f5 "$TMP/proof-rows")
  printf '%s\n' "$gen" | grep -Eq '^[a-z0-9-]{8,64}$' \
    || { PROOF_FAIL="conflicting or malformed proof rows for $1 (generation '$gen' malformed)"; return 0; }
  printf '%s\n' "$created" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' \
    || { PROOF_FAIL="conflicting or malformed proof rows for $1 (created_at '$created' malformed)"; return 0; }
  PROOF_GEN=$gen; PROOF_CREATED=$created
}
# Live identity of the volume, as the producer inspected it right after creation: name, CreatedAt and the run,
# generation and project labels, in one bounded inspect. A failed or timed-out inspect, or five values that differ
# from the proof row in any way (replacement volume with the same name, missing or foreign label, different
# CreatedAt), leave IDENT_FAIL set and the caller retains that volume as "generation mismatch or unverifiable".
IDENTITY_FORMAT='{{.Name}}|{{.CreatedAt}}|{{index .Labels "elevateo.perf.run"}}|{{index .Labels "elevateo.perf.generation"}}|{{index .Labels "elevateo.perf.project"}}'
volume_identity() { # volume_identity <vname> -> IDENT_FAIL empty when the live volume equals the proof row
  IDENT_FAIL=''
  status=0
  dk volume inspect --format "$IDENTITY_FORMAT" "$1" > "$TMP/vident" 2> "$TMP/err" || status=$?
  if [ "$status" -ne 0 ]; then
    if [ "$status" -eq 124 ]; then why="timeout after ${DOCKER_TIMEOUT}s (exit 124)"; else why="exit $status"; fi
    IDENT_FAIL="identity inspect failed ($why): $(tr '\n' ' ' < "$TMP/err" | cut -c1-200)"
    return 0
  fi
  live=$(cat "$TMP/vident")
  expected="$1|$PROOF_CREATED|$RUN_ID|$PROOF_GEN|$PERF01_PROJECT"
  [ "$live" = "$expected" ] || IDENT_FAIL="live '$live' differs from proof '$expected'"
}

dq "$TMP/df-before" system df
cp "$TMP/df-before" "$EVID/system-df-before-cleanup-$STAMP.txt"

# ---------------- Phase A: inventory and plan (no removal) ----------------
# 1. Containers: both compose-project and task labels; every mount must be a task bind, a task volume or tmpfs.
dq "$TMP/ids" ps -aq --no-trunc --filter "label=com.docker.compose.project=$PERF01_PROJECT" --filter "label=$PERF01_LABEL"
for id in $(cat "$TMP/ids"); do
  dq "$TMP/name" inspect --format '{{.Name}}' "$id"; name=$(sed 's#^/##' "$TMP/name")
  dq "$TMP/labels" inspect --format '{{range $k, $v := .Config.Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}' "$id"
  dq "$TMP/mounts" inspect --format '{{range .Mounts}}{{.Type}} {{.Source}} {{.Name}}{{"\n"}}{{end}}' "$id"
  dq "$TMP/running" inspect --format '{{.State.Running}}' "$id"; running=$(cat "$TMP/running")
  bad=$(awk -v root="$PERF01_ROOT/" -v p="$PERF01_PROJECT" '
    NF == 0 { next }
    $1 == "tmpfs" { next }
    $1 == "bind" && index($2, root) == 1 { next }
    $1 == "volume" && ($3 == p "-db-data" || $3 == p "-db-config" || $3 == p "-storage-data") { next }
    { print }' "$TMP/mounts")
  if ! label_ok "$(cat "$TMP/labels")"; then retain container "$id" "$name" "label mismatch"; continue; fi
  if [ -n "$bad" ]; then retain container "$id" "$name" "unexpected mount: $bad"; continue; fi
  sed "s#^#mount $name: #" "$TMP/mounts" >> "$SUMMARY"
  case $running in
    true) plan container-stop "$id" "$name" "running; stop (grace ${STOP_GRACE}s) before remove" ;;
    false) ;;
    *) retain container "$id" "$name" "state unknown ($running)"; continue ;;
  esac
  plan container-rm "$id" "$name" "task-owned, labels and mounts verified"
  echo "$id" >> "$TMP/planned-containers"
done
sort -u -o "$TMP/planned-containers" "$TMP/planned-containers"
# Containers carrying the project name prefix without the task label are reported, never removed.
dq "$TMP/prefix" ps -aq --no-trunc --filter "name=^${PERF01_PROJECT}"
for id in $(cat "$TMP/prefix"); do
  dq "$TMP/tasklabel" inspect --format '{{index .Config.Labels "elevateo.perf.task"}}' "$id"
  if [ "$(cat "$TMP/tasklabel")" != perf01 ]; then
    dq "$TMP/name" inspect --format '{{.Name}}' "$id"
    retain container "$id" "$(sed 's#^/##' "$TMP/name")" "name prefix matches but task label absent; manual review"
  fi
done

# 2. Network: must be ours; emptiness is re-verified in phase B after the containers are gone.
dq "$TMP/nets" network ls -q --filter "label=elevateo.perf.project=$PERF01_PROJECT"
for id in $(cat "$TMP/nets"); do
  dq "$TMP/nname" network inspect --format '{{.Name}}' "$id"; nname=$(cat "$TMP/nname")
  if [ "$nname" != "${PERF01_PROJECT}-runtime" ]; then retain network "$id" "$nname" "unexpected name"; continue; fi
  plan network-rm "$id" "$nname" "task-owned; must be empty at execution"
done

# 3. Images built by the task, by exact ID: the tagged server image and dangling layers carrying the project label.
image_ids_for "$SERVER_IMAGE"
case $(count_file "$TMP/present") in
  0) keep image "-" "$SERVER_IMAGE" "already absent" ;;
  1) sid=$(cat "$TMP/present")
     dq "$TMP/ilabel" image inspect --format '{{index .Config.Labels "elevateo.perf.project"}}' "$sid"
     if [ "$(cat "$TMP/ilabel")" != "$PERF01_PROJECT" ]; then retain image "$sid" "$SERVER_IMAGE" "image label mismatch"
     else plan image-rm "$sid" "$SERVER_IMAGE" "built by task; removed by exact ID after label and reference re-check"; fi ;;
  *) retain image "-" "$SERVER_IMAGE" "reference resolves to several ids; manual review" ;;
esac
dq "$TMP/dangling" images -q --no-trunc --filter dangling=true --filter "label=elevateo.perf.project=$PERF01_PROJECT"
for did in $(grep -E '^sha256:[0-9a-f]{64}$' "$TMP/dangling" || true); do
  plan image-rm "$did" "<dangling>" "dangling layer labelled by task build; removed by exact ID after label and reference re-check"
done

# 4. Pinned images are shared: any workload can pull the same digest, so no record proves exclusive ownership.
# They are always retained; the preflight snapshot is recorded for the evidence trail only (no Docker call).
PRE="$EVID/preflight/images-before.txt"
if [ -f "$PRE" ]; then
  for ref in $(awk '$1 == "absent" { print $2 }' "$PRE"); do keep image "-" "$ref" "shared pinned image pulled after preflight; never removed by this task"; done
  for ref in $(awk '$1 == "present" { print $2 }' "$PRE"); do keep image "$(awk -v r="$ref" '$2 == r { print $3 }' "$PRE")" "$ref" "pre-existing before task; never removed"; done
else
  keep image "-" "<pinned images>" "no preflight image snapshot; all retained"
fi

# 5. Build cache: records on the shared default builder cannot be attributed to this task; always retained.
cache_size=$(awk '/^Build Cache/ { print $5 }' "$TMP/df-before")
keep buildcache "-" "<default builder>" "unattributable on shared default builder; retained (size ${cache_size:-unknown})"

# 6. Volumes: flag, exact name present, bound proof (one well-formed seven-field target row), both labels, live
# identity equal to the proof row (name, CreatedAt, run, generation, project), users limited to the containers
# planned for removal above (compared by exact ID; zero users is re-required at execution).
for suffix in db-data db-config storage-data; do
  vname="${PERF01_PROJECT}-$suffix"
  volume_present "$vname"
  [ "$(count_file "$TMP/present")" -eq 1 ] || { keep volume "-" "$vname" "already absent"; continue; }
  if [ "$VOLUMES" -ne 1 ]; then keep volume "$vname" "$vname" "flag --volumes-proven-synthetic not given"; continue; fi
  volume_proof "$vname"
  if [ -n "$PROOF_FAIL" ]; then retain volume "$vname" "$vname" "synthetic proof failed: $PROOF_FAIL"; continue; fi
  dq "$TMP/vlabels" volume inspect --format '{{range $k, $v := .Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}' "$vname"
  if ! label_ok "$(cat "$TMP/vlabels")"; then retain volume "$vname" "$vname" "label mismatch"; continue; fi
  volume_identity "$vname"
  if [ -n "$IDENT_FAIL" ]; then retain volume "$vname" "$vname" "generation mismatch or unverifiable: $vname ($IDENT_FAIL)"; continue; fi
  dq "$TMP/vusers" ps -aq --no-trunc --filter "volume=$vname"
  sort -u "$TMP/vusers" > "$TMP/vusers-sorted"
  foreign=$(comm -23 "$TMP/vusers-sorted" "$TMP/planned-containers" | grep -c . || true)
  is_digits "$foreign" || perf01_die "non-numeric foreign-user count for $vname" 4
  if [ "$foreign" -ne 0 ]; then retain volume "$vname" "$vname" "$foreign user(s) not planned for removal by this run"; continue; fi
  plan volume-rm "$PROOF_GEN" "$vname" "task-owned, labelled, bound proof for run $RUN_ID generation $PROOF_GEN; users limited to planned containers"
done

# ---------------- Phase B: execute planned removals with re-verification ----------------
run_rm() { # run_rm kind id name reason success-action -- docker args...   (a stop records "stopped", an rm "removed")
  kind=$1; id=$2; name=$3; reason=$4; action=$5; shift 5
  status=0
  dk "$@" > "$TMP/rm.out" 2> "$TMP/rm.err" || status=$?
  if [ "$status" -eq 0 ]; then record "$kind" "$id" "$name" "$action" "$reason"; return 0; fi
  if [ "$status" -eq 124 ]; then why="timeout after ${DOCKER_TIMEOUT}s (exit 124)"; else why="exit $status"; fi
  record "$kind" "$id" "$name" failed "$why: $(tr '\n' ' ' < "$TMP/rm.err" | cut -c1-300)"
  perf01_die "docker $1 failed on $name ($why); remaining deletions aborted" 4
}
if [ "$EXECUTE" -eq 1 ]; then
  while IFS="$TAB" read -r kind id name reason; do
    case $kind in
      container-stop) run_rm container "$id" "$name" "$reason" stopped stop -t "$STOP_GRACE" "$id" ;;
      container-rm) run_rm container "$id" "$name" "$reason" removed rm "$id" ;;
      network-rm)
        dq "$TMP/attached" network inspect --format '{{len .Containers}}' "$id"; attached=$(cat "$TMP/attached")
        is_digits "$attached" || perf01_die "non-numeric attached-container count for $name" 4
        if [ "$attached" -ne 0 ]; then retain network "$id" "$name" "$attached containers still attached at execution"; continue; fi
        run_rm network "$id" "$name" "$reason" removed network rm "$id" ;;
      image-rm)
        dq "$TMP/iverify" image inspect --format '{{.Id}} {{index .Config.Labels "elevateo.perf.project"}}' "$id"
        if [ "$(cat "$TMP/iverify")" != "$id $PERF01_PROJECT" ]; then retain image "$id" "$name" "id or project label changed at execution"; continue; fi
        # An immutable ID can still acquire a foreign tag or digest reference between plan and execution; removing
        # it would drop someone else's reference. Permitted references: exactly the task tag for the server image,
        # none for a dangling layer.
        dq "$TMP/irefs" image inspect --format '{{join .RepoTags " "}}|{{join .RepoDigests " "}}' "$id"; irefs=$(cat "$TMP/irefs")
        if [ "$name" = "$SERVER_IMAGE" ]; then permitted="$SERVER_IMAGE|"; else permitted="|"; fi
        if [ "$irefs" != "$permitted" ]; then retain image "$id" "$name" "foreign reference present at execution: $irefs"; continue; fi
        dq "$TMP/anc" ps -aq --no-trunc --filter "ancestor=$id"; anc=$(count_file "$TMP/anc")
        if [ "$anc" -ne 0 ]; then retain image "$id" "$name" "$anc containers still reference it at execution"; continue; fi
        run_rm image "$id" "$name" "$reason" removed image rm "$id" ;;
      volume-rm)
        volume_present "$name"
        if [ "$(count_file "$TMP/present")" -ne 1 ]; then retain volume "$id" "$name" "volume no longer present by exact name at execution"; continue; fi
        dq "$TMP/vlabels" volume inspect --format '{{range $k, $v := .Labels}}{{$k}}={{$v}}{{"\n"}}{{end}}' "$name"
        if ! label_ok "$(cat "$TMP/vlabels")"; then retain volume "$id" "$name" "labels changed at execution"; continue; fi
        # The proof row is re-read and the live identity re-inspected immediately before the rm: the generation
        # planned ($id) must still be the one proven, and the volume must still be that generation.
        volume_proof "$name"
        if [ -n "$PROOF_FAIL" ]; then retain volume "$id" "$name" "synthetic proof failed at execution: $PROOF_FAIL"; continue; fi
        if [ "$PROOF_GEN" != "$id" ]; then retain volume "$id" "$name" "proof generation changed since plan ($PROOF_GEN)"; continue; fi
        volume_identity "$name"
        if [ -n "$IDENT_FAIL" ]; then retain volume "$id" "$name" "generation mismatch or unverifiable: $name ($IDENT_FAIL)"; continue; fi
        dq "$TMP/vusers" ps -aq --no-trunc --filter "volume=$name"; users=$(count_file "$TMP/vusers")
        if [ "$users" -ne 0 ]; then retain volume "$id" "$name" "$users containers still reference it at execution"; continue; fi
        run_rm volume "$id" "$name" "$reason" removed volume rm "$name" ;;
      *) perf01_die "unknown plan entry $kind" 4 ;;
    esac
  done < "$PLAN"
fi

dq "$TMP/df-after" system df
cp "$TMP/df-after" "$EVID/system-df-after-cleanup-$STAMP.txt"
df -h / | tail -1 >> "$SUMMARY"
echo "retained on disk: $PERF01_ROOT (evidence, generated ops/local/.env); remove from the host only after evidence is fetched and SHA256SUMS verified" | tee -a "$SUMMARY"
echo "cleanup manifest: $MANIFEST (execute=$EXECUTE, result=$RESULT)"
exit "$RESULT"
