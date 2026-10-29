#!/usr/bin/env bash
# AIDEV-NOTE: Keep shell quoting inside this file; Windows native argument parsing strips nested quotes.
set -u
failed=0
npm run generate:api:v2 || failed=1
for gate in 'npm run lint' 'npm run typecheck' 'npm test' 'npm run test:e2e' 'npm run build'; do
  bash -c "$gate" || failed=1
done
exit "$failed"
