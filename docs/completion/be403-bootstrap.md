# BE-403 privileged draft schema bootstrap — IN PROGRESS

Owner Rowan OFF-403; baseline c3ecd1f4cc35b98755a523d48032391ccdd0402c. Root owns approval and independent verification; Soren owns every Docker mutation/test; Elara owns acceptance. No email/activation authorized.

Observed R3 failure supplied by root: 026-migrate.log reports database postgres CREATE denial, not schema ACL denial. Source confirms draft tables.sql attempted CREATE SCHEMA as elevateo_owner without database CREATE.

Repair: bootstrap transaction creates app_drafts_private as elevateo_owner, rejects unexpected owner/foreign ACL and effective application database CREATE. Migration checks owner identity/schema/ACL before mutating tables. Down removes draft objects but keeps the bootstrap schema and unrelated objects; reapply never needs database CREATE. Existing destructive operation-ledger downgrade contract remains. API/worker grants remain bounded function capabilities, no private schema access.

New draft_bootstrap_test.rb covers actual migrator-login rollback/reapply inside rollback-only transaction, runtime schema/data denials, missing schema, wrong owner, API USAGE and PUBLIC CREATE drift. Administrative drift is transaction-local and restored. Full-chain real-login migration and all suites are requested through existing ops/tests/be02/run.py under Soren's lease. No checks have run yet; bootstrap-specific repeated-run/database-CREATE-drift proof remains requested separately.

Independent specialists SPEC-40301 adversarial source and SPEC-40302 design tradeoffs reviewed 32 changed lines each (overlap not additive), zero blocking defects. Full current user rubric supplied; runtime unverified. New test review pending. Dedicated design reviewer notes owner self-ACL absence fails at later DDL rather than explicit guard, and database CREATE drift is checked at bootstrap rather than migration-only runs.

Missing inherited design artifact docs/completion/be02-migration-schema-design.md and Ada gates requested via root inbox. Latest explicit root authorization permits source work on confirmed unified baseline. No model/tier/session ID is independently exposed to this API assistant; no substitute identity asserted.

## Approved semantic reconciliation

BE-403 semantic guard reconciliation (2026-10-14): IN PROGRESS. Approved design hash b08976256765ce546325418a403a23b958933cbbf97ec42a228c5412198d0acb verified. Bootstrap preserves ACL representation and unrelated objects; shared up/down prerequisite checks migration identity, independent ownership, separate owner CREATE/USAGE, foreign ACL and effective runtime denial. Source authored; current changes await independent review and Soren container verification. Earlier 42f6369 migration/guard passes do not validate this revision; its full suites failed (15 failures/55 errors).

Historical imported DB schema review is source-only, at frozen hashes; not current approval. New guard is read-only and deliberately duplicated in administrative bootstrap, reused by both migration directions. No namespace emptiness rule. Sentinel down/reapply, independently revoked privileges/explicit empty ACL and direct-admin rejection regressions authored. Real Rails migration bookkeeping rollback/reapply and bootstrap default-privilege leakage/ACL representation/sentinel rerun still require Soren disposable-container proofs.

## Backend failure repair batch 1

BE-403 runtime failure repairs (2026-10-14): IN PROGRESS. Source fixes target observed 42f6369 errors: Minitest fixture message collision/block binding/frozen strings/nil assertion, draft keyword and rotating-CSRF fixtures, obsolete JSON 3 create_additions option, invalid RBS protected declarations, and worker function namespace USAGE. Auth/session boundaries remain unchanged. Current changes are NOT runtime verified; pool/deadline/input/controller failures remain open.

JSON 3.0 removed create_additions: https://github.com/ruby/json/releases; installed runner uses json 3.0.2. No application test executed by Rowan. Worker receives USAGE on shared app function namespace only; private namespace and table denials retained. This shared namespace prerequisite is intentionally retained on draft downgrade, consistent with bootstrap namespace ownership.

BE-403 raw API boundary correction: IN PROGRESS. Rails instrumentation reads filtered params before actions and can parse malformed query/JSON or truncate raw JSON by forged Content-Length. ApiController now suppresses eager body/query parameter parsing before instrumentation; route parameters remain available and existing bounded raw validators still own body/query decoding. Existing duplicate-key, malformed-query and actual-byte-cap regressions must run on fleet-02.

BE-403 bootstrap guard regressions authored: exact private-schema DO block exercised in rollback-only disposable fixture transactions, including nonempty sentinel/OID/ACL representation, default-privilege creation leakage, owner CREATE/USAGE/ALL loss, foreign grants, wrong owner+empty ACL and atomic rejection. Full psql bootstrap and actual Rails migration bookkeeping remain distinct Soren gates; NOT_RUN for current revision.

Observed execution identity: CLI 0.160.0, gpt-6.1-sol, effort low; service_tier=null, so Fast requested but unconfirmed. Actual manual session 01a137d0-2594-75a2-9b34-725c77f0c632; receipt ~/.codex/sessions/2026/10/14/rollout-2026-10-14T02-29-10-01a137d0-2594-75a2-9b34-725c77f0c632.jsonl.

BE-403 numeric underflow repair: ExactDecimal rejects nonzero JSON mantissas converted to zero by extreme BigDecimal exponents, while preserving exact decimals and true zero. Existing precise-version and exception-mode regression failures provide target coverage; current runtime NOT_RUN. Semantic guard order now follows supplied owner/ACL/owner-privileges/runtime sequence.

BE-403 effective-access regression authored: transaction-local inherited owner membership grants runtime schema access without altering owner-only namespace ACL; bootstrap predicate must still reject. Current source and tests remain pending Soren execution and root independent review.

BE-403 atomic down dependency regression authored: an unrelated view depending on app.drafts forces non-CASCADE down failure; rollback to savepoint must restore earlier function/table drops and preserve dependency. This supplements actual-migrator SQL down/reapply; real Rails schema_migrations bookkeeping remains Soren gate. Current changes NOT_RUN.

BE-403 e0c2d35 fresh remote Docker result: migrations succeeded; full suites FAILED with nine assertions and zero Minitest errors; Steep now parses but exposes inherited typing diagnostics. Raw-boundary, exact-decimal and bootstrap semantic tests passed in this SHA, not full acceptance. Follow-up source repairs strengthen pool backend continuity, scope safe-handoff instrumentation to the request checkin, commit the lower generation fixture for NOWAIT, bind remaining assert_raises block, and assert rollback occurs before intentional adapter discard. Native 25P04 proof remains open; no oracle weakened.

BE-403 typing repair batch authored from e0c2d35 diagnostics: nullable boundary inputs accurately typed, BigDecimal standard-library signatures loaded, Thread required block and demonstrated Rails request seams declared, exact Auth/config/cipher locals narrowed without casts, empty collection/tuple shapes annotated. Strict Steep configuration retained; no suppression or blanket untyped domain types. Bootstrap source-load failure moved inside test execution for explicit reporting; Soren must mount exact immutable bootstrap SQL. Runtime NOT_RUN for this batch.

BE-403 native timeout diagnostics authored: request verbose libpq errors before the two native schedules and emit only backend ID, result SQLSTATE, error class and booleans for exact 25P04 presence/broken connection. No raw SQL/error/credentials exported; original structured-result assertion remains unchanged and may still fail. This is diagnostic evidence collection, not a timeout PASS or widened oracle.

BE-403 coordinated harness source prerequisite: Soren explicitly requested Rowan add exact test-only read-only bootstrap.sql bind and matching cleanup allowlist. Test service preserves its original three read-only source mounts; production API/worker mounts unchanged. This enables actual bootstrap-block regression discovery; no Docker executed by Rowan, independent source review and fresh runtime still required.

BE-403 28390d7 fresh fleet result: 54 suite summaries,375 runs,5487 assertions,2 native deadline failures,0 errors,0 skips; all other suites including bootstrap contract/race repairs passed. Structured server logs correlate both backend PIDs to FATAL25P04; transport error text is diagnostic only. Follow-up captures first structured query PGresult before draining, and copies idle structured fatal fields from libpq notice receiver before discard. Require exact SQLSTATE25P04+FATAL from original structured result; unrelated transport death cannot pass. Remaining Steep errors receive typed literals, correct optional record syntax, explicit saved parse value and nonnullable owned lease. Current follow-up NOT_RUN; RuboCop95 offenses await container lint repair.

Native protocol inference sources: ruby-pg v1.7.0 async exec drains last result; libpq REL_17_6 fe-protocol3.c routes idle ErrorResponse through structured notices. https://github.com/ged/ruby-pg/blob/v1.7.0/ext/pg_connection.c and https://github.com/postgres/postgres/blob/REL_17_6/src/interfaces/libpq/fe-protocol3.c. These explain the new observation point; runtime confirmation remains required.
