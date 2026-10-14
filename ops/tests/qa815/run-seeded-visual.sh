#!/usr/bin/env bash
set -euo pipefail

candidate=f210b5bf53f8a94367352e8f2c7de85d17a76f8f
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
artifact=/home/tanzeel/elevateo-mail-completion-20261015/control/qa816-private/$candidate/qa815-8png
log="$(git rev-parse --show-toplevel)/docs/completion/qa815-evidence/visual-f210b5bf-8png.txt"
context=$(mktemp -d /tmp/qa815-visual.XXXXXXXX)
exec 9>"$lock"
flock -x 9
mkdir -p "$artifact"
printf 'source=%s\nstarted=%s\nlabel=SEEDED-SIMULATED\nartifact=%s\n' "$candidate" "$(date -u +%FT%TZ)" "$artifact" | tee "$log"
git archive "$candidate" | tar -x -C "$context"
python3 - "$context/apps/web/playwright.config.ts" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
s = s.replace('npm run dev:fixtures -- --port 4173 --strictPort', 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort')
s = s.replace('http://127.0.0.1:4173/dev-fixtures.html', 'http://127.0.0.1:4173/')
p.write_text(s)
PY
chmod -R a+rX "$context"
set +e
timeout 1800s docker run --rm --name qa815-visual-f210-8png \
  --memory 2g --memory-swap 3g --cpus 2 --pids-limit 256 --shm-size 512m \
  -e ELEVATEO_PRODUCTION_URL=http://127.0.0.1:4173 -e CI=1 \
  -v "$context":/workspace -w /workspace/apps/web \
  06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f \
  bash -ceu 'npm ci && npm run build && npx playwright test e2e/visual-states.spec.ts --project=desktop --project=narrow-390 --workers=1 --grep "(inbox-ready|reader-ready-hostile)"' \
  >> "$log" 2>&1
result=$?
set -e
if [[ -d "$context/apps/web/e2e/.results/visual" ]]; then
  cp -a "$context/apps/web/e2e/.results/visual/." "$artifact/"
fi
printf 'run_exit=%s\nfinished=%s\n' "$result" "$(date -u +%FT%TZ)" | tee -a "$log"
find "$artifact" -maxdepth 1 -type f -name '*.png' -printf '%f\n' | sort | tee -a "$log"
printf 'png_count=%s\n' "$(find "$artifact" -maxdepth 1 -type f -name '*.png' | wc -l)" | tee -a "$log"
rm -rf "$context"
printf 'context_absent=%s\n' "$([[ ! -e $context ]] && echo yes || echo no)" | tee -a "$log"
exit "$result"
