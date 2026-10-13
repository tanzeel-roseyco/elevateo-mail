# Acceptance browser harness repairs

2026-10-14; task `task_e9f11ec0a289`, dispatch `ctx_ae3470dce540`.
Source-only repair within the accepted test expansion. No application changes, package/shared-module edits, commits, agents, host tests, Docker, remote operations or deployment were performed. Root owns Docker execution, independent bounded review, aggregate documentation and cleanup. Runtime status for every new check: **NOT_RUN**.

## Repairs and scope

1. Puppeteer plaintext requires the same matching child-free `pre` to have nonzero layout and a visible ancestor chain. Literal `textContent.includes(marker)` preserves the existing marker contract without trimming, HTML parsing or claiming exact full-message equality. The chain rejects display-none, hidden visibility, zero opacity, content-visibility-hidden and hidden attributes. This is rendered-presence evidence, not viewport occlusion/contrast/manual visual acceptance. Eight separate browser fixture probes cover visible and literal content, hidden node/ancestor, transparent/invisible ancestor, wrong content and nested markup. Fixtures use DOM creation/textContent, never message innerHTML.
2. All three login paths check exact `http://app.test` origin immediately before each sensitive type/sendKeys/fill operation. Malformed/unavailable URLs, alternate schemes/origins and userinfo fail with a fixed sanitized error. Puppeteer and Selenium retain ordinary draft fills; login explicitly selects the credential guard. Playwright delegates its actual two-fill sequence to the same guarded helper. The common helper lives in the owned Playwright directory; imports from the other owned lanes avoid duplicated policy without changing shared ownership. Six pure guard tests and ten actual-fill-path tests are authored; the latter call the real Puppeteer/Selenium UI methods with narrow doubles and the real Playwright credential sequence. One separate Puppeteer browser probe follows an intercepted 302 to a peer-origin synthetic form and asserts zero input. No runtime secrets are loaded by these regressions.
3. Playwright screenshot accounting now uses the three known lane PNG files as its durable ledger. Every call checks their current sizes under an exclusive lock before creating any screenshot. Fresh worker/module instances therefore inherit existing artifact usage. Only fixed paths are lstat'd: no tree scanning or symlink traversal. Directory canonicality, regular single-link artifacts, exclusive creation and mode 0600 remain required. A partial write is removed only after this call exclusively creates it; no temporary files are used. Unexpected concurrent writers or a stale crash lock fail closed. Three unit tests cover fresh-module replacement and aggregate overflow/exact-cap success, overwrite/lock exclusion, and path/link rejection.

T0 schemas, scenario IDs, scenario totals, reporting and not_run behavior are unchanged. New unit and browser fixture probes are **not application acceptance scenarios**. No additional dependencies or package runner changes are needed. Existing `*.unit.spec.ts` glob discovers 19 newly authored unit cases; browser file is deliberately outside both that glob and Playwright's `*.e2e.ts` glob. The browser probe has nine nested fixture checks plus its enclosing Node test, not ten app cases.

## Root-owned verification commands

Run in the existing approved Linux Docker acceptance image, from `tests/acceptance`, with pinned dependencies already installed:

```sh
npm run typecheck
npm run build
npm test
node --test dist/playwright/credential-origin.unit.spec.js dist/playwright/credential-fill.unit.spec.js dist/playwright/screenshots.unit.spec.js
```

The focused Node command is an alternative focused regression invocation; do not double-count it with `npm test`. For the separate fixture browser probe, use the approved nonroot sandbox-enabled Puppeteer image and pinned CFT binary/version, retaining root's external deadline and cleanup:

```sh
PUPPETEER_EXECUTABLE_PATH=/opt/cft/chrome-linux64/chrome PUPPETEER_EXPECTED_BROWSER_VERSION=155.0.8059.39 node --test dist/puppeteer/ui.browser-probe.js
```

Then root can rerun existing real-app lanes with their required seed/credential/config mounts: `npm run test:playwright`, `npm run test:puppeteer`, `npm run test:selenium`. Those invocations are anticipated commands, not execution receipts. No lint script exists in the inspected acceptance package; root retains the applicable repository lint gate. A source whitespace check returned exit 0, but the acceptance tree was already untracked, so that is not type/lint/test validation of these new files.

## Limits and review accounting

The three accepted MED findings were previously identified over 1,022 reviewed physical LOC, aggregate 2.94 defects/KLOC. This handoff authors candidate repairs, not independent closure. No fresh independent review or defect density is claimed; root will send bounded slices and the dedicated design review. Suggested physical-file groups remain below 200 LOC per pass: Puppeteer UI+journeys (147), browser probe (87), Selenium UI+journeys (131), support+credential helper+credential unit files (146), screenshot helper+unit tests (99). These cover 610 unique physical LOC across 11 changed/new source files, including unchanged surrounding lines; they are not 610 newly added LOC.

Point-in-time URL checks cannot prevent navigation during an in-flight browser command; private network isolation remains mandatory. Actual redirected Selenium/Playwright browser execution is not included; their per-operation coupling is unit-covered in source only. Credential guard errors never echo destination, credentials or DOM. Screenshot accounting intentionally covers exactly the three current screenshot IDs; future screenshot call sites must extend the allowlist. Playwright's task-owned private output directory must exist and must not be concurrently mutated by an unrelated process. A crash leaving `.screenshots.lock` requires root reconciliation and fails closed rather than automatically deleting another writer's lock. ENOSPC/close-failure/crash recovery behavior has source cleanup but no injected runtime evidence. Atomic filesystem operations protect cooperating writers, not an attacker that can replace parent directories. No Obsidian or architecture consultation was attempted in this bounded repair dispatch.

All code hashes below are raw local SHA-256 and physical lines; independent review and Docker results remain pending. Existing unrelated dirty work was preserved. No disposable Docker storage was created or deleted by this worker.

| File | Physical LOC | SHA-256 |
| --- | ---: | --- |
| tests/acceptance/puppeteer/ui.ts | 67 | db22a74339ec98fef94801c83c34917617a316b5c3f200d00eafc94bc08351c9 |
| tests/acceptance/puppeteer/journeys.ts | 80 | 23a9682ea5c2494954a9937eadf73f5a9e43cb82bb5e38ca61bb709c61c324f6 |
| tests/acceptance/puppeteer/ui.browser-probe.ts | 87 | d9af08eab9b083ecb40c1e4b9605ac3b4423f39e0de7aabf5d36c3d593d87778 |
| tests/acceptance/selenium/ui.ts | 44 | 7ef4bb427b13cb9bf456bce77e95383e54b8c7982f1e0ce2b55a723d28a17633 |
| tests/acceptance/selenium/journeys.ts | 87 | e95dbbef467fbcf7ca683c0b991ba8f2d40365331a2b5879704a51793f56e285 |
| tests/acceptance/playwright/support.ts | 53 | 57e6cbdd67e479f3003b926e089d605118b3e88189a35c8a349599b579a96beb |
| tests/acceptance/playwright/credential-origin.ts | 16 | 2f8ec06f36282f794f8a19bdc2e0f3302af4f796c041439a97b0e3f75ee0ec6e |
| tests/acceptance/playwright/credential-origin.unit.spec.ts | 26 | e1682b27ee075f52441bba5063ea6d329d05aac1bb2d04789d0f5d47ebb08dc6 |
| tests/acceptance/playwright/credential-fill.unit.spec.ts | 51 | 27cc1e1ebe64ed7c2f313bac3faedd8dcad483f0db8f51e15ef75f9e7649e787 |
| tests/acceptance/playwright/screenshots.ts | 47 | ba90f3ab89fd6e15a32feea690e5f2ee59f2e6d78320bc49ee51711b7270be55 |
| tests/acceptance/playwright/screenshots.unit.spec.ts | 52 | a7e7d16dc7486eb191617229f291727421b25e61ce66fa831f645cba0c4aaf6c |
