# HTTP approval final repair review

Review date: 2026-10-24. Task `task_70c2e1c6ff06`, dispatch `ctx_772cdfea2898`. Verdict: both prior MEDIUM oracle findings are repaired in the source bound below; zero new actionable defects found. Runtime verification remains owned by implementation dispatch `ctx_4be80c8bfe6d` and is NOT_RUN by this reviewer.

## Coverage and provenance

Three separate packets were reviewed in full, each below 200 physical lines. No other source files were read. Read current README/state/documentation checkpoints and complete `.planning/STANDARDS.md`; the initial combined historical documentation output was truncated, so current state and standards were read separately. Compared both `launch-http-approval-review-20261023.md` and `launch-http-approval-design-review-20261023.md` in this directory.

| Packet | Inclusive lines | Whole-file SHA-256 | New defects | Density |
| --- | --- | --- | ---: | ---: |
| `apps/server/test/support/launch_mailflows/http_approval.rb` | 1-69 | `300b08d1685911b2c896e7096a1b0c1ac94ba18ae09474fa481d99903f95b7a4` | 0 | 0/KLOC |
| `apps/server/test/support/launch_mailflows/http_chain.rb` | 1-122 | `0f2875ccdd00a6857f9a2213ca4a69daebf1750329ce0f05b28c343642fa246b` | 0 | 0/KLOC |
| `apps/server/test/support/launch_mailflows/app_chain_test.rb` | 1-194 | `1d1353d1368a45da6d38c3d36ba71fac6b11d5ad84cbe18e51cc0c7d76f14745` | 0 | 0/KLOC |

Total: **385 unique physical source LOC, zero new defects, 0 defects/KLOC**. Both historical reports count the same replay defect; they are not additive. Two distinct prior MEDIUM findings are fixed statically, zero remain open within this repair scope. All three hashes differ from the relevant earlier report bindings; historical runtime results cannot certify these files. Hashes were observed twice during review. Later edits invalidate this binding.

## Fixed findings

1. **Replay can conceal another intent: fixed (`http_approval.rb:52-58`).** The replay response must retain the original send ID. The SQL now retrieves every intent for the draft, without a send-ID predicate, asserts exactly one row, then separately requires that row's ID to equal the approved ID. An extra S2 intent fails the row-count assertion even if replay returns S1; a sole wrong S2 fails the ID assertion; zero rows fails before indexing. This directly closes the prior counterexample without assuming an unreviewed uniqueness constraint.

2. **Recipient oracle lacks approved-send identity and intended recipient: fixed (`app_chain_test.rb:129,135-169`).** The approved send ID is passed into verification and selects its persisted snapshot. The existing `SmtpSnapshot.render` receives that same send ID and verified sender; the existing `MailMessageIdentity.from_mime` derives the expected MIME identity, avoiding another hand-written identity formatter. Every nonce/content-matching received MIME must have this exact identity, From equal to the replying mailbox, To equal to the original sender, In-Reply-To equal to the original imported RFC identity, and References equal to that ancestry. A wrong S2 MIME with the same content fails identity equality. Duplicate matching deliveries increment a counter and fail the final exactly-one assertion during the bounded observation; absence fails the polling deadline.

The duplicate assertion is explicitly limited by its comment to two seconds after arrival and the mailbox rows fetched during that period. It is not universal exactly-once SMTP, nor proof of duplicates arriving later or beyond an unread backlog at the cutoff. Shared renderer/identity implementation correctness remains dependency-owned, not independently established by this source-only check.

## Full-rubric disposition

- **Purpose and state coupling:** Public HTTP draft/review/approval supplies the exact persisted intent used by the worker and recipient oracle. Denials require no persisted effects; the worker's second run must be idle. The repair changes observations rather than production data structures or authorization behavior. Administrative SQL remains synthetic fixture setup and inspection.
- **Happy path and failures:** The integration case includes real transport/ingestion/read/reply flow plus invalid digest, stale version, missing authentication, invalid CSRF, absent mailbox grant, revoked approval grant, logout and inbound revocation checks. The two repaired assertions supply direct regression oracles for extra intents and incorrect received identity. This review does not claim those checks executed or independently injected these faults.
- **Null, empty and limits:** Required keys use `fetch`; missing snapshot rows, missing MIME identity and missing inbox/reply fail visibly. Zero/multiple intents fail explicitly. Empty IMAP batches retain the cursor; batches have a 50-row limit and polling has a 35-second budget, subject to dependency call deadlines. Malformed fixture inputs and recipient/body maxima are not newly exercised by this repair; no broad boundary-validation acceptance is inferred.
- **Security and external input:** SQL values are parameterized; denied HTTP requests assert exact statuses/codes and zero effects. Private credential output uses mode 0600. Reply identity is checked from received raw MIME. Grant refresh proves current-session denial, not stale-session or dispatch-time revocation. Session/transport internals, production isolation and permission implementation remain outside these packets. No new secrets or body logging is introduced.
- **Maintainability and performance:** The split between HTTP session/draft flow, approval checks and transport chain remains coherent. Shared rendering avoids duplicated identity logic. Names communicate intent; AIDEV comments explain the changed oracles and bounded duplicate observation. No new dependency, unnecessary abstraction or production hot-path query is introduced. The per-message parsing loop is appropriate for this bounded integration proof. Formatting remains delegated to lint.
- **Documentation and standards:** Existing reports preserve the historical defects and narrow evidence claims; this report records their disposition and exact replacement bindings. Docker verification, actual isolation and cleanup receipts remain with the existing owner. Only this report was written, as explicitly scoped; coordinator owns central review-ledger integration. No new design recommendation or Obsidian-backed simulation was made.

## Remaining evidence boundary

No application edits, tests, builds, locks, subprocess workers, network mail operations or deployments were performed. No runtime PASS, production authorization, whole-project approval or visual acceptance is claimed. The existing implementation owner must provide fleet Docker evidence against these final hashes, with non-skipped assertions and containment/cleanup receipts; broader limits from the prior design review remain limits rather than new repair findings.
