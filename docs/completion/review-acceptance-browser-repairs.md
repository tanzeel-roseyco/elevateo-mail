# Bounded browser acceptance repair review

Date: 2026-10-14. Task `task_0876554d6902`; dispatch `ctx_0b0028ef4f7a`.
Reviewer: Codex, GPT-6 family as identified by session instructions; exact model build and configured reasoning effort are not exposed to this worker. No claim of a named Astra/Fable/Opus identity.

Verdict: Puppeteer hidden-node repair and both lanes' credential-call coupling are statically supported within the limits below. One MED Selenium plaintext-oracle defect remains. Runtime: **NOT_RUN**; no tests, Docker, servers, SSH, installs, commits or subagents were run. Style is delegated to linters. This is a review of test code, not application acceptance.

## Inventory and coverage

All raw SHA-256 hashes and physical line counts matched `acceptance-browser-repairs.md` before source inspection. Full assigned files were inspected in three passes, each below 200 physical LOC; total unique implementation/test coverage is **365 LOC**.

| Pass | File | Exact range | LOC | Verified SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | tests/acceptance/puppeteer/ui.ts | 1-67 | 67 | db22a74339ec98fef94801c83c34917617a316b5c3f200d00eafc94bc08351c9 |
| 1 | tests/acceptance/puppeteer/journeys.ts | 1-80 | 80 | 23a9682ea5c2494954a9937eadf73f5a9e43cb82bb5e38ca61bb709c61c324f6 |
| 2 | tests/acceptance/puppeteer/ui.browser-probe.ts | 1-87 | 87 | d9af08eab9b083ecb40c1e4b9605ac3b4423f39e0de7aabf5d36c3d593d87778 |
| 3 | tests/acceptance/selenium/ui.ts | 1-44 | 44 | 7ef4bb427b13cb9bf456bce77e95383e54b8c7982f1e0ce2b55a723d28a17633 |
| 3 | tests/acceptance/selenium/journeys.ts | 1-87 | 87 | e95dbbef467fbcf7ca683c0b991ba8f2d40365331a2b5879704a51793f56e285 |

Pass totals: 147, 87, 131. Post-review metadata checks reconfirmed all five hashes unchanged. Documentation and metadata are excluded from the denominator. Root AGENTS.md, .planning/STANDARDS.md and the repair handoff supplied requirements; repository overview/state documentation supplied context only. No additional implementation was inspected.

## Numbered defects

1. **MED — Selenium plaintext acceptance allows parsed markup.** `selenium/journeys.ts:34-37` selects a `pre` by descendant string value and calls `UI.text`; `selenium/ui.ts:37-38` only requires displayed text to include the marker. A displayed `<pre><b>MARKER</b></pre>` therefore satisfies this assertion before and after reload despite being parsed element content, unlike the child-free plaintext invariant enforced by Puppeteer. This can label an unsafe message-rendering regression as a passing plaintext journey. Minimal repair: require the same matching displayed `pre` to have no element children, retaining literal marker comparison; add a focused browser fixture that accepts literal `<b>...</b>` text and rejects a nested `b` with the marker. Keep fixtures separate from application scenario counts. This is an existing weakness in assigned surrounding code, not a claim that the credential repair introduced it.

Confirmed defect count: **1** (MED 1, HIGH 0). Defect density: **1 / 365 * 1000 = 2.74 defects/KLOC**. No runtime reproduction is claimed.

## Checklist and evidence

- **Hidden Puppeteer plaintext: statically addressed for the stated render-presence contract.** `puppeteer/ui.ts:45-60` couples marker, zero child elements, client rects, ancestor styles/hidden attributes, and positive dimensions to the same `pre`. Hidden matching nodes cannot borrow visibility from a nonmatching sibling. Empty query results and null textContent reject. Display-none, hidden visibility, zero opacity, hidden attribute and content-visibility-hidden ancestors reject. This does not prove viewport visibility, occlusion, clipping, contrast or exact full-message equality.
- **Actual credential operations: coupling verified.** Puppeteer login lines 13-14 and Selenium login lines 14-15 both explicitly pass `true` for the real actor email and password. Puppeteer UI lines 35-37 and Selenium UI lines 30-32 route the actual typing callback through `atCredentialOrigin` immediately before sensitive input; ordinary draft fields retain unguarded noncredential behavior. Each field gets its own URL read. Clearing/clicking precedes the guard but does not type the credential value.
- **Exact origin policy: dependency not inspected here.** The imported `playwright/credential-origin.ts` is outside this assignment. Coordinator confirmed that separate reviewer dispatch `ctx_08c6db7d62b6` owns the helper and real fill guards and found exact-origin policy statically sound. This is coordinator-provided coupling context, not this worker's independent helper inspection. No coverage expansion was performed.
- **Regression source: present, not executed.** Browser probe lines 26-58 define eight plaintext fixture checks, including visible/literal positives and hidden/wrong/nested negatives. Each hidden fixture includes a visible wrong sibling. Lines 59-81 define one intercepted redirect/password-input rejection check with fixed error matching and zero final input length. These nine nested fixture checks and the enclosing Node test add zero application acceptance scenarios. The actual email/password guard unit tests described in the handoff are outside coverage.
- **Errors and cleanup:** UI actions are not retried; read readiness is bounded by caller timeout, Selenium stale retries are capped at two, and Puppeteer handles are disposed. Browser launch and protocol timeouts are explicit; cleanup is attempted after launch. Sanitized probe errors deliberately sacrifice diagnostic detail. Negative plaintext fixtures use broad rejection matching, so root execution of positive controls and inspection of failure diagnostics remain necessary.
- **State and persistence:** Both draft journeys assert identity plus exact fields after full reload; they do not claim independent database evidence. Logout paths check protected control absence. No SQL/backend authorization or network isolation evidence exists in this scope.
- **Boundary inputs:** Labels are fixed call-site strings here; seed IDs/marker and password/config validation belong to unchecked boundaries. Null seed, empty marker, malformed identifiers and invalid timeout safety cannot be certified without those contracts. An empty marker would weaken includes-based predicates, so upstream nonempty marker validation is a review dependency, not an assumed pass.
- **Maintainability/performance:** Narrow UI helpers retain one concern; shared credential policy avoids three divergent policies. Plaintext polling scans matching nodes and ancestor chains; no database queries or new dependencies appear. No measured max-size or browser performance claim is made. Existing anchors explain read/action retry constraints and cross-file behavior.
- **Documentation/standards:** Handoff correctly separates fixtures, application cases and NOT_RUN status. Plain-text rendering requirement exposes defect 1. Strict types are visible in assigned signatures; project compilation/lint and wider config validation remain root-owned gates.

## Design limits and unchecked dependencies

Analytical tradeoff only: per-operation origin reads improve redirect rejection but cannot prevent navigation during an in-flight browser command; isolated private networking remains a required external control. Render-presence checks avoid expensive screenshot/image analysis but cannot establish human-visible message appearance. No Obsidian simulation or architecture consultation occurred; no broad design recommendation or whole-system acceptance is claimed.

Unchecked: shared schema/seed validation, origin helper and its unit tests, lane boundary/file validation, driver/browser versions and behavior, package scripts/reporting, app frontend/backend/auth/storage, Docker/network policy, root fleet receipts, screenshot helper, real Selenium/Playwright redirected-browser behavior. Exact helper policy and runtime evidence must be reconciled by root. Root also owns aggregate code-reviews.md/state documentation; this worker changed only this report.
