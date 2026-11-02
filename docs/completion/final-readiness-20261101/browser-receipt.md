# Browser and visual verification — 2026-11-01

Docker context: `desktop-linux`. Chromium runs in the digest-pinned Playwright image recorded in `browser.Dockerfile`, with 1,500 MB RAM and one CPU. Android was paused during this gate. No host tests or external backend requests were used.

The owned container was updated with the reviewed source using `docker cp`, then executed with:

```powershell
$env:DOCKER_CONTEXT='desktop-linux'
docker start -a elevateo-client-browser-20261101
```

Its entrypoint is `bash /evidence/browser-gate.sh`. Exact inner commands:

```sh
npm run lint
npm run typecheck
npm run test -- src/features/thread/ThreadPage.test.tsx src/features/thread/NotesPanel.test.tsx --maxWorkers=1
npm run build
npm run preview -- --host 127.0.0.1 --port 4174 --strictPort
ELEVATEO_PRODUCTION_URL=http://127.0.0.1:4174 npx playwright test --project=desktop-1440 --project=narrow-390 --workers=1 --output=/evidence/browser-final
```

The focused unit command executes **42 ThreadPage tests**. There is no `NotesPanel.test.tsx`; that extra filter matches no file and is not a separate passing suite. Notes are covered by the populated-note browser regressions. The earlier full web gate passed 1,195 tests; those were not all rerun for this CSS-only product repair.

Final result: lint, typecheck, 42 focused unit tests and production build pass; **262 browser cases passed, 0 failed, 2 skipped in 7.5 minutes**. The skips are desktop executions of the mobile-only drawer scenario (light/dark); both mobile executions passed. All eight reader/note contrast cases pass. See `browser-final-clean.log`.

Docker recorded exit code **0**, with no OOM (`browser-container-state.json`). The enclosing PowerShell logging session returned 1 despite the successful container state; it is not used as the test verdict. The container was removed after inspecting its sole evidence bind mount.

The fixture entry runs on port 4173; the production artifact runs on port 4174. Both are inside the Docker container. The production tests intercept API responses, including hostile plain-text content and a 50-row inbox; they do **not** establish real local-backend integration. See `backend-receipt.md` for that blocker.

Visual inspection found insufficient dark-theme contrast in reader metadata and notes. Semantic muted text and a dark note-card background repair it. A negative control ran the new tests against the old product source: **4 light cases passed and 4 dark cases failed**, with reader text at 3.07:1 and note text at 1.05:1 against the required 4.5:1. See `browser-contrast-negative.log`. Final repaired results are recorded above; this intentional failure is distinct from the final matrix.

Earlier runs exposed stale contract fixtures, selectors and test oracles. They remain failed/interrupted evidence: `browser-final-gate.log`, `browser-final-retry.log`, and `browser-repaired-gate.log` (245 passed, 13 failed, 2 skipped). The repairs add schema preconditions, viewport-aware controls, cursor-driven pagination, meaningful sign-out assertions, and painted-pixel contrast checks. No thresholds were relaxed.

Selected screenshots and human inspection findings are in `visual-receipt.md`. Raw traces remain local and are not included as thousands of repository artifacts.
