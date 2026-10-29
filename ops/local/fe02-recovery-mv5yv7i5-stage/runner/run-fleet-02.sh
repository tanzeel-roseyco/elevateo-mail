#!/usr/bin/env bash
# Fleet-02-only Docker validation runner for the repaired FE-01-R1 frontend snapshot.
# Authored only — the parent reviews, transfers and runs it on fleet-02 (all checks run there).
#   ./run-fleet-02.sh <context.tar.gz> [output-dir]  (needs context.tar.gz.sha256 + manifest.sha256 beside the tarball)
# Guarantees (README.md has the full list): snapshot+manifest verified first; typed-inventory
# existence (successful listing + exact Bash line match; anything else is unknown, never absence);
# create-time caps exactly verified; per-command timeouts; browser PASS needs an inspected exited/0
# state; cleanup deletes only identity-verified task resources, verifies deletions, retains
# unknowns, and any cleanup error fails the run. Never a global prune.
set -u -o pipefail
die() { printf '%s\n' "$*" >&2; exit 1; }; T() { local s="$1"; shift; timeout --kill-after=10 "$s" "$@"; }

SNAPSHOT_TAR="${1:?usage: run-fleet-02.sh <context.tar.gz> [output-dir]}"
NONCE="$(od -An -N4 -tx4 /dev/urandom | tr -d ' \n')"; [ -n "$NONCE" ] || die "no nonce"
TASK_ID="fe01r1-$(date -u +%Y%m%d-%H%M%S)-${NONCE}"
LABEL_KEY="elevateo.task"
BUILDER="elevateo-bx-${TASK_ID}"
BKC="buildx_buildkit_${BUILDER}0"
VOL="${BKC}_state"
UNIT_IMG="elevateo-web-unit:${TASK_ID}"
BROWSER_IMG="elevateo-web-browser:${TASK_ID}"
UNIT_CTR="elevateo-unit-${TASK_ID}"
BROWSER_CTR="elevateo-browser-${TASK_ID}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"; EXPECTED_BKC_MOUNTS="volume:${VOL}:/var/lib/buildkit:true;"
FAIL=0; CLEANUP_FAIL=0; CLEANED=0; BKC_ID=""

# --- output path: one safe basename in the cwd. A multi-component path could escape through a
# symlinked parent; an existing entry, INCLUDING a dangling symlink (-e false), is rejected.
OUT="${2:-results-${TASK_ID}}"
case "$OUT" in (''|.|..|-*|*[!A-Za-z0-9._-]*) die "unsafe output path: '$OUT' (single safe basename required)";; esac
[ -L "$OUT" ] && die "output path is a symlink: $OUT"
[ -e "$OUT" ] && die "output path already exists: $OUT"
mkdir -p "$OUT/context" || die "cannot create $OUT"; CTX="$OUT/context"
note() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$OUT/runner.log"; }
step_failed() { FAIL=1; note "FAILED: $*"; }
cleanup_failed() { CLEANUP_FAIL=1; note "CLEANUP FAILURE: $*"; }

# Typed-inventory existence: a SUCCESSFUL listing plus exact-name match decides yes/no; a failed
# listing is err (unknown), never absence. No stderr-text interpretation.
exists() { # exists <container|image|volume|builder> <name> -> yes|no|err
  local out
  case "$1" in
    container) out="$(T 60 docker container ls -a --format '{{.Names}}')" || { echo err; return; };;
    image)     out="$(T 60 docker image ls --format '{{.Repository}}:{{.Tag}}')" || { echo err; return; };;
    volume)    out="$(T 60 docker volume ls --format '{{.Name}}')" || { echo err; return; };;
    builder)   out="$(T 60 docker buildx ls | awk 'NR>1 && $1!="\\_" { sub(/\*$/, "", $1); print $1 }')" \
                 || { echo err; return; };;
    *) echo err; return;;
  esac
  # Pure-Bash whole-line match: `printf | grep -q` under pipefail can SIGPIPE the producer on an
  # early match in a >pipe-buffer inventory and falsely report absence (probes P14/P15 cover it).
  case $'\n'"$out"$'\n' in (*$'\n'"$2"$'\n'*) echo yes;; (*) echo no;; esac
}
require_absent() { # preflight: absence must be CONFIRMED by a successful inventory
  case "$(exists "$1" "$2")" in (no) : ;; (yes) die "preflight: $1 already exists: $2";;
    (*) die "preflight: cannot confirm $1 '$2' is absent (inventory failed)";; esac
}

# --- snapshot integrity: archive hash, then per-file manifest after extraction ------------------
SNAP_DIR="$(cd "$(dirname "$SNAPSHOT_TAR")" && pwd)"; SNAP_BASE="$(basename "$SNAPSHOT_TAR")"
[ -f "$SNAP_DIR/$SNAP_BASE.sha256" ] || die "missing $SNAP_BASE.sha256 beside the snapshot"
[ -f "$SNAP_DIR/manifest.sha256" ] || die "missing manifest.sha256 beside the snapshot"
(cd "$SNAP_DIR" && sha256sum -c "$SNAP_BASE.sha256") || die "snapshot archive hash mismatch"
tar -xzf "$SNAPSHOT_TAR" -C "$CTX" || die "snapshot unpack failed"
(cd "$CTX" && sha256sum --quiet -c "$SNAP_DIR/manifest.sha256") || die "snapshot manifest mismatch"
[ -f "$CTX/apps/web/package.json" ] || die "snapshot lacks apps/web"
note "task=${TASK_ID} snapshot verified: $(sha256sum "$SNAPSHOT_TAR")"

# --- preflight: every task-named resource, including the builder cache volume, confirmed absent --
for c in "$UNIT_CTR" "$BROWSER_CTR" "$BKC"; do require_absent container "$c"; done
require_absent image "$UNIT_IMG"; require_absent image "$BROWSER_IMG"; require_absent builder "$BUILDER"; require_absent volume "$VOL"

# --- trapped cleanup: identity-verified deletions, each verified, unknowns retained --------------
remove_container() {
  local ctr="$1" lbl mounts
  case "$(exists container "$ctr")" in (no) return 0;;
    (err) cleanup_failed "container $ctr state unknown; retained"; return 1;; esac
  lbl="$(T 60 docker container inspect -f "{{index .Config.Labels \"${LABEL_KEY}\"}}" "$ctr")" \
    && mounts="$(T 60 docker container inspect -f '{{len .Mounts}}' "$ctr")" \
    || { cleanup_failed "cannot verify $ctr; retained"; return 1; }
  if [ "$lbl" = "$TASK_ID" ] && [ "$mounts" = "0" ]; then
    T 120 docker rm -f "$ctr" >/dev/null || { cleanup_failed "rm $ctr"; return 1; }
    [ "$(exists container "$ctr")" = "no" ] || { cleanup_failed "$ctr removal unconfirmed"; return 1; }
    note "removed container $ctr"
  else cleanup_failed "$ctr not verified (label='$lbl' mounts=$mounts); retained"; return 1; fi
}
cleanup() {
  [ "$CLEANED" = 1 ] && return 0; CLEANED=1
  local lbl id mounts bst cst vst verified=0
  remove_container "$UNIT_CTR"; remove_container "$BROWSER_CTR"
  for img in "$UNIT_IMG" "$BROWSER_IMG"; do
    case "$(exists image "$img")" in (no) continue;;
      (err) cleanup_failed "image $img state unknown; retained"; continue;; esac
    lbl="$(T 60 docker image inspect -f "{{index .Config.Labels \"${LABEL_KEY}\"}}" "$img")" \
      || { cleanup_failed "cannot verify $img; retained"; continue; }
    if [ "$lbl" = "$TASK_ID" ]; then
      T 120 docker rmi "$img" >/dev/null || { cleanup_failed "rmi $img"; continue; }
      [ "$(exists image "$img")" = "no" ] && note "removed image $img" || cleanup_failed "$img removal unconfirmed"
    else cleanup_failed "$img label='$lbl' not task-owned; retained"; fi
  done
  # Builder, its container and its cache volume are inventoried INDEPENDENTLY; deletion needs the
  # captured container identity plus the exact RW state-volume mount, else everything is retained.
  bst="$(exists builder "$BUILDER")"; cst="$(exists container "$BKC")"; vst="$(exists volume "$VOL")"
  [ "$bst" = "err" ] && cleanup_failed "builder $BUILDER state unknown"
  [ "$cst" = "err" ] && cleanup_failed "container $BKC state unknown"; [ "$vst" = "err" ] && cleanup_failed "volume $VOL state unknown"
  if [ "$cst" = "yes" ]; then
    if id="$(T 60 docker container inspect -f '{{.Id}}' "$BKC")" \
       && mounts="$(T 60 docker container inspect -f '{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}}:{{.RW}};{{end}}' "$BKC")" \
       && [ -n "$BKC_ID" ] && [ "$id" = "$BKC_ID" ] && [ "$mounts" = "$EXPECTED_BKC_MOUNTS" ]; then
      verified=1
    else cleanup_failed "$BKC failed identity/mount verification; retained"; fi
  fi
  if [ "$bst" = "yes" ] && [ "$verified" = 1 ]; then
    if T 180 docker buildx rm "$BUILDER" >/dev/null 2>&1 && [ "$(exists container "$BKC")" = "no" ]; then
      note "removed builder $BUILDER; container confirmed gone"
      # Volume deletion is gated on the verified ownership above AND confirmed container absence.
      case "$(exists volume "$VOL")" in
        (no) note "cache volume $VOL confirmed gone";;
        (yes) T 60 docker volume rm "$VOL" >/dev/null && [ "$(exists volume "$VOL")" = "no" ] \
          && note "removed owned cache volume $VOL" || cleanup_failed "cache volume $VOL removal unconfirmed";;
        (*) cleanup_failed "cache volume $VOL state unknown after builder removal";;
      esac
    else cleanup_failed "buildx rm $BUILDER failed or container persisted; cache volume untouched"; fi
  elif [ "$bst" = "yes" ]; then cleanup_failed "builder $BUILDER retained (container '$cst'/unverified)"
  else # no builder record: orphans are reported and RETAINED, never deleted blind
    [ "$cst" = "yes" ] && cleanup_failed "orphan buildkitd container $BKC retained (no builder record)"
    [ "$vst" = "yes" ] && cleanup_failed "orphan cache volume $VOL retained (no verified teardown)"
  fi
}
on_exit() {
  local rc=$?; cleanup
  [ "$rc" != 0 ] && FAIL=1; [ "$CLEANUP_FAIL" != 0 ] && FAIL=1
  note "done; results under $OUT (aborted_or_failed_rc=$rc cleanup_failed=$CLEANUP_FAIL exit=$FAIL)"
  exit "$FAIL"
}
trap on_exit EXIT; trap 'exit 130' INT TERM

# --- isolated builder: caps at CREATE time, exact verification, fail closed ---------------------
T 120 docker buildx create --name "$BUILDER" --driver docker-container \
  --driver-opt memory=2g --driver-opt memory-swap=2g \
  --driver-opt cpu-period=100000 --driver-opt cpu-quota=200000 >/dev/null \
  || die "builder create (with caps) failed"
T 300 docker buildx inspect --bootstrap --builder "$BUILDER" >/dev/null || die "builder bootstrap failed"
BKC_ID="$(T 60 docker container inspect -f '{{.Id}}' "$BKC")" || die "cannot capture builder container id"
read -r QUOTA PERIOD MEM SWAP < <(T 60 docker container inspect \
  -f '{{.HostConfig.CpuQuota}} {{.HostConfig.CpuPeriod}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}}' "$BKC") \
  || die "cannot inspect builder caps"
{ [ "$QUOTA" = "200000" ] && [ "$PERIOD" = "100000" ]; } || die "builder CPU caps not applied (quota='$QUOTA' period='$PERIOD')"
{ [ "$MEM" = "2147483648" ] && [ "$SWAP" = "2147483648" ]; } || die "builder memory caps not applied (mem='$MEM' swap='$SWAP')"
MOUNTS="$(T 60 docker container inspect -f '{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}}:{{.RW}};{{end}}' "$BKC")" \
  || die "cannot inspect builder mounts"
[ "$MOUNTS" = "$EXPECTED_BKC_MOUNTS" ] || die "unexpected builder mount surface: '$MOUNTS'"
note "builder $BUILDER verified (id=${BKC_ID:0:12} quota=$QUOTA period=$PERIOD mem=$MEM swap=$SWAP mounts=$MOUNTS)"

build() { # build <target> <tag> <log>; bounded at 15 min per image
  T 900 docker buildx build --builder "$BUILDER" --load --target "$1" -t "$2" \
    --label "${LABEL_KEY}=${TASK_ID}" \
    -f "$SCRIPT_DIR/validation.Dockerfile" "$CTX" 2>&1 | tee "$OUT/$3"
}

# --- unit: build + run (2 CPU / 2 GiB), run bounded at 30 min -----------------------------------
if build unit "$UNIT_IMG" unit-build.log; then
  if T 1800 docker run --name "$UNIT_CTR" --label "${LABEL_KEY}=${TASK_ID}" \
      --cpus 2 --memory 2g --memory-swap 2g "$UNIT_IMG" 2>&1 | tee "$OUT/unit-test.log"; then
    note "unit: PASS"
  else step_failed "unit tests"; fi
else step_failed "unit image build"; fi

# --- browser: detached run; PASS requires a successfully inspected exited/0 terminal state ------
if build browser "$BROWSER_IMG" browser-build.log; then
  if T 120 docker run -d --name "$BROWSER_CTR" --label "${LABEL_KEY}=${TASK_ID}" \
      --cpus 2 --memory 3g --memory-swap 3g --shm-size 1g \
      -e CHOKIDAR_USEPOLLING=1 "$BROWSER_IMG" >/dev/null; then
    DEADLINE=$(( $(date +%s) + 2400 )); STOPPED=0; STATUS="unknown" # 40 min ceiling
    while :; do
      STATUS="$(T 60 docker container inspect -f '{{.State.Status}}' "$BROWSER_CTR")" \
        || { step_failed "browser status inspection failed"; STATUS="unknown"; break; } # latch, no false PASS
      [ "$STATUS" != "running" ] && break
      if [ "$(date +%s)" -ge "$DEADLINE" ]; then
        if [ "$STOPPED" = 0 ]; then
          step_failed "browser tests timed out (40 min); stopping container" # latch BEFORE stop
          T 120 docker stop -t 20 "$BROWSER_CTR" >/dev/null || note "WARN: browser stop failed"
          STOPPED=1
        else step_failed "browser still running after stop"; break; fi
      fi
      sleep 15
    done
    EXIT_CODE="unknown"; if [ "$STATUS" = "exited" ]; then
      EXIT_CODE="$(T 60 docker container inspect -f '{{.State.ExitCode}}' "$BROWSER_CTR")" \
        || { step_failed "browser exit-code inspection failed"; EXIT_CODE="unknown"; }
    else step_failed "browser not in exited terminal state (status='$STATUS')"; fi
    T 300 docker logs "$BROWSER_CTR" > "$OUT/browser-test.log" 2>&1 || note "WARN: log capture failed"
    T 300 docker cp "$BROWSER_CTR:/workspace/apps/web/e2e/.results" "$OUT/e2e-results" \
      || note "WARN: no e2e results to copy" # preserved even on failure
    if [ "$STATUS" = "exited" ] && [ "$EXIT_CODE" = "0" ] && [ "$FAIL" = "0" ]; then note "browser: PASS"
    else step_failed "browser tests (status=$STATUS exit=$EXIT_CODE)"; fi
  else step_failed "browser container start"; fi
else step_failed "browser image build"; fi

exit "$FAIL"
