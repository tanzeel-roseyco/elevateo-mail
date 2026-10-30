# BE02 protected-write deadline repair handoff

Status: implementation and regression authoring complete; ALL runtime acceptance NOT_RUN. No host syntax/app tests, Docker, remote SQL, SSH, providers, commits, deployment, or new agents were used. Root owns adversarial review, freeze, and fleet-02 Docker execution. This report is not acceptance evidence.

Requested identity: Codex gpt-6-astra LOW. Observed: Codex worker; the actual model identifier and reasoning effort are not independently exposed in this worker's available execution evidence, so the requested identity is not asserted as observed.

## Accepted authority and evidence

Read the complete coordinator decision at `../Elevateo Mail - Local Completion/docs/completion/be02-write-deadline-decision.md`; verified SHA256 `0874d5ae89f66bd4fc1972276fe1205678a8b0e1ac6adb8d866e2f72ff293953`. Applied scoped D05; did not repeat consultations. Read applicable project instructions, standards, state/documentation, orchestration, and AIDEV anchors before edits. Preserved concurrent numeric-input changes and root-owned helper repairs. `write_boundary_database_test_helper.rb` was inspected but not modified.

Primary-source inspection: [Rails 8.1.4 pool](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/connection_pool.rb), [adapter](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb), [transactions](https://github.com/rails/rails/blob/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/transaction.rb), [Ruby 3.4 interrupt masks](https://docs.ruby-lang.org/en/3.4/Thread.html#method-c-handle_interrupt), [PG17.6 transaction implementation](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/access/transam/xact.c), [PG17.6 timeout handling](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/tcop/postgres.c), and [SQLSTATEs](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/utils/errcodes.txt). Coordinator pinned local Rails source copies were also inspected.

## Changed purposes

- `WriteStatements` provides only typed `exec_query`, returns the materialized ActiveRecord result, and defers this deadline's interrupt across precheck/native call/postcheck. No generic delegation.
- `SessionWrites` establishes cleanup before checkout, defers deadline interruption during ownership and transaction transitions, and enables interruptible Ruby work only within established Tenancy. It accepts only verified write responses; rollback-nil/nonlocal/error/expiry paths discard. Successful handoff validates registration, current owner, completed transaction, callback outcome and expiry atomically under adapter then pool locks. Disposal removes then always attempts disconnect, never fallback-checks-in, and does not steal a foreign owner's adapter. Removal/replacement/disconnect failures preserve primary exceptions and emit sanitized phase/class/correlation; logging failure also cannot replace a primary exception.
- Controller adds only the final expiry check before rendering; numeric parser edits are preserved. RBS describes the narrow callback and actual Rails synchronization/ownership accessors.
- WG-01 checks same-transaction reentry after preliminary locked-session status/organization checks but before generation acquisition. WG-02 separates null/cardinality/dimension validation from array_position NULL-element checking. Empty and duplicate valid targets remain allowed. SQL is only for root's freshly created disposable database; no applied persistent migration was altered or executed.

## Regression inventory (authored, NOT_RUN)

- Narrow capability/result materialization; expired precheck, expired postcheck, injected deferred interrupt, and preserved SQL exception.
- Blocked Ruby business and serializer gates, nonlocal exits, rollback-nil, pre-render expiry, and fake adapter discard expectations.
- Real Rails 8.1.4 size-one API pool with PostgreSQL 17.6: normal 2xx and terminal409, before/after real COMMIT faults, Rails-removed adapters, failed checkout verification, checkin callbacks before/after owner clearing, callback removal without exception, foreign-owner protection, waiter exclusivity, actual remove replacement path with an observed waiter and injected replacement failure, disconnect/logging failures, exact injected checkout/bootstrap/SQL/checkin expiry, and native lock wait interruption deferral. Recovery probes use a different tenant/session, assert transaction-local GUC isolation, registration/availability/owner invariants and settled backend count.
- Native PG cumulative transaction timeout exact25P04 versus disabled-timer control, serialization-idle timeout, statement57014 and lock55P03 controls. Exact diagnostic assertions do not silently accept generic disconnects.
- Parameterized malformed target arrays yield22023; valid empty/duplicate shapes preserved; repeated reentry yields25001. Deterministic WG-01 two-transaction inversion schedule observes the B lock before attempting reentry.

## Analytical design schedules and unresolved acceptance risks

Obsidian is unavailable. These schedules are analytical only, not simulations executed against a runtime:

1. T1 owns generation A; T2 owns lower B and waits on A. T1 repeated guard(B) must raise25001 before B acquisition, permitting rollback to release A. Old late validation could form A/B inversion.
2. A successful write keeps adapter then pool locks across registration/owner checks, checkin callbacks, queue insertion and final handoff. A callback removing registration or raising after owner clear forces eviction before a waiter can receive an unregistered spare. Cleanup invokes remove without an encompassing pool monitor because Rails can attempt replacement outside remove's internal monitor.
3. Native SQL/transaction close is interrupt-deferred; Ruby work inside Tenancy is interruptible. Server transaction_timeout bounds eligible native transaction work but is disabled during parts of COMMIT. Durable commit followed by lost acknowledgement or late expiry is an uncertain public outcome, not proof of rollback.

Remaining risks requiring root verification: Ruby/RBS syntax and Steep compatibility have NOT_RUN; new test discovery must include the new pool and statements suites; Ruby3.4 Queue timeout, callback behavior, pinned Rails internals and PG17.6 timeout diagnostics require actual Docker validation. Native25P04 may be exposed differently by libpq; retain exact SQLSTATE acceptance and collect correlated server evidence if diagnostics are absent. Deadline timing tests use observed barriers and bounded waits but still require fleet scheduling validation. Cleanup cannot forcibly disconnect an adapter with a different owner; a broken logging sink cannot emit the normal diagnostic, although the original exception is preserved. No absolute return-time or COMMIT/rollback guarantee is made. No native/client/visual acceptance is claimed.

No independent adversarial review was run per dispatch. Defect count and defect density are NOT_ASSESSED, not zero. Root must record reviewed coverage and confirmed defects in its ledger. Suggested review assignments below are at most200 lines per pass and should be assigned independently or combined only up to400 lines per reviewer; formatting belongs to linters. Give a dedicated design reviewer the decision plus SessionWrites/WriteStatements (under400 source lines).

## Frozen handoff file inventory

Hashes cover current whole files, including preserved concurrent content. They are a review snapshot, not an assertion of ownership over every line.

| File | Lines | SHA256 | Review passes (inclusive) |
|---|---:|---|---|
| apps/server/lib/elevateo/session_writes.rb | 167 | fec1cb22954d2b5a74adef5f55e6a79b331feb4f8d3524d9322748ba874f22fd | 1-167 |
| apps/server/lib/elevateo/write_statements.rb | 21 | a490f59904a2fa8005dbd1b64edc1e7084b1fc455e855fdd37900a9af9544977 | 1-21 |
| apps/server/app/controllers/v1/write_controller.rb | 49 | b77201b8eb4e6765bc5b59cd47c746efe8a16d1b9345c80cf29b2c9322b48ebe | 1-49 |
| apps/server/sig/session_writes.rbs | 22 | 63bfcecf7b05f44c26de573f3144ed9e7628ef235c0e97f1e6a4cbf5094620e3 | 1-22 |
| apps/server/sig/write_statements.rbs | 8 | 8cebbe839aa6d570ab971fef8f85d41774f0a94517808c4c091ad5c831f56d1a | 1-8 |
| apps/server/sig/write_controller.rbs | 14 | abaa6e9cc28007426724275f9fe340fd539aad7987049dd2e3b01d1789972f21 | 1-14 |
| apps/server/sig/rails_seams.rbs | 157 | 4c08bd48cda79162d48b818140185676405ba88ce2f49bcef4918ef0d7361c78 | 1-157 |
| apps/server/db/be02_writes/guard.sql | 58 | f663b0a6acb00b1c92fcdd0bb1c6ba69f2409ba81356a14b72293594686edbcc | 1-58 |
| apps/server/test/be_02/write_boundary_deadline_test.rb | 152 | fe9b512ce52c63e6e21e6567c525cf5be82a9e9f565e83223d7ba4eeaae0f68f | 1-152 |
| apps/server/test/be_02/write_boundary_database_deadline_test.rb | 93 | 546f34a5221248d6a5429e2f48780e3c4f2791af4943469faa5b580dc1f6e575 | 1-93 |
| apps/server/test/be_02/write_boundary_database_test.rb | 151 | c04e0428b1a1a8716c8b80e55336c2f9106e780e12d22fca5934cf382752cfff | 1-151 |
| apps/server/test/be_02/write_boundary_controller_test.rb | 242 | 27cf2e4c455759039161393af8f26cffa6dce94b8fa26851de19f238ea7a21fc | 1-200; 201-242 |
| apps/server/test/be_02/write_boundary_test_helper.rb | 120 | 290b99e2a66c6bc0fa3a33ff45aeca64cc6cd2997800a353e4154a1cd9ce55eb | 1-120 |
| apps/server/test/be_02/write_statements_test.rb | 60 | ad323c788e3f22ba131bb728a5b3343f18b46753a16a3fe612eb91c89f0c9f48 | 1-60 |
| apps/server/test/be_02/write_boundary_pool_test.rb | 406 | 083a0c5f43772c31b4096badf6f5a5050844b93c278d10ce94d3ee1c63da4710 | 1-200; 201-400; 401-406 |
| apps/server/test/be_02/write_boundary_pool_test_helper.rb | 125 | e0cde52b611865c72b08ddbe81395ff32ac721a852366ddeb479b08aca133bc8 | 1-125 |
