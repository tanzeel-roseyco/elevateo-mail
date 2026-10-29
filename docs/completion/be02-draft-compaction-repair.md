# BE-02 draft compaction repair (DTX-01)

Bounded repair complete; runtime and independent review remain **NOT_RUN**. Task task_a1906229b697, dispatch ctx_03d2dea3902c, run run_5cc7ae2ab900. Requested role: Astra LOW repair worker; no additional agent/model calls were made. Frozen contract `1.0.0-collaboration.1` is unchanged.

## Change and scope

`apps/server/db/be02_drafts/operations.sql` now captures one local `timestamptz` from `clock_timestamp()` after limit validation and before the batch SELECT. Comparing expiry against that parameter permits the existing partial expiry index to bound the scan. Limits 1..1000, null rejection, ordering, SKIP LOCKED, detail-only update and permanent identity/binding/digest/timestamps remain unchanged. Lookup still checks the actual wall clock independently.

One reported medium defect addressed: DTX-01, volatile per-row cutoff cannot bound expiry scanning. This is static repair evidence, not measured performance or independent closure. At cutoff T, a row expiring after T waits for the next physical cleanup batch; lookup still returns expired once its own wall clock reaches expiry. No schema/API/security redesign, dependency, frontend change, root-document edit, commit, Docker/SSH invocation or host application test occurred. Obsidian was not used; the cutoff scenario is analytical only.

No Ruby test was added: the existing behavioral/concurrency files have a separate exclusive owner, and a copied SELECT or source-text assertion would not prove the production nested query's plan. Coverage requirements were sent to root in Orca message msg_b0b8dbd9e550: invalid/edge limits, mixed expiry, batch count, lock skipping and competing compactors, permanent metadata preservation, and lookup expiry without physical cleanup. Root owns Docker execution and incorporation of that coverage.

## Exact changed paths and review manifest

| Path | SHA-256 | Proposed review pass |
| --- | --- | --- |
| apps/server/db/be02_drafts/operations.sql | 9b2999a43136a27432a12d72d60793e29ac4a7693fc2f7114ab9dfe43b11d4a1 | Functional/design: lines 1-50, 50 physical LOC |
| docs/completion/be02-draft-compaction-repair.md | Delivered separately in completion message to avoid a self-referential hash | Probe/document review: entire file, under 200 physical LOC |

Original SQL SHA-256: `09eb3aad0b4b868bb946ab828d73ee3885a1b89e77756ff3c69a0504f5735b42` (46 physical LOC). Author inspected the 50 resulting SQL lines: one pre-existing defect addressed, 20.00 addressed defects/KLOC; no new defect observed, not an independent review. Original transaction reviewer observed 1 defect / 326 unique LOC = 3.07 defects/KLOC. These denominators are distinct. Assign functional and dedicated design reviewers independently; each proposed pass is <=200 physical LOC and each reviewer total remains <=400. Formatting belongs to lint, not these reviewers. Root owns code-reviews.md updates.

## Root-owned Docker nested-plan proof (NOT_RUN)

Use only a root-authorized, disposable PostgreSQL 17 Docker test database with the real migrations, production function owner/RLS/grants, no concurrent workloads, and an empty operations ledger. Never run this against persistent or shared application data. Run the SQL below through the existing container-internal psql admin connection with `-X -v ON_ERROR_STOP=1`, capturing stdout and stderr. No host-published database port is needed. Disconnect on failure to roll back; root cleans its task resources. The initial empty-ledger guard refuses existing data. All seeded rows and mutations roll back.

Prerequisite: the pinned image must already provide PostgreSQL's `auto_explain` module. LOAD failure means instrumentation is unavailable, not a passing test; do not install a dependency or alter production logging to make this pass. Session-local nested JSON plans inspect the actual function invocation (including SECURITY DEFINER/RLS), not a duplicated SELECT. The chosen log level sends plans to captured client notices; if the pinned server does not expose them there, root must collect its task-owned server log and verify every labeled call has its nested plan. Missing nested plans mean UNKNOWN.

Run this same script in fresh connections/databases for the pre-repair and repaired frozen SQL sources; record source hash, server version, effective settings and complete plans. First use `force_custom_plan` as written, then repeat with only that value changed to `force_generic_plan` to exercise cached parameter planning. Do not alter a shared deployed function for the comparison. No timing threshold is an acceptance criterion, and planner switches such as enable_seqscan must retain their defaults.

```sql
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '1s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SET LOCAL plan_cache_mode = force_custom_plan;
LOAD 'auto_explain';
SET LOCAL auto_explain.log_min_duration = -1;
SET LOCAL auto_explain.log_analyze = on;
SET LOCAL auto_explain.log_buffers = on;
SET LOCAL auto_explain.log_timing = off;
SET LOCAL auto_explain.log_nested_statements = on;
SET LOCAL auto_explain.log_format = json;
SET LOCAL auto_explain.log_level = notice;
SET LOCAL auto_explain.sample_rate = 1;
SET LOCAL client_min_messages = notice;
SELECT version(), current_setting('plan_cache_mode');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM app_drafts_private.operations) THEN
    RAISE EXCEPTION 'probe requires an empty disposable operations ledger';
  END IF;
END $$;
INSERT INTO app_drafts_private.operations
  (organization_id, actor_id, operation_id, mailbox_id, draft_id,
   payload_digest, recorded_at, detail_expires_at, detail)
SELECT '10000000-0000-4000-8000-000000000001'::uuid,
       '10000000-0000-4000-8000-000000000002'::uuid,
       md5(n::text)::uuid,
       '10000000-0000-4000-8000-000000000003'::uuid,
       '10000000-0000-4000-8000-000000000004'::uuid,
       repeat('a', 64), transaction_timestamp(),
       transaction_timestamp() + interval '604800 seconds',
       '{"outcome":"applied"}'::jsonb
FROM generate_series(1, 50000) AS n;
ANALYZE app_drafts_private.operations;
SET LOCAL auto_explain.log_min_duration = 0;
SELECT 'all_unexpired' AS phase, app.compact_draft_operations(100) AS changed;
SET LOCAL auto_explain.log_min_duration = -1;
UPDATE app_drafts_private.operations
SET recorded_at = transaction_timestamp() - interval '8 days',
    detail_expires_at = transaction_timestamp() - interval '8 days' + interval '604800 seconds'
WHERE operation_id IN (SELECT md5(n::text)::uuid FROM generate_series(1, 250) AS n);
ANALYZE app_drafts_private.operations;
CREATE TEMP TABLE compaction_metadata_before ON COMMIT DROP AS
SELECT organization_id, actor_id, operation_id, mailbox_id, draft_id,
       payload_digest, recorded_at, detail_expires_at
FROM app_drafts_private.operations;
SET LOCAL auto_explain.log_min_duration = 0;
SELECT 'mixed_1' AS phase, app.compact_draft_operations(100) AS changed;
SELECT 'mixed_2' AS phase, app.compact_draft_operations(100) AS changed;
SELECT 'mixed_3' AS phase, app.compact_draft_operations(100) AS changed;
SELECT 'mixed_empty' AS phase, app.compact_draft_operations(100) AS changed;
SET LOCAL auto_explain.log_min_duration = -1;
SELECT count(*) AS total,
       count(*) FILTER (WHERE detail IS NULL) AS compacted,
       count(*) FILTER (WHERE detail IS NOT NULL) AS retained
FROM app_drafts_private.operations;
SELECT count(*) AS metadata_difference FROM (
  (SELECT * FROM compaction_metadata_before EXCEPT
   SELECT organization_id, actor_id, operation_id, mailbox_id, draft_id,
          payload_digest, recorded_at, detail_expires_at FROM app_drafts_private.operations)
  UNION ALL
  (SELECT organization_id, actor_id, operation_id, mailbox_id, draft_id,
          payload_digest, recorded_at, detail_expires_at FROM app_drafts_private.operations
   EXCEPT SELECT * FROM compaction_metadata_before)
) differences;
ROLLBACK;
```

Expected outputs: changed counts 0,100,100,50,0; total 50000, compacted 250, retained 49750; metadata_difference 0. These outputs alone do not pass DTX-01. Inspect the nested CTE batch-selection branch under its Limit/LockRows, distinguishing it from the UPDATE's join/identity lookup branch. Repaired plans must show an expiry `Index Cond` on `draft_operations_compaction` using the captured timestamp/parameter; all-unexpired and mixed-empty batches should return zero without filtering 50000/49750 future rows. Record actual rows, loops, rows removed by filter and buffers for this branch, not just the outer SELECT or changed count. Never require a particular whole-plan tree or exact buffer count.

Pre-repair expectation: expiry is a `Filter` containing `clock_timestamp()`, with no expiry index stopping bound; an all-unexpired sweep examines/filter-rejects the recent population (possibly through an ordered index scan). Repaired expectation: expiry participates in the index bound in both custom and generic modes. If the planner chooses a different path, report that observed plan and leave acceptance open; do not force the planner and call that representative evidence. Timing and total UPDATE cost can still vary, especially under locks/dead tuples; this repair is not a global work/latency bound.

Limitations: auto_explain adds overhead; this fixture does not prove deployment grants, lock skipping, concurrent compaction, exact equality at a controlled cutoff or logical wall-clock expiry. Those belong to the exclusive database/concurrency owner and root runtime. A production clock injection solely for deterministic tests is not proposed. This probe is deliberately a reviewed runtime recipe, not an authored passing test or a test-suite addition.
