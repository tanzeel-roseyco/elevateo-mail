# BE-02 protected-read design review

Review status: complete static review, including the coordinator's interface clarification on 2026-10-13. This is the dedicated adversarial design-tradeoff review for task `task_85e71ec5c577`, dispatch `ctx_be60eb6b7eb5`. Only this new report is writable by this reviewer.

<!-- AIDEV-NOTE: This review covers bounded source slices; simulations are analytical, not executed tests. -->

## Scope and evidence

The full review rubric supplied with the dispatch was applied to the assigned slices. Requirements came from `.planning/STANDARDS.md`, `docs/completion/be02-session-database-interface.md`, the dispatch's session interface summary, and the coordinator's answer to the bounded interface question. No other application implementation was inspected. Formatting is left to linters. All seven source hashes were rechecked unchanged before finalization.

Unique reviewed physical LOC includes comments and blank lines: **284**. Slice 1 contains **193** lines; slice 2 contains **91**. Both are below the 200-line slice limit, and the total is below 400. The actual files were shorter than the estimates in the dispatch. The test file was viewed only at lines 39-78; its final two assigned lines only begin another test and do not establish that test's coverage. SHA-256 values are whole-file byte hashes, including the test file whose contents were only partially reviewed.

| Slice | Assigned source | Exact reviewed range | Unique LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `apps/server/app/controllers/v1/read_controller.rb` | 1-61, entire file | 61 | `51564fc34c3373dd9299c2826326ab7a906d5fdb8a715cdfbaae71db49f05c8c` |
| 1 | `apps/server/lib/elevateo/tenancy.rb` | 1-82, entire file | 82 | `cadefac546c11c1fe119e9ff6b5fe66af6f39ab0b9a721989a085e46cc966a34` |
| 1 | `apps/server/config/routes.rb` | 1-19, entire file | 19 | `746906116c005d51b0ed9c0b96589a9f957824fea5583628b8d0bc7425f792b9` |
| 1 | `apps/server/config/application.rb` | 1-31, entire file | 31 | `15f3a2b5af260be13173b59fae34e72bb8ca27fe41eab952dfff51be76158fce` |
| 2 | `apps/server/sig/read_controller.rbs` | 1-15, entire file | 15 | `4b2d2e4c86156489ea91844b869666f741205ad016f15f0eb3aed9dd8917f18c` |
| 2 | `apps/server/sig/tenancy.rbs` | 1-36, entire file | 36 | `33f8443e543cf7a5e50f1f49e27f64baeac755032f8eeedb9f4ab03efc7c8ebb` |
| 2 | `apps/server/test/be_01_r1/tenancy_test.rb` | 39-78 only | 40 | `ea6f7e2dfd25358831f5e60ae771b7a3c4936b97079cefb2fc84ed7e80998c49` |

No application tests, typechecks, lint, Docker commands, SSH, paid models, subagents, commits, or live application requests were run. The source count/hash commands and report writing are not test execution. Obsidian is unavailable in the supplied tools; all concurrency and failure simulations below are **analytical**, not Obsidian execution or reproduced runtime results.

## Confirmed findings

Final count: **3 confirmed source/contract defects**: one P1 and two P2. Defect density is **10.56 defects/KLOC** (`3 / 284 * 1000`). This is a scoped static-review metric, not a repository-wide quality or runtime failure rate. Unexecuted validation and open implementation questions are excluded. Findings are ordered by priority; IDs preserve their reporting order.

### D3 - P1: canonical session organization can disagree with the RLS principal

Evidence: `read_controller.rb:22-28` constructs the tenancy principal from the earlier authenticated identity and then authorizes the SQL session inside that principal's frame. The coordinator confirmed that `authorize` checks supplied presentation context but does not compare its returned canonical `organization_id` with `identity.org_id`.

Consider a context-free read: authentication resolves organization A; a concurrent organization switch commits organization B before the protected snapshot; authorization returns the canonical session for B; the renderer receives that session while the connection still has transaction-local `app.org_id` A. The session authority and tenant data scope now disagree. This is a confirmed identity-fence defect from the assigned code and supplied interface facts, with an analytical interleaving rather than an executed reproduction. It can mix organization metadata with tenant-scoped reads; this report does not claim a demonstrated cross-user disclosure.

Smallest correction: compare the canonical session's organization with the authenticated identity before invoking the renderer and reject a mismatch with a deliberate `context_changed` response consistent with the API contract, normally 409. Keep the established principal unchanged for the transaction. Rebinding claims in an existing frame would undermine the frame's identity invariant and would not repair earlier snapshot work. Context headers are presentation hints and cannot replace this equality check on context-free reads.

Regression evidence needed: pause between authentication and snapshot acquisition, commit an organization switch on another connection, then resume a context-free read. Assert the mismatch error, zero renderer invocations, zero touches, no protected payload, and cleaned transaction-local claims; retain a matching-organization happy path. This P1 finding was sent immediately to the coordinator through orchestration before report completion.

### D1 - P2: reject a rolled-back read before touching session activity

Evidence: `read_controller.rb:25-43`, `tenancy.rb:43-64`, and the explicit nullable transaction return in `sig/tenancy.rbs:21-22,34`.

If authorization or the rendering block raises `ActiveRecord::Rollback`, the frame's `ensure` runs while its Rails transaction is still owned and open. Rails subsequently rolls it back and swallows that particular exception. Consequently, `with_context` returns `nil`, bypassing the String/size validation inside the block, and the controller still calls `read_sessions.touch` at line 41. The failed read can renew a still-valid session's idle activity, and `nil` proceeds toward the String serializer. This violates the intended ordering that touch follows a successful committed protected read. The [Rails transaction API](https://api.rubyonrails.org/v8.1.0/classes/ActiveRecord/ConnectionAdapters/DatabaseStatements.html#method-i-transaction) documents the swallowed rollback; the local RBS also acknowledges it.

Smallest correction: check that the transaction result is a String immediately after the connection block, before `touch`, and raise the existing internal-error path otherwise. Keep the generic tenancy helper's documented nullable behavior for its other callers. Do not move touch into the read-only transaction or add another authorization transaction.

Regression evidence needed: inject rollback during authorization and during the yielded renderer; assert a deliberate non-success API error, zero touches, no protected payload, cleared claims/frame, and a reusable connection. These scenarios were not present in the complete tests visible in this assignment. The coordinator confirmed that `api_serialized` rejects nil with an Auth error/503; therefore the current path can update session activity and subsequently fail serialization. The repair should use a deliberate internal-error response before touching activity.

### D2 - P2: the tenant connection interface omits required disposal

Evidence: `tenancy.rb:72` calls `connection.disconnect!` after loss of transaction ownership, but `sig/tenancy.rbs:16-25` does not declare that method on `_TenantConnection`, the argument type of `with_context` at line 34.

The implementation's critical cleanup operation is absent from its declared connection contract. A connection satisfying only that interface need not support disposal, and a strict implementation typecheck should flag the call when this method is included in the checked target. This is a confirmed declaration/implementation mismatch; no claim is made that a typechecker was executed or produced a particular diagnostic. The coordinator confirmed that this declaration is a known integration correction and that no strict typecheck has run for the new code. This does not establish a runtime failure in the real Rails adapter, which supports disposal.

Smallest correction: add the real adapter's `disconnect!` operation to `_TenantConnection` with the appropriate no-argument return signature, then run the established strict typecheck in Docker. Preserve physical-session disposal: merely clearing the Ruby frame after lost transaction ownership is insufficient. Use the existing ownership-loss regression if available; this reviewer did not read unassigned tests.

## Resolved interface facts and remaining validation

One bundled `orchestration ask` obtained these facts without widening source coverage. These are coordinator-supplied interface evidence, not independently inspected implementations:

1. `authenticate` uses checked session resolution and raises 404 for a live organization-null session or removed membership before constructing `SessionIdentity`; `org_id` is a String. The required no-org state therefore never reaches the non-null `Principal`, and this review does not count a no-org handling bug. The canonical organization comparison is absent, establishing D3.
2. `api_serialized` requires a String within the byte budget and otherwise raises an Auth error/503. `Sessions.touch` propagates denied/expired database results through its checked boundary. A failed touch therefore suppresses response output; it is not silently ignored.
3. `RequestDeadline` captures one fixed monotonic ten-second expiry. An around-action wraps the action in `Timeout.timeout(remaining, Expired)`, mapped to 503, alongside explicit checks. SQL statement/lock limits are three seconds/one second clipped to remaining budget; pool checkout retains its Rails configured timeout and relies on the outer request timeout for the overall bound. The design does not restart the budget at touch. Runtime interruption and safe unwind at pool checkout, tenancy setup and post-read touch still require Docker evidence; these slices alone cannot verify timeout delivery through each adapter operation.
4. The configured parameter filters are password/token/secret/key, plus the callback query redaction middleware. Search/q is not supported in BE-02 A/B and is planned for D. No current supported search-content logging defect is counted. The unassigned redaction middleware remains unverified.
5. No strict typecheck has run for the new code; the missing connection disposal declaration is known, and Rails typing seams are also awaiting integration. Only the assigned interface mismatch is counted here, without extrapolating further diagnostics from unreviewed files.

## Analytical design simulations

Use `A` for successful Auth HTTP verification, `S` for acquisition of the SQL repeatable-read snapshot, `C` for completion of the read transaction, and `T` for the separate activity touch. `S` occurs at the first non-transaction-control statement, which in this helper is the claims-setting SELECT, before `authorize`. PostgreSQL retains that snapshot for subsequent reads; see its [repeatable-read documentation](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-REPEATABLE-READ).

| Interleaving or input | Analytical result and review conclusion |
| --- | --- |
| Auth rejects before `A` | No protected tenancy frame is entered. Auth error ownership is preserved because the wrapper does not remap Auth errors. Credential resolution may use SQL before HTTP; the supported invariant is no Auth/provider HTTP inside the protected SQL transaction. |
| App revocation commits after `A` but before `S` | Snapshot authorization sees the committed revoked session and should deny before the renderer. This depends on the supplied SQL/session contract, not an inspected SQL implementation. |
| App revocation commits after `S` | Authorization and rows remain consistent with `S`; the ongoing read need not observe the new revocation. If revocation is visible when the separate touch checks the session, touch denies, cannot revive it, and suppresses the already-built response. A revocation after the touch's own check is a later event; this design does not promise instantaneous cancellation. Neither boundary creates an atomic transaction with upstream Auth. |
| Upstream Auth revocation occurs after `A` | The completed Auth call cannot predict that event. Keeping SQL short bounds the window; a second Auth call still would not provide an atomic cutover. Do not demand cross-system atomicity. |
| Membership/capability removal commits before `S` | Authorize/RLS should deny or return the current scoped result within the same snapshot; no stale pre-snapshot query-cache result should be substituted. |
| Membership/capability removal commits after `S` | Snapshot-era authorized rows may complete within the request budget. Switching to serializable isolation would not make a later revocation visible inside an already established snapshot. |
| Session expires before authorization | The supplied SQL contract denies; no business renderer should run and no touch should revive expiry. |
| Session expires during the read | Read authorization was valid at the snapshot boundary. Separate touch rechecks lifetime, cannot revive expiry, and propagates a denied/expired result instead of emitting the protected response. Do not equate the application deadline with the session's absolute/idle expiry. |
| Mid-read SQL error | The ordinary exception exits the yield, Rails unwinds the transaction, the outer ensure clears the frame/cache, and `protected_read` maps `ActiveRecordError` to its Auth error boundary. No partial rendered response is sent and touch is skipped. The assigned SQLSTATE test checks this path for a prohibited write. |
| Explicit `ActiveRecord::Rollback` | Rails returns nil after rollback; current controller still performs touch (D1), then the serializer rejects nil with 503 if touch succeeds. String validation only inside the block does not cover this exit. |
| Renderer returns nil, invalid encoding, or over-budget String normally | Inner validation raises `ReadResponse::Overflow`, mapped to 500; the exception unwinds the transaction and skips touch. Empty String is accepted structurally; valid API JSON remains the renderer's supplied contract. |
| Transaction ownership is externally changed through Rails | The frame compares connection and transaction object identity plus open state, then disposes the connection on failure. D2 leaves disposal out of the declared type. This is a Rails-managed ownership fence, not an independent attestation of arbitrary raw SQL issued by trusted application code. |
| Live session has no organization | Checked authentication returns 404 before constructing the non-null principal. Preserve the existing valid cookie without fabricating a tenant session. This behavior is confirmed by the supplied interface, not a request executed by this reviewer. |
| Organization changes between `A` and `S` | Context-required reads can reject stale context/version. Context-free reads currently allow canonical organization B with RLS principal A (D3); compare the canonical identity before invoking the renderer. |
| Deadline expires before or during `T` | Touch is outside the read transaction and shares the original fixed ten-second expiry. The outer timeout and explicit final check should produce a deliberate 503 without a protected payload. A touch committed just before the final expiry check may legitimately precede a failed HTTP response. Actual interruption of blocked SQL/pool waits and cleanup remains unverified. |

## Narrow alternatives and tradeoffs

| Choice | Practical tradeoff | Recommendation |
| --- | --- | --- |
| Existing repeatable-read read-only frame versus per-statement read committed | One stable snapshot couples authorization, RLS reads and serialization. Read committed could mix authorization from one moment with data from another. Read-only also prevents accidental business writes. | Keep the existing isolation and protected serialization boundary. |
| Serializable reads or locks held across Auth | Extra overhead/possible waits do not remove the Auth/SQL boundary or reveal every later revocation. Holding transactions across HTTP violates the written standard. | Do not introduce either for these reads. |
| Separate short touch versus touch in the read transaction | Separate touch preserves read-only operation and rechecks live activity policy, at the cost of another operation and a possible failure after the business read. | Keep touch separate and add D1's success-result guard. Do not silently ignore errors as a repair for missing deadline coverage. |
| Compare canonical organization versus rebind claims after authorization | Equality validation preserves the existing principal/frame invariant and rejects a request that crossed an organization switch. Rebinding midway would alter the meaning of earlier scoped work and make nested frame identity inaccurate. | Fail deliberately before rendering on mismatch (D3); the client can obtain a fresh session context. |
| Nil guard in the controller versus changing all tenancy rollback semantics | The controller alone requires a final serialized String; the generic tenancy helper already declares nullable rollback behavior. | Guard at this narrow boundary and retain the shared helper contract. |
| Uncached scoped reads versus relying on SQL+bind query-cache keys | Tenant identity resides in transaction-local settings, not necessarily in business-query bind keys. Cross-tenant cache reuse could bypass re-evaluation of RLS. | Keep both edge clears and `uncached(dirties: true)`; the [Rails cache API](https://api.rubyonrails.org/classes/ActiveRecord/ConnectionAdapters/QueryCache.html#method-i-uncached) confirms uncached execution. |
| Keep versus remove ownership-loss connection disposal | Losing track of a transaction makes a pooled physical session unsafe to reuse on assumptions about its state. | Keep disposal and declare it accurately in RBS (D2). |

## Coverage checklist and tests still needed

| Area | Review coverage and limit |
| --- | --- |
| Purpose, design size, naming, duplication | The single shared wrapper and small tenancy primitive fit the scoped modular monolith. No speculative abstraction, duplicate domain backend, deep loop, or proven N+1 appears in these slices. Comments explain transaction, cache and activity intent. |
| Boundaries, nulls, limits and errors | Query/body/header checks, identity UUID validation, String/encoding/byte budget, error mapping and rollback were traced. Unknown/duplicate query handling and Auth status mapping are supplied interfaces, not separately inspected implementation. D1 is the exceptional nil path. |
| RLS and state isolation | Principal values are normalized/frozen; nested frames retain principal, connection, transaction and mode; ambient transactions are rejected; settings are bound and transaction-local. D3 identifies the missing canonical-session/principal comparison. Concrete RLS policies and repository SQL remain outside this assignment. |
| Happy/failure test coverage observed | Lines 39-51 check repeatable-read/read-only mode, same-mode nesting and no mode leak; 53-63 reject nested mode changes; 65-75 verify write rejection by SQLSTATE and frame cleanup. Their presence is verified; execution is not. |
| Routes and middleware | Routes expose health, entry/auth/session, organization, mailbox and thread endpoints with explicit mutating verbs. Authorization inside the unassigned controllers is not proven by route declarations. Callback redaction is registered before Rails request logging; its implementation and other middleware are unreviewed. |
| Logging | Framework INFO request logs include the filtered path before application controller validation, per the [Rails logger API](https://api.rubyonrails.org/classes/Rails/Rack/Logger.html#method-i-started_request_message). Rejecting a query later does not establish redaction. The callback middleware is placed before that logger; its operation requires captured-log evidence. Search is not supported in the current scope, so no supported search-content defect is counted. |
| Documentation and standards | The supplied database interface records the Auth-outside-SQL policy and honestly marks its tests not run; the coordinator also confirms no strict typecheck of the new code. Wider README/state synchronization and other reviews were not inspected. No formatting defects counted. |

Coordinator-owned Docker validation should establish: Auth HTTP never runs inside the protected transaction; revocation commits on either side of `S`; session expiry during rendering; no-org cookie/404 behavior; deterministic organization-switch rejection on context-free reads and its matching-organization happy path; rollback versus ordinary SQL errors; no touch after a failed read; cache isolation when a physical connection is reused between principals; remaining deadline at checkout, SQL and post-read touch; and captured framework logs excluding callback credentials and content accepted by current routes. Search logging needs validation when that feature is implemented. These are requested proofs, not a claim that the unassigned test suite lacks every case. Run the existing relevant tests before adding duplicates.

No product corrections were made. The coordinator owns fix assignment, the required regression/typecheck execution, and consolidation into shared `code-reviews.md` and project state.
