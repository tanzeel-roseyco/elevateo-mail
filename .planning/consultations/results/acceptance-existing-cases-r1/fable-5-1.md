# Verified consultation: claude-fable-5-1

Date: 2026-10-14 Australia/Sydney. Task `task_d1da752a40c7`, dispatch `ctx_6a0cdf9e4b2f`.

Requested and returned model: `claude-fable-5-1`; returned canonical model: `claude-fable-5-1`. Session: `7bee8ab3-bd3a-43ee-a322-dc4d6b7f558e`. Exit 0, subtype success, is_error false, one turn, no stderr; wall time 202.351 seconds within the 900-second bound.

Input SHA-256: `0031878035492c0dfc63f39d650fcae943df9a26d5eb0dcc2e9cdf1f9587d34d`. Common packet SHA-256: `05f3699cae0e6b54e5b75d3913b88ec0c5e2b6893a90610a7336b2cddbfb040e`. Base HEADs, exact source/document hashes, common historical omissions and focus hashes are in [source-manifest.json](source-manifest.json); verified execution and usage are in [metadata.json](metadata.json). Raw process/input files remain ignored under ops/local/acceptance-existing-cases-r1.

The following is the successful opinion verbatim, retained as advice rather than accepted fact. It received no other opinion, had tools disabled and ran no tests. The Astra disposition in [synthesis.md](synthesis.md) governs implementation, including rejection of unsupported claims or scope expansion below.

---

# ACCEPTANCE-EXISTING-CASES-R1 — Fable 5.1 independent opinion (design only; no tests run)

Inputs: pass A (166 lines: unavailable.e2e.ts, cases.ts, draft.e2e.ts, support.ts, seed-contract.json) and pass B (181 lines: acceptance_seed.rb). Everything about frontend session code, gateway, routes, controllers, Playwright config and the runtime seed file is **uninspected**; findings about them are conditional.

## Overall verdict

**Change, then support a reduced slice.** Implement 3, 5 and 6 as written. Implement 1 and 2 only with the narrowed assertions below, because browser `page.route` gates prove UI/transport behavior, not Auth/Rails fault behavior; record that limit in each case's evidence text. Defer 4 (needs an unverified management endpoint and would poison a shared actor's authorization version across engines). Preserve all 26 IDs by moving entries out of the `missing` map (unavailable.e2e.ts L4–21) only for cases that gain a real `scenario(...)`; never leave an ID in both maps (duplicate record per ID).

## Recommendations

**R1 — SCN-AUTH-001-F2 (duplicate submit + transport abort): implement, narrowed.** Matrix stimulus is "Auth timeout/503 **or** duplicate submit"; exercise only the duplicate-submit + client-abort sub-partition. Mechanism: install `page.route` on `/v1/auth/login` that parks the route (resolve-later promise, hard 5 s bound), count POSTs with a `page.on('request')` listener registered **before** the first click, then click Sign in a second time after the first request is observed (deterministic ordering, not `dblclick`). Assertions: (a) exactly one POST while held and submit control disabled/busy; (b) `route.abort('timedout')`, then for a bounded window (≈2 s) count stays 1 — no automatic retry; (c) error UI visible, `Account and sign-out` count 0, no mailbox region; (d) `page.unroute`, user-click retry → real POST 200 via `responseAt` (support.ts L14–19) and authenticated UI. Evidence text must say: "two POSTs observed: one aborted client-side before forwarding (never reached Auth), one real Auth exchange; Auth 503/outage not exercised." Never read `route.request().postData()` (contains the password); never fulfill with canned JSON. Challenge risk: because the abort happens before forwarding, the server never consumes the challenge; if the UI discards it locally the retry should refetch `GET /v1/auth/login-challenge` — assert login 200 either way and record whether a refetch occurred. If the second click produces a second POST, fail and file a frontend finding; do not loosen to "≤2". Hold must sit in `finally` (release/abort) so a mid-case failure does not hang context teardown. **Evidence limit:** proves no false authenticated state after a *client-side* transport failure; proves nothing about Auth 503 handling.

**R2 — SCN-AUTH-003-F2 (delayed pre-logout response): implement, narrowed.** Route a protected GET (e.g., `/v1/mailboxes` on mailbox navigation): `route.fetch()` obtains the authentic response with the live cookie jar before logout; park it (≤3 s, below the gateway's documented ten-second client abort, otherwise the client cancels and the test proves nothing); perform UI logout and observe `POST /v1/auth/logout`; then `route.fulfill({ response })` unchanged. Assertions: Sign in heading visible after release and after a bounded settle; `Account and sign-out` count 0; Conversations region count 0. If the page cancels the parked request on logout (`requestfailed`), record "client cancelled pre-logout request" as a distinct outcome — cancellation is defensive but **does not** prove a delivered stale body would be ignored; the case still counts only if the resurrection assertions pass. Revocation proof for the *original* session: capture `context.cookies()` into a local variable **before** logout, re-add after logout, call `page.request.get('/v1/session')` and expect 401; never annotate/log cookie values or headers. A fresh anonymous context proves nothing and must not be used as evidence. **Evidence limit:** uncertain whether `route.fetch()` attaches the exact `X-Session-Context`/`X-CSRF-Token` headers — verify at authoring; if it 401s pre-logout, the gate is invalid and the case stays NOT_RUN.

**R3 — SCN-READ-001-F1 (empty mailbox set): implement.** support.ts L26–27 already expects 200 for `revoked` and acceptance_seed.rb L57 inserts its organization membership while L62–69 leaves no mailbox membership; L149–151 gives it an authorization version. Assertions: `signIn(page,'revoked')`; `GET /v1/session` 200 and `GET /v1/mailboxes` 200 with validated empty list (observe status/content-type only); accessible empty state; `GET /v1/mailboxes` request count ≤1 over a bounded window (matrix "no repeated fetching"); then `page.goto('/#/mailboxes/<primary>')` → non-enumerating response and no `a[data-thread]`. Do **not** substitute `no_membership` (its login is 404 at L27). Unavailable L10 reason is inaccurate against the seed — existing finding, fix by removal. **Evidence limit:** proves the zero-membership org member partition, not a live revocation; the actor's seeded state is static.

**R4 — SCN-READ-001-F2: defer.** No member-management endpoint is in the packet (budget names in the matrix imply one; semantics uninspected). Real revocation of `reader` advances `app_auth.authorization_generations` (L155–161) and changes the version header the backend expects; a bounded `finally` restore can fail and leave `reader` revoked for later engines/retries; rewinding generations or re-seeding an in-use database violates the fixture (L15 requires a fresh Auth fixture). Keep L11 as is; keep global malformed/over-budget unit/mock checks separate. A reserved restorable actor needs a new fixture contract and its own consultation.

**R5 — SCN-DRAFT-008-F1 (same-mailbox author privacy): implement with full row, not a single 404.** Both `composer` (L8) and `approver` (L9) hold compose in `primary`; the seeded `draft_primary` (acceptance_seed.rb L80) belongs to composer but must not be mutated — create a unique case draft as composer reusing the draft.e2e.ts L8–28 pattern (subject includes the case ID). Open a **second browser context** for approver (the `scenario` helper supplies one page; use `page.context().browser()!.newContext()` and close it in `finally`). Assertions as approver: (a) `GET /v1/drafts` — walk cursors to exhaustion (max limit 50, cursor ≤2048 chars) and assert the draft ID and marker-subject are absent; page 1 alone is vacuous if a leak pushed >50 rows; (b) `GET /v1/drafts/{id}` → non-enumerating status, body contains no marker (assert on `text().includes(marker) === false`, do not retain body); (c) UI route `#/mailboxes/primary/drafts/{id}` → no Subject/Message fields populated with case values; (d) optional probe `PUT /v1/drafts/{id}` with version 1 → non-2xx; (e) re-read as composer: detail 200, `Saved version 1`, exact fields unchanged (proves probes caused no mutation). Cross-org `draft_other` probes do not cover this row. **Evidence limit:** list privacy is proven for one page-walk at test time; ordering (`updated_at desc, id desc`) and 256-code-point summary flag belong to DRAFT-008-P, not here.

**R6 — SCN-DRAFT-003-F2 reason text: adapt, stay NOT_RUN.** Replace unavailable.e2e.ts L17 "No expired operation-detail evidence control supplied" with "No controlled recorded-conflict or unrelated-operation lookup barrier supplied"; expiry belongs to the 604800 s TTL partition, which is a different stimulus. One-line change.

**R7 — Allowed paths (smallest).** `tests/acceptance/playwright/unavailable.e2e.ts` (remove L5, L7, L10, L18; reword L17); new `auth-faults.e2e.ts`, `read-empty.e2e.ts`, `draft-privacy.e2e.ts` (each ≤200 lines, no shared mutable state); optionally `support.ts` for a `countRequests(page, path, method)` helper and a second-context sign-in. No edits to `cases.ts`, `boundaries.ts`, seed, matrix, schema, runner. Before writing: verify selectors (`Sign in`, `Account and sign-out`, `Conversations`, `New draft`, `Save draft`) and the Playwright config's trace/HAR/video settings — a trace with request bodies would capture the login password; this consultation cannot confirm the config.

**R8 — Record every gate in evidence metadata.** For R1/R2 the `evidence` array must state `transport_gate: page.route hold/abort`, never "Auth outage". A later reader of `cases.jsonl` otherwise reads a transport test as a server-fault test.

## Confirmed source-backed findings

- **F1 (medium, observability):** cases.ts L12 `catch { failed = true; }` discards every error, including Playwright timeouts and seed/config failures (support.ts L9–11 rethrows a generic error). Infrastructure failures become indistinguishable from assertion failures; the annotation has no status/error-class field. Redaction intent is correct; recommend adding only `error.name`/constructor name, never message or stack. Not in this slice's allowed paths — report to root.
- **F2 (low, design):** cases.ts L11 vacuous guard checks only that `assertions` strings were pushed; a body with no `expect` passes. Authoring rule for this slice: every pushed assertion string corresponds to at least one `expect` executed before it.
- **F3 (low, prior-blocker inaccuracy, existing):** unavailable.e2e.ts L10 contradicts acceptance_seed.rb L57/L62–69; L18 is partly true (no seeded other-author draft) but a case-created draft removes the gap.
- **F4 (low, operations):** acceptance_seed.rb L17 creates Auth users outside the L18 transaction; a failure after L17 leaves users that trip L15 on rerun — the fixture must be discarded, not retried. L171 hardcodes `actors=9`.
- **F5 (low):** draft.e2e.ts L19 regex `[0-9a-f-]{36}` accepts non-UUID 36-char strings; harmless for routing, imprecise.
- **F6 (gap, existing):** DRAFT-008-P shares the DRAFT-001-P body (L7); "consumed state" in the matrix is never asserted. Not in slice.

## Conditional implementation risks (unverified dependencies)

Gateway cancellation on logout; whether the UI disables submit during in-flight login; `route.fetch()` header fidelity; Playwright config trace/HAR capture; whether `/v1/drafts` paginates with cursors as the matrix budgets imply; non-enumerating status being 404 vs 403.

## Minimal regression/runtime acceptance checklist (not run)

1. Each new file passes typecheck; no `postData()`, `headers()['cookie']`, `storageState`, or cookie values appear in annotations/artifacts; synthetic-secret canary scan clean.
2. Every removed `missing` entry has exactly one `scenario` with the same ID; 26 IDs present once each in the report.
3. R1: request counter = 1 while held; = 1 after abort for 2 s; = 2 total; one 200.
4. R2: logout 200 observed before release; no resurrection; original-session cookie replay → 401.
5. R3: `/v1/mailboxes` 200 empty; request count ≤1; direct primary mailbox URL non-enumerating.
6. R5: approver list walk excludes ID; detail non-2xx without marker; composer re-read version 1 unchanged; second context closed in `finally`.
7. Run on Chromium, then Firefox/WebKit: no cross-engine state dependency (only composer's new drafts accumulate; nothing is revoked or restored).
8. Failure injection: force the held route to time out → test fails visibly within its timeout, context closes, no hang.

## Strongest dissent and simpler alternative

**Dissent:** route-based gates in R1/R2 close two P0 "F2" IDs with evidence about the browser's handling of client-side faults, while the matrix's risk is server-side (Auth outage, late authentic response from Rails after revocation). A green record may be read as fault-tolerance acceptance it is not; the stale-response case is also brittle (client cancellation can make it trivially pass unless the sub-outcome is recorded). **Simpler alternative:** implement only R3, R5 and R6 now (seed/API-only, no gates), leave AUTH-001-F2 and AUTH-003-F2 NOT_RUN with corrected reasons until backend owners supply the D05-style barriers. Tradeoff: two fewer closed IDs, but zero risk of mislabeled fault coverage and ~60 fewer lines of timing-sensitive code.

Usage/cost: not measured by this process; coordinator records runtime metadata.
