#!/usr/bin/env bash
# Synthetic failure probes for run-fleet-02.sh, authored for PARENT execution on fleet-02 (inside
# its Docker shell). Every probe feeds the runner an input that must be rejected during its
# validation phase — before any Docker resource is created — and asserts a nonzero exit plus the
# exact guard message. Probes therefore create no containers, images, builders or volumes.
#
#   ./probes.sh            # runs all probes in a scratch directory, exits nonzero on any miss
#
# Limitation (recorded, not hidden): the builder-cap, browser-terminal-state and cleanup-retention
# paths require live Docker fault injection (daemon stop, induced kill) and stay with the parent;
# these probes prove the pre-Docker guards only.
set -u -o pipefail

RUNNER="$(cd "$(dirname "$0")" && pwd)/run-fleet-02.sh"
[ -f "$RUNNER" ] || { echo "runner not found: $RUNNER" >&2; exit 1; }
# Absolute scratch path: a cwd-relative one would resolve wrongly after the cd below and the EXIT
# trap would miss the real directory, leaving scratch behind.
WORK="$(mktemp -d)" || exit 1
case "$WORK" in (/*) : ;; (*) echo "scratch path not absolute: $WORK" >&2; exit 1;; esac
trap 'rm -rf "$WORK"' EXIT
cd "$WORK" || exit 1
OVERALL=0

expect_fail() { # expect_fail <name> <expected-message-substring> <runner-args...>
  local name="$1" want="$2"; shift 2
  local out rc
  out="$(bash "$RUNNER" "$@" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -qF "$want"; then
    printf 'PASS  %s\n' "$name"
  else
    printf 'FAIL  %s (rc=%s, wanted %s)\n' "$name" "$rc" "$want"
    printf '%s\n' "$out" | tail -n 3
    OVERALL=1
  fi
}

# A minimal structurally-valid snapshot the integrity probes can selectively corrupt.
make_fixture() { # make_fixture <dir>
  local d="$1"
  mkdir -p "$d/src/apps/web"
  printf '{"name":"probe"}\n' > "$d/src/apps/web/package.json"
  tar -czf "$d/context.tar.gz" -C "$d/src" apps
  (cd "$d" && sha256sum context.tar.gz > context.tar.gz.sha256)
  (cd "$d/src" && find apps -type f -print0 | sort -z | xargs -0 sha256sum) > "$d/manifest.sha256"
}

# --- output-path guards (checked before snapshot integrity) --------------------------------------
make_fixture ok
expect_fail "P1 absolute output path"   "unsafe output path"        ok/context.tar.gz /tmp/abs-out
expect_fail "P2 parent-escape output"   "unsafe output path"        ok/context.tar.gz ../escape
mkdir -p taken
expect_fail "P3 pre-existing output"    "output path already exists" ok/context.tar.gz taken

# --- snapshot sidecar and hash guards ------------------------------------------------------------
make_fixture nosum && rm nosum/context.tar.gz.sha256
expect_fail "P4 missing archive sha256" "missing context.tar.gz.sha256" nosum/context.tar.gz p4-out

make_fixture noman && rm noman/manifest.sha256
expect_fail "P5 missing manifest"       "missing manifest.sha256"    noman/context.tar.gz p5-out

make_fixture badsum
printf 'extra byte' >> badsum/context.tar.gz   # archive no longer matches its recorded hash
expect_fail "P6 archive hash mismatch"  "snapshot archive hash mismatch" badsum/context.tar.gz p6-out

make_fixture badman
printf 'tampered\n' > badman/src/apps/web/package.json       # re-tar with changed bytes,
tar -czf badman/context.tar.gz -C badman/src apps            # refresh the ARCHIVE hash only,
(cd badman && sha256sum context.tar.gz > context.tar.gz.sha256)
expect_fail "P7 manifest mismatch"      "snapshot manifest mismatch" badman/context.tar.gz p7-out

# --- structural guard ----------------------------------------------------------------------------
mkdir -p hollow/src/apps/web && printf 'x\n' > hollow/src/apps/web/README.txt
tar -czf hollow/context.tar.gz -C hollow/src apps
(cd hollow && sha256sum context.tar.gz > context.tar.gz.sha256)
(cd hollow/src && find apps -type f -print0 | sort -z | xargs -0 sha256sum) > hollow/manifest.sha256
expect_fail "P8 snapshot lacks apps/web package" "snapshot lacks apps/web" hollow/context.tar.gz p8-out

# --- bundle marker-check regression (mirrors validation.Dockerfile's unit CMD tail exactly) ------
# Only grep status 1 (clean scan, no marker) may pass; 0 (marker found) and >=2 (operational
# error, e.g. missing dist) must fail — a bare `! grep` would accept status 2 as a pass.
marker_check() { # marker_check <dist-dir> ; same expression as the Dockerfile CMD
  local st=0
  grep -rl 'dev-fixtures\|Development fixtures\|fixture_token_a' "$1" >/dev/null 2>&1 || st=$?
  [ "$st" -eq 1 ]
}
probe_marker() { # probe_marker <name> <dir> <expected 0|1>
  local rc=0; marker_check "$2" || rc=1
  if [ "$rc" = "$3" ]; then printf 'PASS  %s\n' "$1"; else printf 'FAIL  %s (rc=%s)\n' "$1" "$rc"; OVERALL=1; fi
}
mkdir -p dist-clean && printf 'app code\n' > dist-clean/app.js
mkdir -p dist-leak && printf 'Development fixtures\n' > dist-leak/app.js
probe_marker "P9 clean bundle passes (grep status 1)"            dist-clean 0
probe_marker "P10 fixture marker fails (grep status 0)"          dist-leak 1
probe_marker "P11 missing dist fails (grep operational status)"  dist-absent 1

# --- output-path symlink-escape and dangling-symlink guards --------------------------------------
make_fixture sym
ln -s /tmp linked-parent 2>/dev/null || true
expect_fail "P12 symlinked-parent escape rejected" "unsafe output path" sym/context.tar.gz linked-parent/new-run
ln -s does-not-exist dangle 2>/dev/null || true
expect_fail "P13 dangling-symlink output rejected" "output path is a symlink" sym/context.tar.gz dangle

# --- inventory exact-line match regression (mirrors run-fleet-02.sh exists(); keep in sync) ------
# The replaced `printf | grep -q` could SIGPIPE the producer under pipefail when the match sat on
# an early row of a >pipe-buffer inventory, falsely reporting absence. The pure-Bash match must
# find a first-row name in a >64KiB inventory and still report absence for a missing name.
line_match() { # line_match <haystack> <name> ; same expression as the runner
  case $'\n'"$1"$'\n' in (*$'\n'"$2"$'\n'*) return 0;; (*) return 1;; esac
}
BIG="wanted-container-name"
for i in $(seq 1 2000); do BIG="$BIG"$'\n'"filler-container-$i-padding-padding-padding-padding"; done
if [ "${#BIG}" -gt 65536 ] && line_match "$BIG" "wanted-container-name"; then
  printf 'PASS  %s\n' "P14 first-row match in >pipe-buffer inventory"
else printf 'FAIL  %s\n' "P14 first-row match in >pipe-buffer inventory"; OVERALL=1; fi
if line_match "$BIG" "absent-container-name" || line_match "$BIG" "filler-container-7"; then
  printf 'FAIL  %s\n' "P15 absent/partial name reports no"; OVERALL=1
else printf 'PASS  %s\n' "P15 absent/partial name reports no"; fi

[ "$OVERALL" = 0 ] && echo "all probes passed (pre-Docker guards verified)" \
  || echo "probe failures above; runner guards not proven" >&2
exit "$OVERALL"
