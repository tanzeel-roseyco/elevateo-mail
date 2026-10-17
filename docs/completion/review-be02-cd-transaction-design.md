# BE-02 C/D transaction design review

One medium performance defect was observed in draft-operation compaction. No additional correctness or authorization defect was observed in the assigned SQL under the published protected-write interface. This is a bounded static review, not runtime acceptance or proof of correctness.

- Run: run_5cc7ae2ab900; task: task_31bf7d0e80f2; dispatch: ctx_042bec6c0c3f.
- Source: C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex.
- Contract: 1.0.0-collaboration.1; accepted BE-02 decisions D01-D08.
- Review mode: independent adversarial Codex, dedicated transaction/design assignment.
- Runtime, SQL execution, EXPLAIN, Docker tests and application tests: **NOT_RUN**, as required by this dispatch.
- Obsidian: unavailable. The interleavings below are analytical simulations recorded here; no Obsidian connection or executed simulation is claimed.
- Defects: **1** (medium: 1; high/critical: 0 observed). Unique physical code lines: **326**. Observed density: **1 / 326 * 1000 = 3.07 defects/KLOC**. This measures findings in this assignment, not remaining defects or overall product quality.
- Source was not changed. Only this assigned report was written.

## Coverage and evidence

Counts and SHA-256 hashes were obtained before source inspection. Pass 1 covered 189 physical lines; pass 2 covered 137 physical lines. Each pass stayed below 200 lines, and the assignment stayed below 400 unique lines. All lines, including blank lines and comments, are counted; there is no overlap. A second count/hash check at 2026-10-13 09:55:34 +11:00 matched the initial inventory.

All paths in this table are relative to apps/server in the source workspace.

| Pass | File | Inclusive range | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | db/be02_drafts/save.sql | 1-87 | 87 | 9709C44E1FB4FA981AC2DC96C199869C11DE00A7D5A4F2FACD715B105BC4A815 |
| 1 | db/be02_drafts/operations.sql | 1-46 | 46 | 09EB3AAD0B4B868BB946AB828D73EE3885A1B89E77756FF3C69A0504F5735B42 |
| 1 | db/be02_memberships/mutation.sql | 1-56 | 56 | 3AE401E7954A8A7F3F41623AB80304A897DE2AAF135ADBF27BC2B0C4D169D7F1 |
| 2 | db/be02_drafts/tables.sql | 1-45 | 45 | C2C507D3D301703ECA1091B7E5243242BBDB76B3FFE6E1F592FAD362F4947CF1 |
| 2 | db/be02_drafts/policies.sql | 1-30 | 30 | 059696491B0BEE3F60D6E7DB665E10EEAEC2CEFED85CB02D4BC02DF9A35A38C7 |
| 2 | db/be02_drafts/scope.sql | 1-12 | 12 | 0412B8A8F12BA7CFE5FC05D8B3208E5801E1C731CA3987E3F25C36B5250D22E2 |
| 2 | db/be02_drafts/grants.sql | 1-10 | 10 | 5BEF9B13237E5DFB7D0EA53D6AD87988370847A58136079CDC5DA7087D642058 |
| 2 | db/be02_memberships/revision.sql | 1-23 | 23 | CF44EC8A1A45D80FF4FB308A584BC8E15CD6A413C9C9F8ED2C65BADE01E40902 |
| 2 | db/be02_memberships/grants.sql | 1-17 | 17 | 46DD7A4203481153E7414B34AB729BCCAE08E135F6B3962127BD7B64ADFB469D |
| | Total | | 326 | |

Context included governing AGENTS.md and STANDARDS.md, current-state sections of README.md, state.md and documentation.md, planning/orchestration guidance, be02-implementation-brief.md, the C/D contract, draft implementation notes, membership/search implementation notes, write-boundary interface notes and accepted consultation decisions. Large historical ledgers were used for relevant context, not counted as additional source coverage. Assigned AIDEV anchors were read, including conflict commit intent, permanent ledger identity and the separation between revision and generation triggers.

Executed evidence consists of read-only document/source inspection, physical line counting, SHA-256 comparison, Orca reporting and official PostgreSQL documentation lookup. No parser, linter, test suite, database transaction, lock observation or query plan was executed. Formatting is left to linters. No other agents or model calls were made.

## Finding DTX-01 — Medium: compaction row limit does not bound expiry scanning

**Location:** apps/server/db/be02_drafts/operations.sql:37-38. The relevant existing index is in db/be02_drafts/tables.sql:40-41.

**Concrete failure scenario:** The ledger contains a large seven-day window of non-null detail records, all with future expiry, and the compactor is called with limit 100. Its predicate compares detail_expires_at to clock_timestamp() separately during scan evaluation. That volatile comparison cannot serve as an index scan condition; even an ordered scan of the existing partial expiry index cannot use the time comparison as its stopping bound. With no qualifying expired record, the query can examine every retained non-null detail row before returning zero. Frequent empty sweeps therefore scale with the retained detail population, consuming database work and potentially exceeding the maintenance job's time allowance despite a small batch limit. The actual plan, duration and timeout behavior are **NOT_RUN**; the absent scan bound is the static finding.

PostgreSQL documents that volatile expressions are reevaluated as needed per row and are unsuitable as index scan conditions because the comparison value would otherwise be evaluated once. It also documents that clock_timestamp() changes within one statement. This supports the plan-bound inference above, without claiming a measured plan. Sources: [PostgreSQL function volatility](https://www.postgresql.org/docs/17/xfunc-volatility.html), [PostgreSQL current date/time functions](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).

**Minimal fix:** Capture clock_timestamp() once in a local timestamptz cutoff before the batch SELECT, then compare detail_expires_at <= that variable. Keep the existing partial index, validated batch limit, FOR UPDATE SKIP LOCKED and identity-preserving update. No new storage, queue or architectural change is needed.

**Tradeoff simulation:** At cutoff T, rows with expiry <= T are eligible in this batch. A row expiring while the batch executes remains for the next batch. Logical lookup expiry remains exact because draft_operation checks wall-clock expiry independently; save also rejects an expired operation independently of compaction. A per-batch cutoff trades negligible physical cleanup delay for an indexable expiry bound without changing replay safety.

**Regression required:** In the coordinator's Docker PostgreSQL environment, seed a substantial non-null, wholly unexpired detail population, update statistics, and compare the actual batch SELECT plans before/after the fix. Confirm the cutoff is usable as an index condition and a zero-expired sweep does not filter the entire recent population. Separately cover a mixed expired/unexpired set, exactly-at-cutoff eligibility, at-most-limit updates, locked-row skipping, concurrent compactors and preservation of identity/binding/digest/timestamps. Confirm null/0/1001 limits fail and 1/1000 remain accepted. Avoid a fragile wall-clock-only performance assertion.

**Standards relevance:** The review rubric requires identifying repeated unnecessary work and bottlenecks; the accepted design calls for bounded maintenance. The mutation count is bounded today, but scan work is not bounded by expiry.

This finding was reported promptly to the coordinator through Orca status message msg_557b775b53a2.

## Analytical transaction interleavings

The following are reasoned schedules, not executed concurrency evidence. W denotes a protected write, R a revoker, C a compactor. The foundation's published lock/proof and trigger behavior is an assumption explicitly isolated below.

### 1. Concurrent duplicate save operations

A and B have the same actor, organization, operation ID, binding and digest. A obtains the session/generation guards and then the operation and draft advisory locks (save.sql:17,34-35). B waits on a shared authority guard or the operation lock. A writes version v+1 and the terminal ledger in the same transaction (71-83); its serialized response must validate before commit. After A commits, B observes the ledger and returns its original result (39-51), without applying another increment. If A aborts, neither the new draft version nor ledger survives, and B can perform the single write.

Theoretical property: one committed transition per operation identity, with outcome and mutation atomic. Practical cost: existing generation guards serialize writes sharing an actor, while advisory hash collisions can cause extra waiting without merging keys or changing identity comparisons. That cost follows the accepted revocation protocol; this review proposes no replacement lock architecture.

### 2. Same key, different payload or binding

A wins with digest X. B acquires the same operation key after A commits but supplies digest Y or a different currently authorized draft/mailbox binding. B hits operation_mismatch before current version/state or new reply-target validation (save.sql:43-45). The original ledger is not replaced. If B requests an existing foreign-owned draft, the scope check precedes ledger inspection and produces generic not_available instead, preserving the contract's disclosure priority.

For an identical replay, a subsequent save B, consumed state or removed reply thread does not invalidate A's original terminal outcome: ledger handling occurs before those current business checks. A previously recorded conflict remains the original conflict. This depends on the external caller supplying the contract's canonical digest, not an arbitrary client digest.

### 3. Revocation waits versus writes

If W holds the actor generation/session guard first, R waits while W performs DML and validates the serialized response. W can commit before R; revocation is ordered after that committed write. If R commits first, W obtains the guard afterward and must see current revocation/generation metadata through the published proof. A revoked session maps to 401 before a stale-context 409; scope/capability loss with otherwise current context gives generic 404 before business outcomes.

The assigned save code calls the proof and rechecks scope after advisory waits (17-23,36-38). Membership mutation checks proof before its business lock and repeats actor-manager/target checks after that wait (12-28). These are compatible with the published ordering. Actual lock acquisition, expiry behavior and generation propagation reside outside this assignment. Read-only operation lookup follows the documented protected-read snapshot allowance: one coherent pre-revocation response may already be in flight.

### 4. Terminal detail expiry and physical compaction

A terminal record is stored at T with expiry T+604800 seconds. Before expiry, authorized lookup returns the original detailed outcome. At or after expiry, lookup returns expired regardless of whether C has run (operations.sql:18-23), and save reuse returns operation_mismatch even for an identical digest (save.sql:43-45). C clears only detail (operations.sql:35-43), leaving the permanent primary key, actor/org identity, binding, digest and timestamps.

If C commits while a repeatable-read lookup still sees the old detail, the lookup's wall-clock expiry branch prevents exposing that old detail after its deadline. C cannot turn an expired operation into unknown or executable again. Multiple compactors skip locked rows. The permanent ledger deliberately grows with operation identity count; no purge is recommended because it would violate the accepted no-reexecution guarantee. DTX-01 concerns scan work, not tombstone correctness.

### 5. Serializer abort before commit, including conflicts

W performs draft DML and ledger insertion, or inserts a terminal conflict ledger with no draft change. If response serialization raises, violates the closed shape, exceeds the actual 4096-byte response budget or otherwise fails before commit, the published boundary rolls the transaction back while guards are still held. A waiting retry then sees the pre-write state. Conversely, a properly serialized terminal 409 must commit its conflict ledger; raising every conflict would incorrectly erase that terminal outcome.

The SQL's terminal-conflict return and AIDEV comment support this required distinction (save.sql:1,67-85). Membership revision and generation effects must roll back with the same transaction on serializer failure. No claim is made about the actual wrapper implementation, native deadline or commit-acknowledgment uncertainty; those are independent review interfaces.

### 6. Last two managers departing

A and B are the final two active explicit managers. Each requests self-removal using revision r. Their actor/target generation sets differ, but both need the same mailbox revision row (mutation.sql:19-23). A wins, verifies B remains, removes itself and advances the revision through the trigger. B then obtains the business lock and sees revision r+1, so its old request conflicts before no-op/business handling (29). If B retries with current authority and revision r+1, the remaining-manager check prevents B from leaving (34-38).

If managers instead target each other, the foundation's sorted actor/target guard acquisition serializes overlapping guard sets before the same business lock. Counting only managers still in the organization is essential and appears in the assigned remaining-manager query. Actual owner-policy visibility of all required rows is an unreviewed migration dependency; the code cannot be accepted from its SELECT text alone.

### 7. Target organization membership delete/re-add

A membership write W declares actor and target to the protected boundary. If target removal has acquired the same target generation guard first, W waits. On release, W must evaluate current target organization membership and actor manage authority, including after its mailbox revision wait (mutation.sql:16-28). If target absence remains committed, W returns not_found before any revision outcome, rendered as generic 404.

If removal and re-add both commit before W continues, W evaluates the newly current eligibility and current mailbox revision rather than a cached target boolean. Whether W succeeds or conflicts then depends on those current values; the contract does not require rejecting an otherwise current eligible target solely for having left and returned. The separate critical invariant is that authorization generations survive removal and are never recycled. The SQL relies on the foundation's persistent generation guards/triggers for that invariant. Regression evidence must observe the actual wait and generation increase, not just sequentially exercise deletion and re-add.

### 8. Self-demotion and response authority

A is a manager, B is another active manager. A changes its own capabilities to remove manage_members. Pre-write checks authorize A; the last-manager check permits the change because B remains. Membership DML advances revision and, through the existing foundation trigger, A's authorization generation. The second proof call after DML (mutation.sql:51-55) supplies fresh actor metadata for the response.

Requiring A still to manage members after its own successful demotion would make legitimate demotion impossible. The code appropriately separates pre-write permission from post-write identity metadata. The external presenter must sign that fresh authorization version; the client must clear protected caches/bootstrap. The next manage operation requires current authority and fails scope if permission is gone.

### 9. No-ops, ceilings and failure atomicity

With a matching mailbox revision, deleting an absent explicit row or replacing identical flags does not execute DML and does not advance revision/generation (mutation.sql:30-48). A stale revision conflicts even if the desired value matches (29). A true no-op at revision 2147483647 is allowed; an actual change at that ceiling returns temporarily_unavailable before DML (39). The revision trigger also rejects overflow for changes arriving through other authorized paths (revision.sql:15-17).

A new draft operation always increments, even for identical fields. The expected version is checked before writing, and a changing operation at the draft ceiling returns temporarily_unavailable before ledger insertion (save.sql:58-65). Empty subject/body and an empty valid recipient list remain legal; null required scalar inputs are rejected. The exact recipient validator and HTTP numerical/UTF-8 validation remain external dependencies.

## Checklist and unreviewed interfaces

| Area | Static assessment / boundary |
| --- | --- |
| Purpose and scope | Assigned routines implement draft replay/expiry, mailbox capability mutations and revisions; no extra backend or speculative feature was introduced. |
| Null/empty/max inputs | SQL guards cover required nulls, negative expected versions, draft string ceilings, compaction limits and version exhaustion; empty draft content is permitted. Recipient element validation is external. |
| Authority and disclosure | Scope before draft ledger, manager/target checks before membership conflicts, current proof calls and narrow execution grants are present. Full deployed RLS and owner privileges were not executed. |
| State consistency | Draft and ledger share a transaction; membership trigger owns mailbox revision and existing foundation trigger owns authorization generation. Trigger interaction needs integration evidence. |
| Concurrency | All requested races were simulated above. Lock order follows the documented interface; no live waits or deadlocks were tested. |
| Closed wire shapes/status priority | SQL returns metadata, not draft content or digests in terminal outcomes. HTTP 400/401/404/409/503 ordering, closed error envelope and request IDs belong to external presenters/boundary. |
| Response budgets | Relevant contract caps: draft PUT request 1048576 bytes; draft save/operation lookup/membership mutation responses 4096; membership PUT input 8192; full draft GET 2097152; summaries 262144; roster 131072. SQL detail is capped at 2048 bytes; this does not prove final envelope size. Actual escaped-byte enforcement is external. |
| Security | Fixed search paths, qualified references, forced RLS declarations, private ledger access and runtime grant restrictions appear in scope. Full migrations, policies and bypass checks remain unreviewed. |
| Simplicity/comments | Helpers retain bounded responsibilities; AIDEV comments explain conflict commit, identity retention and trigger ownership. No actionable duplication or over-engineering observed in this scope. |
| Performance | DTX-01 observed. Mailbox revision serialization protects the invariant; broader throughput tuning would need workload evidence. |
| Tests/docs | Relevant implementation and boundary documentation exists and lists happy-path/failure/concurrency tests. Test bodies were outside the assignment and were not inspected; inclusion and adequacy are therefore documented claims, not verified tests. |
| Formatting | Deferred to linters; no formatting findings. |
| Standards | Static review applied correctness/security/maintainability and boundary-validation requirements. Runtime/type/lint/visual acceptance is outside this dispatch. |

The following dependencies were not source-reviewed and are not included in the 326-line denominator:

1. Protected-write controller/helper, begin_protected_write and assert_protected_write: published interface is cookie-bound proof, READ COMMITTED, session then sorted distinct actor/target generation locks, current post-wait authority, serialized WriteResponse validation before commit, terminal 409 commit and deliberate rollback. The native deadline is independently reviewed; no native code was read.
2. Existing authorization generation triggers and organization/session revocation routines: expected to share guards, retain generations across deletion/re-add and bump affected users atomically. The assigned revision trigger explicitly relies on them.
3. Membership table/policy migration and membership_version/roster read functions: expected to make the appropriate mailbox and all relevant current organization members visible to the authorized owner while denying runtime table DML. Only the assigned grant postconditions and draft policies were inspected.
4. Draft recipient validation, canonical payload digest, request parsing, services/controllers and serializers: expected to enforce exact canonical content, Unicode/input bounds, closed field sets, status mapping, current request IDs, context/version proofs and actual serialized-byte caps.
5. Full draft/list projections, membership roster/search, migration loader/down paths, database foundation and all tests: unreviewed. Their published behavior was used only where required for this SQL design review.

The coordinator should fix DTX-01, run the documented Docker regression suites and verify the protected-write/RLS/generation integration before recording application acceptance. Zero additional observed findings in this limited static scope is not evidence that the unreviewed areas or runtime behavior are defect-free.
