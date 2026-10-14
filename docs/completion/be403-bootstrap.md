# BE-403 privileged draft schema bootstrap — IN PROGRESS

Owner Rowan OFF-403; baseline c3ecd1f4cc35b98755a523d48032391ccdd0402c. Root owns approval and independent verification; Soren owns every Docker mutation/test; Elara owns acceptance. No email/activation authorized.

Observed R3 failure supplied by root: 026-migrate.log reports database postgres CREATE denial, not schema ACL denial. Source confirms draft tables.sql attempted CREATE SCHEMA as elevateo_owner without database CREATE.

Repair: bootstrap transaction creates app_drafts_private as elevateo_owner, rejects unexpected owner/foreign ACL and effective application database CREATE. Migration checks owner identity/schema/ACL before mutating tables. Down removes draft objects but keeps the empty bootstrap schema; reapply never needs database CREATE. Existing destructive operation-ledger downgrade contract remains. API/worker grants remain bounded function capabilities, no private schema access.

New draft_bootstrap_test.rb covers actual migrator-login rollback/reapply inside rollback-only transaction, runtime schema/data denials, missing schema, wrong owner, API USAGE and PUBLIC CREATE drift. Administrative drift is transaction-local and restored. Full-chain real-login migration and all suites are requested through existing ops/tests/be02/run.py under Soren's lease. No checks have run yet; bootstrap-specific repeated-run/database-CREATE-drift proof remains requested separately.

Independent specialists SPEC-40301 adversarial source and SPEC-40302 design tradeoffs reviewed 32 changed lines each (overlap not additive), zero blocking defects. Full current user rubric supplied; runtime unverified. New test review pending. Dedicated design reviewer notes owner self-ACL absence fails at later DDL rather than explicit guard, and database CREATE drift is checked at bootstrap rather than migration-only runs.

Missing inherited design artifact docs/completion/be02-migration-schema-design.md and Ada gates requested via root inbox. Latest explicit root authorization permits source work on confirmed unified baseline. No model/tier/session ID is independently exposed to this API assistant; no substitute identity asserted.
