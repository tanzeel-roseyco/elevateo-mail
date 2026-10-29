# Frontend regression repair status — 284aa71 unit and browser failures

Scope: the 12 unit-test failures recorded in the parent's Docker run of HEAD `284aa71`
(`frontend-284aa71-test.log`: API generation, lint and typecheck passed; 159 passed / 12 failed).
All analysis was static (log + source); no host tests, Docker runs or commits were performed here.
Docker validation of these repairs is pending and owned by the parent (fleet-02). The in-progress
browser Docker run may add further findings; none are addressed yet.

## Root causes and fixes

### 1. Product defect — session recovery to an unchanged identity never restarts reads

Failure: `Shell.test.tsx > session gate > a second context change blocks in retry_required until
the explicit retry` (timed out stuck on "Loading mailboxes").

`SessionProvider.requestSession('recovery')` invalidates the request scope, so every in-flight read
becomes stale. But when the recovered session has the **same identity**, the `recovering` → `ready`
commits can batch into a single render (fast gateway responses, as in jsdom): the identity-keyed
`ProtectedShell` never unmounts, and the memoized `ReadContext` object — keyed only to
`context_id`/`authorization_version` — is unchanged, so no consumer effect re-runs. The first 409's
traversal was consumed by `handleError`, nothing refetches, and the UI hangs on loading forever;
the second 409 that should reach `retry_required` is never issued.

Fix (`apps/web/src/app/session.tsx`): a `readEpoch` state is bumped whenever a non-freshness
session request (bootstrap, explicit retry, recovery) commits `ready`, and the `ReadContext`
memo now keys on it. Consumers (`Shell` mailbox traversal, `InboxPage`, `ThreadPage`) depend on
the context object, so a recovery always restarts their reads with a fresh generation, while an
unchanged-identity **freshness** response still preserves the same context object, in-flight reads
and accumulated pages (asserted by `session.test.tsx` "unchanged identity preserves read
ownership", which still holds — freshness never bumps the epoch). AIDEV notes updated in place.

Regression coverage: the previously failing Shell test is itself the regression test for this
path — it deterministically reproduces the batched `recovering`→`ready` transition and asserts
`retry_required` plus exactly bootstrap + one recovery session read. No assertion was changed.

### 2. Test fixture defect — mailbox ids collide across pages (Shell.test.tsx)

Failure: `mailbox traversal > one invalid continuation cursor resets the whole loop…` ("Fresh
second page" missing).

`mailboxPage()` derived ids from the **per-page item index**, so the single-item pages "Fresh
first page" and "Fresh second page" shared one id and the traversal's by-id deduplication
(correct product behavior) dropped the second page's row. Fixed by assigning a stable unique id
per distinct name (equal names still model the same mailbox across pages). The `readCalls() === 4`
and discarded-stale-page assertions are untouched.

### 3. Test harness defect — missing mailbox route unmounts the Shell (Shell.test.tsx)

Failure: `mobile drawer > opens as a named dialog, closes on route selection…` (empty `<body>`;
stderr "No routes matched location /mailboxes/…").

`renderShell` declared only an index route under `<Shell>`, so clicking a drawer mailbox link
navigated outside the route tree and unmounted the entire shell; the second drawer open then had
nothing to query. Added a `mailboxes/:mailboxId` child route rendering the same outlet, matching
the app's real navigation URL shape. All dialog/Escape/focus assertions are unchanged.

### 4. Test query defect — subject regex matches the preview span too (InboxPage.test.tsx, 9 failures)

All nine InboxPage failures share one cause: the fixture builds `preview_text` as
`"<subject> preview"`, so single-match queries like `findByText(/Late arrival/)` matched both the
subject span and the preview span and threw "Found multiple elements" (including inside the
layout-effect `CommitProbe`, where the throw aborted the commit under test). The component
behavior in every scenario (continuation, one-reset budget, dedup by thread id, D3/D4 stale
ownership) is correct per the rendered DOM in the log.

Fixes: presence checks now target the row link's accessible name
(`findByRole('link', { name: /…/ })` — more precise, same intent); absence checks became strictly
stronger (`queryAllByText(/…/)).toHaveLength(0)` covers subject **and** preview); `CommitProbe`
uses `queryAllByText(...).length > 0` so multiple matches count as visible instead of throwing.
No expected behavior, call counts or negative assertions were weakened.

## Browser (Playwright) failures — `frontend-284aa71-browser.log`, 31 passed / 14 failed

No product UI, accessibility, keyboard or contrast defect was found: every passing drawer,
overflow, reduced-motion, hostile-content and keyboard flow confirms the shell behaves correctly
in each presentation. The 14 failures are two spec-harness defect classes:

### 5. Strict-mode locator ambiguity (desktop + reduced-motion: 6 failures)

- `getByText('Routed conversation 50')` (`production.spec.ts` 50-row test) matched both the
  subject span and the `"Preview text for routed conversation 50"` span — the same subject/preview
  ambiguity as the unit tests. Replaced with the row link's accessible name
  (`getByRole('link', { name: /Routed conversation 50/ })`).
- `getByRole('link', { name: 'Unread' })` (contrast tests and the 50-row filter toggles) matched
  the Unread **filter pill** and any conversation row whose accessible name includes its visible
  "Unread" badge. Replaced with `exact: true` on the 'Unread'/'All' pill locators (row names are
  longer strings, so exact matching excludes them). The contrast measurement itself, its
  must-be-measured surface list and the 4.5:1 thresholds are untouched.

### 6. narrow-390 assumed the desktop rail (8 failures)

Below the `md` breakpoint the sidebar rail is `display:none` and mailbox navigation lives in the
drawer dialog — behavior the dedicated 390px drawer tests exercise and pass. Seven specs
(keyboard traversal ×3, contrast ×2, hostile-content isolation, 50-row baseline, hostile reader in
`production.spec.ts`) clicked the rail's mailbox link or asserted the rail navigation directly, so
on narrow-390 they timed out before testing anything.

Added `apps/web/e2e/support.ts` with viewport-aware helpers used by both specs:
`expectMailboxNavReady` (asserts the rail navigation at ≥ md, the drawer trigger below) and
`openMailbox` (rail click, or drawer open → assert the dialog's mailbox navigation → select →
assert the dialog closed). The narrow project now exercises the real mobile navigation path in
these specs — coverage is strictly added, not weakened; all desktop assertions remain.

## Bounded review and contrast evidence fix

Parent-run bounded review: `session.tsx` (181 reviewed lines, SHA `7d7b88d`) — 0 defects;
`e2e/support.ts` + `read.spec.ts` + `production.spec.ts` (260 reviewed lines) — 0 repair defects.
The review surfaced one **pre-existing** contrast evidence gap: on mobile, the sidebar-active
measurement could read the `display:none` desktop rail after the drawer closed. `read.spec.ts` now
reopens the drawer below md and measures the visible active link (selected by non-empty client
rects — a missing rendered copy fails the must-measure check), closing it with Escape afterwards.
All four surfaces and the 4.5:1 threshold are retained; no UI change was needed (the tokens are
identical — this was an evidence-quality gap, not a product defect). Recorded with density figures
and current blob hashes in `code-reviews.md`.

## Fleet-02 validation runner (authored, not executed)

`scripts/fleet-02-validation-20261012/`: `make-snapshot.sh` (explicit contracts/v1 + apps/web
context, six repaired files asserted, transfer-portable per-file + archive sha256),
`validation.Dockerfile` (pinned unit/browser targets sharing one npm ci layer), `run-fleet-02.sh`
(snapshot archive + manifest hash verification before Docker; fresh nonce and resource-absence
preflight; validated output path; builder capped at create time 2 CPU/2 GiB and verified, failing
closed; unit 2 CPU/2 GiB; browser detached 2 CPU/3 GiB, 1 GiB shm, CHOKIDAR_USEPOLLING, with
polling; logs/results preserved on failure; EXIT/INT/TERM-trapped label-and-mount-verified cleanup
whose failures fail the run; no prune), plus a reviewer README. Parent reviews, transfers and runs.
File sha256 / LOC:

- `make-snapshot.sh` (56) `3337873ba662be88c00fc0c7db1de6c8cd943b7878ef3aad255869c876c54c64`
- `validation.Dockerfile` (41) `73861610a354eb5a9198f3ecb89f9978935ba0d5312ad74879bafeec5b80193b`
  (rev 2: bundle marker scan accepts only grep status 1 — status 0 (leak) and >=2 (operational
  error) both fail; previously `! grep` let status 2 pass. Covered by probes P9–P11.)
- `run-fleet-02.sh` (200) `dcaa2bc92d76c26a896f9737ba7c099a65da2c077b2ec018e488b60effbcc597`
  **FROZEN** (rev 5: `exists()` uses a pure-Bash exact whole-line `case` match — the prior
  `printf | grep -Fxq` under pipefail could SIGPIPE the producer on an early match in a
  >pipe-buffer inventory and falsely report absence; output path restricted to a single safe
  basename `[A-Za-z0-9._-]`, rejecting multi-component paths that could escape through a symlinked
  parent and any existing entry including a dangling symlink. Earlier guarantees unchanged. Rev 4: typed-inventory existence checks — successful exact-match listing decides yes/no, any
  listing failure is unknown, never absence; builder deletion requires builder record AND the
  captured buildkitd container ID AND the exact RW `/var/lib/buildkit` state-volume mount, else
  everything is retained; cache-volume deletion is gated on that verified ownership plus confirmed
  container absence and is itself verified; with no builder record, orphan buildkitd container or
  cache volume is reported and retained, never deleted; browser PASS requires a successfully
  inspected `exited`/0 terminal state — inspect failures and non-exited states latch failure;
  per-command timeouts, create-time exact cap checks and fail-the-run cleanup errors retained)
- `probes.sh` (121) `21f672750b078e1cf950d637cc3dea159b0fbcc164ce79294eea3f5e175d2952`
  (rev 3: P12 symlinked-parent output escape rejected, P13 dangling-symlink output rejected,
  P14/P15 exact-line-match regression against a >64KiB first-row-match inventory plus absent and
  partial-name cases, mirroring the runner's `exists()` expression with a keep-in-sync note. Rev 2: absolute mktemp scratch path with absoluteness guard so the EXIT trap removes the real
  directory after cd; new P9–P11 regression probes for the bundle marker scan: clean scan passes,
  marker leak fails, grep operational error fails)
  (synthetic failure probes P1–P8 for parent Docker execution: output-path guards, missing/
  tampered archive hash, missing/tampered manifest, structural snapshot check; each asserts a
  nonzero exit with the exact guard message and runs entirely before any Docker resource is
  created. Recorded limitation: builder-cap, browser-terminal and cleanup-retention paths need
  live fault injection and remain with the parent.)
- `README.md` (21) `2b79f2c82e6ff13ee22232cc986c29c889e60e1669c5bf4183a599550f7ca052`

## Files changed

- `apps/web/src/app/session.tsx` — readEpoch product fix (+ AIDEV note updates)
- `apps/web/src/app/Shell.test.tsx` — unique fixture ids; mailbox child route
- `apps/web/src/features/inbox/InboxPage.test.tsx` — unambiguous queries; stronger absence checks
- `apps/web/e2e/support.ts` — new viewport-aware shell navigation helpers
- `apps/web/e2e/read.spec.ts` — drawer-aware navigation; exact filter-pill locator; visible-copy
  contrast measurement (drawer reopened below md); fail-closed color parser with regressions and
  recorded raw computed values (blob `6428fc71`). This last change postdates the parent's
  frontend-r4 snapshot — the next snapshot/transfer must include it or light-theme contrast
  readings stay untrustworthy.
- `apps/web/e2e/production.spec.ts` — drawer-aware navigation; row-link and exact pill locators
- `scripts/fleet-02-validation-20261012/` — authored fleet-02 validation runner (4 files)

## Contrast oracle defect — color-mix serialization (2026-10-12, post-review)

Parent-supplied root-cause evidence: `--accent-soft` is a `color-mix(in srgb, …)` value, which
Chromium serializes in computed style as `color(srgb 0.957 0.91 0.788)` (0–1 floats). The e2e
luminance parser blindly divided matched numbers by 255, reading a pale cream as near-black — a
broken oracle, consistent with an anomalous ~3.5:1 against a screenshot showing gold text on a
pale cream active sidebar. **No palette change was made for this**; the earlier FE-R14 dark-theme
repair (`#7a6218` → `#e3c35c`) was a genuine calculated defect on plain hex values and stands.

Fix in `read.spec.ts` (new blob `6428fc71`, 252 lines): fail-closed color handling that accepts
exactly two opaque serializations — `rgb()/rgba()` (0–255) and `color(srgb …)` (0–1) — and throws
on anything else, including non-opaque alpha. Parser regressions run inside the test before any
ratio is trusted (white ≈ 1, the cream reads light, `rgb` and `color(srgb)` agree to 1e-9, unknown
formats throw). Each surface's raw computed fg/bg strings are recorded in the ratio failure
messages and attached as per-theme annotations, so the next fleet-02 Docker run yields the actual
computed values for parent audit. The 4.5:1 threshold and all four mandatory surfaces are
unchanged.

**r5 result and oklab follow-up (final, frozen for bounded review):** fleet-02 r5 passed unit
171/171, static/build, browser 44/45 with exact cleanup (`cleanup_failed=0`). The one failure —
reduced-motion light contrast — was the oracle again: a background mid-transition (durations
collapsed to 0.01 ms) serialized as `oklab(0.967428 0.000417888 -0.00125271)` and the strict
parser correctly refused it. Final fix in `read.spec.ts` (blob `80cb3aa2`, 346 lines):

- **Deliberate transition settling (lines 142-170):** every FINITE animation/transition is awaited
  to completion via `document.getAnimations()` (infinite ones, e.g. the skeleton pulse, are
  skipped). A rejecting 5 s deadline races the pending waits, so a finite animation that outlives
  it FAILS the test instead of silently measuring unsettled colors; the timer is cleaned up in a
  `finally`. Cancelled animations resolve their wait deliberately (cancellation also ends
  interpolation). Two animation frames then flush settled computed styles.
- **Bounded non-recursive sRGB pixel conversion (lines 171-211):** `rgb()/rgba()` and
  `color(srgb …)` parse directly at full precision; every other value is validated by the
  two-sentinel fillStyle check, then PAINTED into an explicit-sRGB 1×1 canvas and read back with
  `getImageData({ colorSpace: 'srgb' })` — a real pixel conversion with no serialization re-parse
  and no recursion. Pixel alpha ≠ 255 throws (explicit alpha rejection).
- **Serialization regressions preserved (lines 221-233, asserted 279-285):** the exact failing r5
  oklab value must read light (>0.7), `oklab(1 0 0)` must agree with sRGB white within 0.02,
  `rgb` vs `color(srgb)` agree to 1e-9, and garbage still fails closed.

Threshold 4.5:1 and the four mandatory surfaces unchanged; raw computed strings still recorded.
Docker browser evidence for the normalization output lands in the next frozen run.

(The interim post-r5 fix at blob `d23d9bb4` — fillStyle round-trip normalization and two-frame
settling — is superseded by the final version above after parent static review: the round-trip
was not an explicit pixel conversion, `channels(normalize(raw))` lacked an unchanged-output guard
against indefinite recursion, and two frames did not bound ordinary finite transitions.)

## Finding reconciliation — FE-01 initial review vs. implemented fixes (2026-10-12)

Reconciled from existing review output only (`docs/evidence/fe01-initial-review/review.md`,
`code-reviews.md`, the two Docker logs and the bounded repair reviews); no new review was run.
The user authorized no further ultrareviews; the frontend ultrareview itself was rejected
(>8000 diff lines), so the authoritative ledger is the 20-finding FE-01 initial review.

**Fixed with regression coverage (18 of 20):**

- FE-R01/R02/R03, FE-R13 — transport abort/normalization/MIME and the 401→409 test defect:
  repaired in the FE-01-R1 data checkpoint (transport + cancellation suites, 113 data tests;
  historical baselines 10/21 and 2/7 failures now pass).
- FE-R04 — 30 s freshness without focus reliance: `session.tsx` deadline-chained timer;
  `session.test.tsx` fake-timer schedule/offset regressions.
- FE-R05 — identity-keyed `ProtectedShell`; V3 first-committed-frame commit-probe test.
- FE-R06 — Radix drawer (focus trap, inert background, Escape/restore): Shell unit tests (route
  fixed this round) and the passing 390px e2e drawer suite.
- FE-R07 — one-reset mailbox traversal: `readPage` budget + Shell loop; traversal tests
  (fixture id collision fixed this round).
- FE-R08/R09/R10/R11 — inbox/thread reset-replace, empty-page continuation, filter round trip:
  component logic verified correct in this round's log analysis; their tests repaired
  (query ambiguity) and ThreadPage suite passing.
- FE-R12/FE-R15 — fixture resolver union and missing Node declarations: strict typecheck passes
  in the 284aa71 Docker log.
- FE-R14 — dark accent `#e3c35c` in `index.css` (AIDEV-NOTE records the calculation); the e2e
  contrast spec is the regression, now measuring the visible copy in both themes with the repaired
  fail-closed color parser (see "Contrast oracle defect" above — prior sub-threshold light-theme
  readings are presumed oracle artifacts pending the next run's recorded computed values).
- FE-R16 — focus/visibility cannot bypass exhausted recovery: listeners exist only while ready;
  `session.test.tsx` blocked-state listener and fake-timer regressions. This round's readEpoch
  fix additionally guarantees reads restart after a same-identity recovery.
- FE-R17 — Testing Library cleanup via `src/test/setup.ts` (globals stay disabled); the formerly
  retained-DOM session tests pass (16/16 in the 284aa71 log).
- FE-D01 — false runtime-isolation claim removed from `test.Dockerfile`/README; real runtime
  isolation evidence now exists as `production.spec.ts` (hostile content, origin confinement).
- FE-D02 — README now states exact pins.
- FE-G01 — lint script exists and passes (`eslint . --max-warnings 0`) in the 284aa71 Docker log.

**Implemented but gated on pending actual-UI evidence (not yet acceptance):**

- FE-R14's browser-measured contrast, the drawer/keyboard e2e matrix, 50-row long-task baseline
  and hostile-content isolation all await the parent's fleet-02 run of the frontend-r4 snapshot
  (unit 171-test suite + browser matrix). Source and runner stay frozen meanwhile.

**Still without a concrete fix or regression coverage (carry-forward):**

1. ~~Reduced-motion assertion gap~~ **Closed post-r5** (r5 snapshot frozen separately): new
   behavior-matching spec `animations respect the reduced-motion preference (FE-R16)` in
   `read.spec.ts:241-276` asserts the real computed state from the bundle CSS in every project —
   under reduce, animation/transition durations collapse to ≤1 ms (index.css:132-140, unchanged
   product behavior); without the preference, the pulse must genuinely animate (≥1 s) and the
   transition run (≥0.1 s), so the reduce branch cannot pass vacuously. Fail-closed on a missing
   animation or transitioned element. File blob `3e462157` (288 lines); evidence pending the next
   fleet-02 browser run.
2. Data-layer micro-gaps recorded at stage A — **next-scope regression cases defined below;
   explicitly NOT done.**
3. Real Rails session/storage/mailbox integration and all mutation flows — out of this
   checkpoint's scope by design; no coverage exists or is claimed.
4. ~~Doc drift~~ **Closed post-r5**: `apps/web/README.md:31` now states Radix Dialog 1.2.0 powers
   the accessible mobile drawer (`src/ui/Drawer.tsx`); blob `aa563285` (35 lines).

### Stage-A micro-gap bounded-review repairs (post-authoring review findings)

- **Retry-After strict whole-seconds parsing** (`transport.ts` blob `fbc040f7`, 151 lines):
  `parseInt` accepted `1oops` as 1 and truncated `1.5`/`300.9`; the entire trimmed header must now
  match `^\d{1,3}$` before the 1..300 range check, and HTTP-date values stay discarded. New failure
  cases in the boundary suite: `1oops`, `1.5`, `300.9`, `1e2`, `-1` → none.
- **Scheduling-horizon gap accurately labeled** (`transport-boundaries.test.ts` blob `79722cd2`,
  84 lines): the repo has NO automatic retry scheduler — `retryAfterSeconds` is only surfaced on
  the GatewayError and all retries are explicit user actions — so the suite is renamed/documented
  as header-parsing coverage and the fetch-count/delay scheduling-horizon case is recorded as
  UNRESOLVED until a scheduler exists. The 10 000 ms deadline is now asserted independently of the
  constant used to advance the fake clock.
- **Code-point maxima extended to cursors and request ids** (`contract.ts` blob `11d1700a`,
  127 lines): the false "opaque implies ASCII" assumption is removed — `next_cursor` (max 2048)
  and `request_id` (max 128) have no contract ASCII pattern and now use the shared `codePointMax`
  refinement with their `min(1)` preserved; only `opaqueToken` keeps `.max`, where its regex makes
  units equal points. Boundary tests added (`contract-unicode.test.ts` blob `391e1d54`, 101
  lines): cursor 2048/2049 astral plus non-empty, request_id 128/129 astral plus non-empty.

### Stage-A micro-gap regressions — AUTHORED post-r6 (three bounded patches, Docker-unverified)

The three case sets below are now implemented as small bounded patches for parent review; every
assertion still awaits fleet-02 Docker execution. One actual defect was found and fixed while
authoring: Zod `.max()` counts UTF-16 units, so runtime validation rejected contract-legal astral
text (256 emoji = 512 units) that the canonical schema's code-point `maxLength` permits.

- **Patch U (Unicode):** `contract.ts` blob `6dd6a417` (128 lines) — `text(max)` helper counts
  Unicode code points for human-text fields (names, addresses, subjects, previews, body, error
  message); opaque tokens/cursors keep `.max` (units = points there), AIDEV note records why.
  Tests: `contract-unicode.test.ts` blob `a96d548c` (79 lines) — astral 256/257, mixed 255+astral
  (257 UTF-16 units, the old counting's rejection case), ZWJ family counted as 7 code points,
  preview 256/257, body 16384/16385, reader subject 998/999.
- **Patch S (signals):** `fixtureGateway.ts` blob `389bb9c3` (76 lines) — a pre-aborted caller
  signal now rejects with the canonical `aborted` error before work, matching the HTTP adapter;
  later aborts stay the caller's post-await concern (D4), and abort-IGNORING gateways in tests
  remain method overrides. Tests: `signal-propagation.test.ts` blob `266f999c` (77 lines) — for
  EVERY gateway method on both adapters: pre-aborted rejects (HTTP: with zero fetch calls),
  mid-flight abort rejects `aborted` and demonstrably aborts the signal handed to fetch
  (combined-controller linkage, not object identity), fixture still resolves on a live signal.
- **Patch T (timers):** `transport-boundaries.test.ts` blob `2d51866b` (71 lines) — deadline−1 ms
  still succeeds; exactly at `REQUEST_TIMEOUT_MS` the request times out and the fetch signal is
  aborted; Retry-After window 1..300 inclusive: 0/301/non-numeric discarded, 1 and 300 honored,
  absent header yields none. Shared fake-timer harness with the zero-leaked-timers check.

### Stage-A micro-gap regression cases — original definitions (kept for traceability)

- **Supplementary-Unicode counting semantics** (contract limit tests use BMP only): decide and
  document the counting unit for the frozen contract's string limits (JSON Schema `maxLength`
  counts code points, not UTF-16 units), then: subject/preview of exactly N astral characters
  (surrogate pairs, e.g. U+1F600) accepted; N+1 rejected; one ZWJ emoji family cluster counted as
  its constituent code points, not one grapheme; a mixed BMP+astral string straddling the limit.
- **Per-adapter caller-signal propagation** (both fixture and HTTP gateways, every read method):
  a pre-aborted signal rejects immediately with the canonical abort error and issues no fetch;
  an abort mid-flight rejects with the normalized abort error, never a success; the exact caller
  signal object reaches `fetch` (spy identity assertion), not a derived or missing one.
- **Exact timer boundary** (transport deadline and retry horizon, fake timers): at deadline−1 ms
  no timeout fires and a late success still resolves; at exactly the deadline the timeout error is
  raised and the underlying request aborted; a Retry-After equal to the remaining horizon is the
  last retry attempted, one past it is not.

## r6 fleet-02 validation — PASS (read checkpoint evidence only)

Snapshot `7c9407a7e7b80d163d8348f5f9b0f083a9721c331c0ab3f661cb3621be025118`, task
`fe01r1-20261011-203354-cec049d6`: API generation, lint, typecheck, 171 unit tests with coverage
and production build passed; all 48 browser checks passed in 22.4 s (desktop, narrow-390,
reduced-motion — contrast with the pixel-conversion oracle, settling, reduced-motion behavior
spec included). Runner cleanup exact: `cleanup_failed=0`, exit 0, only task-owned disposable
resources removed. Bounded review of `read.spec.ts:142-330` (189 LOC,
`c97ad650788d727d83d6392cf428d4024f78e339848e37e94c3fade6ff27f89c`): zero defects.

**Scope of this evidence:** the fixture-backed read checkpoint only — session gate, mailbox/inbox/
thread read flows, accessibility/keyboard/contrast and production-artifact isolation against
routed synthetic payloads. It is NOT acceptance of real Rails backend integration, mutation flows,
or the whole application.

## r7 fleet-02 validation — PASS (Stage-A micro-gap patches now Docker-verified)

Lint, typecheck, 209 unit tests (171 prior + the 38 new Unicode/signal/boundary cases), coverage,
build and all 48 browser tests passed; exact task Docker cleanup passed. This verifies the
post-r6 patches: code-point contract semantics (including cursors/request ids), per-adapter
caller-signal propagation, strict whole-seconds Retry-After parsing, and the deadline boundaries.
Evidence remains scoped to the fixture-backed read checkpoint.

**Sampled visual inspection — COMPLETED (2026-10-12):** the parent inspected all eight r7
visual-evidence PNGs (contrast-light, contrast-dark, drawer-390, entry, inbox-390,
production-api-failure, reader, shell) and found zero visible layout defects in these sampled
read-only states. Evidence:
`Elevateo Mail - FE Validation 20261012-r7/visual-evidence` (sibling validation checkout). This
closes the human-inspection gate FOR THE SAMPLED STATES ONLY — it is not whole-application visual
acceptance.

**Explicitly still open after r7:**

- **FE01 read-checkpoint visual coverage** — the r7 snapshot validation itself is COMPLETE
  (lint, typecheck, 209 unit tests, coverage, build, 48 browser tests, exact cleanup); what stays
  open is human visual inspection of the unsampled read-checkpoint states beyond the eight r7
  PNGs (error/recovery/retry_required screens, loading skeletons, empty variants, reader at both
  breakpoints, theme × viewport combinations). Whole-application acceptance is a separate, later
  gate (Rails integration, mutations, future UI) under AGENTS.md "validate the actual UI before
  publishing".
- **Automatic retry scheduler** — none exists; `retryAfterSeconds` is surfaced on errors only and
  retries are explicit user actions. The scheduling-horizon regression (fetch counts / delay
  boundary) stays UNRESOLVED until a scheduler is implemented.
- Real Rails backend integration and all mutation flows (out of checkpoint scope).
- No further ultrareviews are authorized (permanent instruction); this ledger closes against
  existing review output only.

## Final findings audit vs frozen r7 implementation — 2026-10-12 (read-only; docs only)

Audited every finding and coverage-gap bullet in `docs/evidence/fe01-initial-review/review.md`
(FE-R01–R17, FE-D01/D02, FE-G01, plus the follow-up recovery-bypass and compiler-declaration
findings and the conformance coverage gaps) against the frozen r7 working tree, source unread
since r7 freeze. **Conclusion: no remaining confirmed code defect.**

Spot-checks performed this audit (beyond the per-round verifications already recorded above):

- `ThreadPage.tsx` — FE-R10 (one traversal budget, reset-replace semantics, post-await ownership)
  and FE-R11 (filter-preserving back link) present; keyed resource owner with synchronous
  layout-effect abort (D3); terminal-empty vs empty-page-with-cursor distinguished (D4).
- `Drawer.tsx` — FE-R06/D6: Radix Dialog primitive with asChild trigger, sr-only title,
  documented md:hidden/matchMedia-close limitation.
- `src/test/setup.ts` — FE-R17: explicit `afterEach(cleanup)` (Vitest globals disabled).
- Conformance coverage gaps from review `:62` — all now covered: `conformance.test.ts` asserts
  `request_invalid` in the error-code table, Retry-After bounding, streamed oversized rejection,
  redirect rejection, and GET/credentials/cache/redirect init options; `transport.test.ts` covers
  deceptive content type, dishonest Content-Length (byte counting), and sync-throwing streams;
  `transport-boundaries.test.ts` pins the whole-header Retry-After window and exact deadline.
- `contract.ts` / `transport.ts` / `fixtureGateway.ts` — Stage-A patches as recorded, r7-verified.

**Scheduler question resolved from approved requirements (no scheduler invented):** automatic
polling/backoff appears in approved material only for the jobs/outbox send pipeline —
`docs/contracts-and-reliability.md:93` (backend outbox polling) and
`.planning/consultations/results/fe-01/synthesis.md:49` (jobs O55/F51: "Accept for later
checkpoint… exact poll/backoff fields remain unimplemented"). No approved requirement mandates
automatic retry scheduling in the read checkpoint; `contracts/v1/openapi.json` defines Retry-After
only as an optional hint (delta-seconds 1..300). Therefore the absent automatic retry scheduler is
an **out-of-scope future feature of the jobs checkpoint, not a required fix**; manual retry with
`retryAfterSeconds` surfaced on the error is the approved read-checkpoint design. The
scheduling-horizon regression remains correctly labeled UNRESOLVED-until-a-scheduler-exists in
`transport-boundaries.test.ts` — that label is the fix, not a defect.

**Remaining open items are evidence/scope gates, not code defects:**

1. FE01 read-checkpoint visual coverage (human inspection of unsampled states) — plan now
   concrete in `docs/visual-qa-matrix.md` (state × theme × viewport matrix with
   route-fulfillment trigger recipes; eight r7-sampled cells marked ✅). The r7 snapshot
   validation (209 unit / 48 browser PASS) is complete and distinct from this gate;
   whole-application acceptance is a separate later gate.
2. Real Rails backend integration and mutation flows (later checkpoint).
3. Jobs checkpoint will bring the poll/backoff scheduler and unlock the horizon regression.

**Proposed narrow next patch:** none required for correctness. The matrix tooling has since been
AUTHORED (not executed) as `apps/web/e2e/visual-states.spec.ts`: 27 scenarios × light/dark
(one mobile-only; frozen at SHA-256 `2b0fedfbfdfd5a9a5b4ab93ba2916ff4a1ac164419d68b9c896da76e4f606eb5`
after both independent re-reviews passed with zero defects)
covering every ⬜ cell (session loading/unauthenticated/error/recovering/retry_required; mailbox
loading/paginated-loading/error/empty; inbox loading/empty/empty-with-cursor/unavailable/error/
loadingMore; reader loading/truncated/unavailable/error/empty/empty-with-cursor/loadingMore),
each pinned by an on-screen assertion before its screenshot lands in `e2e/.results/visual/`.
Additive test-only code — frozen r7 product source untouched; it runs in the existing browser
stage when the parent next regenerates a snapshot (the current snapshot script must include the
new e2e file). Files touched by this audit: `docs/visual-qa-matrix.md` (new),
`apps/web/e2e/visual-states.spec.ts` (new, test-only) and this ledger. No commits, no Docker
(fleet-02 is Codex-exclusive), no review invocations.

## r8 fleet-02 validation — EXECUTED 2026-10-12 (unit PASS; browser 156/4/50; cleanup exact)

Executed by this session under exclusive FE reservation, frozen rev-5 workflow byte-verified on
fleet-02 (staging `/home/tanzeel/elevateo-mail-tests-20261012-ultra/r8-fe01/`). Task
`fe01r1-20261011-221953-633b2120`, archive `736bf531…e5e2d0` verified by the runner. All 15 guard
probes PASSED inside a disposable fleet-02 container (`--network none`, read-only staged bind,
tmpfs scratch, auto-removed). Unit stage PASS (lint, typecheck, 209 unit tests, coverage, build,
marker scan). Browser stage: **156 passed, 4 failed, 50 skipped** (skips exactly the proposed
mobile-only + reduced-motion-representative pattern); 108 of 112 visual PNGs captured. Runner
cleanup EXACT: `cleanup_failed=0`; task containers, both task images, the capped builder and its
cache volume removed and confirmed gone. CORRECTION: one FE-session-created volume DOES remain on
fleet-02 — `fe01r8-probes-stage`, created by this session's first (aborted) probe-staging attempt
and never used after staging moved to SSH; it is PRESERVED, not removed, pending coordinated
inspection of its ownership/content. The other remaining elevateo-named resources are
pre-existing other-project stacks. Evidence copied to
`Elevateo Mail - FE Validation 20261012-r8/results-fe01r8/` (runner/unit/browser logs +
e2e-results with per-failure screenshots and traces).

The 4 failures are one test-scoping defect in `visual-states.spec.ts` (narrow-390
mailboxes-error/empty, both themes): a page-global `getByText(...).first()` matched the
permanently rendered display:none desktop sidebar duplicate instead of the open drawer's visible
copy — corroborated by the parent's inspection of the failure screenshot (drawer open, text
rendered). REPAIRED by scoping sidebar-state text expectations to the open Mailboxes dialog below
md; new spec 275 LOC, SHA-256
`f84265524cf4ecfd7c8493a620073ac9576cb26be6f7277ea2a8af6818725de3` (supersedes the r8-frozen
`2b0fedfb…`). **A full visual rerun (r9) is required** for the 4 missing matrix cells; the 108
passing captures stand for inspection. Fleet-02 Docker was explicitly RELEASED to the backend
session (`elevateo-mail-backend-cf`, msg `90198a98`) immediately on request — the still-running
evidence SCP uses SSH only and reserves nothing. FE Docker is frozen until the backend's explicit
release; the r9 rerun (repaired spec `f8426552…`, must clear the 4 failures with no new skips)
stages locally meanwhile.

## r9/r10 fleet-02 validation — r10 PASS, full visual matrix captured (2026-10-12)

r9 (archive `ffc7497a…`, spec `f8426552…`): unit PASS; browser 158/2/50 — the 4 r8 sidebar
failures eliminated, but the scoping repair over-applied to `drawer-open-populated` (dialog scope
hid the behind-content proof); repaired (spec `4ed59502f3c27be95e95365fa77befabdfe82ae72af6c90333aa6b5989b5fd67`,
281 LOC, both bounded reviews PASS at 0 defects over 58 unique LOC). The r8 leftover volume
`fe01r8-probes-stage` was inspected (empty, zero mounts), removed, confirmed gone.

r10 (task `fe01r1-20261011-225114-b4aee6cb`, archive `5a17b32b…44c4b1`, sole delta the reviewed
spec): **runner exit 0 — unit 209/14 files PASS; browser 160 passed / 0 failed / 50 expected
skips; 112/112 visual PNGs captured** — the stated acceptance met by observation, no new skips.
Guard probes 15/15 with true docker exit 0 and full log preserved. Cleanup attested read-only
with per-command exits (ssh 0; ps/images/volumes/buildx each 0; full inventories preserved as
`r10-fe01/inv-*.txt`; zero task-named matches incl. `fe01r8-probes-stage`; default buildx only).
All evidence copied to `Elevateo Mail - FE Validation 20261012-r10/results-fe01r10/`.

Visual inspection so far (samples, not full acceptance): parent — both narrow drawer-open-populated
themes (no layout defects) plus two r8 reader-ready-hostile cells (hostile markup inert, no
defects); this session — narrow mailboxes-empty-dark (correct open drawer, empty copy, footer) and
narrow mailboxes-error-light (as-designed bare error + Try again replacing the sidebar content per
Shell.tsx:170-174; the raw synthetic message text is shown — recorded as an acceptance
observation, not a defect). **Remaining gates:** human inspection of the remaining ~106 captures
against `docs/visual-qa-matrix.md`; real Rails integration/mutations per
`docs/fe-rails-integration-packet.md`; jobs-checkpoint scheduler. Fleet-02 released after r10
evidence transfer; no FE runtime remains.

## r11 fleet-02 validation — PASS; skeleton/badge repairs verified (2026-10-12)

Task `fe01r1-20261011-232744-84542099`, archive `0eedf661…b0a350` (delta = the four reviewed
repair files: `--skeleton` token, `bg-skeleton` Skeleton, reader footer flex-wrap, hardened
contrast oracle + regressions). Runner exit 0; unit 209/14 PASS; browser **163/0/50**; 112/112
PNGs retrieved to `Elevateo Mail - FE Validation 20261012-r11/results-fe01r11/`. Preflight
daemon/absence checks, probes (15/15, true exit 0) and per-command cleanup attestation all
recorded in code-reviews.md. Visual verification: light-theme loading skeletons now visible on
canvas at both viewports; narrow truncated badges wrap; dark unchanged; blank reduced-motion
session-loading test-finished frame classified NOT a defect (screenshot:'on' captures
pre-navigation skips; intentional representative-set exclusion — limitation remains recorded).
This verifies the repaired cells plus samples; full 112-capture human acceptance stays open.
Fleet-02 explicitly released (msg `e78cd0cc`); no FE Docker remains.

## r11 full visual QA — ALL 112 CAPTURES INSPECTED, 112/112 PASS (2026-10-12)

Authorized manual agent visual verification, performed locally in this session on the r11 set
itself (r10 acceptance treated as historical). Every one of the 112 PNGs under
`Elevateo Mail - FE Validation 20261012-r11/results-fe01r11/e2e-results/visual/` was opened and
inspected individually at full resolution: desktop-light 26, desktop-dark 26, narrow-390-light
27, narrow-390-dark 27, reduced-motion 6 (light/dark × shell-ready, inbox-loading,
reader-ready-hostile). **Zero defects.** No fleet/Docker use and no frontend code change were
made for this task.

Key confirmations:

- Both r10 repairs verified across the full matrix: light skeletons (#e4e4e7) visible on the
  #f4f4f5 canvas AND on white surfaces (session/inbox/reader loading; drawer loading and
  paginated-loading); dark skeletons (#2f3035) visible in both dark contexts, unchanged; narrow
  truncated-badges wraps both badges fully inside the 390px viewport in both themes.
- Hostile plaintext inert (escaped `<script>`, no linkification) in all captured contexts,
  including both reduced-motion reader cells.
- Unread filter shows only unread rows (1 and 3) with the Unread pill active, both viewports and
  themes; empty/error/unavailable/empty-page-with-cursor copy and actions correct everywhere;
  loading-more shows prior content plus disabled "Loading…" control.

Acceptance observations (as-designed, not defects): mailboxes-error replaces all sidebar/drawer
content with the bare raw error text + Try again (Shell.tsx:170-174, no brand header); reader
header reads "3 messages in this conversation" while one message renders — synthetic fixture
artifact (`message_count: 3` in the spec payload).

Limitations (recorded separately from coverage): static images do not prove interaction
(hover/focus/keyboard/animation behavior is covered by the machine-asserted suites, not these
captures); reduced-motion has only the three representative rows per theme — there is no
reduced-motion session-loading capture by design; badge geometry assertions prove viewport
containment only; the contrast oracle closes the skeleton check statically within the opaque-hex
theme scope (no perceptual ΔE/WCAG claim).

With this, the FE01 read-checkpoint visual coverage gate in `docs/visual-qa-matrix.md` is
satisfied at the agent-inspection level for the r11 evidence set. Remaining open gates are
unchanged: real Rails integration/mutations (`docs/fe-rails-integration-packet.md`) and the
jobs-checkpoint scheduler.

## Validation status (updated 2026-10-12)

- The full Docker suite is COMPLETE as of r11 (superseding the earlier "pending 171-test suite"
  note — the suite has since grown to 209 unit tests): lint `--max-warnings 0`, strict
  typecheck, 209 unit tests with coverage, production build, and the Playwright browser matrix
  (desktop / narrow-390 / reduced-motion: 163/0/50) all PASS on fleet-02 against this working
  tree, with all 112 visual captures individually inspected at zero defects (agent visual
  verification, not whole-app acceptance).
- No commit or push was made; the working tree holds the repairs on `review/ultra/frontend-reader`.
