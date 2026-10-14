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
