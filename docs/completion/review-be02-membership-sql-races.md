# BE-02 membership SQL and race-test review

Review date: 2026-10-13 Australia/Sydney. Run: `run_5cc7ae2ab900`; task: `task_8500452a1f47`; dispatch: `ctx_11182fc9b721`.

## Result and evidence boundary

Three medium-severity test defects were observed. No SQL implementation defect was observed in the assigned migration and SQL under the documented interfaces of the unreviewed write-boundary and generation machinery. This is a bounded static finding, not proof of correctness or a release approval.

Runtime: **NOT_RUN**. No application tests, Docker commands, database queries, model calls, agents, SSH, commits, or frontend work were performed. Execution consisted of source/document reads, physical-line counting, SHA-256 hashing, Orca reporting, and writing this report. Proposed schedules and regressions below are static reasoning, not executed evidence. Formatting is delegated to linters.

The governing context was the supplied review rubric and project instructions, project state/documentation, `.planning/STANDARDS.md`, local-completion and orchestration guidance, the accepted BE-02 decisions, and the implementation brief, drafts, membership/search, write-boundary, and C/D contract documents. The applicable contract is **`1.0.0-collaboration.1`**. All assigned AIDEV anchors were read. Source was not modified; the coordinator owns aggregate `code-reviews.md` and state updates.

## Coverage and immutable review inputs

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex/apps/server`.

Counts include blank and comment lines. Each file was counted and hashed before its review pass. Only the nine assigned files constitute reviewed code; context documents and interfaces do not expand that coverage.

| Pass | Relative file | Inclusive range | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `db/migrate/20261013000006_create_mailbox_membership_writes.rb` | 1–14 | 14 | `27ECFF0CC7D24929403A8B9F0D5258CF0F9C38ED0E33EFCBC2C28C664C886A62` |
| 1 | `db/be02_memberships/tables.sql` | 1–21 | 21 | `7C6DD7A77FC5BEAB533A7710724065509395AD947B7DD1CBB86B4B564AEECF12` |
| 1 | `db/be02_memberships/revision.sql` | 1–23 | 23 | `CF44EC8A1A45D80FF4FB308A584BC8E15CD6A413C9C9F8ED2C65BADE01E40902` |
| 1 | `db/be02_memberships/reads.sql` | 1–29 | 29 | `0F1D89EC1E43FA4AC62C3184694728949A32290DD30A93723B64F123F1B5DED7` |
| 1 | `db/be02_memberships/mutation.sql` | 1–56 | 56 | `3AE401E7954A8A7F3F41623AB80304A897DE2AAF135ADBF27BC2B0C4D169D7F1` |
| 1 | `db/be02_memberships/grants.sql` | 1–17 | 17 | `46DD7A4203481153E7414B34AB729BCCAE08E135F6B3962127BD7B64ADFB469D` |
| 1 | `db/be02_memberships/down.sql` | 1–11 | 11 | `250D372A3855D0AF63B05A04381CDF4D4E2BCDC89F735A46F2DCCF05C7CD46AC` |
| 2 | `test/be_02/mailbox_membership_database_test.rb` | 1–106 | 106 | `2670E02D69BD16FCD731CB54AB795C71E4AA191AFE934315B62F7F1202E624E2` |
| 2 | `test/be_02/mailbox_membership_concurrency_test.rb` | 1–77 | 77 | `73D4D2169440936023FAFC441A2E41B8FCD9EE3E57AC7ECC5AF72F5986428E3A` |

Pass 1: **171 LOC**. Pass 2: **183 LOC**. Total unique physical code: **354 LOC**; no overlapping or unassigned source ranges.

Observed defects: **3** (all medium). Overall defect density: **3 / 0.354 KLOC = 8.47 defects/KLOC**. SQL/migration: **0 observed / 0.171 KLOC = 0.00**; tests: **3 / 0.183 KLOC = 16.39**. These figures measure this review's observations, not the actual underlying defect rate.

## Findings

### R1 — Medium: same-version departures do not test serialization of the last-manager check

**Location:** `test/be_02/mailbox_membership_concurrency_test.rb:6–16`, particularly the common `expected` at lines 9–12.

Both departing managers submit revision `r`. Once either write increments the revision, the other must fail CAS, even if an implementation incorrectly checks the last-manager invariant before obtaining the mailbox revision lock. The asserted statuses, revision, and final count also hold for completely sequential execution. Thus this case establishes a CAS result but cannot distinguish the required last-manager count/check ordering.

**Concrete failure scenario:** A future change moves the manager count before the business lock while retaining the CAS check after it. Two managers both observe a count of two. A first request with expected revision `r` deletes its manager and commits; a waiting request with the valid in-range input `r+1` then matches the new revision and deletes the remaining manager using its stale count. The existing equal-version test and the serial last-manager assertions can both pass with that defect. The current assigned SQL checks after locking; this finding concerns the regression test's inability to protect that ordering.

**Minimal fix:** Add a bounded, observed interleaving with two distinct managers deleting themselves, expected revisions `r` and `r+1`, and the first transaction holding the mailbox revision lock before the second proceeds. Verify the second waits on that business lock, release the first transaction, and require the second to reject removal of the now-last manager. Keep the existing same-version CAS case.

**Regression acceptance:** Require one deletion, one remaining active explicit manager, and rejection of the second removal. A deliberately pre-lock last-manager check must fail this new regression. Use deterministic UUID ordering so earlier generation guards do not accidentally substitute for the intended business-row wait. Runtime: **NOT_RUN**.

### R2 — Medium: the missing-target-guard case does not exercise reversed guard ordering

**Location:** `test/be_02/mailbox_membership_concurrency_test.rb:19–30`.

The two operations use distinct actors and the same target. Their guard sets are `{actor A, target T}` and `{actor B, target T}`: only T is shared. This topology cannot establish an A/B versus B/A generation-guard cycle, so it cannot discriminate UUID-sorted locking from a regressed actor-first implementation. Removing T's guard covers an important fixture condition, but the call site does not observe contention at guard creation. A sequential schedule produces the same asserted CAS statuses and generation result. `parallel_services` is unreviewed; even a simultaneous-start barrier cannot repair this guard topology.

**Concrete failure scenario:** An implementation locks actors before targets rather than sorting all distinct users. The assigned test still succeeds because only one shared guard is contested. Two real managers concurrently targeting each other can instead lock their own guards and wait on each other's guards, producing a deadlock; missing-row creation must obey the same ordering rule.

**Minimal fix:** Retain the current single-target creation test and add a bounded case with the same two users appearing in reversed actor/target roles. Choose fixed UUIDs, remove the relevant guards through the authorized fixture seam, and use database observations/barriers to prove overlapping guard acquisition rather than only submitting two jobs.

**Regression acceptance:** Demonstrate actual contention, bounded completion without deadlock, correct final guard rows/generations, and contract-correct mutation outcomes. The case must fail against an actor-first or unsorted missing-guard implementation. Keep guard-order verification distinct from mailbox CAS verification. Runtime: **NOT_RUN**.

### R3 — Medium: an exception before PID publication can hang the delete/re-add test

**Location:** `test/be_02/mailbox_membership_concurrency_test.rb:61–74`, especially `pid.pop` at line 68.

The parent performs an unbounded queue pop while holding the fixture transaction. The child publishes its PID only after acquiring a pool connection and querying PostgreSQL. If either operation raises, the child terminates without publishing; `report_on_exception = false` suppresses immediate reporting, and the parent cannot reach `task.value` to propagate the exception. `wait_for_lock` cannot impose a deadline on an argument that never finishes evaluating. The unconditional join at line 74 also has no local bound if a worker remains blocked.

**Concrete failure scenario:** Connection-pool checkout or `SELECT pg_backend_pid()` fails before line 63 enqueues a value. The regression then hangs at line 68, retaining the transaction until an external suite/process timeout, instead of reporting the original database or pool failure. This conclusion follows from the assigned queue/thread flow and does not assume the implementation of the unreviewed helpers.

**Minimal fix:** Use a bounded worker-start handshake that sends either a PID or the exception and shares a monotonic deadline with the database wait. Ensure the holder transaction is released before bounded worker cleanup, and propagate the original failure. Prefer the project's existing bounded concurrency harness if its published behavior satisfies these conditions.

**Regression acceptance:** Inject a failure before PID publication and separately a worker that never reaches the intended lock; both must fail within the deadline, preserve the useful failure cause, and leave no active worker/held fixture transaction. Runtime: **NOT_RUN**.

## Static contract checklist

| Area | Observation and limitation |
| --- | --- |
| Authorization before revision disclosure | `mutation.sql:12–28` checks proof, target eligibility, manager capability, locks the revision row, then rechecks capability and target eligibility before CAS. Dependency semantics remain unreviewed. |
| Session/generation ordering and revocation | SQL requires the protected-write proof, and reasserts it after mutation. Actual sorted acquisition, isolation enforcement, session expiry, and concurrent revocation behavior belong to the unreviewed foundation. R2 limits the assigned race evidence. |
| Stale version versus no-op | CAS at line 29 precedes change/no-op classification at lines 30–33. The database test covers stale identical flags and matching no-ops, including absent delete. |
| Last active explicit manager | The count joins current organization membership and occurs after the mailbox revision lock. Serial removal/demotion tests exist; R1 identifies the missing discriminatory race. |
| Revision ceiling | Integer range is constrained; mutation permits matching no-ops at maximum and rejects changes with `temporarily_unavailable`. The trigger raises on exhaustion. Ceiling cases are authored, not executed. |
| Null/invalid inputs | Mutation rejects null IDs/version/delete flag, negative versions, missing PUT flags, and DELETE flags. Reads enforce internal limit 1–51. UUID/integer parameter types constrain other values; malformed HTTP handling is outside coverage. |
| Target deletion/re-addition | Revision trigger increments for real explicit-row removal; re-addition of organization membership does not recreate an explicit mailbox grant. Tests assert tombstone generation increases and stale revision. Generation trigger/cascade implementations are unreviewed. |
| Actually observed interleavings | The delete/re-add test attempts an explicit PID-based lock wait, subject to R3. The first two tests assert outcomes without an observed wait at their call sites. No interleaving was executed in this review. |
| Explicit roster and empty pages | Read routine joins current organization membership, requires an explicit manager, orders UUIDs, and returns no rows when unauthorized. Null cursor supports the initial page. |
| Limits and wire contract | Internal 51-row cap permits the published maximum-50 plus one probe. HTTP 8,192-byte PUT, 4,096-byte write-response, 131,072-byte roster-response limits, cursor validation, and exact 404 text are service/controller obligations, unreviewed here. |
| Internal statuses | Assigned mutation uses `not_found`, `membership_conflict`, `temporarily_unavailable`, and `ok` in the expected decision order. Exact HTTP mapping and rollback of rejected responses are unreviewed. |
| Self-demotion | The response obtains proof metadata again after the trigger, supporting the required post-write generation. The authored service assertion checks the signed context generation; signer and service were not inspected. |
| SQL injection and secrets | Assigned SQL uses typed parameters and fixed statements, with schema-qualified objects and SECURITY DEFINER search paths fixed to `pg_catalog`. No dynamic SQL or embedded credentials observed. |
| Grants and RLS | New revision table enables and forces RLS. Exact function signatures revoke PUBLIC/API/read/worker execution before granting the three intended routines to API only. Trigger execution is revoked; runtime direct membership DML is checked. Actual installed ACLs and inherited privileges were not queried. |
| Privileged owner policies | Broad owner-only policies are paired with explicit routine authorization checks. Their interaction with other owner routines is outside this assignment and requires the foundation review. |
| Migration reversibility | Down SQL drops the new functions, trigger, owner policies, and revision table while leaving the earlier generation trigger/read policy in place. Forward/backward execution was not tested. |
| Tests and documentation | Tests cover create/change/no-op/stale/delete, current-org eligibility, role denial, last manager, cursor revision, ceiling, direct DML and missing proof. Relevant implementation docs describe these behaviors and pending validation. Three test defects are recorded above. |
| Maintainability/performance | Modules have bounded responsibilities, explain important couplings with AIDEV comments, and use no new dependency or dynamic query loop. Trigger loops over at most old/new mailbox IDs; roster output is capped. Index plans, large-roster costs, inherited policy interactions, lint and typing remain unverified. |

## Unreviewed dependencies and residual work

The published `app_auth.begin_protected_write(text, uuid, uuid, uuid[])` interface locks the cookie-bound session, then distinct actor/target authorization-generation guards in UUID order, including ordered creation of missing guards. It requires READ COMMITTED and creates a transaction-bound private proof. Its implementation was not read.

The published owner-only `app_auth.assert_protected_write(text, uuid)` interface validates the current transaction's proof, cookie/actor/target coverage and context consistency, returning status and current actor/organization/generation metadata. Assigned SQL relies on that interface to prevent bypass through forged GUCs and to keep authority stable while acquiring later locks. The generation trigger, org-membership cascades, and proof revocation machinery were not read.

The Ruby `MailboxMemberships` service, controller protected-write wrapper, cursor codec, read-snapshot wrapper, fixtures, `raw_change`, `parallel_services`, `member_change`, `scope`, and `wait_for_lock` were not reviewed. Published documentation places authorization-context/CSRF checks, response shaping/budgets, READ ONLY REPEATABLE READ roster snapshots, and rollback of non-success responses at those boundaries. The review therefore does not certify exact wire behavior or end-to-end rollback.

The coordinator should repair R1–R3 and run the bounded PostgreSQL/Docker regressions, including actual observed locks, runtime-role privileges, and migration behavior, through the authorized testing workflow. This report adds no production activation approval and makes no claim about unassigned code. Findings were reported promptly through Orca status; this artifact is the complete bounded review output.
