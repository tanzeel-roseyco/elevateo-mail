#!/bin/sh
# AIDEV-NOTE: PERF-01 bounded fleet guard runner. Runs the four guard suites (pack-modes-guards.sh, fleet-guards-guards.sh,
# run-baseline-guards.sh, cleanup-guards.sh) on fleet-02 inside disposable containers from a payload made by
# pack-guards.sh, under ONE total deadline, and removes exactly what it created, after proving it owns it. The suites
# are Docker-free inside their containers (fake CLIs, tar); no Supabase stack, no compose, no pull, no volume, no
# network, no image change. Operator-run after a coordinator lease; PERF-01 holds no remote lease and this runner
# requests none by itself.
# Usage: PERF01_RESERVATION=<lease> timeout -k 60 $((PERF01_TOTAL_BUDGET + 300)) sh fleet-guards.sh <payload.tar> <expected archive sha256> <lane dir>
#        sh fleet-guards.sh --dry-run <payload.tar> <expected archive sha256> <lane dir>
#        (operator watchdog: the outer `timeout` is the external bound against a shell that cannot be scheduled or a
#        direct child stuck in uninterruptible sleep; a watchdog kill leaves the evidence UNSEALED, no SHA256SUMS, which
#        is itself fail-closed. Every in-script wait is a capped poll; the external watchdog bounds the rest.)
#        (dry run: prints every command it would run, resolved, plus the budget derivation; calls nothing, creates
#        nothing, needs no reservation, exits 0). Lane contract: both paths absolute, whitespace-free and free of
#        * ? [ ] and backslash (the lane path is a glob prefix for the descriptor scan); checked on the arguments, again
#        on the canonical lane path, and once more inside the --scan child. The expected SHA-256 reaches
#        the operator from pack-guards.sh output through the coordinator, independently of the archive: it
#        authenticates the archive BEFORE tar reads a byte of it; the embedded PAYLOAD.sha256 is only a content
#        manifest, checked after extraction.
# Tunables (positive integers, no leading zero): PERF01_TOTAL_BUDGET=3200 (s, deadline computed at start, <= 3600),
#           per-suite timeouts PERF01_SUITE_TIMEOUT_PM=120 (pack-modes-guards), _FG=120 (fleet-guards-guards),
#           _RB=600 (run-baseline-guards), _CU=300 (cleanup-guards), each 60..1800; PERF01_DOCKER_TIMEOUT=20 (s per
#           short docker call, 5..60). Fixed: KILL=5 (timeout -k), CLEANUP_CALL=15, LOCAL_CALL=30, SUITE_KILL=20,
#           LOGS_CALL=60, SCAN_CALL=5 (descriptor scan), REAP_SETTLE=2, REAP_GRACE=5, LOGS_RUN=LOGS_CALL-REAP_GRACE-SCAN=44
#           (the `docker logs` call itself; the rest of LOGS pays for the same capped poll, proofs and copy as the wait).
# Budget derivation (every `timeout -k K T` call is counted at T+K; computed in the script, printed by --dry-run):
#           SHORT=D+K  CLEAN=15+K  LOCAL=30+K  LOGS=60+K (= LOGS_RUN 44 + K 5 + REAP_GRACE 5 + SCAN 11: the logs pair runs
#           like the wait pair, own group, capped poll, group + descriptor proof, copy)  SUITE_TAIL=LOGS+6*CLEAN  FD_SCAN=SCAN_CALL+K (one bounded pass
#           over /proc/[0-9]*/fd by the --scan child)  SCAN=1+FD_SCAN (the process-group pass, the descriptor pass and
#           the copy of the wait outputs into evidence)  SUITE_OVERHEAD=2*SHORT+SUITE_TAIL+SCAN+REAP_GRACE (REAP_GRACE
#           here = the cap on the normal-path child poll beyond w + SUITE_KILL)
#           (cleanup of one container = lookup, ownership inspect, stop, rm, id proof, name proof = 6 CLEAN calls)
#           per suite worst = S_i + SUITE_KILL + SUITE_OVERHEAD;  PRE = 5*LOCAL + 2*SHORT (archive hash, tar -tvf,
#           tar -xf, manifest check, find; image inspect, lane preflight);  REAP_GRACE = 5 (two REAP_SETTLE polls after
#           the group KILL, child reap then group settle, plus poll granularity and the process-group scans; the same 5 s
#           is the normal-path child-poll cap beyond w + SUITE_KILL);  SIGNAL_REAP = SUITE_KILL + K + REAP_GRACE +
#           FD_SCAN (terminating by process group, reaping with a capped poll, and proving a pending `docker wait` gone
#           by group AND by descriptor before the seal);  RESERVE = N*6*CLEAN + (3+N)*CLEAN + LOCAL (payload re-verify)
#           + LOCAL (seal) + SIGNAL_REAP + FD_SCAN (pre-seal descriptor scan of evidence);  MIN_BUDGET = PRE +
#           sum(per suite worst) + RESERVE.
#           Defaults: SHORT 25, CLEAN 20, LOCAL 35, LOGS 65, SUITE_TAIL 185, FD_SCAN 10, SCAN 11, SUITE_OVERHEAD 251,
#           PRE 225, SIGNAL_REAP 40, RESERVE 740 (N=4), suites 120+120+600+300 + 4*271 = 2224, MIN_BUDGET 3189 <= TOTAL
#           3200 (MIN rounded up to the next hundred; 11 s slack at the defaults) <= 3600. With four suites the lease
#           request is 60 minutes (3600 s keeps 400 s operator margin over TOTAL; the operator watchdog above adds 300 s
#           + 60 s inside that margin); the coordinator decides. The script refuses TOTAL < MIN_BUDGET.
#           History: R3 SIGNAL_REAP 25 / RESERVE 715 / MIN 3100; R4 SIGNAL_REAP 30 / RESERVE 720 / SUITE_OVERHEAD 236 /
#           MIN 3109; R5 adds FD_SCAN and the child-poll cap: the figures above. R8 splits LOGS internally (LOGS_RUN 44 for
#           the call, K + REAP_GRACE + SCAN for its poll, proofs and copy); no derived figure changed.
# Deadline rule: remaining = DEADLINE - now - RESERVE before every docker call; the call runs under min(bound,
#           remaining) or, when remaining <= 0, is not issued at all (status 125), the step is recorded as cut and the
#           run goes straight to cleanup. Before `docker wait`, w = min(S_i, remaining - SUITE_KILL - REAP_GRACE -
#           SUITE_TAIL - SCAN) (everything the main path still spends after the wait: poll excess, proof + copy, tail); if
#           w <= 0 the wait is not issued (cut recorded, suite failed, container cleaned). Cleanup, inventories and the
#           seal always run under their fixed bounds inside RESERVE. Every local step (sha256sum, tar, find, seal) is
#           under `timeout -k 5 30`; the descriptor scan under `timeout -k 5 5`. No `wait` in this script blocks: the
#           direct child is polled on /proc/<pid>/stat under a cap (normal path w + SUITE_KILL + REAP_GRACE less the pgid
#           handshake of up to 5 s, which is charged to the cap so the step never exceeds its budget (R8-3); signal and
#           cleanup path SUITE_KILL + K, then REAP_SETTLE for the child and REAP_SETTLE for the group to settle; caps are
#           iteration counts of 0.5 s sleeps, immune to clock jumps) and `wait` is called only once it is a zombie or gone, so it
#           returns at once; a child still alive after the cap (any state, D and T included, and "unknown" when its stat
#           line cannot be read or parsed while /proc/<pid> still exists) is NOT waited for: it is recorded, the suite
#           failed, the seal refused. This holds on every path: `wait` is reachable only through the Z|gone test.
#           Claim: every in-script wait is a capped poll and wall time is
#           bounded by TOTAL except signal-delivery and scheduler latency of seconds (recorded as
#           deadline_overrun_pre_seal_s); the external operator watchdog bounds the rest (a shell that cannot run);
#           dockerd-side completion of a killed client call is outside our control, which is why absence is proven by
#           inventories, never assumed from a returned status.
# Ownership: a container is stopped or removed only after `docker inspect` shows labels task=perf01, lane=<nonce>,
#           run=<run> and a mount set consisting solely of the lane payload bind (plus the /tmp tmpfs if the daemon
#           lists it). Anything else carrying our exact name is recorded as foreign, left in place, exit 6. A suite
#           whose create was never attempted (evidence/<suite>.attempted absent) gets inventory only: its exact-name
#           `ps` must exit 0 and be empty (exit 5 otherwise); nothing is removed.
# Signals: INT and TERM have explicit handlers (exit 130/143, signal recorded) before the cleanup body runs; cleanup
#           itself ignores INT/TERM so it completes. The `timeout … docker wait` pair runs in its own session and process
#           group (util-linux setsid; the leader pid is recorded in evidence/<suite>.wait.pgid before exec) with stdout
#           and stderr on files under <lane>/tmp, OUTSIDE evidence. A pending pair is terminated BY GROUP (TERM to -pgid,
#           poll capped at SUITE_KILL + K, KILL to -pgid, which also reaches a stopped wrapper, REAP_SETTLE poll), reaped
#           with a capped poll + `wait`, and then PROVEN gone twice: (1) /proc/[0-9]*/stat is scanned for any non-zombie
#           process in that group (zombies hold no descriptors); (2) /proc/[0-9]*/fd/* is scanned (the --scan child,
#           bounded) for ANY process holding a descriptor on a file under <lane>/tmp, which also catches a writer that
#           called setsid itself and so left the group while keeping the inherited stdout. Only after both proofs are
#           the outputs copied (cp: fresh inodes) into evidence; an interrupted suite gets a runner-written .exit marker
#           instead and its outputs stay under <lane>/tmp. Immediately before the seal every recorded group is scanned
#           again and the descriptor scan is run over the evidence directory itself; any survivor or holder refuses the
#           seal (SHA256SUMS.FAILED "evidence writer alive (pgid=N … pids=…); seal not stable", no SHA256SUMS, exit 8
#           unless cleanup/inventory/payload already failed, pids recorded in status.txt wait_groups_live). Containers
#           are created with --init so writers orphaned inside a suite are reaped by docker-init. A clean exit
#           additionally requires an .exit file whose first line is 0 for EVERY suite. Since R8 the `timeout … docker logs`
#           call has exactly the same shape as the wait pair (own session and group, leader pid in evidence/<suite>.logs.pgid,
#           output under <lane>/tmp, capped poll, group AND descriptor proof, then cp into evidence/<suite>.log); a holder
#           or survivor leaves a runner-written <suite>.log marker and refuses the seal; a non-zero or timed-out logs call
#           is noted in the output and does not fail the suite. The only direct runner writes into evidence are its own
#           markers (closed immediately).
# Exit: 0 all suites exited 0, every container proven absent, lane inventories clean, payload and evidence manifests
#       verified; 2 usage or refusal (no reservation, lane exists, bad tunable, unsafe path); 3 archive rejected
#       before extraction (sha256 mismatch, member list or member type not allowed) or pinned base image not present
#       (no pull performed); 4 payload content manifest failed after extraction; 5 lane inventory failed or not clean;
#       6 a created container could not be proven removed, or a foreign container carries our name; 7 a suite exited
#       non-zero, timed out, could not start or left no .exit; 8 evidence seal failed or refused (a live process remained
#       in a wait's process group, a descriptor on evidence or the wait outputs is still held, the descriptor scan itself
#       failed or was partial, a direct child could not be reaped within its cap or its state stayed unknown, or a wait
#       output could not be copied into evidence; 8 takes precedence over 7 and 9 because the evidence itself is then
#       untrustworthy, but not over 6/5/4); 9 deadline cut a step or left no
#       room for a suite; 130/143 interrupted by INT/TERM. Flags escalate only a would-be-clean exit; an earlier
#       non-zero code is preserved. After the seal one receipt line goes to stderr: total wall time, external to the
#       sealed evidence (status.txt holds budget_used_pre_seal_s / finished_pre_seal).
# Never: pull, image rm, prune, compose, volumes, networks, published ports, host networking, privileges, ops/local.
set -eu
die() { echo "fleet-guards: $1" >&2; exit "${2-2}"; }
iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
now() { date +%s; }
# posint <name> <value>: a positive decimal integer without a leading zero (shell arithmetic reads 0600 as octal).
posint() { case "$2" in ''|*[!0-9]*|0*) die "$1 must be a positive integer without a leading zero (got '$2')" ;; esac; }

# Internal mode `--seal <dir>`: the step-checked seal of run-baseline.sh (no pipeline, line count must equal the
# enumeration), run as a child under `timeout` by seal_evidence. Prints the failing step and exits 1, or nothing and 0.
if [ "${1-}" = --seal ]; then
  cd "${2:?seal dir}" || { echo chdir; exit 1; }
  rm -f SHA256SUMS.tmp .seal-list.tmp .seal-sorted.tmp
  find . -type f ! -name 'SHA256SUMS*' ! -name '.*.tmp' -print0 > .seal-list.tmp || { echo enumerate; exit 1; }
  sort -z .seal-list.tmp > .seal-sorted.tmp || { echo sort; exit 1; }
  xargs -0 sha256sum < .seal-sorted.tmp > SHA256SUMS.tmp || { echo hash; exit 1; }
  entries=$(tr -cd '\000' < .seal-sorted.tmp | wc -c | tr -d ' ')
  lines=$(wc -l < SHA256SUMS.tmp | tr -d ' ')
  [ "$entries" -gt 0 ] && [ "$lines" -eq "$entries" ] || { echo "count-mismatch (enumerated $entries, hashed $lines)"; exit 1; }
  mv SHA256SUMS.tmp SHA256SUMS || { echo publish; exit 1; }
  exit 0
fi
# Internal mode `--scan <dir> <scratch>`: prints the pids (space-separated, unique) of every process holding an open
# descriptor on a file under <dir>, from one pass over /proc/<pid>/fd (list built by this shell, its own pid excluded)
# with GNU find's -lname (a symlink whose target matches <dir>/*; "(deleted)" targets still match). Checked stages:
# find's stdout and stderr go to files under <scratch> (a sibling of <dir>, so the scan never holds a descriptor under
# the directory it scans), its status is kept, and every stderr line is classified: an error on /proc/<pid> whose
# directory is gone at re-check vanished between enumeration and readlink (tolerable); an error on a pid whose fd
# directory IS readable is an error on one of our own (dumpable) processes (fail closed); an error on a pid whose fd
# directory we cannot read is tolerated ONLY after its credentials are positively established from the REAL, world-
# readable /proc/<pid>/status: the Uid: line must read and parse to four integers (real, effective, saved, fs) and none
# of the four may equal our own uid (taken from both `id -u` and /proc/self/status, which must agree). Any of the four
# equal to ours is an own process whose descriptors we cannot see, exactly the shape of an escaped non-dumpable writer
# (execute-only or setuid image, or PR_SET_DUMPABLE 0; its /proc files are root-owned): fail closed. A status that
# cannot be read or parsed fails closed too (unknown-credentials), unless /proc/<pid> is gone at that moment (vanished);
# any other line, a silent non-zero find, or malformed stdout fails closed. On anything but a clean pass the child prints
# a sentinel (scan-failed:<why> / scan-partial:<why>) and exits 1; fd_holders turns any non-zero child into scan-failed.
# The child trusts nobody: both paths must be absolute and free of whitespace, * ? [ ] and backslash (the lane contract;
# -lname is a glob).
if [ "${1-}" = --scan ]; then
  d=${2:?scan dir}; d=${d%/}; sw=${3:?scratch dir}
  for v in "$d" "$sw"; do
    case "$v" in /*) ;; *) echo 'scan-failed:bad-dir'; exit 1 ;; esac
    case "$v" in *'*'*|*'?'*|*'['*|*']'*|*'\'*|*[[:space:]]*) echo 'scan-failed:bad-dir'; exit 1 ;; esac
  done
  [ -r /proc/self/stat ] && [ -d "$sw" ] || { echo 'scan-failed:no-proc-or-scratch'; exit 1; }
  so="$sw/scan.$$.out"; se="$sw/scan.$$.err"
  set --
  for p in /proc/[0-9]*; do [ "${p#/proc/}" = "$$" ] || set -- "$@" "$p/fd"; done
  [ $# -gt 0 ] || { echo 'scan-failed:no-pids'; exit 1; }
  fst=0; LC_ALL=C find "$@" -maxdepth 1 -type l -lname "$d/*" > "$so" 2> "$se" || fst=$?
  # Our own uid, from two independent sources that must agree (the positional list is no longer needed from here on).
  me1=$(id -u 2>/dev/null) || me1=''; case "$me1" in ''|*[!0-9]*) me1='' ;; esac
  me2=''; while IFS= read -r l; do case "$l" in Uid:*) set -- $l; me2=${2-}; break ;; esac; done < /proc/self/status
  [ -n "$me1" ] && [ "$me1" = "$me2" ] || { rm -f "$so" "$se"; echo "scan-failed:own-uid-unknown:${me1:-?}/${me2:-?}"; exit 1; }
  reason=''
  while IFS= read -r line; do
    case "$line" in "find: '/proc/"*) pid=${line#find: \'/proc/}; pid=${pid%%[!0-9]*} ;; *) reason=unexpected-error; break ;; esac
    [ -n "$pid" ] || { reason=unexpected-error; break; }
    [ ! -r "/proc/$pid/fd" ] || { reason="error-on-own-pid:$pid"; break; }   # readable fd dir = one of ours (dumpable): fail closed
    # Unreadable fd dir: establish the owner's credentials from the real /proc/<pid>/status (0444 even when non-dumpable;
    # never via PROC_ROOT). Tolerated only when all four Uid fields parse and none is ours.
    cred=''; { while IFS= read -r l; do case "$l" in Uid:*) cred=$l; break ;; esac; done < "/proc/$pid/status"; } 2>/dev/null || cred=''
    if [ -z "$cred" ]; then
      [ -d "/proc/$pid" ] || continue                                 # vanished between enumeration and classification
      reason="unknown-credentials:$pid"; break
    fi
    set -- $cred
    [ $# -eq 5 ] || { reason="unknown-credentials:$pid"; break; }
    own=0
    for u in "$2" "$3" "$4" "$5"; do
      case "$u" in ''|*[!0-9]*) reason="unknown-credentials:$pid"; break 2 ;; esac
      [ "$u" != "$me1" ] || own=1
    done
    [ "$own" -eq 0 ] || { reason="error-on-own-pid:$pid"; break; }   # ours but unreadable: an escaped non-dumpable writer's shape
  done < "$se"
  if [ -z "$reason" ] && [ "$fst" -ne 0 ] && [ ! -s "$se" ]; then reason="find-exit-$fst-silent"; fi
  seen=''
  if [ -z "$reason" ]; then
    while IFS= read -r line; do
      case "$line" in /proc/*/fd/*) pid=${line#/proc/}; pid=${pid%%/*} ;; *) reason=bad-output; break ;; esac
      case "$pid" in ''|*[!0-9]*) reason=bad-output; break ;; esac
      case " $seen " in *" $pid "*) ;; *) seen="$seen $pid" ;; esac   # dedupe in the shell: no sort, no pipeline
    done < "$so"
  fi
  rm -f "$so" "$se"
  [ -z "$reason" ] || { echo "scan-partial:$reason"; exit 1; }
  # The only output on the proof path is one builtin printf whose own status decides the exit: there is no pipeline
  # anywhere in this child, so a failed stage can never be read by the parent as an empty (clean) holder list.
  [ -z "$seen" ] || printf '%s' "${seen# }" || exit 1
  exit 0
fi
SELF=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/$(basename -- "$0")
[ -f "$SELF" ] || die "cannot locate this script's own path (needed for the bounded seal step)"

DRY=0
if [ "${1-}" = --dry-run ]; then DRY=1; shift; fi
[ $# -eq 3 ] || die "usage: fleet-guards.sh [--dry-run] <payload.tar> <expected archive sha256> <lane dir>"
PAYLOAD=$1; EXPECTED_SHA=$2; LANE=$3
case "$PAYLOAD$LANE" in *[[:space:]]*) die "payload and lane paths must not contain whitespace" ;; esac
# Lane contract: the lane path is used as a glob prefix by the descriptor scan (find -lname), so it may not contain
# glob characters or a backslash; re-checked after canonicalization and again inside the --scan child.
case "$PAYLOAD$LANE" in *'*'*|*'?'*|*'['*|*']'*|*'\'*) die "payload and lane paths must not contain * ? [ ] or a backslash" ;; esac
case "$PAYLOAD" in /*) ;; *) die "payload path must be absolute" ;; esac
case "$LANE" in /*) ;; *) die "lane dir must be absolute" ;; esac
[ ${#EXPECTED_SHA} -eq 64 ] || die "expected archive sha256 must be 64 hex characters"
case "$EXPECTED_SHA" in *[!0-9a-f]*) die "expected archive sha256 must be lowercase hex" ;; esac

IMAGE_REF='ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2'
SUITES='pack-modes-guards fleet-guards-guards run-baseline-guards cleanup-guards'; N_SUITES=4
TOTAL_BUDGET=${PERF01_TOTAL_BUDGET-3200}; DOCKER_TIMEOUT=${PERF01_DOCKER_TIMEOUT-20}
S_PM=${PERF01_SUITE_TIMEOUT_PM-120}; S_FG=${PERF01_SUITE_TIMEOUT_FG-120}; S_RB=${PERF01_SUITE_TIMEOUT_RB-600}; S_CU=${PERF01_SUITE_TIMEOUT_CU-300}
KILL=5; CLEANUP_CALL=15; LOCAL_CALL=30; SUITE_KILL=20; LOGS_CALL=60; SCAN_CALL=5
REAP_SETTLE=2; REAP_GRACE=5                        # post-KILL settle poll; its allowance incl. group scans and the child-poll cap
FD_SCAN=$((SCAN_CALL + KILL)); SCAN=$((1 + FD_SCAN))  # one bounded descriptor pass; per-suite group pass + descriptor pass + copy
LOGS_RUN=$((LOGS_CALL - REAP_GRACE - SCAN))         # the docker logs call itself (44); LOGS = LOGS_RUN + KILL + REAP_GRACE + SCAN stays 65
posint PERF01_TOTAL_BUDGET "$TOTAL_BUDGET"; posint PERF01_DOCKER_TIMEOUT "$DOCKER_TIMEOUT"
posint PERF01_SUITE_TIMEOUT_PM "$S_PM"; posint PERF01_SUITE_TIMEOUT_FG "$S_FG"; posint PERF01_SUITE_TIMEOUT_RB "$S_RB"; posint PERF01_SUITE_TIMEOUT_CU "$S_CU"
[ "$DOCKER_TIMEOUT" -ge 5 ] && [ "$DOCKER_TIMEOUT" -le 60 ] || die "PERF01_DOCKER_TIMEOUT must be 5..60"
for s in $S_PM $S_FG $S_RB $S_CU; do [ "$s" -ge 60 ] && [ "$s" -le 1800 ] || die "every PERF01_SUITE_TIMEOUT_* must be 60..1800"; done
suite_timeout() { case $1 in pack-modes-guards) echo "$S_PM" ;; fleet-guards-guards) echo "$S_FG" ;; run-baseline-guards) echo "$S_RB" ;; cleanup-guards) echo "$S_CU" ;; esac; }
# Derived worst-case bounds; every `timeout -k KILL T` call is counted at T + KILL.
SHORT=$((DOCKER_TIMEOUT + KILL)); CLEAN=$((CLEANUP_CALL + KILL)); LOCAL=$((LOCAL_CALL + KILL)); LOGS=$((LOGS_CALL + KILL))
CLEAN_CALLS=6                                   # lookup, ownership inspect, stop, rm, id proof, name proof
SUITE_TAIL=$((LOGS + CLEAN_CALLS * CLEAN)); SUITE_OVERHEAD=$((2 * SHORT + SUITE_TAIL + SCAN + REAP_GRACE))
PRE=$((5 * LOCAL + 2 * SHORT))
SIGNAL_REAP=$((SUITE_KILL + KILL + REAP_GRACE + FD_SCAN))  # group TERM/KILL, settle, capped reap, group + descriptor proof
RESERVE=$((N_SUITES * CLEAN_CALLS * CLEAN + (3 + N_SUITES) * CLEAN + LOCAL + LOCAL + SIGNAL_REAP + FD_SCAN))
SUITES_WORST=$((S_PM + S_FG + S_RB + S_CU + N_SUITES * (SUITE_KILL + SUITE_OVERHEAD)))
MIN_BUDGET=$((PRE + SUITES_WORST + RESERVE))
[ "$TOTAL_BUDGET" -ge "$MIN_BUDGET" ] || die "PERF01_TOTAL_BUDGET ($TOTAL_BUDGET) below MIN_BUDGET $MIN_BUDGET = PRE $PRE + suites $SUITES_WORST + RESERVE $RESERVE"
[ "$TOTAL_BUDGET" -le 3600 ] || die "PERF01_TOTAL_BUDGET must stay within a 60 min lease"

# The exact member set a payload must contain, bytewise sorted (regular files, plus `scripts/` as an empty directory).
# pack-guards.sh reads this block and refuses to pack anything else, so the two lists cannot drift.
write_expected_members() {
cat > "$1" <<'MEMBERS'
PAYLOAD.meta
PAYLOAD.sha256
apps/server/Dockerfile
apps/server/Gemfile
apps/server/Gemfile.lock
compose.yaml
ops/compose.secrets.yaml
ops/perf/cleanup.sh
ops/perf/compose.perf.yaml
ops/perf/lib.sh
ops/perf/load.rb
ops/perf/preflight.sh
ops/perf/run-baseline.sh
ops/perf/sample.sh
ops/perf/sql/explain-rls.sql
ops/perf/tests/cleanup-guards.sh
ops/perf/tests/fakebin/date
ops/perf/tests/fakebin/docker
ops/perf/tests/fleet-guards-guards.sh
ops/perf/tests/fleet-guards.sh
ops/perf/tests/pack-guards.sh
ops/perf/tests/pack-modes-guards.sh
ops/perf/tests/run-baseline-guards.sh
ops/tests/db-fixtures.sql
scripts/
MEMBERS
}
MEMBER_COUNT=25

nonce() {
  if [ -r /proc/sys/kernel/random/uuid ]; then tr -d '\n-' < /proc/sys/kernel/random/uuid
  else od -An -N16 -tx1 /dev/urandom | tr -d ' \n'; fi
}
NONCE=$(nonce)
case "$NONCE" in ''|*[!0-9a-f]*) die "could not derive a hex lane nonce" ;; esac
RUN="perf01-guards-$(date -u +%Y%m%dT%H%M%SZ)"
container_name() { echo "perf01-guards-$NONCE-$1"; }
suite_user() { case $1 in run-baseline-guards) echo '' ;; *) echo ' --user 65534:65534' ;; esac; }
OWN_FORMAT='{{index .Config.Labels "elevateo.perf.task"}}|{{index .Config.Labels "elevateo.perf.lane"}}|{{index .Config.Labels "elevateo.perf.run"}}|{{range .Mounts}}{{.Type}}:{{.Source}}:{{.Destination}};{{end}}'
# create_args <suite>: the one docker create invocation, shared by the dry run and the real run so they cannot drift.
# All four suites declare #!/bin/sh and are POSIX sh, so they are started with `sh`, exactly as the shebang says.
# The /tmp tmpfs carries `exec`: Docker mounts --tmpfs with noexec,nosuid,nodev by default (moby oci_linux.go) and a
# later `exec` overrides noexec; every suite runs its fake CLIs and shims from /tmp (fakebin copies, fake docker/date,
# the execute-only writer of regression case 15), which a noexec /tmp would refuse with EACCES. nosuid and nodev stay.
create_args() {
  printf '%s' "create --name $(container_name "$1") --label elevateo.perf.task=perf01 --label elevateo.perf.lane=$NONCE --label elevateo.perf.run=$RUN --pull never --init --network none --read-only --tmpfs /tmp:size=256m,mode=1777,exec --cpus 0.5 --memory 256m --memory-swap 256m --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges$(suite_user "$1") --mount type=bind,src=$LANE/payload,dst=/repo,readonly $IMAGE_REF sh /repo/ops/perf/tests/$1.sh /repo"
}

if [ "$DRY" -eq 1 ]; then
  T="timeout -k $KILL min($DOCKER_TIMEOUT,remaining) docker"
  C="timeout -k $KILL $CLEANUP_CALL docker"
  L="timeout -k $KILL $LOCAL_CALL"
  cat <<EOF
fleet-guards DRY RUN: nothing below is executed, nothing is created, docker is not called.
lane=$LANE  nonce=$NONCE  run=$RUN
payload=$PAYLOAD
expected_archive_sha256=$EXPECTED_SHA
image=$IMAGE_REF
budget derivation (s): D=$DOCKER_TIMEOUT K=$KILL  SHORT=$SHORT CLEAN=$CLEAN LOCAL=$LOCAL LOGS=$LOGS  SUITE_TAIL=LOGS+$CLEAN_CALLS*CLEAN=$SUITE_TAIL  FD_SCAN=SCAN_CALL+K=$FD_SCAN  SCAN=1+FD_SCAN=$SCAN
  LOGS split: LOGS_RUN=LOGS_CALL-REAP_GRACE-SCAN=$LOGS_RUN (the docker logs call) + K $KILL + REAP_GRACE $REAP_GRACE (poll excess) + SCAN $SCAN (group + descriptor proof, copy) = $((LOGS_RUN + KILL + REAP_GRACE + SCAN)) = LOGS
  SUITE_OVERHEAD=2*SHORT+SUITE_TAIL+SCAN+REAP_GRACE=$SUITE_OVERHEAD   PRE=5*LOCAL+2*SHORT=$PRE
  suites: pack-modes $S_PM + fleet-guards-guards $S_FG + run-baseline $S_RB + cleanup $S_CU + $N_SUITES*(SUITE_KILL $SUITE_KILL + SUITE_OVERHEAD)=$SUITES_WORST
  REAP_GRACE=$REAP_GRACE (REAP_SETTLE $REAP_SETTLE + granularity + group scans; also the normal-path child-poll cap beyond w+SUITE_KILL)  SIGNAL_REAP=SUITE_KILL+K+REAP_GRACE+FD_SCAN=$SIGNAL_REAP
  RESERVE=$N_SUITES*$CLEAN_CALLS*CLEAN+(3+$N_SUITES)*CLEAN+LOCAL+LOCAL+SIGNAL_REAP+FD_SCAN=$RESERVE   MIN_BUDGET=$MIN_BUDGET  TOTAL=$TOTAL_BUDGET  (TOTAL - MIN = $((TOTAL_BUDGET - MIN_BUDGET)) slack; lease request 60 min)
  remaining = DEADLINE - now - RESERVE before every docker call; remaining <= 0 => call not issued (125), step recorded as cut, straight to cleanup (exit 9)
  operator watchdog: run as  timeout -k 60 $((TOTAL_BUDGET + 300)) sh $SELF …  (external bound; a watchdog kill leaves the evidence UNSEALED = fail-closed)
  no in-script wait blocks: the direct child is polled on /proc/<pid>/stat (normal path cap w+SUITE_KILL+REAP_GRACE; signal/cleanup path $((SUITE_KILL + KILL))+${REAP_SETTLE}s) and
  \`wait\` runs only once it is a zombie or gone; a child alive after the cap is recorded, not waited for, the suite failed and the seal refused
 0  require PERF01_RESERVATION (coordinator lease; value never written to evidence); DEADLINE = now + ${TOTAL_BUDGET}s
    INT/TERM => the pending wait's process group is TERMed (-pgid), polled <= $((SUITE_KILL + KILL))s, KILLed (-pgid) if anything is left, settled <= ${REAP_SETTLE}s,
    reaped (capped poll + wait), then PROVEN gone by the group scan AND by the descriptor scan (timeout -k $KILL $SCAN_CALL sh $SELF --scan $LANE/tmp) BEFORE the seal; exit 130/143 after cleanup
    lane contract: payload and lane paths absolute, no whitespace, no * ? [ ] \\ (checked on the arguments, on the canonical lane path, and inside --scan); exit 2 otherwise
 1  mkdir $LANE  (exclusive, exit 2 if present); mkdir $LANE/payload $LANE/evidence $LANE/tmp $LANE/scan   (tmp: wait outputs until proven unheld; scan: --scan scratch, never inside a scanned dir)
 2a $L sha256sum $PAYLOAD  == $EXPECTED_SHA   (else exit 3, nothing read by tar)
 2b $L tar -tvf $PAYLOAD  (status checked) -> every member type '-' or 'd', no leading /, no .. component;
    sorted member names == the $MEMBER_COUNT-entry list embedded in this script  (else exit 3, nothing extracted)
 2c $L tar -xf $PAYLOAD -C $LANE/payload --no-same-owner --no-same-permissions
    (cd $LANE/payload && $L sha256sum -c --quiet PAYLOAD.sha256)   (fail closed, exit 4); $L find (file count must equal manifest lines)
 3  $T image inspect --format {{.Id}} $IMAGE_REF      (exit 3 if absent; never pulls)
 4  $T ps -aq --filter label=elevateo.perf.lane=$NONCE   (must exit 0 AND print nothing; nothing else on the host is checked)
EOF
  for s in $SUITES; do S=$(suite_timeout "$s"); cat <<EOF
 5  [$s] skip with exit 9 unless remaining >= S+SUITE_KILL+SUITE_OVERHEAD = $((S + SUITE_KILL + SUITE_OVERHEAD))s
    echo "$s $(container_name "$s") $NONCE" >> evidence/names.txt ; : > evidence/$s.attempted          (both BEFORE create)
    $T $(create_args "$s")
    $T start <id>
    w = min($S, remaining - $SUITE_KILL - $REAP_GRACE - $SUITE_TAIL - $SCAN); w <= 0 => wait not issued, cut recorded, suite failed, container cleaned
    setsid -w sh -c 'echo \$\$ > evidence/$s.wait.pgid; exec timeout -k $SUITE_KILL w docker wait <id>' > tmp/$s.exit.part 2> tmp/$s.wait.err.part &   (own process group, interruptible)
    pgid handshake <= 5 s (50 x 0.1 s) charged to the cap: cap_s = w+$SUITE_KILL+$REAP_GRACE - handshake_s >= w+$SUITE_KILL (R8-3; only the poll excess shrinks)
    child polled on /proc/<pid>/stat <= cap_s until zombie/gone, then wait; still alive => recorded "direct child … not reaped", suite failed, seal refused
    then /proc group scan (no live pid in that group; zombies tolerated) AND timeout -k $KILL $SCAN_CALL sh $SELF --scan $LANE/tmp $LANE/scan (no process holds a descriptor under tmp/;
    checked stages: find status + stderr classified, a scan that fails, is partial or malformed is a holder named scan-failed/scan-partial, never a clean pass;
    an unreadable fd dir is tolerated only when the real /proc/<pid>/status Uid: line parses to four uids none of which is ours (id -u and /proc/self/status must agree),
    so any same-uid non-dumpable process on the host at scan time refuses the seal: run under an account with no such processes, or stop them for the run;
    the child's holder list is deduplicated in the shell and printed by one status-checked printf: no pipeline on the proof path)
    both empty => cp tmp/$s.exit.part evidence/$s.exit, cp tmp/$s.wait.err.part evidence/$s.wait.err   (either cp failing => .exit marker evidence-copy-failed, suite failed, seal refused, exit 8)
    (a survivor or holder: suite failed, pids recorded, seal refused, nothing copied; an interrupted suite gets a runner-written .exit marker and its outputs stay in tmp/)
    status.txt line "suite=$s suite_wall_create_to_wait_return_s=<n> (S=$S wait_bound=<w>s) handshake_s=<h> cap_s=<c>"   (per-suite wall clock, create to wait return: first-run evidence for S_i; no budget change)
    lb = min($LOGS_RUN, remaining - $KILL - $REAP_GRACE - $SCAN); lb <= 0 => evidence/$s.log = runner-written "docker logs skipped" marker, cut recorded (exit 9)
    setsid -w sh -c 'echo \$\$ > evidence/$s.logs.pgid; exec timeout -k $KILL lb docker logs <id>' > tmp/$s.log.part 2>&1 &   (same shape as the wait: own group, interruptible)
    pgid handshake <= 5 s charged to the cap (cap_s = lb+$KILL+$REAP_GRACE - handshake_s >= lb+$KILL); child polled <= cap_s until zombie/gone, then wait (alive after the cap => wait-child-unreaped marker in $s.log, seal refused);
    status.txt line "suite=$s logs_wall_s=<n> lb=<lb> handshake_s=<h> cap_s=<c>"   (the step's wall clock from before its launch; stays <= LOGS $LOGS)
    a non-zero or timed-out logs call appends "[fleet-guards] docker logs exit <n> (bounded lb s)" to the .part and does NOT fail the suite;
    then the same group scan AND --scan $LANE/tmp proof; both empty => cp tmp/$s.log.part evidence/$s.log (cp failure => evidence-copy-failed marker, seal refused);
    a survivor or holder => runner-written wait-writer-alive marker in evidence/$s.log, pids recorded, seal refused, nothing copied
 6  [$s] (no id returned: $C ps -aq --no-trunc --filter name=^$(container_name "$s")\$ to find it)
    $C inspect --format '$OWN_FORMAT' <id>   => must be perf01|$NONCE|$RUN|bind:$LANE/payload:/repo; (tmpfs::/tmp; tolerated); else "foreign container with our name; not removed", exit 6
    $C stop -t 5 <id> ; $C rm -f <id>
    $C ps -aq --no-trunc --filter id=<id>            (must exit 0 AND print nothing)
    $C ps -aq --filter name=^$(container_name "$s")\$   (must exit 0 AND print nothing; anything else = exit 6)
EOF
  done
  cat <<EOF
 6' at exit: attempted suites not yet proven absent get the same inspect/stop/rm/prove by recorded id or exact name;
    never-attempted suites get inventory only ($C ps -aq --filter name=^<name>\$ must exit 0 and be empty, else exit 5), nothing removed
 7  $C ps -aq --filter label=elevateo.perf.lane=$NONCE
    $C volume ls -q --filter label=elevateo.perf.lane=$NONCE
    $C network ls -q --filter label=elevateo.perf.lane=$NONCE
EOF
  for s in $SUITES; do echo "    $C ps -aq --filter name=^$(container_name "$s")\$"; done
  cat <<EOF
    (each: exit 0 AND empty, else exit 5); verdict also requires evidence/<suite>.exit first line 0 for all $N_SUITES suites
 8  (cd $LANE/payload && $L sha256sum -c --quiet PAYLOAD.sha256)       -> evidence/payload-verify-after.txt
    pre-seal proof: every evidence/*.wait.pgid and evidence/*.logs.pgid group has no live pid in /proc AND timeout -k $KILL $SCAN_CALL sh $SELF --scan $LANE/evidence $LANE/scan finds no descriptor holder
    (else SHA256SUMS.FAILED "evidence writer alive (pgid=N ... pids=...)[; evidence copy failed (...)]; seal not stable", no SHA256SUMS, exit 8 unless 6/5/4 already apply; 8 precedes 7 and 9)
    status.txt summary (budget_used_pre_seal_s, finished_pre_seal, wait_groups_live); $L sh $SELF --seal $LANE/evidence  (step-checked SHA256SUMS; SHA256SUMS.FAILED + exit 8 otherwise)
    stderr receipt after the seal: "fleet-guards: total wall <N>s (external receipt; evidence sealed before it)"
never: pull, image rm, prune, compose, volumes, networks, ports, host networking, privileges, ops/local
EOF
  exit 0
fi

# ----------------------------------------------------------------------------------------------------------------------
[ -n "${PERF01_RESERVATION-}" ] || die "refusing: PERF01_RESERVATION is unset (coordinator lease required); nothing touched"
command -v timeout >/dev/null 2>&1 || die "coreutils timeout not found"
command -v docker >/dev/null 2>&1 || die "docker CLI not found"
command -v setsid >/dev/null 2>&1 || die "util-linux setsid not found (needed to run docker wait in its own process group)"
[ -r /proc/self/stat ] || die "/proc is not readable; the process-group absence proof cannot run"
[ -f "$PAYLOAD" ] || die "payload not found: $PAYLOAD"
START=$(now); DEADLINE=$((START + TOTAL_BUDGET))

mkdir "$LANE" 2>/dev/null || die "lane dir exists or cannot be created ($LANE); nothing touched"
LANE=$(CDPATH= cd -- "$LANE" && pwd -P)   # canonical, so the bind source reported by docker compares equal
case "$LANE" in *'*'*|*'?'*|*'['*|*']'*|*'\'*|*[[:space:]]*)   # the canonical form may differ from the argument (symlinked parent)
  rmdir "$LANE" 2>/dev/null || true; die "canonical lane path contains whitespace, * ? [ ] or a backslash ($LANE); empty lane removed" ;; esac
PAY="$LANE/payload"; EVID="$LANE/evidence"; TMPW="$LANE/tmp"; SCANW="$LANE/scan"   # TMPW: wait outputs until proven unheld; SCANW: --scan scratch
mkdir "$PAY" "$EVID" "$TMPW" "$SCANW"
CONTAINERS=''; VERIFIED=''; IMAGE_ID=''; ARCHIVE_SHA=''; DEADLINE_HIT=''; STEP=init; SIGNAL=''
WAIT_PID=''; WAIT_SUITE=''; WAIT_PGID_FILE=''; WRITER_ALIVE=''; EVIDENCE_BAD=''
WAIT_STEP=wait   # which pair the pending child is: wait (.exit.part/.wait.err.part -> .exit/.wait.err) or logs (.log.part -> .log)
# PERF01_TEST_PROC_ROOT: regression-only override of the directory child_state reads <pid>/stat from (gone-detection
# stays on the real /proc). Whenever set it is announced on stderr and recorded in evidence, so no production run can
# use it silently.
PROC_ROOT=${PERF01_TEST_PROC_ROOT-/proc}
SUITE_FAIL=0; CLEANUP_FAIL=0; INVENTORY_FAIL=0; PAYLOAD_FAIL=0; SEAL_FAIL=0; BUDGET_FAIL=0
# pgrp_of <pid>: the process-group field of /proc/<pid>/stat (field 3 after the parenthesised comm); empty if unreadable.
pgrp_of() { IFS= read -r pg_s < "/proc/$1/stat" 2>/dev/null || return 0; pg_s=${pg_s##*) }; set -- $pg_s; echo "${3-}"; }
OWN_PGID=$(pgrp_of $$)
rec() { echo "$(iso) $*" >> "$EVID/status.txt"; }
clog() { echo "$(iso) $*" >> "$EVID/cleanup.log"; }
remaining() { echo $((DEADLINE - $(now) - RESERVE)); }
lt() { timeout -k "$KILL" "$LOCAL_CALL" "$@"; }            # bounded local step (sha256sum, tar, find)
# dk: a docker call under the deadline. Once only RESERVE remains it is NOT issued (status 125) and the current step is
# recorded as cut; otherwise it runs under min(PERF01_DOCKER_TIMEOUT, remaining).
dk() {
  rem=$(remaining)
  if [ "$rem" -le 0 ]; then
    [ -n "$DEADLINE_HIT" ] || DEADLINE_HIT=$STEP
    rec "deadline reached at step $STEP: docker $1 ${2-} not issued"; return 125
  fi
  t=$DOCKER_TIMEOUT; [ "$rem" -lt "$t" ] && t=$rem
  timeout -k "$KILL" "$t" docker "$@"
}
dkc() { timeout -k "$KILL" "$CLEANUP_CALL" docker "$@"; }  # cleanup-reserve calls: fixed small bound inside RESERVE
DK=dk
budget_or_cleanup() { [ -z "$DEADLINE_HIT" ] || die "deadline cut step $DEADLINE_HIT; going straight to cleanup under the ${RESERVE}s reserve" 9; }

# verify_owned <suite> <id>: true only when inspect shows our three labels and a mount set that is solely the lane
# payload bind (a tmpfs at /tmp is tolerated if the daemon lists it). A failed inspect or any mismatch is not ours.
verify_owned() {
  vst=0; own=$(dkc inspect --format "$OWN_FORMAT" "$2" 2>> "$EVID/cleanup.log") || vst=$?
  if [ "$vst" -ne 0 ]; then clog "$1: ownership of $2 not proven (inspect exit $vst); not removed"; return 1; fi
  labels=${own%|*}; mounts=${own##*|}
  if [ "$labels" != "perf01|$NONCE|$RUN" ]; then clog "$1: foreign container with our name ($2, labels '$labels'); not removed"; return 1; fi
  bind=0; oldifs=$IFS; IFS=';'
  for m in $mounts; do
    case "$m" in '') ;; "bind:$LANE/payload:/repo") bind=1 ;; 'tmpfs::/tmp') ;; *) IFS=$oldifs; clog "$1: foreign container with our name ($2, mount '$m'); not removed"; return 1 ;; esac
  done
  IFS=$oldifs
  [ "$bind" -eq 1 ] || { clog "$1: foreign container with our name ($2, payload bind missing); not removed"; return 1; }
  return 0
}
# cleanup_container <suite> <name> <ids...>: for every id (given, or found by exact-name lookup when create returned
# none) prove ownership, then stop and force-remove; then PROVE absence by successful inventories: `ps -aq --no-trunc
# --filter id=<id>` for every id and `ps -aq --filter name=^<name>$` must each exit 0 with empty output. Error text is
# never trusted. Worst case CLEAN_CALLS calls per container.
cleanup_container() {
  suite=$1; name=$2; shift 2; ids="$*"
  if [ -z "$ids" ]; then
    fst=0; ids=$(dkc ps -aq --no-trunc --filter "name=^$name\$" 2>> "$EVID/cleanup.log") || fst=$?
    if [ "$fst" -ne 0 ]; then clog "$suite: lookup by exact name failed (exit $fst); absence not proven"; CLEANUP_FAIL=1; return 0; fi
    clog "$suite: lookup by exact name $name listed: ${ids:-nothing}"
  fi
  foreign=0
  for i in $ids; do
    if verify_owned "$suite" "$i"; then
      dkc stop -t 5 "$i" > /dev/null 2>> "$EVID/cleanup.log" || clog "$suite: stop $i exit $? (continuing with rm -f)"
      dkc rm -f "$i" > /dev/null 2>> "$EVID/cleanup.log" || clog "$suite: rm -f $i exit $?"
    else foreign=1; fi
  done
  if [ "$foreign" -eq 1 ]; then CLEANUP_FAIL=1; return 0; fi
  absent=1
  for i in $ids; do
    st=0; out=$(dkc ps -aq --no-trunc --filter "id=$i" 2>> "$EVID/cleanup.log") || st=$?
    if [ "$st" -ne 0 ] || [ -n "$out" ]; then absent=0; clog "$suite: id $i NOT proven absent (ps exit $st, output '$out')"; fi
  done
  st=0; out=$(dkc ps -aq --filter "name=^$name\$" 2>> "$EVID/cleanup.log") || st=$?
  if [ "$st" -ne 0 ] || [ -n "$out" ]; then absent=0; clog "$suite: name $name NOT proven absent (ps exit $st, output '$out')"; fi
  if [ "$absent" -eq 1 ]; then clog "$suite: proven absent (id and exact-name inventories exit 0, empty)"; VERIFIED="$VERIFIED $suite"
  else CLEANUP_FAIL=1; fi
}
# inv <kind> <docker args...>: records output and exit status separately; true only when exit 0 AND output empty.
inv() {
  kind=$1; shift
  st=0; $DK "$@" > "$EVID/inventory-$kind.txt" 2> "$EVID/inventory-$kind.err" || st=$?
  echo "$st" > "$EVID/inventory-$kind.exit"
  [ "$st" -eq 0 ] && [ ! -s "$EVID/inventory-$kind.txt" ]
}
# seal_evidence: refused outright while any wait group still holds a live process (WRITER_ALIVE); otherwise runs this
# script's --seal mode as a child under the local bound; a timeout is a failed seal.
seal_evidence() {
  if [ -n "$WRITER_ALIVE" ] || [ -n "$EVIDENCE_BAD" ]; then
    rm -f "$EVID/SHA256SUMS"
    sm=''
    [ -z "$WRITER_ALIVE" ] || sm="evidence writer alive (${WRITER_ALIVE# })"
    [ -z "$EVIDENCE_BAD" ] || sm="${sm:+$sm; }evidence copy failed (${EVIDENCE_BAD# })"
    echo "$sm; seal not stable; no SHA256SUMS published at $(iso)" > "$EVID/SHA256SUMS.FAILED"
    SEAL_FAIL=1; return 0
  fi
  sst=0; seal_step=$(lt sh "$SELF" --seal "$EVID") || sst=$?
  rm -f "$EVID/.seal-list.tmp" "$EVID/.seal-sorted.tmp" "$EVID/SHA256SUMS.tmp"
  if [ "$sst" -eq 0 ]; then rm -f "$EVID/SHA256SUMS.FAILED"
  else
    [ -n "$seal_step" ] || seal_step="timeout-or-crash (exit $sst)"
    rm -f "$EVID/SHA256SUMS"
    echo "sealing failed at step $seal_step at $(iso); no SHA256SUMS published" > "$EVID/SHA256SUMS.FAILED"; SEAL_FAIL=1
  fi
}
# group_alive <pgid>: prints the pids of every non-zombie process whose pgrp is <pgid> (one pass over /proc with builtin
# reads; empty output = none). Zombies hold no descriptors and are tolerated. An empty pgid or a missing /proc prints a
# sentinel, so the caller fails closed.
group_alive() {
  ga_g=$1
  [ -n "$ga_g" ] || { echo unknown-pgid; return 0; }
  [ -r /proc/self/stat ] || { echo no-proc; return 0; }
  for ga_st in /proc/[0-9]*/stat; do
    IFS= read -r ga_s < "$ga_st" 2>/dev/null || continue
    ga_p=${ga_st#/proc/}; ga_p=${ga_p%/stat}; ga_s=${ga_s##*) }
    set -- $ga_s
    if [ "${3-}" = "$ga_g" ] && [ "${1-}" != Z ]; then printf '%s ' "$ga_p"; fi
  done
  return 0
}
# fd_holders <dir>: pids of every process holding an open descriptor on a file under <dir> (this script's --scan child
# under `timeout -k KILL SCAN_CALL`, scratch under SCANW). Any non-zero child (sentinel, timeout, crash) prints
# scan-failed:<child output>:exit-<n>, never an empty string, so the caller fails closed.
fd_holders() {
  fh_out=$(timeout -k "$KILL" "$SCAN_CALL" sh "$SELF" --scan "$1" "$SCANW" 2>/dev/null) \
    || { fh_st=$?
         # Cosmetic join of the child's words with _ (no pipeline: a failed stage cannot blank the sentinel, whose
         # literal scan-failed: prefix and exit code are printed regardless).
         set -f; set -- ${fh_out:-no-output}; set +f
         fh_j=$(IFS=_; printf '%s' "$*") || fh_j=''
         printf 'scan-failed:%s:exit-%s' "${fh_j:-unprintable}" "$fh_st"; return 0; }
  printf '%s' "$fh_out"
}
# child_state <pid>: "gone" ONLY when /proc/<pid> does not exist; one state letter from the known set when the stat line
# (read from PROC_ROOT, /proc unless the regression override is set) is readable and parses; "unknown" otherwise
# (unreadable, empty, unparsable). Callers treat unknown as alive: it is never waited for.
child_state() {
  [ -d "/proc/$1" ] || { echo gone; return 0; }
  cs_x=''; { IFS= read -r cs_x < "$PROC_ROOT/$1/stat"; } 2>/dev/null || { echo unknown; return 0; }
  cs_x=${cs_x##*) }; set -- $cs_x
  case "${1-}" in R|S|D|Z|T|t|W|X|x|K|P|I) echo "$1" ;; *) echo unknown ;; esac
}
# await_child <cap_s>: poll the direct child WAIT_PID on /proc until it is a zombie (Z) or gone, then `wait` it, which
# returns at once; WST holds its status. Returns 1 WITHOUT waiting when the child is still alive or unknown (any state,
# D, T and unknown included) after the cap. The cap is 2*cap iterations of `sleep 0.5` (real elapsed time, immune to a
# wall-clock jump, which the deadline logic handles separately); each iteration adds only one /proc read. Never blocks,
# on any path: `wait` is reached only through the Z|gone break below.
await_child() {
  ac_cap=$1; ac_i=0
  while :; do
    CHILD_STATE=$(child_state "$WAIT_PID")
    case "$CHILD_STATE" in Z|gone) break ;; esac
    [ "$ac_i" -lt $((ac_cap * 2)) ] || return 1
    ac_i=$((ac_i + 1)); sleep 0.5
  done
  WST=0; wait "$WAIT_PID" 2>/dev/null || WST=$?
  return 0
}
# abandon_child <pgid>: the direct child outlived its cap; record it, fail the suite, refuse the seal, do NOT wait.
abandon_child() {
  rec "suite=$WAIT_SUITE: direct child pid $WAIT_PID still alive (state $CHILD_STATE) after the bound; not reaped"
  WRITER_ALIVE="$WRITER_ALIVE pgid=${1:-unknown} suite=$WAIT_SUITE unreaped-child=$WAIT_PID:$CHILD_STATE"
  case "${WAIT_STEP:-wait}" in logs) ab_out=log ;; *) ab_out=exit ;; esac   # the marker replaces the step's own output file
  echo "wait-child-unreaped (pid $WAIT_PID state $CHILD_STATE)" > "$EVID/$WAIT_SUITE.$ab_out"; SUITE_FAIL=1
  WAIT_PID=''
}
# wait_pgid: the group leader recorded by the wait's own shell before exec, or (file not written yet) the live pgrp of
# WAIT_PID; never our own group; empty when unknown.
wait_pgid() {
  wp=''; [ ! -s "$WAIT_PGID_FILE" ] || IFS= read -r wp < "$WAIT_PGID_FILE"
  case "$wp" in ''|*[!0-9]*) wp=$(pgrp_of "$WAIT_PID") ;; esac
  case "$wp" in ''|*[!0-9]*|"$OWN_PGID") wp='' ;; esac
  echo "$wp"
}
# settle_wait <pgid> <copy|interrupted>: after the shell-level reap, prove (1) the pending child's process group holds no
# live process and (2) no process at all holds a descriptor on a file under TMPW (a writer that called setsid itself
# leaves the group but keeps the inherited stdout; the descriptor scan catches it). Then either copy the .part outputs
# into evidence (cp: fresh inodes no writer can hold) or, for an interrupted step, write a runner-owned marker and leave
# the outputs under TMPW (they are not a result). A survivor or holder is recorded with its pids, fails the suite and
# sets WRITER_ALIVE, which refuses the seal. Returns 1 on a survivor or holder. WAIT_STEP selects the file pair (R8):
# wait = .exit.part + .wait.err.part -> .exit + .wait.err (markers in .exit); logs = .log.part -> .log (markers in .log).
settle_wait() {
  sw_alive=$(group_alive "$1"); sw_fd=$(fd_holders "$TMPW")
  sw_step=${WAIT_STEP:-wait}; case "$sw_step" in logs) sw_out=log ;; *) sw_out=exit ;; esac
  if [ -n "$sw_alive" ] || [ -n "$sw_fd" ]; then
    WRITER_ALIVE="$WRITER_ALIVE pgid=${1:-unknown} suite=$WAIT_SUITE step=$sw_step group-pids=$(echo ${sw_alive:-none} | tr ' ' ,) descriptor-holders=$(echo ${sw_fd:-none} | tr ' ' ,)"
    echo "wait-writer-alive (pgid ${1:-unknown} group pids: ${sw_alive:-none}; descriptor holders under tmp: ${sw_fd:-none})" > "$EVID/$WAIT_SUITE.$sw_out"; SUITE_FAIL=1
    rec "suite=$WAIT_SUITE: writer(s) survive the $sw_step: group ${1:-unknown} pids ${sw_alive:-none}; descriptor holders under $TMPW: ${sw_fd:-none}; outputs NOT copied; the seal will be refused"
    return 1
  fi
  if [ "$2" = copy ]; then
    # The .part files exist whenever the step was launched: the shell creates them for the redirections before setsid
    # runs. A missing one is therefore a failure like any other cp failure; every copy failure is an evidence failure.
    cf=''
    if [ "$sw_step" = logs ]; then
      cp "$TMPW/$WAIT_SUITE.log.part" "$EVID/$WAIT_SUITE.log" 2>> "$EVID/cleanup.log" || cf='log.part'
    else
      cp "$TMPW/$WAIT_SUITE.exit.part" "$EVID/$WAIT_SUITE.exit" 2>> "$EVID/cleanup.log" || cf='exit.part'
      cp "$TMPW/$WAIT_SUITE.wait.err.part" "$EVID/$WAIT_SUITE.wait.err" 2>> "$EVID/cleanup.log" || cf="${cf:+$cf,}wait.err.part"
    fi
    if [ -n "$cf" ]; then
      EVIDENCE_BAD="$EVIDENCE_BAD suite=$WAIT_SUITE copy-failed=$cf"
      echo "evidence-copy-failed ($cf)" > "$EVID/$WAIT_SUITE.$sw_out" 2>/dev/null || true; SUITE_FAIL=1
      rec "suite=$WAIT_SUITE: copying $cf from $TMPW into evidence FAILED; evidence incomplete; the seal will be refused"
      return 1
    fi
  else
    echo "interrupted (signal ${SIGNAL:-none}) during $sw_step; $sw_step output left in $TMPW, not in evidence" > "$EVID/$WAIT_SUITE.$sw_out"; SUITE_FAIL=1
  fi
  rec "suite=$WAIT_SUITE: $sw_step group $1 proven empty by /proc scan and no descriptor held under $TMPW ($2)"
  return 0
}
# reap_wait: terminate the pending wait BY PROCESS GROUP (a wrapper-only signal would leave a child that ignores TERM,
# or a stopped wrapper, alive with descriptors): TERM to -pgid; poll (iteration- and clock-capped at SUITE_KILL + K)
# until no live process remains; KILL to -pgid if any does (KILL reaches stopped processes too); then the direct child
# is reaped by a poll capped at REAP_SETTLE (`wait` only once it is a zombie or gone, never blocking); settle_wait then
# proves the group empty and no descriptor held before anything reaches evidence. A child alive after the cap is
# recorded and abandoned (suite failed, seal refused).
reap_wait() {
  [ -n "$WAIT_PID" ] || return 0
  rp=$(wait_pgid); rk=''
  # (no `--` before the negative pid: dash's kill builtin would read it as an illegal number and send nothing)
  if [ -n "$rp" ]; then kill -TERM "-$rp" 2>/dev/null || true; else kill -TERM "$WAIT_PID" 2>/dev/null || true; fi
  i=0; t0=$(now); lim=$((SUITE_KILL + KILL))
  while [ "$i" -lt $((lim * 2)) ] && [ $(( $(now) - t0 )) -lt "$lim" ] && [ -n "$(group_alive "$rp")" ]; do i=$((i + 1)); sleep 0.5; done
  if [ -n "$(group_alive "$rp")" ]; then
    rk=' (KILL sent to the group after the poll)'
    if [ -n "$rp" ]; then kill -KILL "-$rp" 2>/dev/null || true; else kill -KILL "$WAIT_PID" 2>/dev/null || true; fi
  fi
  rw_pid=$WAIT_PID
  if await_child "$REAP_SETTLE"; then
    j=0; while [ "$j" -lt $((REAP_SETTLE * 4)) ] && [ -n "$(group_alive "$rp")" ]; do j=$((j + 1)); sleep 0.25; done   # group settle
    rec "pending docker ${WAIT_STEP:-wait} (pid $rw_pid, pgid ${rp:-unknown}) terminated and reaped after ~$((i / 2))s$rk; descriptors closed before the seal"
    WAIT_PID=''
    settle_wait "$rp" interrupted || true
  else
    rec "pending docker ${WAIT_STEP:-wait} (pid $rw_pid, pgid ${rp:-unknown}) terminated after ~$((i / 2))s$rk but NOT reaped within ${REAP_SETTLE}s"
    abandon_child "$rp"
  fi
}
on_signal() { # on_signal <code> <name>: record, terminate and reap a pending docker wait, exit so the EXIT trap runs finish
  SIGNAL=$2
  rec "signal $2 received; exiting $1 after cleanup"
  reap_wait
  exit "$1"
}
finish() {
  code=$?
  trap - EXIT; trap '' INT TERM
  set +e
  reap_wait
  DK=dkc
  rec "cleanup phase begins (exit so far $code, signal ${SIGNAL:-none}, deadline cut: ${DEADLINE_HIT:-none}, remaining before reserve $(remaining)s)"
  # 6: attempted suites not yet proven absent are cleaned (ownership proven first); never-attempted suites are only
  #    inventoried in step 7 and nothing carrying their name is ever touched.
  for s in $SUITES; do
    case " $VERIFIED " in *" $s "*) continue ;; esac
    if [ ! -f "$EVID/$s.attempted" ]; then clog "$s: create never attempted; inventory only, nothing removed"; continue; fi
    cid=''; [ -f "$EVID/$s.cid" ] && cid=$(cat "$EVID/$s.cid")
    cleanup_container "$s" "$(container_name "$s")" $cid
  done
  # 7: lane-only inventories, each exit checked on its own; empty output after a failed command is not clean.
  inv post-ps ps -aq --filter "label=elevateo.perf.lane=$NONCE" || INVENTORY_FAIL=1
  inv post-volume volume ls -q --filter "label=elevateo.perf.lane=$NONCE" || INVENTORY_FAIL=1
  inv post-network network ls -q --filter "label=elevateo.perf.lane=$NONCE" || INVENTORY_FAIL=1
  for s in $SUITES; do inv "post-name-$s" ps -aq --filter "name=^$(container_name "$s")\$" || INVENTORY_FAIL=1; done
  # 8: the payload the suites ran from is byte-identical to what was verified before they ran (bounded local step).
  if [ -f "$PAY/PAYLOAD.sha256" ]; then
    ( cd "$PAY" && lt sha256sum -c --quiet PAYLOAD.sha256 ) > "$EVID/payload-verify-after.txt" 2>&1 || PAYLOAD_FAIL=1
  else PAYLOAD_FAIL=1; fi
  # Verdict: every suite must have an .exit file whose first line is 0.
  for s in $SUITES; do
    if [ ! -f "$EVID/$s.exit" ] || [ "$(head -1 "$EVID/$s.exit")" != 0 ]; then SUITE_FAIL=1; fi
  done
  # Pre-seal absence proof: no live process may remain in any wait group recorded this run (zombies tolerated), and no
  # process anywhere may hold a descriptor on a file under the evidence directory (the --scan child; this also catches
  # a writer that left its group with setsid). A survivor, a holder, an unreadable pgid, a missing /proc or a failed
  # scan refuses the seal (SHA256SUMS.FAILED, exit 8 unless cleanup/inventory/payload already failed).
  for pf in "$EVID"/*.wait.pgid "$EVID"/*.logs.pgid; do   # every group this run started: wait pairs and logs pairs
    [ -f "$pf" ] || continue
    pg=''; IFS= read -r pg < "$pf" || true
    case "$pg" in ''|*[!0-9]*) pg='' ;; esac
    pa=$(group_alive "$pg")
    [ -z "$pa" ] || WRITER_ALIVE="$WRITER_ALIVE pgid=${pg:-unknown} file=${pf##*/} pids=$(echo $pa | tr ' ' ,)"
  done
  fh=$(fd_holders "$EVID")
  [ -z "$fh" ] || WRITER_ALIVE="$WRITER_ALIVE evidence-descriptor-holders pids=$(echo $fh | tr ' ' ,)"
  [ -z "$WRITER_ALIVE" ] || rec "pre-seal proof FAILED: live writer(s):${WRITER_ALIVE}; seal refused"
  [ -z "$EVIDENCE_BAD" ] || rec "pre-seal check FAILED: evidence copy failure(s):${EVIDENCE_BAD}; seal refused"
  final=$code
  if [ "$final" -eq 0 ]; then
    if [ "$CLEANUP_FAIL" -eq 1 ]; then final=6
    elif [ "$INVENTORY_FAIL" -eq 1 ]; then final=5
    elif [ "$PAYLOAD_FAIL" -eq 1 ]; then final=4
    elif [ -n "$WRITER_ALIVE" ] || [ -n "$EVIDENCE_BAD" ]; then final=8   # the evidence itself is untrustworthy: precedes 9 and 7
    elif [ "$BUDGET_FAIL" -eq 1 ] || [ -n "$DEADLINE_HIT" ]; then final=9
    elif [ "$SUITE_FAIL" -eq 1 ]; then final=7
    fi
  fi
  used=$(( $(now) - START ))
  {
    echo "--- summary"
    echo "run=$RUN"; echo "nonce=$NONCE"; echo "image_ref=$IMAGE_REF"; echo "image_id=$IMAGE_ID"
    echo "payload_archive_sha256=${ARCHIVE_SHA%% *}"; echo "payload_archive_sha256_expected=$EXPECTED_SHA"
    for s in $SUITES; do
      if [ -f "$EVID/$s.exit" ]; then echo "$s.exit=$(head -1 "$EVID/$s.exit")"; else echo "$s.exit=not-started"; fi
      if [ -f "$EVID/$s.attempted" ]; then echo "$s.attempted=yes"; else echo "$s.attempted=no"; fi
    done
    echo "signal=${SIGNAL:-none}"
    echo "cleanup_verified=$([ "$CLEANUP_FAIL" -eq 0 ] && echo yes || echo no)"
    echo "wait_groups_live=${WRITER_ALIVE:-none}"
    echo "evidence_copy_failed=${EVIDENCE_BAD:-none}"
    echo "test_override_proc_root=${PERF01_TEST_PROC_ROOT:-none}"
    echo "inventory_clean=$([ "$INVENTORY_FAIL" -eq 0 ] && echo yes || echo no)"
    echo "payload_unchanged=$([ "$PAYLOAD_FAIL" -eq 0 ] && echo yes || echo no)"
    echo "deadline_cut_step=${DEADLINE_HIT:-none}"
    echo "budget_min_s=$MIN_BUDGET"; echo "budget_reserve_s=$RESERVE"; echo "budget_signal_reap_s=$SIGNAL_REAP"; echo "budget_used_pre_seal_s=$used"; echo "budget_total_s=$TOTAL_BUDGET"
    echo "deadline_overrun_pre_seal_s=$(( used > TOTAL_BUDGET ? used - TOTAL_BUDGET : 0 ))"
    echo "finished_pre_seal=$(iso)"; echo "exit_before_seal=$final"
  } >> "$EVID/status.txt"
  seal_evidence
  [ "$SEAL_FAIL" -eq 1 ] && [ "$final" -eq 0 ] && final=8
  total=$(( $(now) - START ))
  echo "fleet-guards: total wall ${total}s (external receipt; evidence sealed before it)" >&2
  echo "fleet-guards: evidence $EVID (exit $final)" >&2
  exit "$final"
}
trap finish EXIT
trap 'on_signal 130 INT' INT
trap 'on_signal 143 TERM' TERM
rec "start lane=$LANE nonce=$NONCE run=$RUN reservation=set budget=${TOTAL_BUDGET}s min=${MIN_BUDGET}s reserve=${RESERVE}s suite_timeouts=$S_PM/$S_FG/$S_RB/$S_CU"
if [ -n "${PERF01_TEST_PROC_ROOT-}" ]; then
  rec "TEST OVERRIDE active: PERF01_TEST_PROC_ROOT=$PERF01_TEST_PROC_ROOT (child_state reads <pid>/stat there instead of /proc); NOT a production run"
  echo "fleet-guards: TEST OVERRIDE active: PERF01_TEST_PROC_ROOT=$PERF01_TEST_PROC_ROOT; this is not a production run" >&2
fi

# 2a: authenticate the archive against the independently supplied hash BEFORE tar reads any of it.
STEP=archive-auth
ARCHIVE_SHA=$(lt sha256sum -- "$PAYLOAD") || die "hashing the payload archive failed or timed out" 3
echo "$ARCHIVE_SHA" > "$EVID/payload-archive.sha256"
[ "${ARCHIVE_SHA%% *}" = "$EXPECTED_SHA" ] || die "archive sha256 ${ARCHIVE_SHA%% *} differs from the expected $EXPECTED_SHA; nothing extracted" 3
rec "archive authenticated: $EXPECTED_SHA"

# 2b: member validation against the list embedded above; types, paths and the exact set, before extraction.
STEP=archive-members
lt tar -tvf "$PAYLOAD" > "$EVID/archive-members.tv" || die "tar -tvf failed or timed out; archive rejected, nothing extracted" 3
write_expected_members "$EVID/members-expected.list"
: > "$EVID/members-found.list"
while IFS= read -r line; do
  type=$(printf '%s' "$line" | cut -c1)
  name=$(printf '%s\n' "$line" | awk '{ print $6 }')
  case "$type" in -|d) ;; *) die "archive member '$name' has type '$type' (only regular files and directories allowed); nothing extracted" 3 ;; esac
  case "$name" in ''|/*|../*|*/../*|*/..|..) die "archive member path not allowed: '$name'; nothing extracted" 3 ;; esac
  echo "$name" >> "$EVID/members-found.list"
done < "$EVID/archive-members.tv"
LC_ALL=C sort -o "$EVID/members-found.list" "$EVID/members-found.list" || die "sorting the member list failed" 3
LC_ALL=C sort -o "$EVID/members-expected.list" "$EVID/members-expected.list" || die "sorting the expected list failed" 3
cmp -s "$EVID/members-expected.list" "$EVID/members-found.list" \
  || die "archive members differ from the embedded allowlist (see members-expected.list vs members-found.list); nothing extracted" 3
rec "archive members validated: $(wc -l < "$EVID/members-found.list" | tr -d ' ') entries, types - and d only"

# 2c: extract without preserving archive ownership or modes, then the content manifest as the second check.
STEP=extract
lt tar -xf "$PAYLOAD" -C "$PAY" --no-same-owner --no-same-permissions || die "payload extraction failed or timed out" 4
[ -f "$PAY/PAYLOAD.sha256" ] || { PAYLOAD_FAIL=1; die "PAYLOAD.sha256 missing from the payload" 4; }
( cd "$PAY" && lt sha256sum -c --quiet PAYLOAD.sha256 ) > "$EVID/payload-verify-before.txt" 2>&1 \
  || { PAYLOAD_FAIL=1; die "payload manifest verification failed or timed out (see payload-verify-before.txt)" 4; }
( cd "$PAY" && lt find . -type f ! -name 'PAYLOAD.*' ) > "$EVID/payload-files.txt" || die "enumerating the payload failed or timed out" 4
pf=$(wc -l < "$EVID/payload-files.txt" | tr -d ' '); pm=$(wc -l < "$PAY/PAYLOAD.sha256" | tr -d ' ')
[ "$pf" -eq "$pm" ] || { PAYLOAD_FAIL=1; die "payload holds $pf files but the manifest lists $pm" 4; }
cp "$PAY/PAYLOAD.sha256" "$EVID/PAYLOAD.sha256"
[ ! -f "$PAY/PAYLOAD.meta" ] || cp "$PAY/PAYLOAD.meta" "$EVID/PAYLOAD.meta"
rec "payload content manifest verified: $pm files"

# 3: the pinned base image must already be present; nothing is ever pulled.
STEP=image-inspect
ist=0; IMAGE_ID=$(dk image inspect --format '{{.Id}}' "$IMAGE_REF" 2> "$EVID/image-inspect.err") || ist=$?
budget_or_cleanup
[ "$ist" -eq 0 ] || die "pinned base image not present; no pull performed ($IMAGE_REF, inspect exit $ist)" 3
echo "$IMAGE_ID" > "$EVID/image-id.txt"
rec "image present: $IMAGE_ID"

# 4: lane-only preflight. Other workloads on the host are out of scope and never inspected.
STEP=lane-preflight
if ! inv pre-ps ps -aq --filter "label=elevateo.perf.lane=$NONCE"; then
  budget_or_cleanup
  INVENTORY_FAIL=1; die "lane preflight: ps failed or found containers carrying this lane's nonce" 5
fi

# 5: one container per suite: name and attempt marker recorded first, created, started, waited under the deadline
#    (in the background so a signal interrupts it), logs captured, ownership proven, removed.
run_suite() {
  suite=$1; name=$(container_name "$suite"); S=$(suite_timeout "$suite")
  rem=$(remaining); need=$((S + SUITE_KILL + SUITE_OVERHEAD))
  if [ "$rem" -lt "$need" ]; then
    BUDGET_FAIL=1; echo "skipped-budget (remaining ${rem}s < ${need}s)" > "$EVID/$suite.exit"
    rec "suite=$suite skipped: remaining ${rem}s < S+SUITE_KILL+SUITE_OVERHEAD ${need}s"; return 0
  fi
  echo "$suite $name $NONCE" >> "$EVID/names.txt"
  : > "$EVID/$suite.attempted"
  STEP="$suite/create"
  sc_t0=$(now)   # per-suite wall clock, create to wait return, recorded below (first-run evidence for the S_i bounds)
  # shellcheck disable=SC2046
  set -- $(create_args "$suite")
  cst=0; cid=$(dk "$@" 2> "$EVID/$suite.create.err") || cst=$?
  if [ "$cst" -eq 125 ]; then echo "deadline-before-create" > "$EVID/$suite.exit"; budget_or_cleanup; fi
  if [ "$cst" -ne 0 ]; then
    echo "create-failed (exit $cst)" > "$EVID/$suite.exit"; SUITE_FAIL=1
    rec "suite=$suite create exit $cst (124 = timeout); looking the name up for cleanup"
    cleanup_container "$suite" "$name"; return 0
  fi
  case "$cid" in ''|*[!0-9a-f]*)
    echo "create-unparsable" > "$EVID/$suite.exit"; SUITE_FAIL=1; rec "suite=$suite create output unparsable"
    cleanup_container "$suite" "$name"; return 0 ;; esac
  echo "$cid" > "$EVID/$suite.cid"; CONTAINERS="$CONTAINERS $cid"
  STEP="$suite/start"
  sst=0; dk start "$cid" > /dev/null 2> "$EVID/$suite.start.err" || sst=$?
  if [ "$sst" -eq 125 ]; then echo "deadline-before-start" > "$EVID/$suite.exit"; budget_or_cleanup; fi
  if [ "$sst" -ne 0 ]; then
    echo "start-failed (exit $sst)" > "$EVID/$suite.exit"; SUITE_FAIL=1; rec "suite=$suite start failed exit $sst"
    cleanup_container "$suite" "$name" "$cid"; return 0
  fi
  # Recompute the wait bound immediately before issuing it: create and start may have consumed up to 2*SHORT.
  STEP="$suite/wait"
  w=$(( $(remaining) - SUITE_KILL - REAP_GRACE - SUITE_TAIL - SCAN )); [ "$w" -gt "$S" ] && w=$S   # post-wait: poll excess, proof+copy, tail
  if [ "$w" -le 0 ]; then
    [ -n "$DEADLINE_HIT" ] || DEADLINE_HIT=$STEP
    echo "deadline-before-wait" > "$EVID/$suite.exit"; SUITE_FAIL=1; rec "suite=$suite wait not issued: no room before the reserve"
    cleanup_container "$suite" "$name" "$cid"; budget_or_cleanup
  fi
  rec "suite=$suite id=$cid started wait=${w}s (S=$S)"
  # The wait runs in its own session and process group (util-linux setsid; -w keeps the shell-level child if setsid had
  # to fork). Its shell records the leader pid ($$) before exec; stdout/stderr land under TMPW, outside evidence, until
  # settle_wait proves the group gone.
  WAIT_SUITE=$suite; WAIT_STEP=wait; WAIT_PGID_FILE="$EVID/$suite.wait.pgid"
  setsid -w sh -c 'echo $$ > "$1"; exec timeout -k "$2" "$3" docker wait "$4"' sh "$WAIT_PGID_FILE" "$SUITE_KILL" "$w" "$cid" \
    > "$TMPW/$suite.exit.part" 2> "$TMPW/$suite.wait.err.part" &
  WAIT_PID=$!
  i=0; while [ ! -s "$WAIT_PGID_FILE" ] && [ "$i" -lt 50 ] && kill -0 "$WAIT_PID" 2>/dev/null; do i=$((i + 1)); sleep 0.1; done
  # R8-3: the handshake above (up to 50 x 0.1 s = 5 s) is charged to the poll cap, so the step stays inside its budgeted
  # w + SUITE_KILL + REAP_GRACE (iteration accounting, immune to clock jumps). Invariant: the handshake is capped at 5 s =
  # REAP_GRACE, so cap_s >= w + SUITE_KILL, the moment by which `timeout -k` has already KILLed the call; only the poll
  # excess shrinks, never the time the child is allowed to be alive.
  hs_s=$(( (i + 9) / 10 )); cap_s=$(( w + SUITE_KILL + REAP_GRACE - hs_s ))
  # Capped poll instead of a blocking `wait`: a direct child in uninterruptible sleep could otherwise block forever.
  wpg=$(wait_pgid); sw=0
  if await_child "$cap_s"; then
    wst=$WST; WAIT_PID=''
    settle_wait "$wpg" copy || sw=$?
  else
    abandon_child "$wpg"; wst=0; sw=1
  fi
  rec "suite=$suite suite_wall_create_to_wait_return_s=$(( $(now) - sc_t0 )) (S=$S wait_bound=${w}s) handshake_s=$hs_s cap_s=$cap_s"
  if [ "$sw" -ne 0 ]; then :   # a live process, a descriptor holder or an unreaped child: recorded, suite failed, seal to be refused
  elif [ "$wst" -eq 124 ]; then echo "timeout after ${w}s" > "$EVID/$suite.exit"; SUITE_FAIL=1
  elif [ "$wst" -ne 0 ]; then echo "wait-failed (exit $wst)" > "$EVID/$suite.exit"; SUITE_FAIL=1
  else
    sx=$(head -1 "$EVID/$suite.exit" | tr -d ' ')
    case "$sx" in 0) ;; *) SUITE_FAIL=1 ;; esac
  fi
  STEP="$suite/logs"
  # R8: the logs call has the SAME shape as the wait (own session and group, pgid recorded before exec, output under TMPW,
  # capped poll instead of a blocking foreground wait, group + descriptor proof, cp into evidence). Its allowance is the
  # unchanged LOGS = 65 s, split LOGS_RUN 44 (the call) + KILL 5 + REAP_GRACE 5 (poll excess) + SCAN 11 (proofs, copy).
  lb=$(( $(remaining) - KILL - REAP_GRACE - SCAN )); [ "$lb" -gt "$LOGS_RUN" ] && lb=$LOGS_RUN
  if [ "$lb" -le 0 ]; then echo "[fleet-guards] docker logs skipped: deadline reached" > "$EVID/$suite.log"; [ -n "$DEADLINE_HIT" ] || DEADLINE_HIT=$STEP
  else
    WAIT_SUITE=$suite; WAIT_STEP=logs; WAIT_PGID_FILE="$EVID/$suite.logs.pgid"
    lg_t0=$(now)   # the step's own wall clock (two date forks per step, inside its LOGS allowance)
    setsid -w sh -c 'echo $$ > "$1"; exec timeout -k "$2" "$3" docker logs "$4"' sh "$WAIT_PGID_FILE" "$KILL" "$lb" "$cid" \
      > "$TMPW/$suite.log.part" 2>&1 &
    WAIT_PID=$!
    i=0; while [ ! -s "$WAIT_PGID_FILE" ] && [ "$i" -lt 50 ] && kill -0 "$WAIT_PID" 2>/dev/null; do i=$((i + 1)); sleep 0.1; done
    # R8-3: handshake charged to the cap (<= 5 s = REAP_GRACE, so cap_s >= lb + KILL, when timeout has already KILLed the
    # call; only the poll excess shrinks). lb + handshake + poll + proof + copy therefore stays inside LOGS = 65.
    hs_s=$(( (i + 9) / 10 )); cap_s=$(( lb + KILL + REAP_GRACE - hs_s ))
    lpg=$(wait_pgid)
    if await_child "$cap_s"; then
      WAIT_PID=''
      # A non-zero or timed-out logs call is a bounded diagnostic failure, not a suite failure: noted in the output itself
      # (appended to the .part by the runner, whose descriptor closes at once) before the proof and the copy.
      [ "$WST" -eq 0 ] || echo "[fleet-guards] docker logs exit $WST (bounded ${lb}s)" >> "$TMPW/$suite.log.part"
      settle_wait "$lpg" copy || true   # a survivor, holder or copy failure: recorded, marker in $suite.log, seal refused
    else
      abandon_child "$lpg"              # alive after the cap: recorded, marker in $suite.log, seal refused, never waited
    fi
    rec "suite=$suite logs_wall_s=$(( $(now) - lg_t0 )) lb=$lb handshake_s=$hs_s cap_s=$cap_s"
    WAIT_STEP=wait
  fi
  rec "suite=$suite finished exit=$(head -1 "$EVID/$suite.exit")"
  cleanup_container "$suite" "$name" "$cid"
  budget_or_cleanup
}
for s in $SUITES; do run_suite "$s"; done
rec "all suites processed; handing over to the exit trap for cleanup proof, inventories and seal"
exit 0
