#!/bin/sh
# AIDEV-NOTE: Docker-only (tar-only, no fake CLI) regression for the tar invocation used by pack-guards.sh. It reads the single TAR_FLAGS line
# out of /repo/ops/perf/tests/pack-guards.sh and exercises exactly those flags on a fixture tree under /tmp: two packs
# over the same files must hash identically, every file must list as -rw-r--r-- 0/0 and the directory as
# drwxr-xr-x 0/0, and flipping a source file from 0755 to 0644 must leave the archive hash unchanged (the claim that
# `--mode=u=rw,go=r,a+X` normalizes modes independently of the checkout). git is absent from ruby:slim, so this
# exercises the tar invocation, not pack-guards.sh itself. Launch only inside the fleet-guards.sh lane
# (`sh /repo/ops/perf/tests/pack-modes-guards.sh /repo`, --user 65534:65534). Writes only under /tmp. Exit 0 iff all pass.
set -eu
REPO=${1:-/repo}
WORK=${TMPDIR:-/tmp}/perf01-pack-modes-$$
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "ok   $*"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $*"; }
assert_eq() { if [ "$1" = "$2" ]; then ok "$3 ($1)"; else bad "$3: expected '$2' got '$1'"; fi; }
# sha <file>: checked capture; a failure prints a FAIL line, leaves a marker (the call runs in a subshell, so the
# counter cannot be bumped here) and returns a per-file sentinel so two failures can never compare equal.
sha() {
  out=$(sha256sum -- "$1") || { echo "FAIL sha256sum failed on $1" >&2; : > "$WORK/sha-failed"; printf 'FAILED:%s' "$1"; return 0; }
  printf '%s' "${out%% *}"
}

PACKER="$REPO/ops/perf/tests/pack-guards.sh"
assert_eq "$(grep -c '^TAR_FLAGS="' "$PACKER" || true)" 1 "exactly one TAR_FLAGS line in pack-guards.sh"
TAR_FLAGS=$(sed -n 's/^TAR_FLAGS="\(.*\)"$/\1/p' "$PACKER" | head -1)
assert_eq "$(printf '%s' "$TAR_FLAGS" | grep -c -- '--format=ustar --no-recursion --mtime=@[0-9]* --owner=0 --group=0 --numeric-owner --mode=u=rw,go=r,a+X' || true)" 1 "the flag string is the expected one"
if [ -z "$TAR_FLAGS" ]; then echo "passed=$PASS failed=$FAIL"; exit 1; fi

mkdir -p "$WORK/tree/dir"
printf 'exec\n' > "$WORK/tree/exec.sh"; chmod 0755 "$WORK/tree/exec.sh"
printf 'plain\n' > "$WORK/tree/plain.txt"; chmod 0644 "$WORK/tree/plain.txt"
printf 'dir\nexec.sh\nplain.txt\n' | LC_ALL=C sort > "$WORK/members.list"
# shellcheck disable=SC2086
pack() { tar $TAR_FLAGS -cf "$1" -C "$WORK/tree" -T "$WORK/members.list"; }

pack "$WORK/a.tar"
pack "$WORK/b.tar"
assert_eq "$(sha "$WORK/b.tar")" "$(sha "$WORK/a.tar")" "two consecutive packs over the same files hash identically"
tar -tvf "$WORK/a.tar" > "$WORK/a.tv"
assert_eq "$(wc -l < "$WORK/a.tv" | tr -d ' ')" 3 "three members listed"
assert_eq "$(grep -c '^-rw-r--r-- 0/0 ' "$WORK/a.tv" || true)" 2 "both files list as -rw-r--r-- 0/0 regardless of source mode"
assert_eq "$(grep -c '^drwxr-xr-x 0/0 .* dir/$' "$WORK/a.tv" || true)" 1 "the directory lists as drwxr-xr-x 0/0"
assert_eq "$(grep -c ' exec.sh$' "$WORK/a.tv" || true)" 1 "exec.sh present"
assert_eq "$(grep -c ' plain.txt$' "$WORK/a.tv" || true)" 1 "plain.txt present"

chmod 0644 "$WORK/tree/exec.sh"
pack "$WORK/c.tar"
assert_eq "$(sha "$WORK/c.tar")" "$(sha "$WORK/a.tar")" "flipping a source file 0755 -> 0644 leaves the archive hash unchanged"
printf 'changed\n' > "$WORK/tree/plain.txt"
pack "$WORK/d.tar"
if [ "$(sha "$WORK/d.tar")" != "$(sha "$WORK/a.tar")" ]; then ok "a content change does change the archive hash"; else bad "content change not reflected in the archive hash"; fi

[ ! -e "$WORK/sha-failed" ] || bad "at least one sha256sum call failed (see the FAIL lines above)"
echo "passed=$PASS failed=$FAIL work=$WORK"
[ "$FAIL" -eq 0 ]
