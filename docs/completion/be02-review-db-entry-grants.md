# BE-02 entry, grants and bootstrap adversarial review

Review disposition: **changes required**. This bounded static review identifies **5 defects: 2 P1 and 3 P2**, with **14.41 defects/KLOC** across **347 unique physical source lines**. No application, SQL, Docker, host, lint or migration tests were executed. These are source-level findings, not claims of reproduced runtime failures.

Task: `task_ffa3f238d00a`; dispatch: `ctx_52777649f866`; reviewer terminal: `term_ae7d026e-2141-4c81-8099-0351de521ac0`. Only this new report was written. Product code, shared state/documentation and source snapshots were not edited; no commits or subordinate agents were created.

<!-- AIDEV-NOTE: This is a frozen bounded review; root owns fixes and the Docker evidence needed to close findings. -->

**Coverage and provenance**

The full supplied review rubric was applied, except formatting, which remains a linter responsibility. Requirements read separately: `.planning/STANDARDS.md` and `docs/completion/be02-session-database-interface.md`. Historical root state and unassigned implementation/test files were not read. The user supplied the full rubric for this dispatch, despite the older standards document saying it was unavailable.

| Slice | Assigned source | Exact inclusive range | Unique physical LOC | SHA-256 of file bytes |
| --- | --- | --- | ---: | --- |
| 1 | `apps/server/db/be02/pending.sql` | 1-109, entire file | 109 | `733c5c6188b83fcf95fcd732584cf08adb32c3c0156e77dca2d774443e93e4d1` |
| 1 | `apps/server/db/be02/rate_limits.sql` | 1-28, entire file | 28 | `0aa2462ec1ff030d87f5cb7700b26a4888a6c1fccf3f31a58ad10cfdf9e0817b` |
| 1 | `apps/server/db/be02/grants.sql` | 1-27, entire file | 27 | `f910a3c1c9ed8e7b6f27517137fa11f09dbeb1cb2ba7ec3be86b58926227f4f6` |
| 2 | `ops/db/bootstrap.sql` | 1-114, entire file | 114 | `8cffde366e1f82a9885f0550f26530cf62e7bea951680cb5cbd915927940f82f` |
| 2 | `ops/db/bootstrap-auth-grants.sql` | 1-32, entire file | 32 | `b4bd67444253ba00f09c804db6eda969074c71e21b36bd3d6a0d9e2c1e8714f8` |
| 2 | `apps/server/db/migrate/20261013000001_create_private_sessions.rb` | 1-37, entire file | 37 | `14c480c927b70749e4f002fcdb1f133c29e0cd3832d6934d1b83f7ef25bdf3bd` |

Slice 1 totals **164** lines; slice 2 totals **183** lines, including a bootstrap file below its 130-line cap. Each slice is below 200 lines, and 347 total is below both the dispatch's 363-line estimate and 400-line absolute limit. Physical LOC includes comments and blank lines; rereads do not increase unique coverage. Context prose and this report are excluded from the denominator. The hashes match the interface document's implementation snapshot.

Final metadata verification detected a concurrent change to `pending.sql`: it now has 117 physical lines and SHA-256 `71d074f7a5c799755c604892756d6101d0c52938367e54d4551c5102a71b7a2f`. The other five source hashes remain unchanged. This review and D3 refer to the original 109-line snapshot above; the newer content was not reviewed, and no conclusion about its repair status is implied.

Additional interface information was requested through Orca, without opening other implementation files. The coordinator's response to the dispatch question, received at approximately `2026-10-12 21:31 UTC`, stated:

- Pending entries validate the digest, kind, token size and state; default expiry is `statement_timestamp() + 10 minutes`. Claim/identity/ciphertext fields have no additional cross-field CHECK constraints. There is currently no pending-entry cleanup.
- `create_session` inserts the cookie row and can then wait on generation insertion/locking. It does not recheck the entry claim deadline. The coordinator specifically confirmed the late-completion case in finding D3.
- Existing coverage includes pending completion/replay, known password retry and uncertain failure, basic role denial, initial rate limits/bounds, and session/refresh/logout cases. There is no current coverage for scanner HTTP behavior, completion crossing its deadline during a lock wait, unexpected owner membership, Auth DML overgrants, expired rate-bucket reset/cleanup, or this migration's down/up cycle.

**Prioritized defects**

**D1 — P1: Reject unexpected runtime membership paths to the owners.**

Evidence: `ops/db/bootstrap.sql:44-48` examines `elevateo_owner` grants only when the member is `elevateo_migrator`. Lines 53-58 examine only the direct edges to/from `elevateo_session_owner`; lines 61-62 grant its approved SET-enabled edge to `elevateo_owner`.

An existing `elevateo_owner` grant to `elevateo_api` with `SET TRUE` passes these checks and is retained. It needs no elevated attribute on the API role. After successful bootstrap, that login can assume both the application owner and, through the approved owner edge, the private session owner. This bypasses the documented runtime function boundary. The same omission admits a worker-to-owner edge and other unvalidated intermediate paths. PostgreSQL permits SET ROLE through a chain of SET-enabled memberships; NOINHERIT does not remove this ability. [PostgreSQL role membership](https://www.postgresql.org/docs/17/role-membership.html).

Fix: validate the complete permitted membership graph affecting the runtime roles and owners, including effective SET/inherited/admin paths. Fail transactionally on unexpected edges while preserving the measured legacy read-grant transition. Do not silently remove unrelated grants.

Regression: seed an otherwise valid database with a SET-enabled API-to-owner edge, and separately a worker/intermediate path. Bootstrap must reject them without partial mutation. The normal legacy and clean configurations must still succeed, and real runtime logins must be unable to assume either owner or the migrator.

This finding was sent immediately as escalation `msg_14ade7952f5d`; the coordinator accepted it in the interface reply.

**D2 — P1: Existing default EXECUTE grants defeat the private-function allowlist.**

Evidence: `apps/server/db/be02/grants.sql:2` revokes function rights only from PUBLIC; lines 6-25 add intended runtime grants without clearing other runtime function grants. `ops/db/bootstrap.sql:71` changes only the private owner's default PUBLIC function privilege. The migration creates its SQL functions as `elevateo_session_owner` at lines 27-29.

If that existing role has a default EXECUTE grant to `elevateo_api`, newly created worker-only functions retain API access after this migration. For example, `claim_revocations` and `finish_revocation` remain callable by the API despite the interface limiting them to the worker. A default grant to the worker analogously exposes API lifecycle functions. Defaults apply when objects are created; revoking PUBLIC does not revoke grants to named roles. [PostgreSQL default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html), [PostgreSQL REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html).

Fix: reject unexpected owner default ACLs or remove unintended effective function grants before applying the explicit role allowlist, then verify the result using real role privileges. Also check PUBLIC table/sequence defaults: lines 3-4 omit PUBLIC, so that ACL route is not closed by the shown revokes. Actual row visibility additionally depends on the unreviewed table policies; it is not asserted here.

Regression: seed a private-owner default EXECUTE grant to each runtime role in separate cases before the migration. The migration/bootstrap must fail closed or leave API unable to execute worker-only/helper functions and worker unable to execute API functions. Seed PUBLIC table/sequence defaults and assert the documented private-data boundary as well.

This finding was sent immediately as escalation `msg_95ee391b73e7`.

**D3 — P2: Completion can create a session after the entry claim expires while waiting on another lock.**

Evidence: `apps/server/db/be02/pending.sql:97-100` checks claim and entry deadlines before calling `create_session` at lines 102-103. Lines 104-106 mark the entry completed whenever that call reports a new session, without another deadline fence. The coordinator confirmed that `create_session` can wait on a generation lock after inserting the cookie row and does not check the entry deadline itself.

A valid password claim can enter this function, block beyond its 10-second claim deadline or entry expiry, then return successful session creation when the lock becomes available. This violates the documented requirement to consume a live password claim. The pending-row lock prevents competing completion; it does not keep the claim unexpired.

Fix: enforce both entry deadlines after the last potentially blocking operation and before final session publication, or roll back the nested session creation atomically when that fence fails. Merely returning unauthorized after `create_session` has persisted a row would leave an unintended session behind.

Regression: another transaction holds the relevant generation guard; begin completion with a live claim, let its deadline pass, then release the guard. Assert unauthorized, no new cookie session, and no completed entry. Repeat for total entry expiry and retain a normal successful completion/replay test. This finding uses the stated coordinator interface evidence, not an independent inspection of `create_session`.

**D4 — P2: The Auth privilege gate accepts write grants outside its four-column read boundary.**

Evidence: `ops/db/bootstrap-auth-grants.sql:25-29` checks only SELECT privileges. It checks no table- or column-level INSERT/UPDATE/DELETE/TRUNCATE rights, and does not inspect runtime-role Auth access.

An existing `UPDATE (not_after)` grant to `elevateo_session_owner` survives and passes the advertised fail-closed gate: it contributes no table SELECT or SELECT on an extra column. The accepted owner can then alter Auth deadlines rather than only read them. Existing Auth grants to the API/worker also are not rejected by this phase. This is a validation defect when overgrants exist, not a claim that the script creates these rights on a clean database. Privilege inquiry functions test the requested privilege types; checking SELECT alone says nothing about UPDATE. [PostgreSQL privilege inquiry functions](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE).

Fix: assert the complete accepted Auth ACL boundary, including non-SELECT table privileges, column INSERT/UPDATE and unexpected grant options; verify runtime roles have no direct/effective Auth-table access. Keep Auth RLS rejection intact and fail on drift instead of silently modifying unrelated Auth grants.

Regression: separately seed column UPDATE on `not_after`, table DELETE/TRUNCATE, and runtime SELECT/UPDATE. This phase must reject each drift case and roll back its own changes. The accepted four-column read configuration must still pass.

**D5 — P2: Rate-window counter and start time can use different expiry decisions.**

Evidence: `apps/server/db/be02/rate_limits.sql:12-15` evaluates the 15-minute boundary separately for `attempts` and `window_start`, each using `clock_timestamp()`. Lines 19-22 duplicate this behavior for IP limits. That function can change during one SQL statement. [PostgreSQL current-time functions](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).

When a bucket expires between those evaluations, the assignments can disagree. Depending on evaluation order, an exhausted counter can be retained with a fresh window, denying requests for another 15 minutes, or a reset counter can retain the expired window, allowing the next request to reset again. Atomic upsert prevents competing writes from interleaving but does not make two volatile time reads identical. This is a source-level timing defect; its narrow interleaving was not reproduced.

Fix: make each bucket update reuse one expiry decision and one sampled time, accounting for any row-lock wait before the decision. Keep the fixed email-then-IP locking order and capped counters.

Regression: verify exhausted email and IP buckets reset their count and start together, including a controlled boundary-crossing case, and that both limits and Retry-After remain correct. A normal expired-bucket test alone does not exercise the disagreement between two time evaluations.

**Rubric and requirement checks**

| Area | Bounded review result |
| --- | --- |
| Scanner-safe GET staging | `stage_entry` validates and inserts an encrypted opaque token; it has no Auth call or consuming state transition. Actual GET routing/cookie/scanner behavior was outside scope and remains unverified. |
| Nulls, invalid input and limits | The shown functions reject missing claims/kinds/failure flags and bound token size. Digests/credentials delegate to helpers described by the interface, not reviewed here. Rate counters saturate at 6/31 instead of overflowing. SQL UUID parsing and helper implementations require their own tests. |
| Replay and concurrent claims | Pending-row FOR UPDATE serializes claims/completion; missing, expired, uncertain or completed entries reject. Active contention returns temporarily unavailable; expired owned claims become uncertain. Same-entry replay after completion rejects. Re-staging the same opaque Auth token under a different digest depends on Auth's one-use verification and caller behavior; no local cross-digest replay guarantee was assumed. |
| Known failure versus ambiguity | Explicit known password failure clears the claim for retry only in password_pending; other live failures become uncertain. Bound identity and ciphertext are stored after Auth policy validation. A caller must not mislabel ambiguous HTTP results as known failures. |
| Deadline/state propagation | D3 and D5 need correction. Completion handles `session_created:true` independently of status, preserving the documented no-organization session behavior. |
| Privileges and authorization | Fixed SECURITY DEFINER search paths and explicit intended entrypoints are positive controls; D1, D2 and D4 prevent acceptance of the overall boundary. Trusted verified identity must still originate in the HTTP adapter. |
| Fresh DB then Auth bootstrap | Phase 1 does not query Auth tables; phase 2 checks Auth presence, four column types and disabled RLS before granting access. Both use ON_ERROR_STOP and a transaction. Actual pinned-image readiness/catalog compatibility was not executed. |
| Existing-grant preservation | The measured legacy API read edge is retired with RESTRICT and a preservation postcondition. Unexpected owner paths and other ACLs remain insufficiently validated as above. |
| Migration reversibility | `up` uses fixed SQL paths, switches to the private owner and switches back before triggers. `down` delegates to an unassigned SQL file; rollback preservation, ordering and reapply were not inspected or executed and cannot be certified. |
| Simplicity, naming and comments | The functions have bounded lifecycle responsibilities and useful security comments. No new abstraction or unrelated refactor is recommended. The comments about runtime-owner isolation and entrypoint enumeration overstate protection until D1/D2 are corrected. |
| Performance and retention | Indexed-key lookup/upsert intent is apparent, but table indexes/query plans were outside scope. No provider I/O exists in these slices. Pending entries have no cleanup per coordinator; retention/capacity policy remains an open operational question, not an additional counted bug. |
| Tests and documentation | The interface describes 14 authored integration tests and clearly says zero executed. The coordinator supplied the coverage summary above; test bodies were not read. Documentation must reflect fixes and real execution evidence before these findings close. |

**Evidence still required, distinct from confirmed defects**

- Root must run the focused regressions for D1-D5 with actual API/worker logins in the pinned PostgreSQL Docker environment, then normal happy paths and at least two likely failure cases per changed feature.
- Prove the two-phase sequence from a fresh disposable database, including failure before Auth readiness, wrong Auth types/RLS, accepted existing read grants, and migration down/up with reusable role prerequisites preserved.
- Prove scanner GET does not consume an invite/recovery token, and that later explicit user submission verifies once. This requires the HTTP adapter and real/fake Auth integration outside these source slices.
- Confirm malformed/oversize input, duplicate digests, absent rows, concurrent claims, timed-out verify/password claims, no-organization creation, and a failed session creation leaving the entry unconsumed. Some are reportedly covered; this reviewer did not inspect or execute those tests.
- Decide bounded cleanup/retention for expired and terminal pending entries, including stored ciphertext. There is no finding that existing retention violates an approved policy; that policy is unresolved.

Defect density is **5 / 347 x 1,000 = 14.41 defects/KLOC**. Assigning each defect to its primary location gives slice 1 (D2, D3, D5): **3 / 164 x 1,000 = 18.29**; slice 2 (D1, D4): **2 / 183 x 1,000 = 10.93**. Open evidence requests and operational questions are excluded. No defect is marked fixed, and no test is marked passed by this review.
