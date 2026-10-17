# BE-02 C/D protected-write design review

<!-- AIDEV-NOTE: Findings bind to the hashes below; active implementation changes require separate verification. -->

Review date: 2026-10-13 Australia/Sydney (2026-10-12 UTC). Reviewer: dispatched Codex design reviewer, task `task_19d230b2a629`, dispatch `ctx_d911905b9c06`. Read-only implementation root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. Only this report was edited.

## Result and evidence limits

**One medium-severity deadline invariant gap; no confirmed high/critical defect in the inspected slice.** The private transaction marker and sorted authorization guards are a reasonable design for this contract. This is a bounded source review and analytical simulation, not acceptance of the application or an executed concurrency/security test. Active C/D implementation, unreviewed downstream code, and missing runtime evidence are not counted as defects merely because they are incomplete.

The full supplied adversarial rubric was applied to the bounded targets. Formatting belongs to linters. No Docker, SSH, host application tests, agents, paid sessions, ultrareview, commits, production actions, or root state edits were performed. Test filenames were inventoried, but their contents and results were not reviewed. No test-pass or complete test-coverage claim is made.

**Obsidian connection discovery currently exposes no available tool.** Discovery returned zero matching tools. The requested tradeoff simulations are saved locally in this report; no Obsidian execution or synchronization is claimed.

## Snapshot and exact coverage

The final inspected file bytes were captured and hashed from the same in-memory read at approximately `2026-10-12 22:29:08 UTC`. These hashes identify observations, not a stable release. Source writers were active throughout.

Pre-delivery drift check at approximately `22:33:07 UTC`: the three SQL files and controller still matched the inspected hashes. `session_writes.rb` had changed to SHA-256 `7d7ddb8c1a2e8167da2faab5e8e10682965ad40333408387c1018cda9815e0dc`; those newer bytes were not reviewed. WD-01 describes the inspected snapshot and awaits repair verification; this report does not assert that it persists in the newer working file.

| File beneath implementation root | Exact inspected LOC | SHA-256 |
| --- | ---: | --- |
| `apps/server/db/be02_writes/guard.sql` | 1-53 (53) | `a28b91e0b23016bc28ab6974da45ccf0af9efbceebe757a1948c2d9cea7d2fb4` |
| `apps/server/db/be02_writes/assertions.sql` | 1-18 (18) | `9b4dee564c225213135e7d16b421436d3262126e6b9f98975b4694efeb29ba8b` |
| `apps/server/db/be02_writes/grants.sql` | 1-33 (33) | `e46f8fbf6898e91cdb1120b0c504dd2f4bccdd6b121d97223209a7ce6cef736d` |
| `apps/server/lib/elevateo/session_writes.rb` | 1-70 (70) | `39de35f0136b1d9226995ebcace275c00b82c82e8395e3f9c6d885acff1afa5d` |
| `apps/server/app/controllers/v1/write_controller.rb` | 1-48 (48) | `a8755e7dfe2c279209d2fb5f242bec628c604a62a78c0c2a489e47ea1e7b6d10` |

Initial pass 1 covered the three SQL files plus the original 66-line `session_writes.rb`: **170 LOC**. Pass 2 covered the controller: **48 LOC**. A separate **70-LOC** reinspection covered the updated session wrapper after four proof-validation lines were added. Each pass is below 200 LOC; even counting the entire reread again, total code inspection is **288 LOC**, below 400. The distinct final snapshot has **222 physical LOC**, including comments and blank lines. The original session-wrapper SHA-256 was `f3d0205ee8258d2bdf337e33b0b5a4d78705c773332d11828ffdc41b2a7fc0e3`.

Defect count: **1** (critical 0, high 0, medium 1, low 0). Defect density: **1 / 222 x 1,000 = 4.50 defects/KLOC** of distinct inspected final code. Initial-snapshot density was 1 / 218 x 1,000 = 4.59/KLOC. Repeated reads are not used to dilute the density. These metrics describe this sample, not the repository.

Context, excluded from the code denominator:

- Canonical `docs/completion/be02-cd-contract.md`, 161 physical lines, SHA-256 `2f37e8ecb60f40a17ab2e1f6edbbda64bf5f0312c38c55161f20f6abde87426e`.
- Accepted `.planning/consultations/results/be-02/decisions.md`, especially D02/D03/D05/D07/D08, SHA-256 `173f9088cb548076a5a8d04ce87573f000338789744e92567bd7fa915de680f9`.
- `.planning/STANDARDS.md`, SHA-256 `7c01430086ed2dc263c8edcb1b2a9f41b572a23a11b36c1179be802e2874bd10`, plus current project workflow/state documentation.

## WD-01 — Medium: the transaction has no database-enforced remaining-request deadline

**Exact location:** final `session_writes.rb:16-39,51-61`; original snapshot `:16-35,47-57`. The timeout setup assigns `statement_timeout` once, before the guard call, and only checks the request deadline around the business block and response verification. `with_connection` uses no explicit remaining-request checkout bound in this slice. The final check precedes transaction commit.

**Why this is a defect:** contract section 2 and decision D05 require a total ten-second request bound covering Auth, transaction and serialization. A statement timeout starts afresh for each SQL command and a lock timeout applies to each lock acquisition. Neither is a cumulative transaction budget. The inspected wrapper therefore does not establish the required database transaction lifetime bound. PostgreSQL documents these distinct timer scopes in [client connection defaults](https://www.postgresql.org/docs/17/runtime-config-client.html).

**Reproduction by deterministic schedule, not executed here:** start with a valid session/context and an absolute request deadline at t=10.000; reach `acquire` at t=9.000, giving approximately 1,000 ms to each SQL statement. Let the business block issue two consecutive 800 ms statements. Both individually satisfy the configured limit. The second finishes near t=10.600, then the wrapper detects expiry and rolls back. The guard locks were retained beyond the contract deadline. Pool contention before acquisition and commit after the final check are additional intervals not bounded by this setting. An authorized test owner can reproduce the database portion with controlled barriers or sleeps inside a disposable Docker test.

**Qualification about the HTTP boundary:** the foundation writer reported an inherited `RequestDeadline.within` implemented with Ruby `Timeout` around the whole action. That code is outside this review's source coverage. The finding is not a claim that every HTTP request lacks an outer timer; it is that the inspected transaction lacks a safe database-enforced cumulative bound. Asynchronous Ruby interruption needs a demonstrated cancel/rollback/discard path before pool reuse. The writer agreed that the inherited timeout alone is not a safe transaction guarantee. No unauthorized committed write, leaked connection, or runtime overrun was observed by this worker.

**Impact:** an authorization guard can remain held too long, delaying writes and revocation, or the application must rely on an unproven asynchronous interruption path. Classify as an availability/deadline invariant defect, not a demonstrated privilege escalation. Eventual rollback after the block is useful but does not meet the walltime requirement.

**Smallest repair and tradeoff:** retain this shared write boundary; carry its existing monotonic deadline through pool checkout and database work. On a verified PostgreSQL 17-or-later pin, arm transaction-local `transaction_timeout` from the remaining request budget before protected work, retain tighter statement/lock limits, and fail immediately if no budget remains. Bound checkout explicitly. Ensure cancellation or database termination leads to rollback or physical connection discard before reuse, with no automatic retry. Avoid adding a second transaction framework. Recomputing only `statement_timeout` before every statement improves SQL dispatch bounds but does not cover idle Ruby work or commit. An outer waiter timeout without database cancellation only hides the continuing work.

The writer's proposed repair is to mask only the request-deadline exception while owning the connection, use native transaction timeout, explicitly bound checkout, and safely check in/discard afterward. This is a proposal, not reviewed repaired code. Verify the actual server supports the setting, timer setup consumes the remaining budget correctly, and connection creation/network failure/scheduler latency are accounted for honestly. Native transaction timeout terminates the session; it requires connection recovery. A lost commit acknowledgement remains outcome-unknown even when a timeout is returned.

**Required regression evidence:** two individually short statements exceeding the combined budget; lock waits; exhausted pool; expired-before-entry; cancellation during a query and commit; serializer failure; and a subsequent unrelated request proving no open transaction, stale tenant state, or poisoned adapter was returned to the pool. Run these through the real inherited action boundary and database adapter. Test success as well as failure.

**Communication:** first finding sent to coordinator (`msg_2cc2c76e6fb0`) and foundation writer (`msg_28c960b9373a`) at approximately 22:25 UTC; repair conditions sent in `msg_4938db24fb6a`. The writer acknowledged the issue and described an in-progress repair. WD-01 remains open for the inspected hashes until that repair and its failure-path tests are reviewed.

## Local interleaving simulations and design tradeoffs

The following are explicit analytical schedules. They neither execute SQL nor certify helpers outside the five reviewed files.

### 1. Auth HTTP before locks; no cross-service atomicity claim

`write_controller.rb:30` authenticates before invoking the transaction at line 31. Session acquisition and SQL proof checks then precede the yield. This satisfies the visible call-order requirement and avoids holding database locks during the ordinary Auth request.

Schedule: Auth accepts actor A; an upstream ban occurs; the application starts its SQL transaction. The database must still check local/session policy, but cannot make the earlier HTTP result atomic with a remote ban. The accepted contract bounds this window with the request deadline. Moving Auth under the session lock lengthens lock occupancy and still does not produce a distributed atomic check. The passed Ruby block is not structurally forbidden from doing HTTP; instrumentation must enforce the rule, as D05 already recognizes.

### 2. Revocation wins before a write obtains its generation guard

Let W be a write by A and R a membership change by manager M targeting A. R locks its own session, then affected generation tuples in sorted order. R owns A's tuple, changes membership, bumps A's generation, and commits. W may already own A's session lock but waits on A's generation tuple in `guard.sql:29-34`. After R commits, W acquires it and executes the current authority recheck at lines 35-38. W must deny revoked scope or detect the changed context before business work.

`READ COMMITTED` plus the volatile guard supports a new snapshot after waits; a repeatable-read transaction could retain authority from before R. PostgreSQL explains [statement snapshots and locking behavior](https://www.postgresql.org/docs/17/transaction-iso.html), and [volatile functions obtain fresh snapshots for their internal queries](https://www.postgresql.org/docs/17/xfunc-volatility.html). The actual `session_status` and metadata predicates were outside coverage and must be tested to consume that fresh state.

### 3. Write wins before revocation

W holds A's session and generation tuple, checks current authority, changes business data, serializes the response, and commits. R waits on the same generation tuple and then revokes/bump-commits. W legally precedes R; a later response or later revocation cannot undo committed W. The essential condition is that every relevant authority change uses those same guards. SQL text in this slice supports the boundary, but does not prove every membership or organization mutation obeys it.

An existing protected read instead uses its accepted repeatable-read snapshot S. If R commits after S, one complete earlier response may finish within the deadline. Adding a second version read inside S cannot discover R. Rejecting all such responses would require a different, more expensive read protocol; that is not the accepted design.

### 4. Opposite actor/target order and previously missing guard rows

W1 affects actors X/Y, W2 affects Y/X. Both normalize to the same sorted user list in `guard.sql:26-34`, insert the first tuple if absent, then lock it before proceeding. W2 waits at that first tuple instead of owning the later tuple while W1 waits for it. This avoids the basic AB/BA cycle, including uniqueness waits when both tuples were previously missing.

Actor plus at most two targets gives at most three distinct guard tuples. Empty targets still include the actor; duplicates collapse. Null arrays/elements, more than two targets, and multidimensional targets are rejected. A single organization is fixed by the locked session, so sorting user IDs is sufficient within this transaction. Business locks must follow generation locks and have their own consistent order; that downstream proof is not covered. This is serialization for the guarded invariants, not a claim that all application operations run at PostgreSQL SERIALIZABLE isolation.

A global or organization-wide lock is simpler to reason about but unnecessarily couples unrelated actors. Optimistic version comparison without retaining a guard allows revocation between the comparison and DML. PostgreSQL SERIALIZABLE plus generic retries would add abort/retry complexity and still would not make Auth HTTP atomic. Keep the bounded explicit guard protocol.

### 5. Forged GUCs versus the transaction marker

An API caller sets `app.user_id` and `app.org_id` to a chosen identity and tries a membership helper without calling a successful guard. `assertions.sql:7-13` requires a matching session digest, non-null marker for the current transaction, matching actor/organization claims, and actor/target membership in the guarded array. A custom GUC alone supplies none of that private marker. Reusing a previous transaction's marker also fails. API execution of the assertion is revoked; the intended caller is the privileged membership routine.

The marker is private table data, bound to the current xid, rather than a custom setting that an API connection can freely fabricate. Persisting one marker per session avoids a separate request-proof ledger and expiry cleanup; the tradeoff is updating the session row on writes. Under the fixed target bound and pilot scope, there is no evidence that this needs a more elaborate structure.

This proves a successful database guard, not a signed receipt that Auth HTTP, CSRF or context-header checks happened. An API-role caller possessing an actually valid cookie digest and its bound identities can call the granted `begin_protected_write` function directly. HTTP proofs remain a trusted Rails-boundary responsibility at `write_controller.rb:14-30` and `session_writes.rb:23-30`. A helper must invoke the assertion before mutation and must honor its non-ok status; that downstream call chain is unreviewed. Do not advertise the marker as protection against a fully compromised Rails runtime holding valid session material.

### 6. SECURITY DEFINER scope and grants

Both functions explicitly use `search_path = pg_catalog`, schema-qualified tables/types/helpers, and no caller-supplied SQL syntax. The Ruby array literal is built from validated UUIDs and bound as a parameter. `grants.sql:2-6` revokes named/public execution and permits only API guard entry and owner assertion entry. Lines 15-30 check execute/grant-option drift, private-table exposure, and direct API membership DML.

These statements do not show actual function ownership, role inheritance, role attributes, RLS policies, migration atomicity, or ownership of called helpers. Acceptance must verify the intended NOLOGIN definer owner, no unintended superuser/BYPASSRLS or SET ROLE path, deliberate owner-versus-FORCE-RLS behavior, and effective policy coverage. SECURITY DEFINER runs with owner privileges; invoker policy expectations are insufficient. Function creation and public-execute revocation should be in one migration transaction so no public execution window exists. See [PostgreSQL's SECURITY DEFINER guidance](https://www.postgresql.org/docs/17/sql-createfunction.html). No owner/policy defect is counted without inspecting that evidence.

### 7. Durable terminal draft 409 versus rollback

At the business layer, save A discovers a terminal version/state conflict, records the operation outcome, and returns a `WriteResponse` carrying HTTP 409. In the reviewed wrapper, a normal return passes verification and exits the transaction normally; the controller renders only afterward. This permits a committed conflict ledger with an unchanged draft.

Alternative failure schedule: insert the terminal conflict record, then raise `CollaborationError` merely to select status 409. Exception unwinding rolls back that record, so a later lookup cannot recover the supposedly terminal decision. This is a required downstream check, not an observed defect: the draft writer was not inspected. Authorization, stale context, wrong scope, and operation mismatch should still abort without creating a terminal record. Returning all errors as commit-worthy values would be the wrong repair.

If commit succeeds but the caller disconnects or the commit acknowledgement is lost, the outcome is uncertain to that caller. Preserve the operation ID and reconcile through the ledger; neither 503 nor an absent lookup proves no write occurred. Do not retry the transaction automatically with new intent.

### 8. Self-membership change must project the post-DML generation

`session_writes.rb:31-33` constructs and passes the session before business DML. Suppose manager A submits a valid self-demotion at generation g, the membership routine updates capabilities and bumps A to g+1. Constructing the success envelope from that supplied pre-write session would incorrectly emit g. The membership writer must derive the actor's post-DML generation while still inside the guarded transaction and return g+1, as contract line 138 requires.

For a change to another actor, A's generation may remain g; for a true membership no-op, generations/revision stay unchanged. A blanket unconditional generation bump or wrapper-wide response rewrite would be unnecessary and could invalidate unrelated responses. Keep the final projection in the membership operation, alongside its atomic revision/generation update. That implementation is outside coverage, so this is an explicit obligation rather than a counted defect.

## Rubric checklist and remaining verification

| Area | Review conclusion / required evidence |
| --- | --- |
| Null, empty, maximum inputs | Controller validates guard array shape/count; SQL defends null, dimensionality and count; empty target list retains actor. UUID parser and all body/query/byte-limit implementations remain unreviewed. Latest wrapper explicitly requires string context/version before presentation validation. |
| Authorization ordering | Visible transport/proof shape checks precede Auth; locked database/session checks precede context/CSRF/business yield. Actual Auth/policy predicates and route resource authority must be proved by integration tests. |
| State and consistency | Marker requires current transaction and guarded identities. Correctness depends on shared generation-lock discipline and post-DML membership projection. Draft 409 commit path is structurally supported. |
| Maintainability / scope | One controller seam, one transaction wrapper and small guard/assertion routines have clear responsibilities. Small duplicated UUID validation defends both the controller and service boundary; removing it is not justified. Comments explain marker and ordering decisions. No speculative abstraction recommended. |
| Performance | At most three guard tuples; session-row serialization is deliberate. No unbounded loop found here. Shared session contention, actual query counts, indexes, connection pool load and vacuum cost were not measured. |
| Error and pool hygiene | Missing/non-WriteResponse results fail closed; swallowed Rails Rollback cannot become a success. Deliberate error mapping is visible. Native/Ruby timeout, disconnect, commit uncertainty and reuse need the WD-01 tests. |
| Tests | Present filenames include `write_boundary_input_test.rb`, `write_boundary_database_test.rb`, `write_boundary_controller_test.rb`, and `write_boundary_concurrency_test.rb`. Presence is not proof of assertions, happy/failure coverage, or passing execution. |
| Documentation / standards | Canonical contract and accepted decisions specify the invariants. No reviewed repair is claimed. Docker acceptance and required strict typing/lint gates remain with integration owners. |

Minimum acceptance matrix for the owner: successful valid write; missing/malformed/forged proofs; null/empty/over-limit target arrays; direct helper without a successful same-transaction guard; old-xid marker; both revocation/write orders using deterministic barriers; reverse actor/target lock order including absent guard rows; self-membership post-generation and true no-op; terminal draft conflict ledger surviving HTTP 409; normal exceptions rolling back; multi-statement deadline, cancellation/commit ambiguity and clean pool reuse. Also instrument Auth so any call under an application transaction fails the test.

Explicitly uncovered: `Tenancy.with_context`, `SessionStore`, `session_status`, session metadata/presentation, Auth adapter, inherited request deadline/API renderers, UUID/JSON/body/query parsers, `WriteResponse`, role/bootstrap/migration ownership and policies, C/D business helpers and SQL, operation ledger/replay/concurrency implementation, membership generation triggers/routines, tests' contents, actual PostgreSQL/driver/runtime pins, browser/client behavior, and all other downstream code. These need their assigned reviewers; this report does not expand into them.

Only this report is authorized for editing. The coordinator should incorporate the coverage and defect metrics into the project's central `code-reviews.md`; that file and root state documents were left untouched by this worker.
