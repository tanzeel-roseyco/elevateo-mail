#!/usr/bin/env bash
# Produces the explicit build-context snapshot for the fleet-02 validation run. Authored only; run
# from the repository root by the parent before transfer. The snapshot is exactly contracts/v1 and
# apps/web with node_modules, build output and test results excluded, plus a per-file sha256
# manifest and the archive's own hash, so the validated bytes are pinned and reviewable.
set -euo pipefail

OUT_DIR="${1:-fleet-02-snapshot-$(date -u +%Y%m%d-%H%M%S)}"
[ -d contracts/v1 ] && [ -d apps/web ] || { echo "run from the repository root" >&2; exit 1; }
mkdir -p "$OUT_DIR"

# The six repaired files must be present in the snapshot, or the run would validate stale source.
REPAIRED_FILES=(
  apps/web/src/app/session.tsx
  apps/web/src/app/Shell.test.tsx
  apps/web/src/features/inbox/InboxPage.test.tsx
  apps/web/e2e/support.ts
  apps/web/e2e/read.spec.ts
  apps/web/e2e/production.spec.ts
)
for f in "${REPAIRED_FILES[@]}"; do
  [ -f "$f" ] || { echo "missing repaired file: $f" >&2; exit 1; }
done

TAR="$OUT_DIR/context.tar.gz"
tar -czf "$TAR" \
  --exclude='apps/web/node_modules' \
  --exclude='apps/web/dist' \
  --exclude='apps/web/e2e/.results' \
  --exclude='apps/web/.vite' \
  contracts/v1 apps/web

# Assert each repaired file actually landed in the archive (exclusions cannot have eaten one).
for f in "${REPAIRED_FILES[@]}"; do
  tar -tzf "$TAR" "$f" >/dev/null || { echo "snapshot lacks: $f" >&2; exit 1; }
done
# Assert the exclusions held.
if tar -tzf "$TAR" | grep -E 'node_modules/|e2e/\.results/|apps/web/dist/' >/dev/null; then
  echo "snapshot contains excluded paths" >&2; exit 1
fi

# Per-file manifest of the working-tree bytes the archive was built from, then the archive hash.
{
  find contracts/v1 apps/web \
    -path apps/web/node_modules -prune -o \
    -path apps/web/dist -prune -o \
    -path apps/web/e2e/.results -prune -o \
    -path apps/web/.vite -prune -o \
    -type f -print0 | sort -z | xargs -0 sha256sum
} > "$OUT_DIR/manifest.sha256"
# Basename-relative so `sha256sum -c` verifies after transfer to fleet-02 (run-fleet-02.sh requires
# context.tar.gz.sha256 and manifest.sha256 beside the tarball).
(cd "$OUT_DIR" && sha256sum context.tar.gz | tee context.tar.gz.sha256)

echo "snapshot: $TAR"
echo "manifest: $OUT_DIR/manifest.sha256 ($(wc -l < "$OUT_DIR/manifest.sha256") files)"
