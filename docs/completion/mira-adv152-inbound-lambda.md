# ADV152 — fake inbound guard lambda

Exact source: 487ca33d68f1e6f1b48f3f9e1b4922131de32bed, completion-corin-mail819. Static review only; runtime NOT_RUN. No tests/builds, styling review, or implementation edits.

Confirmed defects: 0. Density: 0 / 102 unique versioned source LOC (0 per 1,000 LOC).

The one-line change preserves the consumed callback contract. protected_write calls guard_users with input and query keywords. The lambda still requires input, validates actor_id as a UUID, and returns that actor as a one-element guard list. Anonymous ** accepts and ignores the unused query keyword instead of naming an unused argument. It neither changes guard selection nor bypasses the helper's UUID validation, session authentication, context/version/CSRF checks, or guarded transaction.

Within the action, actor_id must still equal the authenticated identity.user_id. Store construction derives actor and session digest from that identity, then checks organization/mailbox authorization before ingestion. Provider account/event/MIME values are narrowed to strings, and the route remains restricted to the test environment plus explicit enablement. Existing typing comments and security intent remain truthful for the unchanged consumed values. Empty/malformed actor inputs still pass through the same UUID validation path; the callback now tolerates additional keywords, but the only actual caller reviewed supplies input/query, so this does not widen the HTTP input boundary.

Tradeoff: anonymous keyword capture is a small idiomatic adaptation to the shared helper protocol. It avoids unnecessary callback/interface restructuring and does not warrant emulating or validating unused future keyword semantics. This review does not certify the underlying transaction locks, MIME bounds, RLS implementation, or downstream ingest idempotency. No regression test was added for a runtime-neutral unused-parameter repair; existing runtime/typing verification remains separate. Parent-reported integrated lint PASS is not independently executed evidence and is not a Steep PASS claim.

Coverage: apps/server/app/controllers/v2/fake_inbound_controller.rb current 1–51 (51 LOC); parent diff context 13–19 (7 LOC); apps/server/app/controllers/v1/write_controller.rb current 1–44 (44 LOC). Total 102 unique versioned source LOC, below 140 assignment limit and every read below 180. Documentation paths were metadata-listed, not read. RBS, tests, SessionWrites, WriteInput implementation, store/ingress source, route registration, and broader application behavior are excluded.
