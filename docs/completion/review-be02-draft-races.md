# BE-02 draft persistence and race review

<!-- AIDEV-NOTE: This bounded static review is not execution evidence; helpers and implementation SQL remain unreviewed. -->

Three P2 test defects were observed in 163 unique physical source lines: **18.40 defects/KLOC** (`3 / 163 * 1000`). These are gaps in what the assigned tests establish, not demonstrated failures of the draft implementation. Application/runtime verification is **NOT_RUN**. No claim of integrated acceptance or publication readiness follows from this review.

- Review date: 2026-10-13, Australia/Sydney.
- Run: `run_5cc7ae2ab900`.
- Task: `task_4cd10e0597a2`; dispatch: `ctx_937acb3541a9`.
- Governing contract: **1.0.0-collaboration.1**, especially sections 2-5 and the response-budget requirements.
- Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.

## Coverage and evidence boundary

One bounded review pass covered the following complete files. Physical counts include comments and blank lines. Counts and SHA-256 hashes were obtained before reading code; later rehashes matched. Rereading the same ranges did not expand unique coverage.

| Source path relative to `apps/server` | Inclusive lines | Unique physical LOC | SHA-256 |
| --- | --- | ---: | --- |
| `test/be_02/draft_database_test.rb` | 1-90 | 90 | `B0D7392BC04822C3CC1987479BF9C1442FC099B6A413C1EBEED70B529ED48352` |
| `test/be_02/draft_concurrency_test.rb` | 1-73 | 73 | `521F070700F80AD9FCB79ED1C273E3EDE9A5C36B38E803A7D8A2E2FDB073D89B` |
| **Total, pass 1** | | **163** | **Below 200/pass and 400/assignment** |

The full supplied review rubric was applied to this test slice. Context included root `AGENTS.md`, current/relevant sections of `README.md`, `state.md`, and `documentation.md`, `.planning/STANDARDS.md`, `.planning/README.md`, `.planning/AGENT_ORCHESTRATION.md`, the accepted `.planning/consultations/results/be-02/decisions.md`, and these published handoffs:

- `docs/completion/be02-implementation-brief.md`
- `docs/completion/be02-cd-contract.md`
- `docs/completion/be02-drafts-implementation.md`
- Relevant helper and lock-observation interfaces in `be02-db-test-repairs.md`, `be02-db-race-fixes.md`, `be02-runtime-harness.md`, `be02-write-boundary.md`, and `be02-session-database-interface.md`.

The AIDEV search found the note at `draft_concurrency_test.rb:54`: the admin connection is the blocked mutator and must be inspected through an independent connection. Its intent is appropriate; finding DR-01 addresses the strength of that observation. No existing anchors or sources were modified.

All implementation SQL, migrations, controllers, services, serializers, authorization code, and helper implementations are **UNREVIEWED**. The fixture DML written inside these two tests is included in the 163 lines; the underlying product SQL is not. Documentation is context, not proof that its claims hold.

## Findings

### DR-01 — P2: compose-revocation barrier accepts an unrelated lock wait

**Location:** `apps/server/test/be_02/draft_concurrency_test.rb:55-62` (test starts at line 42).

The observer checks only that the admin backend reports `wait_event_type == "Lock"`. It never verifies that the transaction on `@api` is a blocker. Therefore the observation is insufficient to establish the test's stated causal claim that the guarded save holds up compose removal.

**Concrete failure scenario:** the intended write/revocation guard coupling regresses, while another transaction or an incidental fixture lock blocks the admin connection. The loop accepts that wait, commits `@api`, and eventually lets removal finish when the other blocker releases. The later permission-denial and version assertions can all succeed without having demonstrated the intended serialization. This is a false-positive path in the test, not a claim that such a blocker occurred during this review.

**Minimal fix:** in the independent observer, require both a lock wait and `@api.backend_pid` among `pg_blocking_pids(@admin.backend_pid)` before committing. Retain the bounded monotonic deadline and cleanup. Reuse an existing bounded observation helper if its published contract can express waiter and expected blocker, rather than adding a new concurrency abstraction.

**Regression:** run the intended holder/waiter case and an unrelated-blocker case; the latter must not satisfy the barrier. A deliberately removed guarded-save/revocation coupling must make the intended race test fail. Execute against the isolated PostgreSQL roles in Docker; no such execution occurred here.

### DR-02 — P2: the expiry test supplies the lifetime it should verify

**Location:** `apps/server/test/be_02/draft_database_test.rb:56-67`.

Immediately after saving, the test overwrites both `recorded_at` and `detail_expires_at` with its own 604800-second interval. It never checks the timestamps originally produced by the save. It also does not establish a just-before or exactly-equal boundary: lookup runs in a later statement, after the expiry timestamp assigned by the update.

**Concrete failure scenario:** the implementation initially records a one-day or eight-day lifetime, or refreshes the lifetime on retry. Those contract violations can pass this test because the test installs correct expiry metadata before looking. An implementation using `now > detail_expires_at` instead of the required `>=` also passes the shown after-expiry sequence.

**Minimal fix:** before fixture expiry manipulation, assert that the original terminal timestamps differ by exactly 604800 seconds and remain unchanged after an identical retry. Apply that check to applied and terminal-conflict records. Add deterministic just-before/equal/after evidence using an available controlled-time seam; if none exists, leave exact equality explicitly unverified instead of labeling the current after-expiry sequence an exact-boundary check.

**Regression:** incorrect initial duration, retry-based extension, and a strict-greater-than expiry predicate must each fail the strengthened tests. Preserve the existing before/after-compaction assertions that expired IDs produce `operation_mismatch` without increasing the draft version.

### DR-03 — P2: compaction test does not verify retention of the permanent digest and full binding

**Location:** `apps/server/test/be_02/draft_database_test.rb:64-68`.

After compaction the only direct ledger-field assertion is that `detail` is nil. The subsequent expired lookup and identical-save rejection establish useful behavior, but do not compare the retained identity, binding, and digest against their original values.

**Concrete failure scenario:** compaction corrupts or replaces the digest while preserving the operation's key, binding, and expiry. Lookup can still return `expired`, and reuse can still return `operation_mismatch` solely because the ID is expired. Every shown assertion can pass despite violating the contract's permanent digest-retention requirement. The same test also does not establish that all original detailed outcome/version fields have been removed if any are stored outside `detail`; the schema is unreviewed.

**Minimal fix:** capture the ledger's actor/org/operation identity, mailbox/draft binding, and digest before compaction, then assert their exact equality afterward. Using the actual schema in its separate review, assert that all detailed outcome/version storage is cleared and that a second bounded compaction leaves the tombstone unchanged. Keep this as a test change; no new retention subsystem is needed.

**Regression:** a compactor mutation that substitutes a different valid digest must fail. Where field layout allows it, retained detailed outcome/version data must also fail the retention-shape assertion. Continue to require expired-ID reuse rejection and no draft mutation.

## Checklist and bounded coverage assessment

The following records what is visible in the assigned code. “Present” means assertions exist; it does not mean the test ran or passed.

| Review area | Static assessment |
| --- | --- |
| Full replacement; nullable/empty content | Present at database lines 6-27: nullable display name, empty address, replaced subject/recipients, and later body preservation. Full payload-boundary validation is delegated to unreviewed tests/services. |
| Applied A replay after B, consumption, and reply removal | Present at database lines 6-27; original result is compared, current version/body are preserved, and operation lookup retains original applied version/state. |
| Durable conflict and non-repurposable operation | Present at database lines 30-41; records the conflict, creates the draft through another ID, replays the original conflict and checks unchanged metadata. |
| Priority: new reply scope before consumed before version | Present at database lines 44-53. These database helpers return code objects; HTTP 404/409 mapping is unreviewed. |
| Duplicate operation convergence | Concurrency lines 6-27 use two session digests, hold the first save uncommitted, call `wait_for_lock(contender)`, then require one version and one ledger row. Whether that helper identifies the correct blocker is unreviewed. |
| Distinct-operation contention | Concurrency lines 30-39 require one applied result and one conflict for two IDs. They call `parallel_api_calls`, but this slice contains no held-transaction/observed-wait barrier for this case; deterministic overlap remains unverified. |
| Revocation racing with a write | Save-first ordering is present at concurrency lines 42-66, with the observation defect DR-01. Revocation-first ordering is absent from this slice. |
| Exact expiry, non-extension, retained tombstone | After-expiry rejection before/after compaction is present; DR-02 and DR-03 limit the stronger claims. |
| Version maximum and compaction maximum | Database lines 81-88 check 2147483647 exhaustion, no new visible operation and unchanged draft/ledger count. Line 69 rejects compaction limit 1001; lower/null limits and worker role permissions are outside this slice. |
| Operation scoping and privacy | Database lines 72-78 assert an exact unknown shape and reject another draft binding. Despite the test name, they do not vary actor/org/mailbox. Foreign-scope enforcement is described in the unreviewed authorization suite. |
| Exact operation wire variants | Unknown is checked exactly; applied lookup excludes digest/body but not every forbidden content/extra field. Expired projection is checked only by outcome. Serializer shape verification is unreviewed. |
| Transaction abort and isolation | Rollback appears as cleanup, not an asserted abort scenario. Atomic rollback of draft plus ledger, an in-flight unknown lookup, and read-snapshot isolation are not established by these files. |
| Lost response/crash uncertainty | Existing replay assertions are useful component evidence. No client-response discard, disconnect, or crash boundary is exercised in this slice. |
| Inputs, permissions, secrecy | SQL fixture values are parameterized; no literal credentials or secret output were observed. Actual boundary sanitization, grants, session validation, and authorization remain outside coverage. |
| Error propagation and cleanup | Threads disable automatic exception reporting but successful paths retrieve `Thread#value`; transactions have rollback cleanup. Helper timeouts, teardown behavior, and connection lifecycle guarantees are unreviewed. |
| Naming, comments, design, performance | Focused tests and an explanatory AIDEV note; no new product abstractions here. The bounded polling loop is intentional. Formatting belongs to linters; product hot-path queries cannot be assessed from these tests. |
| Documentation and standards | The implementation handoff accurately labels execution NOT_RUN. Its “seven-day expiry” and observed-lock claims need the qualifications above. Deterministic critical races and failure-path evidence required by STANDARDS remain partly unverified. |

## Independent evidence still needed

These are explicit bounded-review gaps, **not additional counted defects in unseen code**. The coordinator should map them to other reviewed tests before concluding they are missing globally.

1. **Deterministic distinct-operation race:** confirm what `parallel_api_calls` guarantees. Threaded or simultaneous starts alone do not prove overlapping database transactions. A held first transaction plus an observed second waiter and separate IDs would provide direct evidence while preserving one applied/one terminal conflict assertions.
2. **Revocation-first ordering:** arrange revocation to win the authoritative guard, then release a waiting save and require denial with no draft/ledger mutation. Exercise lookup as well as replay after loss of compose. Preserve contract priority: revoked local session is 401; stale context/authorization is 409; an otherwise current hidden/unavailable scope is generic 404. Do not force every revocation into one status.
3. **Abort/crash before commit:** hold an uncommitted draft and ledger write, observe from an independent authorized connection, then roll back or terminate the writing connection. Verify through a new connection that neither record persisted and that retrying the same ID applies exactly once. An in-flight `unknown` must never be treated as proof that the write cannot later commit.
4. **Commit with lost response:** commit and deliberately discard the response, reconnect and reconcile the same operation ID. Include later save B before reconciliation of A; require A's original outcome, B's current content, and no new increment or replacement operation ID.
5. **Actual role, isolation and HTTP verification:** helper transaction isolation and generation guards, actor/org key separation, exact 200/401/404/409/503 envelopes, generic errors, no-store headers, and 4096-byte save/lookup/error budgets require their own reviewed and executed evidence. Full-draft/list budgets remain 2 MiB/256 KiB; no alternate limit or wire shape is proposed by this review.

## Published dependencies, all unreviewed

| Interface described by the handoffs or used here | Review boundary |
| --- | --- |
| `DraftDatabaseTestCase` / `draft_database_test_helper.rb` | Extends the foundation fixture with API/worker/admin connections, normalized payload creation, save/lookup calls, ledger/draft inspection and teardown. Neither its code nor the parent fixture was inspected. |
| `begin_write`, `write_guard`, `save_sql`, `save` | Caller-held protected transaction and guarded-save convenience interfaces as used by these tests. Actual isolation, SQL errors, commit/rollback handling and result conversion are not verified here. |
| `with_api_connections`, `parallel_api_calls`, `wait_for_lock`, `fixture_change` | Connection/concurrency/guarded-fixture interfaces. A name is not evidence of a blocker-identity assertion or deterministic transaction overlap. |
| `app.save_draft` and operation lookup | Published contract promises same-transaction draft/ledger writes, current authority before replay, and scoped metadata-only reconciliation. Implementations are unreviewed. |
| `app.compact_draft_operations(limit)` | Published worker-only function accepts 1..1000, defaults to 100, uses bounded skip-locked compaction and retains permanent identity/binding/digest. Implementations and privileges are unreviewed. |
| Controllers, `SessionWrites`, protected-write/read boundary | Published interfaces own transaction completion, coherent read snapshots, serialized terminal responses and failure rollback. Their behavior is not inferred as passed from these tests. |

## Executed evidence and handoff

- Executed: read-only source/document inspection, AIDEV search, physical line counts, SHA-256 hashing and Orca coordination. Material findings were reported through status message `msg_61e572d92c56`.
- **NOT_RUN:** application tests, Docker, host application execution, mutation tests, SQL execution, lint, typechecks, integration, HTTP, frontend and visual QA. No runtime pass/fail result was produced.
- No subagents, model calls, ultrareviews, SSH, commits or implementation edits. No Docker resources were created, so this dispatch has no Docker cleanup to perform.
- The only authored file is this assigned report. Source and other workers' files were preserved. Coordinator-owned `code-reviews.md`, state and documentation updates remain with the coordinator.
- Defect accounting: **3 observed P2 test defects / 163 unique physical LOC = 18.40 defects/KLOC**. No product implementation defect is asserted by this slice; absence of an observed implementation defect is not proof of correctness.
