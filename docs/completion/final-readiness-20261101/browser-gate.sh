#!/bin/bash
set -euo pipefail
cd /workspace/apps/web
npm run lint
npm run typecheck
npm run test -- src/features/thread/ThreadPage.test.tsx src/features/thread/NotesPanel.test.tsx --maxWorkers=1
npm run build
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort >/evidence/production-preview.log 2>&1 &
preview_pid=$!
trap 'kill "$preview_pid"' EXIT
# AIDEV-NOTE: Playwright waits for the fixture server only; production preview needs its own readiness gate.
ready=0
for attempt in {1..60}; do
  kill -0 "$preview_pid" || { cat /evidence/production-preview.log; exit 1; }
  if curl --fail --silent --max-time 1 http://127.0.0.1:4174/ >/dev/null; then ready=1; break; fi
  sleep 1
done
test "$ready" = 1 || { cat /evidence/production-preview.log; exit 1; }
ELEVATEO_PRODUCTION_URL=http://127.0.0.1:4174 npx playwright test --project=desktop-1440 --project=narrow-390 --workers=1 --output=/evidence/browser-final
