# BE02 review: write_boundary_races

Review date: 2026-10-13 (Australia/Sydney). Static review completed against contract `1.0.0-collaboration.1`.

**Result: 2 medium test defects observed across 277 unique physical code lines; 7.22 defects/KLOC. Runtime: NOT_RUN.** These are weaknesses in the assigned tests, not verified defects in the unreviewed production implementation. The application is not certified by this review.

## Assignment and immutable coverage

- Run: `run_5cc7ae2ab900`
- Task: `task_091a271bc398`
- Dispatch: `ctx_e40a997500f8`
- Worker: `term_4e88f20f-1f54-4b6c-9191-84cb0951a3e7`
- Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`
- All code paths below are relative to `apps/server` in that source root.
- Counted and hashed before code inspection; hashes/counts rechecked unchanged at 10:03:52. Physical counts include comments and blank lines. No unassigned dependency code was inspected.

| Pass | File | Inclusive range | Unique physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `test/be_02/write_boundary_controller_test.rb` | 1-150 | 150 | `4A1ACC3E5AC7331AA37EC799EBDF2A2C09947180D64FE8A76442B1086EBE6C3F` |
| 2 | `test/be_02/write_boundary_concurrency_test.rb` | 1-127 | 127 | `71CB2E2262BC734FAE95AAD2DA408F390749496A02834614FCA8FB075C42D045` |

Each pass is below 200 physical lines; assignment total is 277/400. Neither assigned file contains an `AIDEV-` anchor. Existing explanatory comments were read and preserved; no source was edited.

Governing context: project `AGENTS.md`, current README/state/documentation, `.planning/STANDARDS.md`, orchestration guidance, and the repository-relative `docs/completion/be02-implementation-brief.md`, `be02-cd-contract.md`, `be02-drafts-implementation.md`, `be02-collaboration-implementation.md`, `be02-write-boundary.md`, and `.planning/consultations/results/be-02/decisions.md`. Accepted bounded decisions govern this review; production activation remains separate.

## Findings

### F1 - Medium / P2: overflow rollback test also fails JSON syntax validation

**Location:** `test/be_02/write_boundary_controller_test.rb:113-122`, particularly line 114.

**Evidence:** The only fixture above the ordinary 4096-byte response budget is `"x" * 4097`. It is not a serialized JSON object. The other fixtures independently violate string validity or top-level shape. All three therefore have a rejection reason independent of the byte budget.

**Concrete failure scenario:** If response-size enforcement is removed while JSON validation remains, this entire method can still receive `500 internal_error` and observe rollback. A valid serialized object over 4096 bytes could then commit, while the supposed overflow regression stays green. This is a static sensitivity finding; no mutation or test was executed.

**Minimal fix:** Keep malformed-JSON, forbidden-string and null-shape cases separate. Add otherwise accepted serialized object fixtures of exactly 4096 and 4097 UTF-8 bytes, assert their `bytesize` in the fixture, and check successful commit at the cap versus `500 internal_error`, rollback and no retained business write above it. Use a projection accepted by the boundary so unrelated validation cannot mask the size check.

**Regression:** Removing the response-size predicate must make the above-cap test fail through an unexpected commit/success. Add a valid multibyte/escaped serialization case that distinguishes character count from serialized UTF-8 byte count. Execution remains coordinator-owned and NOT_RUN here.

### F2 - Medium / P2: expiry race lacks a verified transaction-to-expiry crossing

**Location:** `test/be_02/write_boundary_concurrency_test.rb:36-48`, particularly lines 37, 40 and 46.

**Evidence:** The test sets expiry to the database clock plus 300 milliseconds before lock setup and `begin_write`, waits for a lock through an unreviewed helper, then performs fixed `pg_sleep(0.4)`. It does not assert that the writer transaction started before expiry or that the intended generation wait was reached while the session was still valid.

**Concrete failure scenario:** A scheduler pause of at least 300 milliseconds between expiry setup and `begin_write` places the transaction start after expiry. A faulty guard that evaluates expiry only after its generation wait using transaction-start time can then return the expected `unauthorized`, even though it does not implement the required wall-clock recheck. If a guard instead rejects expired state before that wait, the same setup delay fails before exercising the intended race. Separately, the fixed 400-millisecond sleep assumes enough of the one-second lock budget remains after observation; scheduler delay can instead cause a lock timeout. These are analytical schedules, not observed runtime outcomes or claims about the unreviewed SQL implementation.

**Minimal fix:** Record the writer transaction timestamp before its asynchronous guard call and prove `writer_transaction_start < expires_at`. At the observed generation wait, assert the exact administrator blocking PID and prove the database clock is still before expiry. Release only after a bounded database-clock observation reaches the recorded expiry, with sufficient remaining lock/deadline budget; fail explicitly if setup misses those prerequisites. Replace the fixed sleep as the evidence for crossing expiry.

**Regression:** Under verified timing prerequisites, a guard that substitutes transaction-start time for the required post-lock wall clock must fail this test. Injecting a setup delay before `begin_write` must report a failed temporal prerequisite rather than count as evidence of a successful expiry race. Exact blocker and bounded-observation behavior must be checked in the separately assigned helper before runtime acceptance.

## Contract and adversarial checklist

All entries describe authored static assertions only; none is an executed pass.

| Area | Observation and remaining evidence |
| --- | --- |
| Auth HTTP outside locks | Controller lines 26-41 instrument the Auth client and expect `begin, guard, business, commit`; real pool/HTTP behavior remains unreviewed. |
| Transport and proof priority | Lines 55-63 expect malformed transport/proofs to fail before Auth calls or transaction events, including bodyless input and understated Content-Length. |
| Session before stale context | Lines 66-70 expect a guard's unauthorized status to produce 401 despite stale context. This uses supplied harness metadata, not a real session/proof race. |
| Context/generation/CSRF recheck | Lines 73-81 change guard metadata and expect 409 for context/generation versus 400 for CSRF, with rollback and no business write. Combined priority cases beyond this file are unreviewed. |
| Resource authority and error shape | Lines 83-88 require the exact generic 404 message; lines 144-148 require only `code`, `message`, `request_id`. Actual inaccessible-resource-versus-business precedence is outside these harness cases. |
| Session proof cannot be bypassed | Lines 90-101 call the published service with nil context/version and expect rejection before business. Service implementation and SQL private-marker enforcement are unreviewed. |
| Null, empty and limits | Nil proofs, null output and empty DELETE input are present. Valid JSON at/above the output byte cap is missing: F1. Complete parser/target-limit coverage belongs to unreviewed suites. |
| Rollback | Lines 103-129 cover raised errors, invalid output and explicit Rails rollback using harness state. Output overflow is not isolated: F1. Actual database rollback is NOT_RUN. |
| Terminal 409 commits | Lines 131-139 expect a returned `draft_conflict` envelope and retained `terminal_ledger` marker. This proves only the intended harness assertion, not durable ledger persistence or a client wire response. |
| Session revocation ordering | Concurrency lines 6-34 author both writer-first lock timeout and revoker-first unauthorized outcomes. Exact PG exception/blocker behavior is delegated to unreviewed helpers. |
| Auth revocation while waiting | Lines 56-72 delete the Auth session before releasing the generation guard and expect unauthorized. The observed blocking PID and actual SQL semantics remain unverified. |
| Session before generation insertion | Lines 74-92 hold the session and attempt a competing target insert; the intent is to expose an insert before session locking. Determinism depends on helper wait/timeout behavior. |
| Sorted generation insertion/locking | Lines 94-115 hold an earlier generation and insert a later target to expose batch insertion before ordered locks. Intended coverage is useful; actual locking and bounded deadlock behavior are NOT_RUN. |
| Expiry after waiting | F2: no verified temporal crossing and a fixed sleep. |
| Membership revocation | Lines 117-126 test contention on the generation-lock routine. They do not execute membership removal, an atomic generation bump, or a subsequent denied write. Other suites may supply that evidence and were not reviewed. |
| Business-row lock order | These concurrency tests call the boundary guard, not a business-row lock or complete C/D mutation. Controller event ordering is synthetic. Session-to-generation-to-business ordering is not fully established by this assignment. |
| Exact blocker / bounded waits | `wait_for_lock(@api)` implementation is outside scope. No claim is made that it does or does not require `pg_blocking_pids(waiter_pid)` to contain the administrator PID, refresh statistics snapshots, and enforce a bounded observation deadline. |
| Simplicity, naming and comments | No additional maintainability defect observed in the assigned test structure. Race comments explain intended ordering; the expiry comment does not establish the stated timing margin (F2). Formatting belongs to linters. |
| Security and performance | Tests express proof and authority boundaries; production validation, permission enforcement and query performance are not established by reviewing test callers. No new abstraction or dependency is recommended. |
| Standards and documentation | The published handoff correctly labels runtime evidence NOT_RUN. This report flags test defects against accepted response-budget and revocation requirements; it does not grant application acceptance. |

## Unreviewed dependency boundaries

| Interface | Published responsibility; review limit |
| --- | --- |
| `write_boundary_test_helper.rb`, `AuthFixtures`, `WriteBoundaryHarness` | Deterministic controller/adapter harness, dispatch, metadata and transaction events. Implementations, reset/isolation behavior, rollback fidelity and stub fidelity are UNREVIEWED. |
| `write_boundary_database_test_helper.rb`, `WriteBoundaryDatabaseTestCase` | Isolated fixtures, distinct database connections and owned generation-fixture cleanup. `begin_write`, `write_guard`, `invoke`, `wait_for_lock`, `assert_lock_timeout` and target cleanup implementations are UNREVIEWED. |
| `V1::WriteController#protected_write` / `Elevateo::SessionWrites#transaction` | Transport/Auth before guarded transaction; revalidation, serialization and byte-budget validation before commit. Production implementation is UNREVIEWED. |
| `Elevateo::WriteResponse` / `CollaborationError` | Serialized bytes plus status; only 2xx or terminal 409 may commit, fixed bounded error vocabulary/envelope. Implementations are UNREVIEWED. |
| `begin_protected_write` / `assert_protected_write` | Session then sorted actor/target generation locks, post-lock authority/expiry checks and private transaction proof for later business seams. SQL and grants are UNREVIEWED. |
| Other C/D, database, deadline and integration suites | May cover actual business locks, terminal-ledger durability and omitted precedence/limit cases. No global absence-of-coverage claim is made. |

The exact blocker helper clarification was requested through Orca without expanding code coverage; no answer had been received when this report was authored. Even a confirmed helper contract would remain a separately reviewed dependency, not runtime evidence from this assignment.

## Evidence, defect density and handoff

Executed evidence consists only of read-only file inspection, line counts, SHA-256 hashing, anchor search and Orca coordination. Source hashes remained unchanged across review. Application tests, Docker, host tests, linters, typechecks, SQL execution, mutation tests, frontend checks, additional model/agent calls, SSH and Obsidian simulation were **NOT_RUN**. No Docker resources were created, and no cleanup, commit, live mail send or publication was performed.

| Coverage | Defects | Physical LOC | Defects/KLOC |
| --- | ---: | ---: | ---: |
| Controller pass | 1 medium | 150 | 6.67 |
| Concurrency pass | 1 medium | 127 | 7.87 |
| Assignment total | 2 medium | 277 | 7.22 |

Density is `observed defects / unique physical LOC * 1000`, rounded to two decimals. No other defects observed is not proof of correctness. Both findings were reported promptly through Orca status messages; the coordinator owns fixes, Docker regressions, dependency review, aggregate `code-reviews.md` updates and final acceptance. This report is the only file created by this dispatch.
