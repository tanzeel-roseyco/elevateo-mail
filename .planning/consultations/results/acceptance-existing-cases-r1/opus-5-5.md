# Verified consultation: claude-opus-5-5

Date: 2026-10-14 Australia/Sydney. Task `task_d1da752a40c7`, dispatch `ctx_6a0cdf9e4b2f`.

Requested and returned model: `claude-opus-5-5`; returned canonical model: `claude-opus-5-5`. Session: `16cd404a-277a-4861-a75a-befc38796997`. Exit 0, subtype success, is_error false, one turn, no stderr; wall time 75.303 seconds within the 900-second bound.

Input SHA-256: `614ffc8955465c202c98e74c1454694970f85f5da82f7f2edc978372186c8402`. Common packet SHA-256: `05f3699cae0e6b54e5b75d3913b88ec0c5e2b6893a90610a7336b2cddbfb040e`. Base HEADs, exact source/document hashes, common historical omissions and focus hashes are in [source-manifest.json](source-manifest.json); verified execution and usage are in [metadata.json](metadata.json). Raw process/input files remain ignored under ops/local/acceptance-existing-cases-r1.

The following is the successful opinion verbatim, retained as advice rather than accepted fact. It received no other opinion, had tools disabled and ran no tests. The Astra disposition in [synthesis.md](synthesis.md) governs implementation, including rejection of unsupported claims or scope expansion below.

---

# Opinion: ACCEPTANCE-EXISTING-CASES-R1 (claude-opus-5-5, design only)

**Inspection limit.** I reviewed only pass A (166 lines: `unavailable.e2e.ts`, `cases.ts`, `draft.e2e.ts`, `support.ts`, `seed-contract.json`) and pass B (`acceptance_seed.rb`, 181 lines). I did not inspect `boundaries.js`, `credential-origin.js`, `config.js`, the frontend gateway, Rails controllers or routes, or the seed runtime/support files. Every endpoint, selector or behaviour in those files is unverified. Nothing was executed.

## Overall verdict

**Change, then support a smaller slice.** Proceed with:
- **Implement:** R4 (READ-001-F1).
- **Adapt:** R5 (DRAFT-008-F1), R2 (AUTH-001-F2), R3 (AUTH-003-F2), with the specific changes below.
- **Defer:** R6 (READ-001-F2).
- **Metadata-only:** R7 (DRAFT-003-F2 reason text).

**Prerequisite blocker.** `responseAt` cannot observe aborted traffic. Fault cases need a small shared helper fix (R1) before they can be written.

Two existing "unavailable" reasons misdescribe what the seed already supplies. Those are prior inaccuracies, recorded here as confirmed findings, not new defects.

## Confirmed source-backed findings

**F-A (Medium, existing).** `unavailable.e2e.ts:10` says there is no active membership with zero visible mailboxes. The seed contradicts this:
- `acceptance_seed.rb:57` inserts an organization membership for `revoked`.
- Lines 62–69 add and delete its mailbox membership twice, so none remains.
- `verify_actors` (lines 134–146) confirms org membership equals `[org]` and capabilities are empty.

This partition exists today.

**F-B (Medium, existing).** `unavailable.e2e.ts:18` says the seed lacks another author's private draft in the same mailbox. This is partly inaccurate:
- `draft_primary` is owned by `composer` (`acceptance_seed.rb:80, 93`).
- `approver` (`seed-contract.json:9`) holds read, compose and approve_send on the same primary mailbox.

What is genuinely missing is only a list-leak sample that is isolated from runs that create drafts.

**F-C (Medium).** `support.ts:14–18` (`responseAt`) has two problems:
- It hardcodes `http://app.test` instead of using the configured base URL.
- It only resolves on a *response*. An aborted request emits `requestfailed`, never a response, so any abort-path case would hang until the test timeout. The resulting failure is indistinguishable from a broken barrier.

**F-D (Low–Medium).** `cases.ts:11–14` handles failure in a way that loses information:
- `catch {}` discards the error entirely, including its class.
- The annotation still serialises any assertions pushed before the failure. A failed record can therefore list "completed" assertions.

Fix: record a fixed failure-stage code (for example `setup|barrier|assertion|cleanup`) without the message text, and clear or flag assertions when the case fails. Redaction is preserved either way.

**F-E (Low, existing).** `unavailable()` (`cases.ts:21`) uses `test.skip`. The report mapping must translate these into `not_run`, never `skipped` or `pass`. I cannot verify this mapping because `report.ts` was not inspected.

**F-F (Low).** `draft.e2e.ts:7` reuses one body for both DRAFT-001-P and DRAFT-008-P. The 008 row requires:
- correct consumed state,
- 256-code-point truncation,
- `updated_at desc, id desc` ordering.

None of these is asserted, so the 008-P record overstates its coverage. Do not change the path ID. Narrow the recorded assertion text, or add those assertions later.

**F-G (Note).** The seed refuses to run against a non-fresh Auth state (`acceptance_seed.rb:15`). Any case that mutates shared actors therefore cannot be recovered by re-seeding inside a run. This is the right design, and it is what forces the R6 deferral.

## Recommendations

**R1: Fault-observation helper (prerequisite).**
- **Action:** adapt. Add a sibling helper beside `responseAt`. It races `waitForResponse` against `waitForEvent('requestfailed')` for the same method and path, with an explicit bounded timeout, and returns a tagged outcome `{kind:'response'|'aborted'|'timeout'}`.
- **Origin:** derive it from `loadAcceptanceConfig()`, not the hardcoded string.
- **Barrier rule:** every route barrier is unrouted in `finally`, and an unreleased hold must fail visibly.
- **Allowed paths:** `tests/acceptance/playwright/support.ts` only. If `config.ts` lacks a base-URL field, the change returns to T0.
- **Evidence limit:** the config shape is uninspected.

**R2: SCN-AUTH-001-F2.**
- **Action:** adapt. Use `page.route('**/v1/auth/login')` to hold the first genuine POST, then exercise duplicate submit.
- **Duplicate-submit assertion:** the Sign in button becomes disabled or busy, and the route sees exactly **one** POST while the hold is active. A second POST means uncontrolled retry and fails the case.
- **Abort:** call `route.abort('connectionreset')` before forwarding, and assert R1 returns `aborted`. The UI must show a bounded transport error, distinct from the generic credential rejection at `support.ts:30`. There must be no Account control.
- **Retry:** unroute, resubmit and expect one real POST returning 200 plus the Account control.
- **What browser counts can prove:** browser-side counts establish *requests leaving the browser*, not "exactly one Auth exchange". The aborted request never reached Rails, so the claim must be phrased as "zero forwarded, then one forwarded".
- **Challenge risk:**
  - Record whether the app issues a fresh `GET /v1/auth/login-challenge` before the retry.
  - If it reuses the old challenge, a 200 proves the challenge was not consumed by an unforwarded request. That is the expected outcome.
  - If the retry fails with challenge expiry, mark the case **failed with a product finding**. Do not auto-refresh it inside the test.
- **503 path:** stays NOT_RUN. An abort is not an Auth outage, and fabricating a 503 is prohibited.
- **Timing:** keep the hold well under the client's 10-second abort, or the client aborts first and confounds the result.
- **Allowed paths:** a new `auth-faults.e2e.ts`, plus removing this ID from `unavailable.e2e.ts`. The `unavailable.e2e.ts` entry must be split rather than deleted, so the outage partition stays unavailable.
- **Evidence limit:** unverified that the UI disables the button, and unverified what error copy it shows.

**R3: SCN-AUTH-003-F2.**
- **Action:** adapt. Holding a request *before* forwarding does not produce a pre-logout response, because it would reach Rails after logout.
- **Capturing a genuine pre-logout response:** inside the route handler, use `route.fetch()` to obtain the genuine response before logout. Logout through the UI, then `route.fulfill({response})` the same object unchanged.
- **Caveat:** `route.fetch` replays the request through Playwright's request stack. Record it as "authentic upstream bytes, re-delivered", not as the browser's original socket.
- **Response-side assertions:**
  - After fulfil, the sign-in heading stays visible.
  - Account control count is 0.
  - The protected marker (thread `pre` marker or mailbox region) never appears. Check this with a bounded `expect(...).toHaveCount(0)` poll after fulfil, so the negative is not vacuous.
- **Positive control:** before logout, the same view rendered the marker.
- **Revocation in the same session:** in the *same page*, issue a protected request (for example `/v1/session`) and require 401 or the documented denial.
- **If the app cancels the request:** if logout aborts the in-flight request, the fulfil throws. Record `cancelled_by_client`. That proves only client-side cancellation, not server revocation, so the session-denial check is still required.
- **Allowed paths:** the same `auth-faults.e2e.ts`.
- **Evidence limit:** the logout selector and the session endpoint's denial code are uninspected. Repeat-logout behaviour needs the endpoint contract.

**R4: SCN-READ-001-F1.**
- **Action:** implement. Use `signIn(page,'revoked')`, which follows the 200 branch at `support.ts:27,35`.
- **Assertions:**
  - `GET /v1/mailboxes` returns 200 JSON with an empty collection. Validate this through a shape guard if `boundaries.js` provides one; otherwise this is an open item.
  - The accessible empty state is visible, and no mailbox link exists.
  - Fetching does not repeat: count mailbox GETs over a bounded settle window and require ≤ the documented bootstrap count.
  - `/#/mailboxes/{primary}` renders denial or empty, never thread rows.
- **Read-only:** no state is mutated, so the case is safe across engines and retries.
- **Labelling:** label it "org member, zero mailboxes (revoked-mailbox variant)". Do not substitute `no_membership`, which takes the 404 path.
- **Allowed paths:** new `read.e2e.ts` case, and remove line 10 from `unavailable.e2e.ts`.

**R5: SCN-DRAFT-008-F1.**
- **Action:** adapt, using two samples.
  - **(a) Guessed identity, read-only:** `approver` requests seeded `draft_primary` (composer-owned) by URL. Require a non-enumerating denial matching the denial for a random nonexistent UUID, compared on status and body shape. No composer marker may be visible.
  - **(b) List leak:** composer creates a uniquely marked draft (per run and attempt). Approver loads the drafts list and must not see it.
- **Guards against vacuous negatives in (b):**
  - The list response is 200 JSON.
  - Approver also creates one of its own drafts and *does* see it (positive control).
  - Absence is checked by draft ID in both the list response and the DOM.
  - Paginate to exhaustion, or assert `next_cursor` is null. Accumulated drafts from retries could otherwise push the target past the 50-item limit.
- **Re-read:** composer re-reads its draft unchanged afterwards. Use separate browser contexts per actor.
- **Not a single 404:** the row requires list, detail and UI checks, not one denial.
- **Cleanup:** none possible without a delete API, so accept accumulation. Unique markers keep runs isolated.
- **Allowed paths:** new `draft-privacy.e2e.ts`, and update line 18.
- **Evidence limit:** list pagination parameters and the denial status are unverified.

**R6: SCN-READ-001-F2.**
- **Action:** defer. No management API or restore path was inspected, the seed cannot be rerun (F-G), and poisoning `reader` would break later engines.
- **Global tests:** keep the malformed and over-budget boundary tests as-is.
- **Follow-up:** a reserved, restorable actor is a separate seed-contract consultation.

**R7: SCN-DRAFT-003-F2 reason text.**
- **Action:** implement as metadata only. Change line 17 to "No controlled recorded-conflict or unrelated-operation lookup response with independent DB evidence supplied". The case remains NOT_RUN.

**R8: Narrow the 008-P recorded assertion text (F-F).**
- **Action:** adapt. Edit the record text only; no ID changes.

**R9: Failure-stage code (F-D).**
- **Action:** adapt, optional. This touches shared `cases.ts`, which is T0-owned, so route it to root.

## Minimal regression and runtime checklist (not run)

1. All 26 path IDs are still present. Each moved ID appears exactly once overall. The expected evidence sets are unchanged.
2. A deliberately unreleased route hold fails within the bounded timeout with a stage code, not a hang.
3. R2:
   - one POST during the hold;
   - abort observed as `aborted`;
   - retry produces a single 200;
   - challenge GET counts recorded;
   - no token, body or URL in the annotations.
4. R3: positive control renders the marker; after fulfil the marker count stays 0; same-session protected call is denied.
5. R4: empty list, no repeat fetches, no thread rows.
6. R5:
   - the approver positive control passes;
   - the composer draft is absent across all pages;
   - the seeded draft denial matches the nonexistent-UUID denial;
   - the composer re-read is unchanged.
7. Re-run the whole slice twice and on a second engine against the same seed. Results must be identical, with no new failures from accumulation.
8. No trace or screenshot taken on login or logout routes. `finally` unroutes on every path.

## Strongest dissent and simpler alternative

**Dissent.** The `route.fetch` + `fulfill` technique in R3 sits close to "canned JSON". A reviewer could reasonably say re-delivery through Playwright is not an authentic browser response.

R2's abort path is a similar case. It tests the client's transport-error handling, not Auth resilience. Both may produce green results that readers over-interpret.

**Simpler alternative.**
- Ship only R4, R5, R7 and R8, which need no barriers.
- Fix the unavailable reasons (F-A, F-B).
- Defer both AUTH F2 cases until a root-owned proxy-level hold exists, one that delays real upstream bytes on the wire.

**Tradeoff.** This gives cleaner evidence semantics but leaves two P0 rows NOT_RUN for longer. My preference is to land R1 + R4 + R5 first and gate R2 and R3 behind an explicit evidence-label review.
