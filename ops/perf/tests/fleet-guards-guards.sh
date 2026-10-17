#!/bin/sh
# AIDEV-NOTE: Docker-only regression for fleet-guards.sh. Inside the lane container it writes its own small fake `docker`
# (state dir per case, one file per container: name|task|lane|run|mounts) and a fake `date` with an adjustable offset
# into /tmp, builds a payload from /repo (tar + sha256sum -b; git is absent so PAYLOAD.meta is minimal), and drives
# `sh /repo/ops/perf/tests/fleet-guards.sh` with PERF01_RESERVATION=regression against lanes under /tmp. Cases:
# (1) clean run => exit 0, four .exit files 0, reservation value absent from evidence, SHA256SUMS verifies, receipt line;
# (2) a foreign container already holding our exact name => create fails, the lookup finds it, the ownership inspect
#     says foreign => no stop/rm of it, exit 6; (3) the clock jumps past the deadline during the first suite => the other
#     suites are never attempted (no .attempted, no stop/rm for them), exit 9; (4) TERM during a suite wait => exit 143,
#     signal recorded, the container still proven removed; (5) PERF01_SUITE_TIMEOUT_RB=0600 or PERF01_TOTAL_BUDGET=03200
#     => exit 2 with zero docker calls and no lane created (case 1 passes the canonical 600 and 3200); (6) a sha256sum
#     shim failing on .tar (and proving it fired through a marker) makes pack-modes-guards.sh exit non-zero with a FAIL
#     line naming sha256sum; (7) `docker rm` failing and leaving the container => the runner must not claim absence:
#     exit 6, cleanup_verified=no, id still in the fake daemon, id-proof line in cleanup.log; (8) a `docker wait` whose
#     TERM handler writes "late" 5 s later (below the 20 s kill grace) => TERM to the runner yields exit 143, the group is
#     reaped and proven empty before the seal, SHA256SUMS still verifies 6 s later, "late" is in the lane tmp file but
#     not in the sealed .exit; (9) fallback: a `docker wait` that ignores TERM, SIGSTOPs its timeout wrapper, writes
#     "late" after 5 s and then stays alive for 120 s more (it must never reach its "normal-exit" line) => same verdicts,
#     KILL to the group recorded, the writer pid (recorded by the fake) gone or a zombie, "normal-exit" absent from the
#     .part, no live pid left in the recorded pgid; (10) mutant control: a COPY of the runner under /tmp with its
#     protection disabled by a deterministic sed (reap_wait a no-op, group_alive always empty, fd_holders always empty,
#     the wait writing straight into evidence), the edit proven (cmp differs, four MUTANT markers, sha256 of copy and
#     original printed), driven through the (9) scenario MUST fail the checks that (9) passes: "late" in the sealed
#     .exit, the live writer AND the stopped wrapper in the recorded pgid, and the seal broken (or beaten by the write);
#     (11) escape: a `docker wait` that starts `setsid sh -c '…sleep 5; echo late; sleep 120' &` (new session and group,
#     inherited stdout) and exits 0 normally => the real runner's descriptor scan finds the holder, copies nothing, writes
#     no SHA256SUMS, SHA256SUMS.FAILED names the pid, exit 8 (otherwise clean run), "late" nowhere in evidence; the suite
#     then KILLs the escaped pid by its recorded pid; (12) a PATH `find` shim that, for the runner's descriptor scan only,
#     prints a partial list, an error on a live own pid and exits 1 => exit 8, no SHA256SUMS, SHA256SUMS.FAILED names
#     scan-partial and its reason although nothing is alive; the same shim delegating cleanly => exit 0 and a verifying
#     seal (the shim path is not what fails); (13) PERF01_TEST_PROC_ROOT (regression-only, announced in evidence and on
#     stderr whenever set) points child_state at an empty directory so every stat read fails while /proc/<pid> exists =>
#     state unknown, never gone: no blocking wait (elapsed under a ceiling), abandon with state unknown, seal refused,
#     exit 143 on this TERM path, the abandoned child reaped by init after the runner exits; (14) a PATH `cp` shim failing
#     only for destinations ending in .wait.err => every suite's .exit is the runner's evidence-copy-failed marker,
#     status.txt names the failed copy, no SHA256SUMS, exit 8 on an otherwise clean run; (15) an escaped writer like (11)
#     that is NON-DUMPABLE at scan time (it runs an execute-only, mode 0111, copy of /bin/sh: Linux marks a process
#     non-dumpable when its executable is not readable, so its /proc/<pid>/fd is root-owned and unreadable to us while
#     /proc/<pid>/status stays world-readable with our uid; its sleep children redirect stdout/stderr to /dev/null so the
#     non-dumpable shell is the ONLY holder) => the suite first proves /proc/<writer>/fd is unreadable and Uid is ours,
#     then the runner's scan must report scan-partial:error-on-own-pid:<writer>, exit 8, no SHA256SUMS, SHA256SUMS.FAILED
#     naming the pid, "late" nowhere in evidence; the suite KILLs the writer and proves it gone. The dumpable control is
#     case (11). The foreign-uid branch cannot be exercised inside the container (single user) and is argued statically
#     in 7.3. Needs an exec-capable /tmp (the runner mounts its tmpfs with `exec`); the suite checks that first.
#     (16) function-level, demonstrably LIVE child: child_state, await_child and abandon_child are extracted from the
#     production runner (awk range child_state() { .. the } closing abandon_child; proven non-empty and byte-identical
#     to the same line range taken independently with sed) and sourced in a scratch sh that owns a `sleep 300`. With
#     PROC_ROOT=<empty dir> `await_child 2` must return 1 within 10 s (4 polls of 0.5 s) with CHILD_STATE=unknown while
#     the sleep is still alive (kill -0 and the real /proc stat letter S or R), then abandon_child must write the
#     wait-child-unreaped marker and WRITER_ALIVE unreaped-child=<pid>:unknown. Controls: PROC_ROOT=/proc on the same
#     live sleep returns 1 after the cap with CHILD_STATE=S; a child that already exited returns 0 at once, is waited,
#     and WST carries its status. The sleep is KILLed and reaped at the end. Case (13) stays as the integrated path.
#     (17) R8, the logs pair: the fake `docker logs` prints its line, then forks a setsid'd child that keeps the inherited
#     stdout (the .log.part), ignores TERM, writes "late" after 5 s and sleeps on; logs itself exits 0 => the logs step's
#     descriptor proof must catch it: exit 8, no SHA256SUMS, SHA256SUMS.FAILED naming the pid with step=logs, the suite's
#     .exit still 0 (the wait step was clean), <suite>.log the runner-owned wait-writer-alive marker, "late" in the lane
#     tmp .log.part after 6 s and nowhere in evidence, cleanup proven; then the suite KILLs the writer and proves it gone.
#     (18) a fake `docker logs` that ignores TERM and sleeps 200 s: the run returns inside a stated wall ceiling, the
#     .log in evidence carries the line written before the hang plus the bounded-exit note, the suite is NOT failed by
#     it, run exit 0 and SHA256SUMS verifies. Case (1) additionally asserts a .logs.pgid per suite, four "logs group …
#     proven empty … (copy)" lines and "fake suite log" in all four .log files; its wait-group count is anchored on
#     "wait group". Case (11) now expects the holder recorded twice (the wait step and the logs step both scan tmp/).
#     (19) R8-3, delayed pgid publication: a PATH `setsid` shim sleeps 3 s before exec'ing the real setsid, so the pgid
#     file appears late on every wait and logs launch, combined with the hanging logs call of (18) on one suite => the
#     run is still clean (exit 0, SHA256SUMS verifies, eight pgid files); every wait rec shows handshake_s >= 3 and
#     cap_s = w + SUITE_KILL + REAP_GRACE - handshake_s; the hung suite's logs rec shows lb 44, handshake_s >= 3,
#     cap_s = 44 + 5 + 5 - handshake_s and logs_wall_s <= 65 (the step stayed inside LOGS with the delay and a
#     TERM-ignoring call). Case (18) gains the control: without the shim handshake_s <= 1 and logs_wall_s <= 65.
#     R8-4 (cases 18 and 19): the hang fake records its start epoch and the first TERM it ignores (with its epoch) in
#     $FAKE_TERM_FILE and loops over sleep so a TERM-interrupted sleep does not end it; the suites assert logs_wall_s >= 49
#     (only the KILL at lb + KILL can end the call) and <= 65, the bounded-exit note with exit 137 exactly (coreutils
#     timeout 9.x returns 137 when it had to KILL after the timeout; no other code is accepted), exactly one recorded TERM
#     43..52 s after the fake's start, plus the unchanged absence and SHA256SUMS assertions.
#     R8-5 (lead, after the independent R8 review; cases 18 and 19): logs_wall_s alone could not distinguish "TERM at 44,
#     KILL at 49, fast proof and copy" from "KILL at 44 with no grace, slow proof and copy" (both read 49). The hang fake
#     now writes a 1 s heartbeat to $FAKE_TERM_FILE until the KILL, and lifetime_verdict requires TERM 43..47 s after the
#     start, the last heartbeat 4..7 s after the TERM (the 5 s grace, 1 s granularity) and an observed heartbeat span of
#     47..52 s; two synthetic term files prove the verdict rejects the premature-KILL timeline and accepts the intended one.
#     R8-7 (lead, after the independent review of R8-5): a 48 s span floor rejected a correct timer under ordinary startup
#     and second rounding (span 47); the floor is 47, the span is described as observed scheduling evidence rather than the
#     exact call lifetime, and a third synthetic term file at that rounded boundary must pass.
#     R8-6 (lead, same review): rv accepted a numeric prefix with trailing junk and the concatenated validation let a
#     missing field reach the arithmetic as 0; rv now matches only a complete token (digits, an optional literal suffix
#     such as "s)" for wait_bound, then whitespace or end of line) and every field is validated on its own with num, which
#     records a bad naming the field; a synthetic status line proves the strict extraction.
#     Handshake: every interrupted case waits for the marker the fake wait creates AFTER installing its handler
#     (FAKE_READY_FILE), then TERMs the runner; no TERM is sent blind. Fake daemon semantics: `stop` only marks a
#     container stopped (ps -a still lists it); only `rm` deletes it, so rm is the proof of removal. tests/fakebin/docker
#     is frozen and not used here. Writes only under /tmp. Exit 0 iff every assertion passes.
set -eu
REPO=${1:-/repo}
WORK=${TMPDIR:-/tmp}/perf01-fleet-guards-$$
mkdir -p "$WORK/bin" "$WORK/pay" "$WORK/shim"
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "ok   $*"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $*"; }
assert_eq() { if [ "$1" = "$2" ]; then ok "$3 ($1)"; else bad "$3: expected '$2' got '$1'"; fi; }
RUNNER="$REPO/ops/perf/tests/fleet-guards.sh"
ALL='pack-modes-guards fleet-guards-guards run-baseline-guards cleanup-guards'

cat > "$WORK/bin/docker" <<'FAKE'
#!/bin/sh
# fake docker: state in $FAKE_STATE (file per id: name|task|lane|run|mounts); every invocation is appended to $FAKE_LOG.
set -u
echo "$*" >> "$FAKE_LOG"
cmd=$1; shift
suite_of() { s=${1#perf01-guards-}; echo "${s#*-}"; }
case "$cmd" in
  image) echo sha256:fakeimage; exit 0 ;;
  volume|network) exit 0 ;;
  ps)
    fn=''; fid=''; fl=''
    while [ $# -gt 0 ]; do
      if [ "$1" = --filter ]; then case $2 in name=*) fn=${2#name=^}; fn=${fn%\$} ;; id=*) fid=${2#id=} ;; label=*) fl=${2#label=} ;; esac; shift; fi
      shift
    done
    for f in "$FAKE_STATE"/*; do
      case "$f" in *.stopped) continue ;; esac
      [ -f "$f" ] || continue; i=$(basename "$f"); IFS='|' read -r n t l r m < "$f"
      [ -z "$fn" ] || [ "$n" = "$fn" ] || continue
      [ -z "$fid" ] || [ "$i" = "$fid" ] || continue
      [ -z "$fl" ] || [ "$fl" = "elevateo.perf.lane=$l" ] || continue
      echo "$i"
    done; exit 0 ;;
  create)
    n=''; t=''; l=''; r=''; src=''
    while [ $# -gt 0 ]; do
      case $1 in --name) n=$2; shift ;; --label) case $2 in elevateo.perf.task=*) t=${2#*=} ;; elevateo.perf.lane=*) l=${2#*=} ;; elevateo.perf.run=*) r=${2#*=} ;; esac; shift ;; --mount) src=${2#*src=}; src=${src%%,*}; shift ;; esac
      shift
    done
    id=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
    if [ "$(suite_of "$n")" = "${FAKE_COLLIDE_SUITE-}" ]; then   # a foreign container already holds our exact name
      echo "$n|other-task|other-lane|other-run|bind:/srv/foreign:/data;" > "$FAKE_STATE/$id"
      echo "Error: Conflict. The container name $n is already in use" >&2; exit 125
    fi
    echo "$n|$t|$l|$r|bind:$src:/repo;" > "$FAKE_STATE/$id"; echo "$id"; exit 0 ;;
  start) exit 0 ;;
  wait)
    f="$FAKE_STATE/$1"; [ -f "$f" ] || { echo "Error: No such container: $1" >&2; exit 1; }
    IFS='|' read -r n t l r m < "$f"; s=$(suite_of "$n")
    # Interruptible modes create $FAKE_READY_FILE only AFTER their handler is installed (deterministic handshake).
    case "$s" in
      "${FAKE_LATE_SUITE-}")   trap 'sleep 5; echo late; exit 0' TERM; : > "${FAKE_READY_FILE:?}"; sleep 60 ;;   # TERM honoured late
      "${FAKE_STOP_WRAPPER_SUITE-}")           # ignores TERM, stops its wrapper, writes late at 5 s, then outlives any escalation
        trap '' TERM; kill -STOP "$PPID"; echo $$ > "${FAKE_WRITER_PID_FILE:?}"; : > "${FAKE_READY_FILE:?}"
        sleep 5; echo late; sleep 120; echo normal-exit; exit 0 ;;
      "${FAKE_ESCAPE_SUITE-}")                 # leaves the group (own session) but keeps the inherited stdout; wait itself exits 0
        setsid sh -c 'echo $$ > "$1"; trap "" TERM; sleep 5; echo late; sleep 120; echo normal-exit' sh "${FAKE_WRITER_PID_FILE:?}" &
        sleep 0.2 ;;
      "${FAKE_ESCAPE_XO_SUITE-}")              # same escape, but the writer is an execute-only sh copy: non-dumpable, fd dir unreadable
        setsid "${FAKE_XO_SH:?}" -c 'echo $$ > "$1"; trap "" TERM; sleep 5 >/dev/null 2>&1; echo late; sleep 120 >/dev/null 2>&1; echo normal-exit' sh "${FAKE_WRITER_PID_FILE:?}" &
        sleep 0.2 ;;
      "${FAKE_SLEEP_SUITE-}")  : > "${FAKE_READY_FILE:?}"; sleep "${FAKE_SLEEP_SECONDS-30}" ;;
      "${FAKE_SKEW_SUITE-}")   echo 100000 > "$FAKE_DATE_OFFSET_FILE" ;;
    esac
    echo 0; exit 0 ;;
  logs)
    echo "fake suite log"
    f="$FAKE_STATE/${1-}"; ls_s=''; [ ! -f "$f" ] || { IFS='|' read -r n t l r m < "$f"; ls_s=$(suite_of "$n"); }
    case "$ls_s" in
      '') ;;
      "${FAKE_LOGS_ESCAPE_SUITE-}")   # a child escapes to its own session but keeps the inherited stdout (the .log.part); logs itself exits 0
        setsid sh -c 'echo $$ > "$1"; trap "" TERM; sleep 5; echo late; sleep 120; echo normal-exit' sh "${FAKE_WRITER_PID_FILE:?}" &
        sleep 0.2 ;;
      "${FAKE_LOGS_HANG_SUITE-}")     # ignores TERM (but records the first one with its epoch) and outlives LOGS_RUN; only KILL ends it
        tf=${FAKE_TERM_FILE:-/dev/null}; echo "start $(date +%s)" >> "$tf"
        trap 'grep -q "^term-received" "$tf" 2>/dev/null || echo "term-received $(date +%s)" >> "$tf"' TERM
        echo $$ > "${FAKE_WRITER_PID_FILE:?}"
        # R8-5: a 1 s heartbeat is the call-lifetime evidence (its last line marks the KILL instant to within a second);
        # TERM interrupts the sleep, runs the trap, and the loop goes on until KILL.
        while :; do echo "alive $(date +%s)" >> "$tf"; sleep 1; done ;;
    esac
    exit 0 ;;
  inspect) f="$FAKE_STATE/$3"; [ -f "$f" ] || { echo "Error: No such object: $3" >&2; exit 1; }; IFS='|' read -r n t l r m < "$f"; echo "$t|$l|$r|$m"; exit 0 ;;
  stop) for a in "$@"; do :; done; f="$FAKE_STATE/$a"; [ -f "$f" ] || { echo "Error: No such container: $a" >&2; exit 1; }; : > "$f.stopped"; exit 0 ;;
  rm)
    for a in "$@"; do :; done; f="$FAKE_STATE/$a"; [ -f "$f" ] || { echo "Error: No such container: $a" >&2; exit 1; }
    IFS='|' read -r n t l r m < "$f"
    [ "$(suite_of "$n")" != "${FAKE_RM_FAIL_SUITE-}" ] || { echo "Error response from daemon: cannot remove $a (scripted)" >&2; exit 1; }
    rm -f "$f" "$f.stopped"; exit 0 ;;
  *) echo "fake docker: unsupported $cmd" >&2; exit 1 ;;
esac
FAKE
cat > "$WORK/bin/date" <<'FAKE'
#!/bin/sh
# fake date: `date +%s` adds the offset found in $FAKE_DATE_OFFSET_FILE (if any); everything else is the real date.
off=0; [ -r "${FAKE_DATE_OFFSET_FILE-}" ] && off=$(cat "$FAKE_DATE_OFFSET_FILE")
for real in /usr/bin/date /bin/date; do [ -x "$real" ] && break; done
if [ "$#" -eq 1 ] && [ "$1" = +%s ]; then echo $(( $("$real" +%s) + off )); else exec "$real" "$@"; fi
FAKE
cat > "$WORK/shim/sha256sum" <<'FAKE'
#!/bin/sh
for a in "$@"; do case "$a" in *.tar) : > "${SHIM_FIRED:?}"; echo "shim: scripted sha256sum failure on $a" >&2; exit 1 ;; esac; done
exec /usr/bin/sha256sum "$@"
FAKE
# Execute-only copy of /bin/sh for case 15: a process whose executable it cannot read is non-dumpable (fs/exec.c
# would_dump), so its /proc/<pid>/fd becomes root-owned and unreadable to the same uid. Checked before use.
mkdir -p "$WORK/xo"; cp /bin/sh "$WORK/xo/sh"; chmod 0111 "$WORK/xo/sh"
mkdir -p "$WORK/findshim" "$WORK/cpshim" "$WORK/setsidshim"
cat > "$WORK/setsidshim/setsid" <<'FAKE'
#!/bin/sh
# fake setsid (case 19 only, via EXTRA_PATH): publishes the pgid late by sleeping 3 s before exec'ing the real setsid, so
# both the wait and the logs launch see a slow handshake while the child itself still behaves normally.
for real in /usr/bin/setsid /bin/setsid; do [ -x "$real" ] && break; done
sleep 3
exec "$real" "$@"
FAKE
cat > "$WORK/findshim/find" <<'FAKE'
#!/bin/sh
# fake find (case 12 only, via EXTRA_PATH): for the runner's descriptor scan (the -lname call) and FIND_MODE=partial it
# prints a partial list, an error on a live own pid (its parent, the --scan child) and exits 1; otherwise the real find.
for real in /usr/bin/find /bin/find; do [ -x "$real" ] && break; done
case " $* " in *" -lname "*) case "${FIND_MODE-}" in partial)
  echo "/proc/$PPID/fd/0"; echo "find: '/proc/$PPID/fd': Permission denied" >&2; exit 1 ;; esac ;; esac
exec "$real" "$@"
FAKE
cat > "$WORK/cpshim/cp" <<'FAKE'
#!/bin/sh
# fake cp (case 14 only, via EXTRA_PATH): fails when the destination ends with $CP_FAIL_SUFFIX; otherwise the real cp.
for real in /usr/bin/cp /bin/cp; do [ -x "$real" ] && break; done
for a in "$@"; do :; done
case "${CP_FAIL_SUFFIX-}" in '') ;; *) case "$a" in *"$CP_FAIL_SUFFIX") echo "cp: scripted failure for $a" >&2; exit 1 ;; esac ;; esac
exec "$real" "$@"
FAKE
chmod 0755 "$WORK/bin/docker" "$WORK/bin/date" "$WORK/shim/sha256sum" "$WORK/findshim/find" "$WORK/cpshim/cp" "$WORK/setsidshim/setsid"
EXTRA_PATH=''   # a shim directory prepended to the runner's PATH by one case at a time

# A payload exactly as the runner's MEMBERS block demands, from /repo; manifest with `sha256sum -b` like pack-guards.sh.
awk '/^MEMBERS$/ { f = 0 } f { print } /<<.MEMBERS.$/ { f = 1 }' "$RUNNER" > "$WORK/members.list"
assert_eq "$(wc -l < "$WORK/members.list" | tr -d ' ')" 25 "MEMBERS block has 25 entries"
: > "$WORK/pay/PAYLOAD.sha256"; : > "$WORK/tarlist"
while IFS= read -r m; do
  case "$m" in PAYLOAD.*) ;; */) echo "${m%/}" >> "$WORK/tarlist" ;; *) ( cd "$REPO" && sha256sum -b -- "$m" ) >> "$WORK/pay/PAYLOAD.sha256"; echo "$m" >> "$WORK/tarlist" ;; esac
done < "$WORK/members.list"
echo "packer=fleet-guards-guards regression payload (no git in the image)" > "$WORK/pay/PAYLOAD.meta"
tar --format=ustar --no-recursion --mtime=@1767225600 --owner=0 --group=0 --numeric-owner --mode=u=rw,go=r,a+X \
    -cf "$WORK/payload.tar" -C "$REPO" -T "$WORK/tarlist" -C "$WORK/pay" PAYLOAD.sha256 PAYLOAD.meta
SHA=$(sha256sum "$WORK/payload.tar" | cut -d' ' -f1)

# run_fg <case> [VAR=value ...]: fresh fake daemon state and lane; sets RC, STATE, LOG, LANE, EVID.
run_fg() {
  c=$1; shift
  STATE="$WORK/$c.state"; LOG="$WORK/$c.docker.log"; LANE="$WORK/$c.lane"; OFF="$WORK/$c.offset"
  WPID="$WORK/$c.writer.pid"; mkdir -p "$STATE"; : > "$LOG"; rm -f "$OFF" "$WPID"; RC=0
  env PATH="${EXTRA_PATH:+$EXTRA_PATH:}$WORK/bin:$PATH" FAKE_STATE="$STATE" FAKE_LOG="$LOG" FAKE_DATE_OFFSET_FILE="$OFF" FAKE_WRITER_PID_FILE="$WPID" PERF01_RESERVATION=regression \
    "$@" sh "$RUNNER" "$WORK/payload.tar" "$SHA" "$LANE" > "$WORK/$c.out" 2> "$WORK/$c.err" || RC=$?
  EVID="$LANE/evidence"
}
# term_run <label> <case> [VAR=value ...]: runner (${RUN_WITH:-$RUNNER}) in the background; waits (<= 30 s) for the fake
# wait's ready marker, which exists only once its handler is installed, then TERMs the runner. Sets RC, STATE, LOG, LANE, EVID.
term_run() {
  lbl=$1; c=$2; shift 2
  STATE="$WORK/$c.state"; LOG="$WORK/$c.docker.log"; LANE="$WORK/$c.lane"; READY="$WORK/$c.ready"; WPID="$WORK/$c.writer.pid"
  mkdir -p "$STATE"; : > "$LOG"; rm -f "$READY" "$WPID"
  env PATH="${EXTRA_PATH:+$EXTRA_PATH:}$WORK/bin:$PATH" FAKE_STATE="$STATE" FAKE_LOG="$LOG" FAKE_READY_FILE="$READY" FAKE_WRITER_PID_FILE="$WPID" PERF01_RESERVATION=regression \
    "$@" sh "${RUN_WITH:-$RUNNER}" "$WORK/payload.tar" "$SHA" "$LANE" > "$WORK/$c.out" 2> "$WORK/$c.err" &
  PID=$!
  i=0; while [ ! -e "$READY" ]; do i=$((i + 1)); [ "$i" -le 300 ] || break; sleep 0.1; done
  if [ -e "$READY" ]; then ok "$lbl handshake: the fake wait installed its handler and signalled readiness"; else bad "$lbl handshake marker never appeared; TERM sent blind"; fi
  kill -TERM "$PID" 2>/dev/null || true
  RC=0; wait "$PID" || RC=$?
  EVID="$LANE/evidence"
}
# alive_in_group <pgid>: pids of non-zombie processes in that group (same /proc method as the runner, independent copy).
alive_in_group() {
  g=$1
  for st in /proc/[0-9]*/stat; do
    IFS= read -r s < "$st" 2>/dev/null || continue
    s=${s##*) }; set -- $s
    if [ "${3-}" = "$g" ] && [ "${1-}" != Z ]; then p=${st#/proc/}; echo "${p%/stat}"; fi
  done
  return 0
}
# reap_checks <label> <suite> <pause>: the shared verdicts of cases (8) and (9).
reap_checks() {
  assert_eq "$RC" 143 "$1 exit 143"
  assert_eq "$(grep -c '^cleanup_verified=yes$' "$EVID/status.txt" || true)" 1 "$1 cleanup proven"
  RC2=0; grep -q 'terminated and reaped' "$EVID/status.txt" || RC2=$?
  assert_eq "$RC2" 0 "$1 the pending wait was reaped before the seal"
  assert_eq "$(grep -c '^wait_groups_live=none$' "$EVID/status.txt" || true)" 1 "$1 pre-seal proof found no live writer"
  pg=$(cat "$EVID/$2.wait.pgid" 2>/dev/null || echo none)
  case "$pg" in ''|none|*[!0-9]*) bad "$1 no pgid recorded for the interrupted wait" ;; *) ok "$1 pgid recorded ($pg)" ;; esac
  assert_eq "$(alive_in_group "$pg" | wc -w | tr -d ' ')" 0 "$1 no live process left in the recorded group"
  sleep "$3"
  RC2=0; ( cd "$EVID" && sha256sum -c --status SHA256SUMS ) || RC2=$?
  assert_eq "$RC2" 0 "$1 SHA256SUMS still verifies ${3}s after the runner exited (writer delay 5 s)"
  assert_eq "$(grep -c late "$LANE/tmp/$2.exit.part" || true)" 1 "$1 the writer did write late into the lane tmp file (hazard exercised)"
  assert_eq "$(grep -c late "$EVID/$2.exit" || true)" 0 "$1 no late write reached the sealed .exit file"
  assert_eq "$(grep -c '^interrupted (signal TERM)' "$EVID/$2.exit" || true)" 1 "$1 the interrupted suite carries the runner's own marker"
}

echo "== (1) clean run with canonical tunables"
run_fg c1 PERF01_SUITE_TIMEOUT_RB=600 PERF01_TOTAL_BUDGET=3200
assert_eq "$RC" 0 "(1) exit 0"
for s in $ALL; do assert_eq "$(head -1 "$EVID/$s.exit" 2>/dev/null || echo none)" 0 "(1) $s exit 0"; done
assert_eq "$(grep -c '^create ' "$LOG" || true)" 4 "(1) four creates"
assert_eq "$(grep -c 'regression' "$EVID/status.txt" || true)" 0 "(1) reservation value absent from evidence"
assert_eq "$(grep -c 'reservation=set' "$EVID/status.txt" || true)" 1 "(1) reservation recorded as set only"
assert_eq "$(grep -c '^cleanup_verified=yes$' "$EVID/status.txt" || true)" 1 "(1) cleanup verified"
assert_eq "$(grep -c '^budget_used_pre_seal_s=' "$EVID/status.txt" || true)" 1 "(1) pre-seal wording in status.txt"
assert_eq "$(grep -c 'total wall .*external receipt' "$WORK/c1.err" || true)" 1 "(1) receipt line on stderr after the seal"
RC2=0; ( cd "$EVID" && sha256sum -c --status SHA256SUMS ) || RC2=$?
assert_eq "$RC2" 0 "(1) SHA256SUMS verifies"
assert_eq "$(ls "$STATE" | wc -l | tr -d ' ')" 0 "(1) the fake daemon holds nothing afterwards (only rm deletes)"
assert_eq "$(grep -c '^rm -f ' "$LOG" || true)" 4 "(1) four rm calls, one per container"
assert_eq "$(grep -c '^create .* --init ' "$LOG" || true)" 4 "(1) every create carries --init"
assert_eq "$(ls "$EVID"/*.wait.pgid | wc -l | tr -d ' ')" 4 "(1) a pgid was recorded for every wait"
assert_eq "$(grep -c 'wait group .* proven empty by /proc scan and no descriptor held under .* (copy)' "$EVID/status.txt" || true)" 4 "(1) every wait group proven empty and unheld before its outputs were copied"
assert_eq "$(ls "$EVID"/*.logs.pgid | wc -l | tr -d ' ')" 4 "(1) a pgid was recorded for every logs pair (R8: logs run like the wait)"
assert_eq "$(grep -c 'logs group .* proven empty by /proc scan and no descriptor held under .* (copy)' "$EVID/status.txt" || true)" 4 "(1) every logs group proven empty and unheld before its output was copied"
for s in $ALL; do assert_eq "$(grep -c '^fake suite log$' "$EVID/$s.log" || true)" 1 "(1) $s.log was copied from the logs pair's output"; done
assert_eq "$(grep -c 'TEST OVERRIDE' "$EVID/status.txt" || true)" 0 "(1) no test override recorded in a normal run"
assert_eq "$(grep -c '^test_override_proc_root=none$' "$EVID/status.txt" || true)" 1 "(1) status.txt says no override"

echo "== (2) a foreign container carries our exact name: never stopped or removed, exit 6"
run_fg c2 FAKE_COLLIDE_SUITE=run-baseline-guards
assert_eq "$RC" 6 "(2) exit 6"
fid=$(ls "$STATE")
assert_eq "$(echo "$fid" | wc -w | tr -d ' ')" 1 "(2) exactly the foreign container remains"
assert_eq "$(grep -c "^stop -t 5 $fid\$" "$LOG" || true)" 0 "(2) foreign never stopped"
assert_eq "$(grep -c "^rm -f $fid\$" "$LOG" || true)" 0 "(2) foreign never removed"
RC2=0; grep -q 'foreign container with our name' "$EVID/cleanup.log" || RC2=$?
assert_eq "$RC2" 0 "(2) cleanup.log names the foreign container"

echo "== (3) the clock jumps past the deadline during the first suite: later suites never attempted, nothing of theirs touched"
run_fg c3 FAKE_SKEW_SUITE=pack-modes-guards
assert_eq "$RC" 9 "(3) exit 9"
assert_eq "$(ls "$EVID"/*.attempted | wc -l | tr -d ' ')" 1 "(3) exactly one .attempted marker"
assert_eq "$(grep -c '^create ' "$LOG" || true)" 1 "(3) one create issued"
assert_eq "$(grep -c '^stop ' "$LOG" || true)" 1 "(3) one stop (the attempted suite only)"
assert_eq "$(grep -c '^rm ' "$LOG" || true)" 1 "(3) one rm (the attempted suite only)"
assert_eq "$(grep -c '^deadline_cut_step=pack-modes-guards/logs$' "$EVID/status.txt" || true)" 1 "(3) cut step recorded"
assert_eq "$(grep -c 'never attempted; inventory only' "$EVID/cleanup.log" || true)" 3 "(3) three suites inventory-only"
assert_eq "$(grep -c '^fleet-guards-guards.attempted=no$' "$EVID/status.txt" || true)" 1 "(3) status says not attempted"

echo "== (4) TERM during a suite wait: exit 143, signal recorded, container still proven removed"
term_run "(4)" c4 FAKE_SLEEP_SUITE=pack-modes-guards FAKE_SLEEP_SECONDS=30
assert_eq "$RC" 143 "(4) exit 143"
assert_eq "$(grep -c '^signal=TERM$' "$EVID/status.txt" || true)" 1 "(4) signal recorded"
assert_eq "$(grep -c '^cleanup_verified=yes$' "$EVID/status.txt" || true)" 1 "(4) cleanup proven"
assert_eq "$(grep -c '^stop -t 5 ' "$LOG" || true)" 1 "(4) the interrupted container was stopped"
assert_eq "$(grep -c '^rm -f ' "$LOG" || true)" 1 "(4) the interrupted container was removed (rm is the proof)"
assert_eq "$(ls "$STATE" | wc -l | tr -d ' ')" 0 "(4) nothing left in the fake daemon"
if [ -f "$EVID/SHA256SUMS" ]; then ok "(4) evidence sealed"; else bad "(4) SHA256SUMS missing"; fi

echo "== (5) leading-zero tunables are refused before any docker call"
run_fg c5a PERF01_SUITE_TIMEOUT_RB=0600
assert_eq "$RC" 2 "(5) 0600 => exit 2"; assert_eq "$(wc -c < "$LOG" | tr -d ' ')" 0 "(5) zero docker calls"
if [ ! -e "$LANE" ]; then ok "(5) no lane created"; else bad "(5) lane created despite refusal"; fi
run_fg c5b PERF01_TOTAL_BUDGET=03200
assert_eq "$RC" 2 "(5) 03200 => exit 2"; assert_eq "$(wc -c < "$LOG" | tr -d ' ')" 0 "(5) zero docker calls"
if [ ! -e "$LANE" ]; then ok "(5) no lane created for 03200"; else bad "(5) lane created despite refusal (03200)"; fi

echo "== (6) pack-modes-guards.sh fails loudly when sha256sum fails"
RC=0; SHIM_FIRED="$WORK/c6.shim-fired" PATH="$WORK/shim:$PATH" sh "$REPO/ops/perf/tests/pack-modes-guards.sh" "$REPO" > "$WORK/c6.out" 2>&1 || RC=$?
if [ "$RC" -ne 0 ]; then ok "(6) non-zero exit ($RC)"; else bad "(6) exited 0 despite a failing sha256sum"; fi
if [ -e "$WORK/c6.shim-fired" ]; then ok "(6) the shim was reached"; else bad "(6) the shim never fired; the case proved nothing"; fi
RC2=0; grep -q '^FAIL sha256sum failed on ' "$WORK/c6.out" || RC2=$?
assert_eq "$RC2" 0 "(6) the FAIL line names sha256sum"

echo "== (7) a failing docker rm must never be reported as absence"
run_fg c7 FAKE_RM_FAIL_SUITE=run-baseline-guards
assert_eq "$RC" 6 "(7) exit 6"
assert_eq "$(grep -c '^cleanup_verified=no$' "$EVID/status.txt" || true)" 1 "(7) cleanup_verified=no"
assert_eq "$(ls "$STATE" | grep -vc '\.stopped$' || true)" 1 "(7) the container is still in the fake daemon"
sid=$(ls "$STATE" | grep -v '\.stopped$')
RC2=0; grep -q "id $sid NOT proven absent" "$EVID/cleanup.log" || RC2=$?
assert_eq "$RC2" 0 "(7) the id-proof line names the surviving container"
assert_eq "$(grep -c '^stop -t 5 ' "$LOG" || true)" 5 "(7) stop succeeded five times (incl. the exit-trap retry) yet absence was never claimed"
assert_eq "$(grep -c '^rm -f ' "$LOG" || true)" 5 "(7) rm was attempted five times (incl. the retry) and failed twice for the surviving container"

echo "== (8) a docker wait whose TERM handler writes late (5 s, below the grace) cannot reach sealed evidence"
term_run "(8)" c8 FAKE_LATE_SUITE=pack-modes-guards
reap_checks "(8)" pack-modes-guards 6

echo "== (9) fallback: a docker wait that ignores TERM and SIGSTOPs its wrapper is KILLed by group and proven gone"
term_run "(9)" c9 FAKE_STOP_WRAPPER_SUITE=pack-modes-guards
reap_checks "(9)" pack-modes-guards 6
RC2=0; grep -q 'KILL sent to the group' "$EVID/status.txt" || RC2=$?
assert_eq "$RC2" 0 "(9) the group needed KILL (TERM was ignored, the wrapper was stopped) and the runner recorded it"
assert_eq "$(grep -c normal-exit "$LANE/tmp/pack-modes-guards.exit.part" || true)" 0 "(9) the writer never reached normal-exit: it was KILLed, not finished"
wp=$(cat "$WPID" 2>/dev/null || echo none)
case "$wp" in ''|none|*[!0-9]*) bad "(9) the fake recorded no writer pid" ;; *)
  ws=$( { IFS= read -r x < "/proc/$wp/stat"; } 2>/dev/null && { x=${x##*) }; set -- $x; echo "${1-}"; } || echo gone)
  case "$ws" in gone|Z) ok "(9) writer pid $wp is $ws (KILLed by group, TERM ignored)" ;; *) bad "(9) writer pid $wp still alive in state $ws" ;; esac ;;
esac

echo "== (10) mutant control: the runner with its protection disabled (copy under /tmp) must FAIL the (9) scenario"
MUT="$WORK/mutant"; mkdir -p "$MUT"
cat > "$MUT/disable.sed" <<'SED'
/^reap_wait() {$/a\
  WAIT_PID=''; return 0   # MUTANT: no group termination, no reap
/^group_alive() {$/a\
  return 0   # MUTANT: the group absence proof always passes
/^fd_holders() {$/a\
  return 0   # MUTANT: the descriptor absence proof always passes
s|^    > "\$TMPW/\$suite\.exit\.part" 2> "\$TMPW/\$suite\.wait\.err\.part" &$|    > "$EVID/$suite.exit" 2> "$EVID/$suite.wait.err" \&   # MUTANT: the writer holds the sealed inode|
SED
sed -f "$MUT/disable.sed" "$RUNNER" > "$MUT/fleet-guards.sh"
echo "production $(sha256sum "$RUNNER" | cut -d' ' -f1)"; echo "mutant     $(sha256sum "$MUT/fleet-guards.sh" | cut -d' ' -f1)  ($MUT/fleet-guards.sh, never written to /repo)"
if cmp -s "$RUNNER" "$MUT/fleet-guards.sh"; then bad "(10) the mutant is byte-identical to the production runner; nothing was disabled"; else ok "(10) the mutant differs from the production runner"; fi
assert_eq "$(grep -c '# MUTANT' "$MUT/fleet-guards.sh" || true)" 4 "(10) all four disabling edits applied (reap_wait no-op, group_alive empty, fd_holders empty, wait writing into evidence)"
assert_eq "$(grep -c '# MUTANT' "$RUNNER" || true)" 0 "(10) the production runner carries no mutant marker"
RUN_WITH="$MUT/fleet-guards.sh"; term_run "(10)" c10 FAKE_STOP_WRAPPER_SUITE=pack-modes-guards; RUN_WITH=''
assert_eq "$RC" 143 "(10) the mutant still exits 143 (the defect is silent at the exit code)"
pg=$(cat "$EVID/pack-modes-guards.wait.pgid" 2>/dev/null || echo none)
mut_alive=$(alive_in_group "$pg" | wc -w | tr -d ' ')
if [ "$mut_alive" -ge 2 ]; then ok "(10) $mut_alive live processes remain in the mutant's wait group: the TERM-ignoring writer and the stopped wrapper the real runner KILLs"
else bad "(10) fewer than two survivors ($mut_alive) in the mutant's wait group; the scenario did not exercise the defect"; fi
wp=$(cat "$WPID" 2>/dev/null || echo none)
case "$wp" in ''|none|*[!0-9]*) bad "(10) no writer pid recorded" ;; *) if [ -d "/proc/$wp" ]; then ok "(10) the writer pid $wp is still alive under the mutant"; else bad "(10) the writer pid $wp is gone under the mutant"; fi ;; esac
sleep 6
RC2=0; ( cd "$EVID" && sha256sum -c --status SHA256SUMS ) || RC2=$?
late_in_exit=$(grep -c late "$EVID/pack-modes-guards.exit" || true)
assert_eq "$late_in_exit" 1 "(10) the writer's late text IS in the mutant's sealed .exit (the real runner keeps it out)"
if [ "$RC2" -ne 0 ]; then ok "(10) the mutant's SHA256SUMS no longer verifies: the regression detects the original defect"
elif [ "$late_in_exit" -eq 1 ]; then ok "(10) the write landed before the mutant sealed (slow host); the sealed content itself shows the defect"
else bad "(10) the mutant passed every check the real runner passes; the regression does not discriminate the defect"; fi
case "$pg" in ''|none|*[!0-9]*) ;; *) kill -KILL "-$pg" 2>/dev/null || true ;; esac   # tidy the writer and the stopped wrapper the mutant left behind

echo "== (11) escape: a writer that leaves the group with setsid but keeps the inherited stdout is caught by the descriptor scan"
run_fg c11 FAKE_ESCAPE_SUITE=pack-modes-guards
assert_eq "$RC" 8 "(11) exit 8: the seal is refused on an otherwise clean run"
assert_eq "$(grep -c '^cleanup_verified=yes$' "$EVID/status.txt" || true)" 1 "(11) cleanup still proven (the refusal is about evidence, not containers)"
if [ -f "$EVID/SHA256SUMS" ]; then bad "(11) SHA256SUMS was published despite a live descriptor holder"; else ok "(11) no SHA256SUMS published"; fi
wp=$(cat "$WPID" 2>/dev/null || echo none)
case "$wp" in ''|none|*[!0-9]*) bad "(11) the fake recorded no escaped writer pid" ;; *)
  RC2=0; grep -Eq "(^|[^0-9])$wp([^0-9]|\$)" "$EVID/SHA256SUMS.FAILED" 2>/dev/null || RC2=$?
  assert_eq "$RC2" 0 "(11) SHA256SUMS.FAILED names the escaped writer pid $wp"
  RC2=0; grep -q 'evidence writer alive' "$EVID/SHA256SUMS.FAILED" 2>/dev/null || RC2=$?
  assert_eq "$RC2" 0 "(11) SHA256SUMS.FAILED carries the fail-closed wording"
  pg=$(cat "$EVID/pack-modes-guards.wait.pgid" 2>/dev/null || echo none)
  assert_eq "$(alive_in_group "$pg" | wc -w | tr -d ' ')" 0 "(11) nothing lives in the wait's own group $pg: the group scan alone could not have seen the writer"
  if [ "$(alive_in_group "$wp" | wc -w | tr -d ' ')" -gt 0 ]; then ok "(11) the escaped writer lives in its own session/group $wp"; else bad "(11) the escaped writer is not alive in its own group; the escape was not exercised"; fi ;;
esac
assert_eq "$(grep -c '^wait-writer-alive' "$EVID/pack-modes-guards.exit" || true)" 1 "(11) the suite's .exit is the runner's own holder marker, not a copy of the writer's output"
assert_eq "$(grep -c 'descriptor holders under' "$EVID/status.txt" || true)" 2 "(11) status.txt records the descriptor holder on both steps that scan tmp/ (wait, then logs; R8)"
sleep 6
assert_eq "$(grep -c late "$LANE/tmp/pack-modes-guards.exit.part" || true)" 1 "(11) the escaped writer did write late into the lane tmp file (hazard exercised)"
assert_eq "$(grep -rlx late "$EVID" | wc -l | tr -d ' ')" 0 "(11) late is nowhere in evidence"
case "$wp" in ''|none|*[!0-9]*) ;; *) kill -KILL "-$wp" 2>/dev/null || kill -KILL "$wp" 2>/dev/null || true ;; esac   # the escaped session's pgid is its pid

echo "== (12) a failing or partial descriptor scan is never a clean pass"
EXTRA_PATH="$WORK/findshim"; run_fg c12 FIND_MODE=partial; EXTRA_PATH=''
assert_eq "$RC" 8 "(12) exit 8 although nothing is alive: the scan itself failed"
assert_eq "$(grep -c '^cleanup_verified=yes$' "$EVID/status.txt" || true)" 1 "(12) cleanup still proven"
if [ -f "$EVID/SHA256SUMS" ]; then bad "(12) SHA256SUMS published on a failed scan"; else ok "(12) no SHA256SUMS published"; fi
RC2=0; grep -q 'scan-failed:scan-partial:error-on-own-pid' "$EVID/SHA256SUMS.FAILED" 2>/dev/null || RC2=$?
assert_eq "$RC2" 0 "(12) SHA256SUMS.FAILED names the partial scan and its reason"
assert_eq "$(grep -c '^wait-writer-alive' "$EVID/pack-modes-guards.exit" || true)" 1 "(12) nothing was copied: the suite's .exit is the runner's own marker"
assert_eq "$(grep -c 'descriptor-holders=[0-9]' "$EVID/status.txt" || true)" 0 "(12) the shim's partial stdout was discarded, never recorded as a numeric holder list"
EXTRA_PATH="$WORK/findshim"; run_fg c12b FIND_MODE=clean; EXTRA_PATH=''
assert_eq "$RC" 0 "(12) the same shim delegating cleanly passes: the shim path is not what fails"
RC2=0; ( cd "$EVID" && sha256sum -c --status SHA256SUMS ) || RC2=$?
assert_eq "$RC2" 0 "(12) SHA256SUMS verifies through the delegating shim"

echo "== (13) an unreadable child stat is unknown, never gone: no blocking wait, abandon with state unknown, seal refused"
mkdir -p "$WORK/c13.fakeproc"   # empty: every <pid>/stat read fails while the real /proc/<pid> still exists
T13=$(date +%s)
term_run "(13)" c13 FAKE_SLEEP_SUITE=pack-modes-guards FAKE_SLEEP_SECONDS=30 PERF01_TEST_PROC_ROOT="$WORK/c13.fakeproc"
E13=$(( $(date +%s) - T13 ))
if [ "$E13" -le 40 ]; then ok "(13) runner returned in ${E13}s (ceiling 40: handshake, prompt group exit, 2 s child cap); it did not block"; else bad "(13) runner took ${E13}s: it blocked"; fi
assert_eq "$RC" 143 "(13) exit 143 (TERM path; the earlier code is preserved, the seal refusal is in the evidence)"
RC2=0; grep -q 'still alive (state unknown) after the bound; not reaped' "$EVID/status.txt" || RC2=$?
assert_eq "$RC2" 0 "(13) abandon_child fired with state unknown"
assert_eq "$(grep -c '^wait-child-unreaped (pid [0-9]* state unknown)' "$EVID/pack-modes-guards.exit" || true)" 1 "(13) the suite's .exit is the unreaped-child marker with state unknown"
if [ -f "$EVID/SHA256SUMS" ]; then bad "(13) SHA256SUMS published despite an unreaped child"; else ok "(13) no SHA256SUMS published"; fi
RC2=0; grep -q 'unreaped-child=[0-9]*:unknown' "$EVID/SHA256SUMS.FAILED" 2>/dev/null || RC2=$?
assert_eq "$RC2" 0 "(13) SHA256SUMS.FAILED names the unreaped child and state unknown"
assert_eq "$(grep -c 'TEST OVERRIDE active' "$EVID/status.txt" || true)" 1 "(13) the override is recorded in evidence"
assert_eq "$(grep -c 'TEST OVERRIDE active' "$WORK/c13.err" || true)" 1 "(13) the override is announced on stderr"
assert_eq "$(grep -c "^test_override_proc_root=$WORK/c13.fakeproc\$" "$EVID/status.txt" || true)" 1 "(13) status.txt names the override"
assert_eq "$(grep -c '^cleanup_verified=yes$' "$EVID/status.txt" || true)" 1 "(13) cleanup still proven"
cpid=$(cat "$EVID/pack-modes-guards.wait.pgid" 2>/dev/null || echo none)
case "$cpid" in ''|none|*[!0-9]*) bad "(13) no child pid recorded" ;; *)
  kill -KILL "-$cpid" 2>/dev/null || true
  i=0; while [ -d "/proc/$cpid" ] && [ "$i" -lt 50 ]; do i=$((i + 1)); sleep 0.1; done
  if [ ! -d "/proc/$cpid" ]; then ok "(13) the abandoned child $cpid was reaped after the runner exited (reparented to init)"
  else bad "(13) the abandoned child $cpid is still present ($(cat "/proc/$cpid/stat" 2>/dev/null | cut -c1-40)); no reaper?"; fi ;;
esac

echo "== (14) a failed copy of one wait output is an evidence failure, never silently an empty file"
EXTRA_PATH="$WORK/cpshim"; run_fg c14 CP_FAIL_SUFFIX=.wait.err; EXTRA_PATH=''
assert_eq "$RC" 8 "(14) exit 8 on an otherwise clean run"
assert_eq "$(grep -c '^cleanup_verified=yes$' "$EVID/status.txt" || true)" 1 "(14) cleanup still proven"
if [ -f "$EVID/SHA256SUMS" ]; then bad "(14) SHA256SUMS published despite a copy failure"; else ok "(14) no SHA256SUMS published"; fi
RC2=0; grep -q 'evidence copy failed (.*copy-failed=wait.err.part' "$EVID/SHA256SUMS.FAILED" 2>/dev/null || RC2=$?
assert_eq "$RC2" 0 "(14) SHA256SUMS.FAILED names the copy failure and which file"
for s in $ALL; do assert_eq "$(head -1 "$EVID/$s.exit" 2>/dev/null || echo none)" "evidence-copy-failed (wait.err.part)" "(14) $s .exit is the copy-failure marker (exit.part copied, wait.err failed)"; done
assert_eq "$(grep -c '^evidence_copy_failed=.*copy-failed=wait.err.part' "$EVID/status.txt" || true)" 1 "(14) status.txt records which copy failed"
assert_eq "$(ls "$EVID"/*.wait.err 2>/dev/null | wc -l | tr -d ' ')" 0 "(14) no .wait.err file exists in evidence (nothing partial was left behind)"

echo "== (15) an escaped writer that is non-dumpable at scan time: unreadable fd dir, same uid => refused by credentials"
RC2=0; "$WORK/xo/sh" -c 'exit 7' 2>/dev/null || RC2=$?
if [ "$RC2" -eq 7 ]; then ok "(15) the execute-only sh copy runs from $WORK (/tmp is exec-capable)"
else bad "(15) the execute-only sh copy does not run (status $RC2): /tmp noexec or execute-only exec unsupported; the case cannot prove anything"; fi
if [ -r "$WORK/xo/sh" ]; then bad "(15) the copy is still readable; mode 0111 did not take"; else ok "(15) the copy is not readable by its owner (mode 0111)"; fi
run_fg c15 FAKE_ESCAPE_XO_SUITE=pack-modes-guards FAKE_XO_SH="$WORK/xo/sh"
wp=$(cat "$WPID" 2>/dev/null || echo none)
case "$wp" in ''|none|*[!0-9]*) bad "(15) the fake recorded no writer pid" ;; *)
  if [ -d "/proc/$wp" ]; then ok "(15) the writer $wp is alive after the runner exited"; else bad "(15) the writer $wp is already gone; the scan never faced it"; fi
  if [ ! -r "/proc/$wp/fd" ]; then ok "(15) /proc/$wp/fd is NOT readable by our uid (non-dumpable writer)"; else bad "(15) /proc/$wp/fd is readable: the writer is dumpable and case 11 already covers it"; fi
  wu=$(awk '/^Uid:/ { print $2 }' "/proc/$wp/status" 2>/dev/null || echo none)
  assert_eq "$wu" "$(id -u)" "(15) /proc/$wp/status Uid is ours (world-readable status proves the credentials)"
  assert_eq "$RC" 8 "(15) exit 8: the seal is refused on an otherwise clean run"
  assert_eq "$(grep -c '^cleanup_verified=yes$' "$EVID/status.txt" || true)" 1 "(15) cleanup still proven"
  if [ -f "$EVID/SHA256SUMS" ]; then bad "(15) SHA256SUMS published despite an own non-dumpable holder"; else ok "(15) no SHA256SUMS published"; fi
  RC2=0; grep -Eq "scan-partial:error-on-own-pid:$wp([^0-9]|\$)" "$EVID/SHA256SUMS.FAILED" 2>/dev/null || RC2=$?
  assert_eq "$RC2" 0 "(15) SHA256SUMS.FAILED names scan-partial:error-on-own-pid:$wp (unreadable fd dir, Uid ours)"
  assert_eq "$(grep -c '^wait-writer-alive' "$EVID/pack-modes-guards.exit" || true)" 1 "(15) nothing was copied: the suite's .exit is the runner's own marker"
  sleep 6
  assert_eq "$(grep -c late "$LANE/tmp/pack-modes-guards.exit.part" || true)" 1 "(15) the non-dumpable writer did write late into the lane tmp file (hazard exercised)"
  assert_eq "$(grep -rlx late "$EVID" | wc -l | tr -d ' ')" 0 "(15) late is nowhere in evidence"
  kill -KILL "-$wp" 2>/dev/null || kill -KILL "$wp" 2>/dev/null || true
  i=0; while [ -d "/proc/$wp" ] && [ "$i" -lt 50 ]; do i=$((i + 1)); sleep 0.1; done
  if [ ! -d "/proc/$wp" ]; then ok "(15) the writer $wp was KILLed and is gone"; else bad "(15) the writer $wp survives KILL"; fi ;;
esac

echo "== (16) the live-child bound on the production functions: await_child returns 1 after its cap while the child is demonstrably alive"
X16="$WORK/c16"; mkdir -p "$X16/emptyproc" "$X16/evid"
awk '/^child_state\(\) [{]$/ { f = 1 } f { print } f && /^abandon_child\(\) [{]$/ { g = 1 } g && /^[}]$/ { exit }' "$RUNNER" > "$X16/funcs.sh"
s16=$(grep -n '^child_state() {$' "$RUNNER" | cut -d: -f1); e16=$(awk '/^abandon_child\(\) [{]$/ { g = 1 } g && /^[}]$/ { print NR; exit }' "$RUNNER")
if [ -s "$X16/funcs.sh" ]; then ok "(16) the extracted functions are non-empty ($(wc -l < "$X16/funcs.sh" | tr -d ' ') lines, runner L${s16:-?}-L${e16:-?})"; else bad "(16) the extraction is empty; the anchors no longer match the runner"; fi
case "$s16$e16" in ''|*[!0-9]*) bad "(16) could not locate the range independently (start '$s16' end '$e16')" ;; *)
  if sed -n "${s16},${e16}p" "$RUNNER" | cmp -s - "$X16/funcs.sh"; then ok "(16) the awk extraction is byte-identical to runner L$s16-L$e16 taken with sed"; else bad "(16) the extraction differs from runner L$s16-L$e16"; fi ;;
esac
assert_eq "$(grep -c '^[a-z_]*() {$' "$X16/funcs.sh" || true)" 3 "(16) exactly the three production functions were extracted"
cat > "$X16/drive.sh" <<'DRV'
set -eu
. "$1"                                      # child_state, await_child, abandon_child: production bytes
EMPTY=$2; EVID=$3; OUT=$4
WAIT_SUITE=c16; WRITER_ALIVE=''; SUITE_FAIL=0; CHILD_STATE=''; WST=''
rec() { echo "$*" >> "$EVID/rec.txt"; }
sleep 300 & LIVE=$!
sh -c 'exit 3' & ZP=$!
sleep 1                                     # the exit-3 child is a zombie or already reaped by this shell; the sleep is alive
real_state() { rs=''; { IFS= read -r rs < "/proc/$1/stat"; } 2>/dev/null || { echo none; return 0; }; rs=${rs##*) }; set -- $rs; echo "${1-none}"; }
PROC_ROOT=$EMPTY; WAIT_PID=$LIVE; t0=$(date +%s); rc=0; await_child 2 || rc=$?
echo "s1_rc=$rc s1_state=$CHILD_STATE s1_elapsed=$(( $(date +%s) - t0 )) s1_live_kill0=$(kill -0 "$LIVE" 2>/dev/null && echo yes || echo no) s1_live_real=$(real_state "$LIVE")" >> "$OUT"
abandon_child 4242
echo "s2_marker=$(head -1 "$EVID/c16.exit" 2>/dev/null || echo none)" >> "$OUT"
echo "s2_writer_alive=${WRITER_ALIVE# } s2_suite_fail=$SUITE_FAIL s2_wait_pid=${WAIT_PID:-empty}" >> "$OUT"
PROC_ROOT=/proc; WAIT_PID=$LIVE; t0=$(date +%s); rc=0; await_child 2 || rc=$?
echo "s3_rc=$rc s3_state=$CHILD_STATE s3_elapsed=$(( $(date +%s) - t0 )) s3_live_kill0=$(kill -0 "$LIVE" 2>/dev/null && echo yes || echo no)" >> "$OUT"
WAIT_PID=$ZP; t0=$(date +%s); rc=0; await_child 2 || rc=$?
echo "s4_rc=$rc s4_state=$CHILD_STATE s4_elapsed=$(( $(date +%s) - t0 )) s4_wst=${WST:-unset}" >> "$OUT"
kill -KILL "$LIVE" 2>/dev/null || true; wait "$LIVE" 2>/dev/null || true
echo "s5_live_gone=$([ -d "/proc/$LIVE" ] && echo no || echo yes) live_pid=$LIVE" >> "$OUT"
DRV
: > "$X16/out.txt"
T16=$(date +%s); RC2=0; sh "$X16/drive.sh" "$X16/funcs.sh" "$X16/emptyproc" "$X16/evid" "$X16/out.txt" > "$X16/drive.log" 2>&1 || RC2=$?
E16=$(( $(date +%s) - T16 ))
assert_eq "$RC2" 0 "(16) the driver completed (log: $X16/drive.log)"
if [ "$E16" -le 25 ]; then ok "(16) the whole driver took ${E16}s (two capped polls of about 2 s each, one immediate return, a 1 s settle)"; else bad "(16) the driver took ${E16}s: a poll blocked"; fi
v16() { sed -n "s/.*[[:space:]]*$1=\([^ ]*\).*/\1/p" "$X16/out.txt" | head -1; }
assert_eq "$(v16 s1_rc)" 1 "(16) PROC_ROOT empty: await_child 2 returned 1 (abandoned, not waited)"
assert_eq "$(v16 s1_state)" unknown "(16) PROC_ROOT empty: CHILD_STATE is unknown"
e1=$(v16 s1_elapsed); if [ -n "$e1" ] && [ "$e1" -le 10 ]; then ok "(16) PROC_ROOT empty: returned after ${e1}s (ceiling 10, expected about 2)"; else bad "(16) PROC_ROOT empty: elapsed '${e1:-none}' exceeds the 10 s ceiling"; fi
assert_eq "$(v16 s1_live_kill0)" yes "(16) the sleep is still alive afterwards (kill -0)"
case "$(v16 s1_live_real)" in S|R) ok "(16) the real /proc stat letter of the sleep is $(v16 s1_live_real): a live, known process, not a zombie" ;; *) bad "(16) the sleep's real state is '$(v16 s1_live_real)', not S or R" ;; esac
assert_eq "$(sed -n 's/^s2_marker=//p' "$X16/out.txt" | head -1)" "wait-child-unreaped (pid $(v16 live_pid) state unknown)" "(16) abandon_child wrote the unreaped marker with state unknown"
RC2=0; grep -q "s2_writer_alive=pgid=4242 suite=c16 unreaped-child=$(v16 live_pid):unknown" "$X16/out.txt" || RC2=$?
assert_eq "$RC2" 0 "(16) WRITER_ALIVE carries unreaped-child=<pid>:unknown"
assert_eq "$(v16 s2_suite_fail)" 1 "(16) abandon_child failed the suite"
assert_eq "$(v16 s2_wait_pid)" empty "(16) abandon_child cleared WAIT_PID (never waited later)"
assert_eq "$(v16 s3_rc)" 1 "(16) control PROC_ROOT=/proc on the live sleep: returned 1 after the cap"
case "$(v16 s3_state)" in S|R) ok "(16) control: CHILD_STATE is $(v16 s3_state) (live, known)" ;; *) bad "(16) control: CHILD_STATE is '$(v16 s3_state)', not S or R" ;; esac
e3=$(v16 s3_elapsed); if [ -n "$e3" ] && [ "$e3" -le 10 ]; then ok "(16) control: returned after ${e3}s (ceiling 10)"; else bad "(16) control: elapsed '${e3:-none}' exceeds the 10 s ceiling"; fi
assert_eq "$(v16 s3_live_kill0)" yes "(16) control: the sleep is still alive (never waited)"
assert_eq "$(v16 s4_rc)" 0 "(16) exited child: await_child returned 0 at once"
case "$(v16 s4_state)" in Z|gone) ok "(16) exited child: CHILD_STATE is $(v16 s4_state) (zombie, or already reaped by the shell and hence gone)" ;; *) bad "(16) exited child: CHILD_STATE is '$(v16 s4_state)'" ;; esac
e4=$(v16 s4_elapsed); if [ -n "$e4" ] && [ "$e4" -le 1 ]; then ok "(16) exited child: returned in ${e4}s"; else bad "(16) exited child: took '${e4:-none}' s"; fi
assert_eq "$(v16 s4_wst)" 3 "(16) exited child: WST carries its exit status 3 (it was waited)"
assert_eq "$(v16 s5_live_gone)" yes "(16) the sleep was KILLed and reaped by the driver"

echo "== (17) the logs pair: an escaped child of docker logs that keeps the .log.part open is caught by the logs step's descriptor proof"
run_fg c17 FAKE_LOGS_ESCAPE_SUITE=pack-modes-guards
assert_eq "$RC" 8 "(17) exit 8: the seal is refused on an otherwise clean run"
assert_eq "$(grep -c '^cleanup_verified=yes$' "$EVID/status.txt" || true)" 1 "(17) cleanup still proven"
if [ -f "$EVID/SHA256SUMS" ]; then bad "(17) SHA256SUMS published despite a live holder of the logs output"; else ok "(17) no SHA256SUMS published"; fi
assert_eq "$(head -1 "$EVID/pack-modes-guards.exit" 2>/dev/null || echo none)" 0 "(17) the suite's .exit (wait step, clean) was copied and still reads 0"
assert_eq "$(grep -c '^wait-writer-alive' "$EVID/pack-modes-guards.log" || true)" 1 "(17) pack-modes-guards.log is the runner-owned holder marker, not a copy of the logs output"
assert_eq "$(grep -c 'writer(s) survive the logs:' "$EVID/status.txt" || true)" 1 "(17) status.txt records the holder on the logs step"
assert_eq "$(grep -c 'writer(s) survive the wait:' "$EVID/status.txt" || true)" 0 "(17) the wait step itself was clean"
wp=$(cat "$WPID" 2>/dev/null || echo none)
case "$wp" in ''|none|*[!0-9]*) bad "(17) the fake recorded no escaped writer pid" ;; *)
  RC2=0; grep -Eq "step=logs [^;]*(^|[^0-9])$wp([^0-9]|\$)" "$EVID/SHA256SUMS.FAILED" 2>/dev/null || RC2=$?
  assert_eq "$RC2" 0 "(17) SHA256SUMS.FAILED names the escaped logs writer $wp under step=logs"
  pg=$(cat "$EVID/pack-modes-guards.logs.pgid" 2>/dev/null || echo none)
  case "$pg" in ''|none|*[!0-9]*) bad "(17) no pgid recorded for the logs pair" ;; *) ok "(17) logs pair pgid recorded ($pg)" ;; esac
  assert_eq "$(alive_in_group "$pg" | wc -w | tr -d ' ')" 0 "(17) nothing lives in the logs pair's own group $pg: the group scan alone could not have seen the writer"
  if [ "$(alive_in_group "$wp" | wc -w | tr -d ' ')" -gt 0 ]; then ok "(17) the escaped writer lives in its own session/group $wp"; else bad "(17) the escaped writer is not alive in its own group; the escape was not exercised"; fi ;;
esac
sleep 6
assert_eq "$(grep -c late "$LANE/tmp/pack-modes-guards.log.part" || true)" 1 "(17) the writer did write late into the lane tmp .log.part (hazard exercised)"
assert_eq "$(grep -rlx late "$EVID" | wc -l | tr -d ' ')" 0 "(17) late is nowhere in evidence"
case "$wp" in ''|none|*[!0-9]*) ;; *)
  kill -KILL "-$wp" 2>/dev/null || kill -KILL "$wp" 2>/dev/null || true
  i=0; while [ -d "/proc/$wp" ] && [ "$i" -lt 50 ]; do i=$((i + 1)); sleep 0.1; done
  if [ ! -d "/proc/$wp" ]; then ok "(17) the writer $wp was KILLed and is gone"; else bad "(17) the writer $wp survives KILL"; fi ;;
esac

# rv <line pattern> <key> [suffix]: the value of key=<digits><suffix> on the first status.txt line matching the pattern,
# only when the token is complete: one or more digits, the literal suffix (e.g. "s)" for wait_bound=<w>s)), then whitespace
# or the end of the line. Empty for a missing key, an empty value, a numeric prefix with trailing junk, or a non-numeric
# value (R8-6: the old pattern accepted "lb=44x" as 44 and "handshake_s=" as empty; callers now validate each field with num).
rv() {
  rv_sfx=$(printf '%s' "${3-}" | sed 's/[].[*^$\/]/\\&/g')
  sed -n "/$1/s/.*[[:space:]]$2=\([0-9][0-9]*\)$rv_sfx\([[:space:]].*\)\{0,1\}\$/\1/p" "$EVID/status.txt" | head -1
}
# num <label> <name> <value>: ok (silently) when the value is a complete non-empty decimal token; otherwise records a bad
# naming the field and returns 1, so a missing or junk field can never reach the arithmetic as 0 (R8-6).
num() { case "$3" in ''|*[!0-9]*) bad "$1 $2 is missing or not a complete number ('$3')"; return 1 ;; esac; return 0; }
# lifetime_verdict <term file>: call-lifetime evidence from the hang fake's file (start epoch, exactly one ignored TERM with
# its epoch, 1 s heartbeats until KILL). Prints one reason line; returns 0 only when TERM arrived 43..47 s after the start
# (lb 44, -1 for second rounding, +3 slack), the last heartbeat is 4..7 s after the TERM (KILL grace 5 s, 1 s granularity,
# +2 slack) and the observed heartbeat span (last heartbeat minus start, whole-second epochs) is 47..52 s. R8-5:
# logs_wall_s alone could not tell "TERM at 44, KILL at 49, fast cleanup" from "KILL at 44 with no grace, slow proof and
# copy"; the heartbeat gap after the TERM can. The span is scheduling evidence, not the exact call lifetime: a correct
# timer with ordinary startup and second rounding (timeout at 1000.90, fake start 1001.01 -> 1001, TERM 1044.90 -> 1044,
# last heartbeat 1048.91 -> 1048, KILL 1049.90) records a span of 47, so 48 as the floor rejected a correct runner (R8-7).
# First TERM delivery only (coreutils timeout signals the monitored pid and then its whole group, so two are possible).
lifetime_verdict() {
  lv_n=$(grep -c '^term-received ' "$1" 2>/dev/null || true)
  [ "${lv_n:-0}" = 1 ] || { echo "expected exactly one ignored TERM, found ${lv_n:-0}"; return 1; }
  lv_s=$(sed -n 's/^start \([0-9][0-9]*\)$/\1/p' "$1" | head -1)
  lv_t=$(sed -n 's/^term-received \([0-9][0-9]*\)$/\1/p' "$1" | head -1)
  lv_a=$(sed -n 's/^alive \([0-9][0-9]*\)$/\1/p' "$1" | tail -1)
  for lv_v in "start:$lv_s" "term:$lv_t" "last-alive:$lv_a"; do
    case "${lv_v#*:}" in ''|*[!0-9]*) echo "term file lacks a complete ${lv_v%%:*} epoch ('${lv_v#*:}')"; return 1 ;; esac
  done
  lv_term=$((lv_t - lv_s)); lv_grace=$((lv_a - lv_t)); lv_life=$((lv_a - lv_s))
  { [ "$lv_term" -ge 43 ] && [ "$lv_term" -le 47 ]; } || { echo "TERM arrived ${lv_term}s after the start, outside 43..47 (lb 44 - 1 .. + 3)"; return 1; }
  { [ "$lv_grace" -ge 4 ] && [ "$lv_grace" -le 7 ]; } || { echo "last heartbeat ${lv_grace}s after the TERM, outside 4..7: the 5 s KILL grace was not honoured (premature KILL)"; return 1; }
  { [ "$lv_life" -ge 47 ] && [ "$lv_life" -le 52 ]; } || { echo "observed heartbeat span ${lv_life}s, outside 47..52 (lb 44 + KILL 5, 1 s heartbeat, startup and second rounding, slack)"; return 1; }
  echo "TERM at +${lv_term}s ignored, last heartbeat ${lv_grace}s after it, observed heartbeat span ${lv_life}s: TERM at the allowance, KILL only after the grace"
  return 0
}
# lifetime_checks <label> <term file>: the verdict above as one ok/bad assertion.
lifetime_checks() { if lc_r=$(lifetime_verdict "$2"); then ok "$1 $lc_r"; else bad "$1 $lc_r"; fi; }

# R8-5 discriminator self-check on synthetic term files, before the real cases: a KILL at the TERM instant followed by a
# slow proof and copy (logs_wall_s would still read 49) must FAIL the lifetime verdict; the intended timeline must PASS.
LVF="$WORK/lifetime-fixtures"; mkdir -p "$LVF"
{ echo "start 1000"; i=0; while [ "$i" -le 44 ]; do echo "alive $((1000 + i))"; i=$((i + 1)); done; echo "term-received 1044"; } > "$LVF/premature"
{ echo "start 1000"; i=0; while [ "$i" -le 49 ]; do echo "alive $((1000 + i))"; i=$((i + 1)); done; echo "term-received 1044"; } > "$LVF/intended"
if lv_r=$(lifetime_verdict "$LVF/premature"); then bad "(R8-5) the lifetime verdict accepted a KILL at the TERM instant with no grace"; else ok "(R8-5) the lifetime verdict rejects a premature KILL: $lv_r"; fi
if lv_r=$(lifetime_verdict "$LVF/intended"); then ok "(R8-5) the lifetime verdict accepts TERM at +44 and KILL at +49: $lv_r"; else bad "(R8-5) the lifetime verdict rejected the intended timeline: $lv_r"; fi
# R8-7 rounded-boundary control: the correct timer with ordinary startup and second rounding from the design review
# (timeout 1000.90, fake start 1001.01, TERM 1044.90, last heartbeat 1048.91, KILL 1049.90) records start 1001, TERM 1044,
# last heartbeat 1048: TERM delta 43, grace 4, observed span 47. It must PASS; the premature timeline above still fails.
{ echo "start 1001"; i=1; while [ "$i" -le 48 ]; do echo "alive $((1000 + i))"; i=$((i + 1)); done; echo "term-received 1044"; } > "$LVF/rounded"
if lv_r=$(lifetime_verdict "$LVF/rounded"); then ok "(R8-7) the lifetime verdict accepts the rounded boundary (TERM +43, grace 4, span 47): $lv_r"; else bad "(R8-7) the lifetime verdict rejected a correct timer at the rounded boundary: $lv_r"; fi
# R8-6 self-check of the strict field extraction on a synthetic status line (EVID is pointed at the fixture dir and restored).
printf '%s\n' 'suite=fixture logs_wall_s=49 lb=44x handshake_s= cap_s=54 (S=120 wait_bound=120s) trailing=7' > "$LVF/status.txt"
EVID_SAVED=$EVID; EVID=$LVF
assert_eq "$(rv 'suite=fixture ' logs_wall_s)" 49 "(R8-6) rv returns a complete numeric token"
assert_eq "$(rv 'suite=fixture ' lb)" '' "(R8-6) rv rejects a numeric prefix with trailing junk (lb=44x)"
assert_eq "$(rv 'suite=fixture ' handshake_s)" '' "(R8-6) rv rejects an empty value (handshake_s=)"
assert_eq "$(rv 'suite=fixture ' cap_s)" 54 "(R8-6) rv returns a token followed by whitespace"
assert_eq "$(rv 'suite=fixture ' wait_bound 's)')" 120 "(R8-6) rv returns wait_bound=<w>s) through its literal suffix"
assert_eq "$(rv 'suite=fixture ' trailing)" 7 "(R8-6) rv returns the last token on the line"
assert_eq "$(rv 'suite=fixture ' absent)" '' "(R8-6) rv returns empty for a missing key"
EVID=$EVID_SAVED

echo "== (18) a docker logs call that ignores TERM and hangs: bounded by LOGS_RUN + KILL, noted in the .log, the suite not failed"
T18=$(date +%s)
run_fg c18 FAKE_LOGS_HANG_SUITE=pack-modes-guards FAKE_TERM_FILE="$WORK/c18.term"
E18=$(( $(date +%s) - T18 ))
# ceiling 95 = LOGS_RUN 44 (TERM, ignored) + KILL 5 + poll excess <= REAP_GRACE 5 + SCAN 11 (proof and copy) + 30 for the rest of a four-suite fake run
if [ "$E18" -le 95 ]; then ok "(18) the run returned in ${E18}s (ceiling 95 = 44 + 5 + 5 + 11 + 30 for the rest of the run)"; else bad "(18) the run took ${E18}s: the logs step was not bounded"; fi
assert_eq "$RC" 0 "(18) exit 0: a bounded logs failure does not fail the run"
assert_eq "$(head -1 "$EVID/pack-modes-guards.exit" 2>/dev/null || echo none)" 0 "(18) the suite's .exit still reads 0"
RC2=0; grep -Fxq '[fleet-guards] docker logs exit 137 (bounded 44s)' "$EVID/pack-modes-guards.log" || RC2=$?
assert_eq "$RC2" 0 "(18) pack-modes-guards.log carries the bounded-exit note: exit 137 (timeout had to KILL after TERM was ignored) at lb = LOGS_RUN = 44"
assert_eq "$(grep -c '^fake suite log$' "$EVID/pack-modes-guards.log" || true)" 1 "(18) the line written before the hang was still copied"
assert_eq "$(grep -c 'logs group .* proven empty by /proc scan and no descriptor held under .* (copy)' "$EVID/status.txt" || true)" 4 "(18) every logs group, the hung one included, proven empty and unheld before its copy"
assert_eq "$(grep -c '^wait_groups_live=none$' "$EVID/status.txt" || true)" 1 "(18) pre-seal proof found no live writer"
assert_eq "$(grep -c '^cleanup_verified=yes$' "$EVID/status.txt" || true)" 1 "(18) cleanup proven"
RC2=0; ( cd "$EVID" && sha256sum -c --status SHA256SUMS ) || RC2=$?
assert_eq "$RC2" 0 "(18) SHA256SUMS verifies"
hp=$(cat "$WPID" 2>/dev/null || echo none)
case "$hp" in ''|none|*[!0-9]*) bad "(18) the fake recorded no hung logs pid" ;; *)
  hs=$( { IFS= read -r x < "/proc/$hp/stat"; } 2>/dev/null && { x=${x##*) }; set -- $x; echo "${1-}"; } || echo gone)
  case "$hs" in gone|Z) ok "(18) the hung logs process $hp is $hs (KILLed by the group kill after TERM was ignored)" ;; *) bad "(18) the hung logs process $hp is still alive in state $hs" ;; esac ;;
esac
pg=$(cat "$EVID/pack-modes-guards.logs.pgid" 2>/dev/null || echo none)
case "$pg" in ''|none|*[!0-9]*) bad "(18) no pgid recorded for the hung logs pair" ;; *) assert_eq "$(alive_in_group "$pg" | wc -w | tr -d ' ')" 0 "(18) nothing lives in the hung logs pair's group $pg" ;; esac
h18=$(rv 'suite=pack-modes-guards logs_wall_s=' handshake_s); lw18=$(rv 'suite=pack-modes-guards logs_wall_s=' logs_wall_s)
vf=0; num "(18)" handshake_s "$h18" || vf=1; num "(18)" logs_wall_s "$lw18" || vf=1   # R8-6: every field validated and named on its own
if [ "$vf" -eq 0 ]; then
  if [ "$h18" -le 1 ]; then ok "(18) control for (19): without a shim the logs handshake took ${h18}s (<= 1)"; else bad "(18) control: handshake_s=$h18 > 1 without any delay"; fi
  if [ "$lw18" -le 65 ]; then ok "(18) the hung logs step took ${lw18}s, inside LOGS 65 (44 + 5 + poll excess + proof + copy)"; else bad "(18) the hung logs step took ${lw18}s > LOGS 65"; fi
  if [ "$lw18" -ge 49 ]; then ok "(18) lower bound: the hung logs step took ${lw18}s >= 49 (step wall; the call's own lifetime is proven below)"; else bad "(18) the hung logs step took only ${lw18}s < 49: the call ended before the KILL, the allowance was not exercised"; fi
fi
lifetime_checks "(18)" "$WORK/c18.term"   # R8-5: TERM at +44 ignored, heartbeats continue 4..7 s past it, call lived 48..52 s

echo "== (19) delayed pgid publication: a setsid that execs 3 s late is charged to the poll cap on both launches and stays benign"
T19=$(date +%s)
EXTRA_PATH="$WORK/setsidshim"; run_fg c19 FAKE_LOGS_HANG_SUITE=pack-modes-guards FAKE_TERM_FILE="$WORK/c19.term"; EXTRA_PATH=''
E19=$(( $(date +%s) - T19 ))
# ceiling 120 = the (18) ceiling 95 + 8 launches (4 waits + 4 logs) x 3 s shim delay; the delay sits inside each step's cap, so this is generous
if [ "$E19" -le 120 ]; then ok "(19) the run returned in ${E19}s (ceiling 120 = 95 + 8 x 3)"; else bad "(19) the run took ${E19}s: the delayed handshake was not bounded"; fi
assert_eq "$RC" 0 "(19) exit 0: a late pgid is benign"
RC2=0; ( cd "$EVID" && sha256sum -c --status SHA256SUMS ) || RC2=$?
assert_eq "$RC2" 0 "(19) SHA256SUMS verifies"
assert_eq "$(ls "$EVID"/*.wait.pgid | wc -l | tr -d ' ')" 4 "(19) four wait pgid files (published late, still published)"
assert_eq "$(ls "$EVID"/*.logs.pgid | wc -l | tr -d ' ')" 4 "(19) four logs pgid files"
for s in $ALL; do
  p19="suite=$s suite_wall_create_to_wait_return_s="
  w19=$(rv "$p19" wait_bound 's)'); h19=$(rv "$p19" handshake_s); c19=$(rv "$p19" cap_s)   # wait_bound is recorded as <w>s)
  vf=0; num "(19) $s:" wait_bound "$w19" || vf=1; num "(19) $s:" handshake_s "$h19" || vf=1; num "(19) $s:" cap_s "$c19" || vf=1   # R8-6
  if [ "$vf" -eq 0 ]; then
    if [ "$h19" -ge 3 ]; then ok "(19) $s: the wait handshake took ${h19}s (the shim's delay was seen)"; else bad "(19) $s: wait handshake_s=$h19 < 3; the shim did not delay the pgid"; fi
    assert_eq "$c19" "$(( w19 + 20 + 5 - h19 ))" "(19) $s: wait cap_s = w $w19 + SUITE_KILL 20 + REAP_GRACE 5 - handshake_s $h19"
  fi
done
p19='suite=pack-modes-guards logs_wall_s='
lw=$(rv "$p19" logs_wall_s); lh=$(rv "$p19" handshake_s); lc=$(rv "$p19" cap_s); ll=$(rv "$p19" lb)
vf=0; num "(19) hung suite:" logs_wall_s "$lw" || vf=1; num "(19) hung suite:" handshake_s "$lh" || vf=1; num "(19) hung suite:" cap_s "$lc" || vf=1; num "(19) hung suite:" lb "$ll" || vf=1   # R8-6
if [ "$vf" -eq 0 ]; then
  assert_eq "$ll" 44 "(19) hung suite: lb = LOGS_RUN"
  if [ "$lh" -ge 3 ]; then ok "(19) hung suite: the logs handshake took ${lh}s (delayed)"; else bad "(19) hung suite: logs handshake_s=$lh < 3"; fi
  assert_eq "$lc" "$(( 44 + 5 + 5 - lh ))" "(19) hung suite: logs cap_s = lb 44 + KILL 5 + REAP_GRACE 5 - handshake_s $lh"
  if [ "$lw" -le 65 ]; then ok "(19) hung suite: logs_wall_s=${lw} <= LOGS 65 with a delayed handshake and a TERM-ignoring call"; else bad "(19) hung suite: logs_wall_s=${lw} > LOGS 65; the handshake was not charged to the cap"; fi
  # the KILL still lands 49 s after timeout starts (the shim's 3 s precede timeout and are inside logs_wall_s), so >= 49 holds here too
  if [ "$lw" -ge 49 ]; then ok "(19) hung suite: logs_wall_s=${lw} >= 49: the step wall reached the KILL point (the call's own lifetime is proven below)"; else bad "(19) hung suite: logs_wall_s=${lw} < 49: the call ended before the KILL"; fi
fi
RC2=0; grep -Fxq '[fleet-guards] docker logs exit 137 (bounded 44s)' "$EVID/pack-modes-guards.log" || RC2=$?
assert_eq "$RC2" 0 "(19) the hung suite's .log carries the bounded-exit note with exit 137"
lifetime_checks "(19)" "$WORK/c19.term"   # R8-5: the delayed pgid does not move TERM (+44 from the fake's start) or the KILL grace

echo "passed=$PASS failed=$FAIL work=$WORK"
[ "$FAIL" -eq 0 ]
