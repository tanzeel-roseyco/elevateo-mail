# Final bounded browser acceptance repairs

2026-10-14. Task `task_bc66f1110a28`; dispatch `ctx_4ceb88be7ddc`.
Requested role: Astra LOW bounded repair. Actual session identifies itself as Codex/GPT-6; exact serving variant and effort are not exposed, so no exact-model attestation is claimed.

Status: authored, **NOT_RUN**. No host tests, installs, builds, Docker, SSH, subagents, ultrareview or commits were performed. Root remains sole fleet owner. No application/frontend source or frozen authored scenario IDs changed. Aggregate state/review documents remain root-owned.

## Repairs

- Selenium `UI.plaintext` now checks marker inclusion in literal `textContent`, zero element children, layout dimensions and the same node's visible ancestor chain. The journey uses it before and after reload, avoiding XPath interpolation of the marker. This matches Puppeteer's existing substring marker contract, without trimming or claiming full-body equality, viewport occlusion or manual visual acceptance.
- The standalone Selenium browser probe uses the exact private Grid boundary, verified browser/driver capabilities, disabled environment overrides and the same pinned Chrome binary selection as the lane runner. It navigates only to `about:blank` and constructs synthetic DOM. Eleven variants cover visible/literal positives and hidden node/ancestor, transparent/invisible/content-hidden ancestor, wrong/nested/empty/missing negatives. Every fixture includes a visible wrong sibling; negatives require the specific readiness timeout, not arbitrary rejection. These fixtures add zero application scenarios. Session quit is attempted in `finally`; root must tear down the isolated Grid on creation/transport failure or timeout because remote orphan absence is not proven by this source.
- Screenshot persistence adds one optional target-opener parameter defaulting to the existing filesystem open function. Lock creation, ledger, exclusive flags, write/sync/close sequencing and cleanup remain in the actual helper. Three deterministic regressions persist partial bytes before a write rejection, reject sync, or close the real descriptor then reject close. They assert exact injected rejection, reached phase, descriptor closure, owned-target and lock ENOENT, retained old bytes, and successful exact-budget retry. The close probe models a reported close failure after release; it does not establish recovery from an OS failure that leaves a descriptor open.

The two source review findings addressed are the MED Selenium parsed-markup false positive and MED screenshot cleanup coverage gap. Their prior review denominators/densities remain in `review-acceptance-browser-repairs.md` and `review-acceptance-playwright-repairs.md`; this implementation handoff is not an independent review or defect-closure verdict.

## Frozen source inventory

Physical LOC includes blank lines. SHA-256 covers raw file bytes.

| File | LOC | SHA-256 |
| --- | ---: | --- |
| tests/acceptance/selenium/ui.ts | 59 | 653c21555f9fac14502db88807cb4b11013d2cb03f1ef1ed56442c1ba299c8b7 |
| tests/acceptance/selenium/journeys.ts | 86 | d5d417e6e6e9bd5b6023f9e5e51dc7584d2749d8c5fa719a6a63f40f81c08572 |
| tests/acceptance/selenium/ui.browser-probe.ts | 60 | 0cd9b0d1908e6d337c3de03b57d6b8813518a74f9e93a2ca6c99a25184c49190 |
| tests/acceptance/playwright/screenshots.ts | 51 | 4805eeb95659579abf6c4ffa56e77b0794df329515467edd8a0fd9c870ebeb57 |
| tests/acceptance/playwright/screenshots.unit.spec.ts | 98 | b5dac72ab42c9c7e2ca6f9d7055e65193732ae561efd9f56726c64fa5339fe88 |

Total source inventory: 354 physical LOC, not independently reviewed coverage. Suggested bounded review slices: Selenium UI + journeys = 145; browser probe = 60; screenshot helper + regressions = 149. Dedicated design review and aggregate defect-density accounting remain root-owned.

## Pending root Docker commands — all NOT_RUN

Run these commands **inside** root's approved pinned acceptance container, working directory `tests/acceptance`, with the existing locked dependencies. This is the container payload, not authorization to create resources or run on the host:

```sh
npm run typecheck
npm run build
node --test dist/playwright/screenshots.unit.spec.js
npm test
node --test dist/selenium/ui.browser-probe.js
```

The final command requires the isolated pinned Chrome Grid reachable as `http://selenium:4444`, with `SELENIUM_GRID_URL`, `SELENIUM_EXPECTED_BROWSER=chrome`, `SELENIUM_EXPECTED_BROWSER_VERSION` and `SELENIUM_EXPECTED_DRIVER_VERSION` from root's verified image contract. No application seed or credentials are required for this fixture. Do not invent version values, public network access or local-driver fallback. Root must apply its bounded external watchdog and exact task-resource cleanup, preserve unrelated/persistent resources, then record actual exits and Grid absence evidence. The package has no lint script; the applicable repository lint gate remains pending.

After fixture and unit gates, root retains the real seeded application Selenium/Playwright lane runs and actual visual validation. Neither fixture success nor authored source establishes application acceptance. Tests, typecheck, build, lint, browser behavior and independent review are all **NOT_RUN/pending** for this frozen repair.
