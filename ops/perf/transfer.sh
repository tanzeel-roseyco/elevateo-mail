#!/bin/sh
# AIDEV-NOTE: Host-side only (Windows Git Bash or any POSIX sh with git+ssh). Never runs Docker anywhere.
# Ships the committed tree of the current revision to a fresh task directory on fleet-02 and records provenance.
# Usage: PERF01_RESERVATION=<id> PERF01_PROJECT=perf01-<hex> ops/perf/transfer.sh
#   PERF01_ALLOW_DIRTY=1  ship anyway when tracked files are modified (the archive still contains HEAD, not the
#                         working tree; evidence is then labelled dirty and the dirty-diff hash is recorded).
set -eu
. "$(dirname -- "$0")/lib.sh"
perf01_require_reservation
perf01_require_project
REMOTE=${PERF01_REMOTE:-fleet-02}
[ "$REMOTE" = fleet-02 ] || perf01_die "only the fleet-02 alias is in scope"

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
REV=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
DIRTY_SHA=$(git diff HEAD | sha256sum | cut -d' ' -f1)
UNTRACKED=$(git status --porcelain --untracked-files=all | grep -c '^??' || true)
if [ "$DIRTY_SHA" != "$PERF01_EMPTY_SHA256" ] && [ "${PERF01_ALLOW_DIRTY:-0}" != 1 ]; then
  perf01_die "tracked files differ from HEAD (diff sha256 $DIRTY_SHA); commit first or set PERF01_ALLOW_DIRTY=1"
fi

# Only the paths the benchmark needs. third_party/upstream (79 MB of the 81 MB tree) is never shipped.
PATHS="compose.yaml apps/server ops scripts .gitattributes"
ARCHIVE_SHA=$(git archive --format=tar "$REV" -- $PATHS | sha256sum | cut -d' ' -f1)
TREES=$(for p in $PATHS; do printf '%s=%s ' "$p" "$(git rev-parse "$REV:$p")"; done)

REMOTE_DIR="\$HOME/$PERF01_PROJECT"
perf01_log "creating $REMOTE:~/$PERF01_PROJECT (refuses an existing directory)"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" "test ! -e $REMOTE_DIR && mkdir -m 0700 $REMOTE_DIR" \
  || perf01_die "remote task directory already exists or ssh failed"
perf01_log "streaming git archive of $REV ($PATHS)"
git archive --format=tar "$REV" -- $PATHS | ssh -o BatchMode=yes "$REMOTE" "tar -x -C $REMOTE_DIR"

SOURCE_JSON=$(mktemp)
cat > "$SOURCE_JSON" <<EOF
{
  "reservation": $(perf01_json_str "$PERF01_RESERVATION"),
  "project": $(perf01_json_str "$PERF01_PROJECT"),
  "branch": $(perf01_json_str "$BRANCH"),
  "revision": "$REV",
  "dirty_diff_sha256": "$DIRTY_SHA",
  "dirty": $([ "$DIRTY_SHA" = "$PERF01_EMPTY_SHA256" ] && echo false || echo true),
  "untracked_files": $UNTRACKED,
  "archive_paths": $(perf01_json_str "$PATHS"),
  "archive_sha256": "$ARCHIVE_SHA",
  "path_tree_hashes": $(perf01_json_str "$TREES"),
  "transferred_at": "$(perf01_iso)",
  "transfer_host": $(perf01_json_str "$(hostname)")
}
EOF
ssh -o BatchMode=yes "$REMOTE" "cat > $REMOTE_DIR/source.json && chmod 0755 $REMOTE_DIR/ops/perf/*.sh $REMOTE_DIR/scripts/dev" < "$SOURCE_JSON"
cat "$SOURCE_JSON"
rm -f "$SOURCE_JSON"
perf01_log "done; next (after reservation): ssh $REMOTE 'cd ~/$PERF01_PROJECT && PERF01_RESERVATION=... PERF01_PROJECT=$PERF01_PROJECT sh ops/perf/preflight.sh'"
