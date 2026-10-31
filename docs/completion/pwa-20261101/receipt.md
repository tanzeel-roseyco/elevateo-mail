# PWA verification — 1 November 2026

## Scope and audit

The initial web client had no manifest or service worker. Existing viewport-fit handling, theme tokens, gateway
no-store requests, draft optimistic-version/conflict rules and session-scoped approval recovery remain in place.
No server code, API contract, deployment, native updater, DNS or Cloudflare configuration changed.

The build hashes final disk bytes after Vite finishes rewriting preload references and generates a static shell and asset allowlist. Installation fetches without credentials,
rejects redirects and verifies SHA-256 before caching. Only exact same-origin static URLs are served from cache.
Root navigation uses the static shell; authentication, queries, APIs, attachments and writes bypass interception.
There is no runtime caching, background sync, send queue, skipWaiting or forced reload. A waiting update asks the
user to save drafts and resolve approvals, close every window, then reopen. Activation deletes only obsolete
Elevateo shell caches. Sign-out clears owned browser records and simulated-settings memory, fences other windows,
and still attempts server logout if local deletion fails. Cleanup failure is visible on every logout outcome.

## Verification scope

All commands ran inside the task-owned Docker Desktop container, using `DOCKER_CONTEXT=desktop-linux`.
Browser loopback is internal to Docker, not a host development server. The Playwright base-image pull failed during
layer extraction; Chromium and its system dependencies were installed in the existing Node test container instead.
No existing worker container was stopped. Production API responses in browser tests are synthetic and labelled;
no live account or mail was used.

The first default-parallel web run had 13 resource-sensitive failures. The serial rerun passed 1,210 tests,
contract checks, lint, typecheck, coverage, production build, bundle budget and fixture-marker exclusion.
The complete serial gate then passed 1,214 tests in 102 files (explicit exit 0). After the owner changed the design, lint, typecheck and 36 focused PWA/shared-UI tests passed. Raw logs preserve
the unsuccessful attempts. PowerShell reports native stderr as an error record even for successful commands;
the commands' test summaries and explicit exit receipts establish results.

The update browser test uses sentinels to prove no reload or storage mutation while two windows stay open.
It does not claim a live send approval or real server-backed draft operation. Existing draft and send unit tests
cover version/conflict/recovery behavior; those implementations are unchanged.

## Owner design update

PWA metadata now uses white background and theme colours. New notices and controls use shared Callout/Button
white/gold outline variants with black text, without hex colours in PWA components. Dark-mode PWA QA was dropped
as instructed. Global theme removal belongs to the concurrent feature-white-gold branch; this branch does not
rewrite its theme system. Screenshots show the existing production sign-in page with the revised PWA chrome.
Refresh manifest screenshots after that branch integrates its broader visual changes.

The first production browser attempt found an actual Vite ordering defect: two chunks changed after
precache hashes were generated. The worker refused installation as designed. Hashing now runs in writeBundle
against final disk bytes. The first screenshot harness also blocked service workers and therefore showed the
setup error state; it was corrected to permit and await installation before capturing manifest images.

## Final browser and Lighthouse evidence

`xvfb-run -a npx playwright test --config playwright.pwa.config.ts`: 7 passed, 0 failed, 0 skipped
against production dist. Covers installability/manifest assets, service-worker control, offline navigation,
private-route bypass, no queued writes, two-window update waiting, obsolete cache deletion, and successful/failed
network sign-out across windows. Visual tests use persistent profiles, CDP PWA installation and actual standalone
windows. Four screenshots at 1440 and 390 widths were opened and inspected after the final changes: legible
controls, no horizontal overflow, and no install invitation in the installed window. Motion is reduced.
Manifest screenshots were refreshed separately at their declared dimensions.

Lighthouse 13.6.0 audited the production sign-in route in Chromium 156.0.8078.4. These are single lab runs on
shared Docker Desktop, not field performance or authenticated-mailbox benchmarks.

| Profile | Performance | Accessibility | Best practices | FCP | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mobile | 76 | 100 | 96 | 1.2 s | 5.7 s | 140 ms | 0.078 |
| Desktop | 99 | 100 | 96 | 0.3 s | 1.0 s | 0 ms | 0.014 |

Initial scores were 71/100/96 mobile and 96/100/96 desktop. The PWA precache now excludes unused brand
masters (including a 3.4 MB original), and the offer row reserves space before the browser install event.
The final mobile LCP remains a performance limitation. Best-practices deductions are the synthetic 401 session
and login-challenge network errors; these were not hidden from the audit. Existing sign-in/bootstrap layout
and unused JavaScript are outside this PWA change and should be profiled with the final-readiness/theme work.
No Lighthouse PWA score exists in this version; explicit browser tests establish the relevant behavior.

The web-perf skill was read, but its required DevTools MCP tools were unavailable. The owner's autonomous
Docker-only instruction took precedence over its request to stop for MCP setup. Audits used Lighthouse CLI
inside Docker instead; no MCP trace or field INP measurement is claimed.

Reproduction inside the disposable container (after its normal npm ci and Chromium system dependencies):

```sh
apt-get install -y xvfb xauth
npm run build
xvfb-run -a npx playwright test --config playwright.pwa.config.ts
# Start the test-only production server for this separate audit command.
node e2e/pwa/server.mjs &
npm install --prefix /tmp/pwa-lighthouse lighthouse@13.6.0
node e2e/pwa/audit.mjs
```

Reports: `lighthouse-mobile.report.json`, `lighthouse-desktop.report.json`, `lighthouse-final.log`.
Browser results and inspected screenshots: `browser-results/`, `browser-complete.log`.
Raw earlier failures remain for provenance. The intermediate harness lint error was fixed before the final gate.

## Server and device follow-ups

- Verify HTTPS, same-origin root scope and correct JavaScript/manifest MIME types on the actual host.
- Revalidate `sw.js` and the manifest; retain old versioned static assets during rollouts and publish dist atomically.
- Verify `Cache-Control: no-store` on API, authentication, message and attachment responses. The worker bypasses
  these URLs, but it cannot control the browser HTTP cache or intermediary caching policy.
- Keep the host CSP intact. Confirm its existing policy permits same-origin workers, manifest, icons and scripts;
  only add `worker-src 'self'` or `manifest-src 'self'` if the deployed policy requires it. No CSP was weakened here.
- Real iOS/Android installation, OS splash screens, safe-area hardware, Safari Add to Dock and managed-device
  installation policies require physical/platform testing. The Docker screenshots prove desktop Chromium installation at phone width, not mobile-device installation.
- No backend integration, deployment, production header audit or live send was run.

## Design review

Natural update waiting trades immediate activation for protection of all open drafts and approvals. Cache-first
immutable assets trade storage/download size for reliable repeat/offline shell loads. Byte verification prevents
an authenticated/login fallback from entering the cache. No private response is needed for offline operation.
Scenario reasoning covered an unsaved draft, pending approval, second open tab, unavailable asset and stale cache.
No Obsidian connection was available, so no Obsidian tradeoff simulation was run.

## References

Lighthouse removed its PWA category in version 12; installability and offline behavior therefore have explicit
browser checks rather than an invented PWA score. See [PageSpeed release notes](https://developers.google.com/speed/docs/insights/release_notes).
Platform guidance follows [Safari 26 web apps](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
and [Safari 17 Add to Dock](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/).

## Final web gate and cleanup

The final source passed the full README web gate after all implementation and visual changes: 102 test files,
1,214 tests passed, zero failures; contract checks, lint, typecheck, coverage, build, bundle budget and fixture
exclusion all exited successfully. Entry JavaScript is 197.2 KB against the 500 KB budget. Focused PWA checks
also passed 24 tests. See `web-gate-complete.log`, `web-gate-complete.exit.txt` and `performance-fix-verified.log`.

```sh
npm run check:api && npm run check:api:v2 && npm run lint && npm run typecheck && npm run test -- --coverage --maxWorkers=1 && npm run build && npm run check:bundle && ! grep -rl "dev-fixtures\|Development fixtures\|fixture_token_a" dist
```

Cleanup removed only `elevateo-pwa-gate-20261101` (verified no mounts; writable layer 1,420,886,016 bytes)
and image `elevateo-pwa-check:20261101`. Docker reported container storage falling from 2.154 GB to 733.2 MB
and image storage from 3.602 GB to 3.176 GB. Host C: free space increased from 32,659,169,280 to
32,663,826,432 bytes; virtual-disk allocation and concurrent activity prevent equating this with Docker's
logical storage reduction. Shared build cache was active and growing, so no global pruning was safe. All
volumes and the other worker's preview were retained. Docker/WSL shutdown or compaction was not safe with
that workload active. See `docker-cleanup.log`. No production action or push was performed.
