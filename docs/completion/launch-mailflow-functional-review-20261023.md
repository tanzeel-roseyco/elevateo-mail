# Launch mailflow bounded functional review — 2026-10-23

Read-only adversarial source review; implementation unchanged. Task `task_2c7ceb32b32d`, dispatch `ctx_881341685f62`. Findings sent to root and mailflow owner `ctx_4b7700cd00c9` through Orca. This report is not runtime acceptance or whole-application readiness evidence.

## Provenance and bounds

Actual locally observed executable: `codex-cli 0.163.0` (`codex --version`). This dispatch's actual terminal preview reports `GPT-6.1-Sol low fast`; Orca worker launch metadata has requested/effective model and effort null. Thus the displayed profile is observable, but independently verified backend model identity and billing tier are unavailable. No substitute reviewer or teammate was launched.

| Source packet | Requested range | Existing reviewed range | Physical lines | SHA256 of complete existing file |
| --- | --- | --- | ---: | --- |
| `apps/server/test/support/launch_mailflows/app_chain_test.rb` | 1–190 | 1–175 (EOF) | 175 | `27bd5cc802207ae8010d94b77306070cf9196648534da69e44ec60e109fdcf87` |
| `apps/server/test/support/launch_mailflows/http_chain.rb` | 1–100 | 1–64 (EOF) | 64 | `429afedbff9f3aef1fa0cabe4e2421518a06a6df45fe57b25a336e9cf7423f82` |

239 unique physical source lines total, including blanks/comments and all source context; each packet below 200. File hashes were rechecked before report creation. No other source code was opened. User-provided project instructions, on-disk AGENTS.md opening context, `.planning/STANDARDS.md`, and opening current-state sections of README/state/documentation informed the review. Full rubric applied to these packets; formatting delegated, not reviewed. No application tests, builds, Docker mutations, or live sends performed.

## Findings

1. **MEDIUM — Cleanup failures bypass remaining cleanup.** `app_chain_test.rb:58–64`. Both SQL deletes and private-directory removal run before an unprotected `super`. If the first delete raises (connection loss, aborted transaction, constraint failure), neither later delete, private credential-directory deletion, nor superclass teardown is attempted. Likewise filesystem removal failure bypasses superclass teardown. This undermines failure-path isolation and can leave the copied credential bundle behind. Use nested `ensure` cleanup so independent cleanup always runs, retaining/reporting original and cleanup failures. Add failure-injection coverage for SQL and filesystem cleanup errors. Inherited cleanup semantics are unreviewed; this finding concerns the visible failure to invoke it.

2. **MEDIUM — Generic client failure can falsely establish CSRF rejection.** `http_chain.rb:41–46`. The negative accepts every 400–499 code and checks only unchanged draft version. A malformed token being accepted by the CSRF layer but rejected as a validation/version/request-shape error still passes this assertion. The subsequent valid save narrows this possibility but does not identify the rejection mechanism. Assert the documented CSRF-specific status and machine-readable reason, then verify draft content as well as version remains unchanged. The error contract is outside this packet; no particular expected code is assumed here.

3. **MEDIUM — HTTP mailbox authorization is not negatively exercised.** `http_chain.rb:29–37,51–60`; `app_chain_test.rb:114–115`. The HTTP user receives organization owner access and explicit compose mailbox membership before all authenticated inbox/save requests. The HTTP negative at line 25 proves anonymous rejection only. Changing a database session user and calling `ThreadReads` directly does not test HTTP identity/session binding or routing authorization. A route that returns/saves across unauthorized mailboxes for authenticated users can therefore pass this chain. Add an authenticated identity lacking the target mailbox grant and assert both inbox/read and draft-save denial with no persistence; include revoked-grant handling if claiming current authorization. This is a test-proof defect, not an established production authorization vulnerability.

4. **LOW — Reply polling does not advance beyond its requested first batch.** `app_chain_test.rb:137–153`, especially line 141. Every iteration requests `fetch_after(0, limit: 50)`. If the adapter honors the usual ascending after-UID batch contract and the mailbox already has 50 older messages, the valid new reply is never inspected and the test times out despite successful delivery. No mailbox-empty assertion appears here. Paginate with a cursor or bound inspection to a recorded pre-send UID. Adapter ordering and fixture mailbox emptiness are outside scope, so this failure is conditional on those explicit dependencies; it is not an observed runtime failure.

**Accounting:** 4 review findings / 239 unique physical lines = **16.74 defects/KLOC** (3 medium, 1 conditional low). Confirmed unconditional findings alone: 3 / 239 = **12.55/KLOC**. Counts describe this bounded harness review, not production defect density. Overlapping line references are not added to the denominator.

## What the visible assertions establish if executed successfully

- Initial send uses a production-named SMTP adapter, asserts accepted, runs IMAP synchronization against a worker connection, finds nonce-bearing persisted content, and ties its RFC Message-ID to the initial send UUID (`app_chain_test.rb:79–105`). These are meaningful chain assertions, not merely an HTTP 200 check.
- Real-HTTP-shaped flow checks anonymous denial, invite/auth acceptance, organization switch, imported thread identity/mailbox, draft version 1→2, logout, and subsequent session denial (`http_chain.rb:22–48`). HTTP client behavior, cookie management, actual server identity and transport are dependencies, not proven from their names.
- Reply review/approval leads to executor accepted then idle; recipient-side IMAP checks nonce subject/body, sender, In-Reply-To and References, with IMAP close in ensure (`app_chain_test.rb:118–153`). These checks strongly correlate the reply but do not directly assert SMTP envelope recipient, final worker SQL state, or unique delivery count. Accepted then idle is not exactly-once proof.
- The disabled IMAP account assertion (`app_chain_test.rb:131–132`) is a useful failure case. Direct database-reader denial is separately useful, with the HTTP coverage limitation above.

## Explicitly unverified evidence and remaining gates

No runtime PASS is claimed. Required inherited fixtures, `begin_write`, `write_guard`, `review`, `approve`, `fixture_change`, database role setup, credential/binding implementations, HTTP support at `/source/ops/tests/be02/http_support`, transports, executor, and superclass cleanup were outside the source budget. Whether they enforce isolation, scoped grants, real cookie sessions, frozen snapshot approval, no external network access, and durable worker transitions cannot be verified here. The setup skip at line 32 means runner evidence must prove this test executed rather than skipped.

The first SMTP call supplies a 10-second deadline. Both polling loops use monotonic 35-second checks **after** blocking sync/open/fetch/close work. Therefore those checks do not themselves bound a stuck dependency call; per-call timeouts, SQL statement timeouts, HTTP timeouts and an outer runner deadline remain unverified. No whole-test maximum can be derived from these packets alone. Existing ensure closes an opened reply session; connection-opening failure and teardown failure must still be covered independently.

Null/empty malformed identity and credential fixtures currently fail through fetch/parse/index/split or resolver dependencies rather than dedicated assertions. Credential selection can be empty; its rejection depends on the unreviewed bundle validator. Inbox pagination could omit the imported thread when fixtures are populated; mailbox emptiness and default ordering are unverified. No boundary-specific regressions for these helper failure paths appear in scope.

Visible SQL uses parameter binding, and nonce/UUID values do not interpolate external SQL. Private bundle creation requests mode 0600; actual filesystem enforcement and secure removal are runtime matters. Helpers have bounded, understandable responsibilities; no actionable duplication, unnecessary abstraction, or hot-path database performance defect was established in these test packets. The connection adapter deliberately bypasses ActiveRecord wrappers; its behavior versus production remains a dependency. Comments accurately distinguish browser acceptance from this chain. Wider documentation synchronization and standards conformance beyond these files remain unverified.

The owner should repair/review these findings and supply exact-source fleet Docker evidence, cleanup evidence, skipped/executed case counts, and dependency timeout/isolation proof before treating this harness as acceptance evidence. Actual UI validation and production release authority remain separate.
