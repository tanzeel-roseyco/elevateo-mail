#!/bin/sh
# Runs INSIDE the retained Node dependency image; immutable source and harness are read-only.
set -eu
mkdir -p /tmp/check/apps /tmp/check/contracts
cp -a /source/apps/web /tmp/check/apps/web
cp -a /source/contracts/. /tmp/check/contracts/
cmp /tmp/check/apps/web/package-lock.json /build/apps/web/package-lock.json
cp /harness/fixtureMain.tsx /tmp/check/apps/web/src/dev/be03BrowserMain.tsx
cp /harness/send.spec.ts /tmp/check/apps/web/e2e/be03-browser.spec.ts
ln -s /build/apps/web/node_modules /tmp/check/apps/web/node_modules
cat > /tmp/check/apps/web/be03-browser.html <<'HTML'
<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>SIMULATED BE03 browser validation</title></head><body><div id="root"></div><script type="module" src="/src/dev/be03BrowserMain.tsx"></script></body></html>
HTML
cd /tmp/check/apps/web
npm run typecheck > /output/harness-typecheck.txt 2>&1
npm run lint > /output/harness-lint.txt 2>&1
exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 18142 --strictPort
