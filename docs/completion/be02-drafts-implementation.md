# BE-02 C durable drafts implementation handoff

<!-- AIDEV-NOTE: This is source handoff evidence; coordinator Docker execution and adversarial review remain separate. -->

This dispatch implements the accepted C scope from `1.0.0-collaboration.1`, under BE02-D01–D08, on `feature/codex-be02-integration`. It adds migration `20261013000004`, seven SQL modules, draft read/save/lookup services, four controller actions, RBS declarations and focused tests. The coordinator confirmed all four routes are integrated in `apps/server/config/routes.rb`. No dependencies, shared fixture edits, root-document changes, commits, live transport, application credentials or Docker resources were created by this dispatch.

## Behavior and integration seams

| Route | Action | Request / response byte cap |
| --- | --- | --- |
| PUT `/v1/drafts/:draft_id` | `V1::DraftsController#update` | 1,048,576 / 4,096 |
| GET `/v1/drafts/:draft_id` | `V1::DraftsController#show` | No body / 2,097,152 |
| GET `/v1/drafts` | `V1::DraftsController#index` | No body / 262,144 |
| GET `/v1/draft-operations/:operation_id` | `V1::DraftOperationsController#show` | No body / 4,096 |

Reads reuse the existing `protected_read` snapshot, `ThreadProjection`, `ReadResponse` and signed `Cursors`. Draft lists use `updated_at DESC,id DESC`, default/max 50, whole entries and cursors bound to actor, organization, context, authorization version, mailbox, order and effective limit. Complete reads preserve all content; summaries take 256 subject code points with a truncation flag. Empty and overlong supplied cursors are `cursor_invalid` after scope authorization.

Writes use the foundation's `protected_write` and `SessionWrites` transaction. `app.save_draft` also requires `app_auth.assert_protected_write(session_digest, actor_id)`, so GUCs alone cannot establish write authority. Migration 000003 and its private transaction marker are prerequisites. Compose and global draft ownership are rechecked inside the protected transaction; the private owner receives actor-scoped reads of the existing organization/membership/mailbox/thread tables to perform that check. No API membership DML is granted.

Only applied success and terminal `draft_conflict`, `draft_consumed`, or `operation_mismatch` return a serialized `WriteResponse`. Terminal conflict records therefore COMMIT. Boundary, authentication, context, scope and availability errors raise `CollaborationError`, causing rollback. Invalid database projections or serialization overflow become `internal_error` before commit. Every conflict serialization uses the current request ID; legacy A/B `AuthError` is untouched. The foundation worker was notified of this exact seam.

`app.drafts` has forced RLS, actor-owned compose reads, composite organization/mailbox and reply constraints, scalar maxima and positive bounded versions. API receives only named SELECT columns and execution of the bounded functions, not table writes. The operation ledger is in an inaccessible private schema with forced RLS; only narrow definer functions inspect or mutate it.

## Durable operation semantics

Validated content is full replacement, with empty unsent fields and nullable address members preserved. Unicode limits count code points. SHA-256 hashes the contract's ordered JSON array, with normalized UUID/integer spelling and exact scalar text, recipient order and null/empty distinctions; operation ID is excluded from the digest. Tests specify the exact escaping and UTF-8 digest input.

The private primary key is organization/actor/operation. Save ordering is current guarded authority, scope/ownership, operation and draft transaction locks, rechecked scope, existing ledger, new reply scope, consumed state, expected version, then save. Identical retries preserve the original applied result or original terminal conflict even after a later save, consumption or reply deletion. Concurrent duplicate saves converge on one mutation; current authorization still precedes replay. Exhausted versions return 503 before mutation or ledger insertion.

Lookup returns only canonical metadata, with generic C/D 404 for hidden or mismatched bindings. An authorized absent draft with no visible record returns `unknown`; this does not assert that no write occurred. Stored conflict versions/state remain those of the original decision.

Expiry is computed as exactly 604800 seconds. At or after expiry lookup returns `expired`, and all reuse returns `operation_mismatch` even before compaction. `app.compact_draft_operations(limit)` is worker-only, accepts 1..1000 (default 100), uses `FOR UPDATE SKIP LOCKED`, clears detailed outcomes/versions and retains permanent identity, binding, digest and expiry metadata. There is no scheduler, purge or reexecution path. A later worker can call this bounded function without granting table access.

## Regression evidence authored; execution NOT_RUN

| Test file under `apps/server/test` | Critical cases |
| --- | --- |
| `be_02/draft_payload_test.rb` | Exact canonical escaping, UUID/integer equivalence, recipient/null distinctions, empty/max Unicode content, invalid types and limits. |
| `be_02/draft_reads_test.rb` | Complete untruncated content, summary truncation, signed cursor binding, scope-before-cursor, missing draft, metadata-only conflicts, terminal commit responses versus raised nonterminal errors. |
| `be_02/draft_database_test.rb` | Replayed A after B/consumption/deleted reply, complete replacement, durable conflict metadata, conflict priority, seven-day expiry, worker compaction/tombstone, binding mismatch, unknown and version exhaustion. |
| `be_02/draft_authorization_test.rb` | Missing/stale transaction guard, direct DML/private-ledger denial, foreign actor, compose revocation, shared read without compose, foreign reply scope, database maxima/composite constraints and forced RLS. |
| `be_02/draft_concurrency_test.rb` | Duplicate cross-session replay, competing version-zero creates, compose removal waiting on guarded save; lock waits use observed PostgreSQL wait events. |
| `requests/drafts_test.rb` | Actual controller/serializer success and durable 409 COMMIT, generic hidden 404, duplicate/oversized received JSON before auth, maximum escaped content, invalid projection rollback and all three GET actions. |

`draft_database_test_helper.rb` extends the foundation's database fixture in an owned file. It uses the existing API, worker and admin PostgreSQL connections, guarded fixture changes and exact private-ledger teardown. No shared fixture helper edits are needed. The request harness extends the foundation adapter locally, including its read-pool seam.

**NOT_RUN:** lint, RBS/Steep checks, migration up/down, unit/request/database/concurrency tests, actual HTTP integration, contract/generated-type integration, Docker checks, actual-client/visual validation and adversarial review. Source inspection is not runtime verification. The coordinator owns these checks and should run the listed files with the shared BE-02 Docker harness and the actual PostgreSQL 17 roles. Existing `Steepfile` coverage already targets the new library/controllers and signatures; the coordinator owns any necessary shared loader or harness corrections. No Docker cleanup is owed by this worker because it created no Docker resources.

## Bounded adversarial review handoff

These are proposed independent assignments, not completed reviews. Each contains at most 200 physical lines; line counts were inspected after the final source edits. Defect count and defect density from adversarial review are **NOT_RUN**, not zero. The coordinator should record actual findings and density in its owned `code-reviews.md` and use a dedicated design-tradeoff reviewer for lock ordering, permanent tombstones and definer privilege boundaries.

All paths in this table are relative to `apps/server`; each file is reviewed in full from line 1 to the stated line count.

| Slice | Files and physical line counts | Total |
| --- | --- | ---: |
| C1 schema and access | `db/migrate/20261013000004_create_app_drafts_operations.rb` 18; `db/be02_drafts/tables.sql` 45; `policies.sql` 30; `scope.sql` 12; `grants.sql` 10; `down.sql` 11 | 126 |
| C2 transactional ledger | `db/be02_drafts/save.sql` 87; `operations.sql` 46 | 133 |
| C3 input and projection | `lib/elevateo/drafts/payload.rb` 48; `database.rb` 51; `projection.rb` 40 | 139 |
| C4 service outcomes | `lib/elevateo/drafts.rb` 78; `lib/elevateo/draft_operations.rb` 86 | 164 |
| C5 controller and types | `app/controllers/v1/drafts_controller.rb` 42; `draft_operations_controller.rb` 15; `sig/drafts.rbs` 51; `draft_operations.rbs` 12; `drafts_controller.rbs` 14 | 134 |
| C6 boundary/read tests | `test/be_02/draft_payload_test.rb` 62; `draft_reads_test.rb` 116 | 178 |
| C7 authorization fixtures | `test/be_02/draft_database_test_helper.rb` 75; `draft_authorization_test.rb` 79 | 154 |
| C8 persistence/concurrency tests | `test/be_02/draft_database_test.rb` 90; `draft_concurrency_test.rb` 73 | 163 |
| C9 request serialization tests | `test/requests/drafts_test.rb` 146 | 146 |

The inventory is 25 source/test/signature files, 1,337 physical lines, plus this report. Formatting belongs to linters. Cross-file review context should include canonical contract sections 2–5, existing read projection/cursor code and the protected-write foundation, without silently expanding a single assignment's code coverage beyond 200 lines. The independent design review should simulate concurrent duplicate requests, a revocation queued behind a save, expiry before/after compaction, and serialization failure after SQL but before commit. Any Obsidian-connected simulation and required named-model review remain coordinator work, not evidence claimed by this dispatch.
