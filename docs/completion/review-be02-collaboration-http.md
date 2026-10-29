# BE-02 collaboration HTTP adversarial review

Review date: 2026-10-13 Australia/Sydney (2026-10-12 UTC). Assignment: `collaboration_http`; run `run_5cc7ae2ab900`; task `task_d64ae950d159`; dispatch `ctx_5b056022867e`. Reviewer terminal: `term_b5df6f6e-73c6-4f16-9560-b17b452ea643`.

**Result: 1 MED regression-test defect across 353 unique physical lines, or 2.83 defects/KLOC. Runtime: NOT_RUN.** No application-code defect was observed in the assigned controller/signature slice; that is not proof that its unreviewed dependencies or the integrated feature work. Repair the false-positive request-budget regression before treating it as acceptance evidence.

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. All code paths below are relative to `apps/server` in that source root. This report lives in the coordinator's separate Local Completion directory. No source, test, contract, state, or other worker file was changed.

## Finding CH-01 — MED: oversized-body regression can pass with byte enforcement broken

**Location:** `test/be_02/collaboration_controller_test.rb:43-49`, `test_actual_request_bytes_override_forged_content_length_for_each_write_budget`.

**Observed code:** each route receives a body consisting only of spaces, at 8,193 bytes for read state and assignment or 65,537 bytes for notes, with `CONTENT_LENGTH` set to `1`. The test expects `400 request_invalid` and no authentication/database activity.

**Concrete failure scenario:** remove or incorrectly increase the actual request-byte limit while retaining JSON validation. Reading the whole whitespace-only body still produces invalid JSON, which can yield exactly the asserted 400 before authentication. A regressed implementation that trusts the claimed one-byte length also reads invalid JSON and can satisfy the same assertions. Consequently, all three budget checks can pass while the security boundary named by this test is broken. This is a statically demonstrated false-positive regression oracle, not an observed production byte-limit bypass; no mutation or runtime test was executed.

**Minimal fix:** use a complete, valid route-specific JSON object as the prefix, then append legal JSON whitespace so the actual encoded body is exactly the route cap plus one byte. Set the forged `Content-Length` to the byte length of that complete valid prefix. Keeping the forged value at `1` would still mask a length-trusting reader, because it would parse truncated JSON. Supply the normal authorized success fixture for each route so accepting the prefix genuinely reaches success. Keep assertions that oversized rejection precedes Auth and database checkout.

**Regression:** for each 8,192/65,536-byte request budget, show a valid exactly-at-cap body succeeds with an honest length; show the same valid prefix padded to cap+1 is rejected with a forged shorter length equal to the prefix size. Also cover a missing declared length if supported by the transport. Temporarily disabling/increasing the actual-byte guard, and separately replacing it with a declared-length-only read, must make the relevant oversized test fail. These are proposed Docker regressions, not executed results.

Reported promptly through Orca status message `msg_64651770489e` at `2026-10-12T22:54:02Z`; clarified the valid-prefix/forged-length detail in `msg_0cacbde51b83` at `2026-10-12T22:56:51Z`.

## Checklist and static observations

| Area | Evidence and assessment |
| --- | --- |
| Path parsing before raw-body validation | All three controllers use `request.path_parameters[:thread_id]` with `WriteInput.uuid`, rather than `params`, before entering the protected boundary. The AIDEV comments explain the early-JSON-parsing hazard. This matches the documented path-only parsing seam. Error handling for malformed or absent path values is delegated and unreviewed; these tests do not establish its response envelope. |
| Exact guard callback interface | Read state, assignment and note creation pass keyword lambdas accepting `input:, query:`. They invoke their service validators; read state and notes return no target users, and assignment returns either `[]` or the validated assignee UUID. This matches the published `guard_users` contract; no positional-lambda mismatch observed. |
| Local session, online policy, proof and race ordering | Controllers consistently delegate to `protected_write`/`protected_read` and do not start their own transaction. The published boundary owns bounded parsing, current Auth, checkout, session/generation guards and proof rechecks. Its required revoked-session 401 before stale-context 409, and resource/permission 404 before business conflict, cannot be proven from this slice. No revocation race was executed. |
| Permissions and actor/target handling | Controllers obtain identity and session from boundary block arguments; no controller accepts a caller-supplied actor. Assignment adds its non-null target for boundary guard locking. Current-reader checks, target eligibility, canonical actor/target lock order and RLS remain service/foundation/database responsibilities. The visible assignment test asserts the target guard argument and eligibility-query order before `FOR UPDATE`, using canned rows. |
| Request budgets | Read state/assignment inherit documented 8,192-byte defaults; note creation explicitly passes 65,536. Numeric sizes agree with contract `1.0.0-collaboration.1`. CH-01 prevents the oversized-request test from validating those limits reliably. |
| Response budgets | Assignment GET passes 4,096; writes use the documented 4,096 default except note creation, which passes 65,536. Notes GET passes 262,144. Entire-entry pagination, actual serialized-byte enforcement and rejection before commit are delegated and unreviewed. |
| Statuses and wire shapes | Controllers return service/boundary results without a second ad hoc serializer. Visible assertions cover read-state 200 and exact top-level fields, assignment 200 and selected values, hidden-resource generic 404/rollback, invalid input 400 before authentication, note creation 201, and GET 200. They do not themselves establish every exact assignment/note/list shape or replay/conflict/exhaustion status. |
| Null, empty and maximum cases | Assignment's nullable target becomes an empty target-guard list. Tests include initial false read state without INSERT, empty assignment/note GET fixtures, invalid/duplicate JSON, forged actor input, and a 4,096-code-point control-character note whose escaped request exceeds 8,192 bytes but fits the note budget. Null payloads, malformed path values, assignment clear/no-op/version ceiling, note replay, cursor boundaries and response ceilings require evidence outside this assignment. No global coverage absence is inferred. |
| Regression fidelity through protected boundary | Test controllers subclass the real controllers and override session/config access; they do not replace `protected_write` or `protected_read`. Dispatch calls the real controller action via a Rack environment. The pool, SQL results and session/Auth client are simulated, so this is controller-boundary regression structure, not real router, PostgreSQL, Auth or RLS acceptance. |
| State and transaction assertions | Teardown checks no open transaction and no retained tenancy stack. Hidden assignment checks rollback; note creation checks commit; GET assertions check READ ONLY, no write guard and no DML. Snapshot isolation level and interleavings are not proved by the GET assertions alone. |
| Typing, names and comments | Assigned RBS files describe service inputs/results and the path-parameter seam; controller methods remain small. AIDEV anchors were inspected and their intent is consistent with this slice. No unnecessary abstraction, duplicated domain logic, deeply nested loop, hot-path query loop or secret was observed here. RBS/typechecker execution is NOT_RUN. |
| Documentation and scope | Collaboration implementation and write-boundary documents describe these adapters and separate static work from pending integration evidence. Standards and frozen contract were used as requirements. Formatting was not reviewed; it belongs to linters. No design change is proposed beyond correcting the test oracle. |

## Counted and hashed coverage

Counts and SHA-256 hashes were captured before inspecting code. Every assigned physical line, including comments and blank lines, was inspected. Pass 1 contains 175 lines; pass 2 contains 178 lines. Passes do not overlap, so assignment coverage is exactly **353 unique physical LOC**, below both the 200-line pass cap and the 400-line assignment cap. Rehash at `2026-10-12T22:56:53Z` confirmed unchanged hashes and counts.

| Pass | File | Inclusive range | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `app/controllers/v1/thread_read_states_controller.rb` | 1-20 | 20 | `00A915D7C7029BDC59A6CAC079485707C7F82F9CB39DE14F729E3C81493F4CB6` |
| 1 | `app/controllers/v1/thread_assignments_controller.rb` | 1-32 | 32 | `436EA2F9DB5AA639A6A2F985692ACA571CA7B2F35E07FFBD26815B93B5319940` |
| 1 | `app/controllers/v1/thread_notes_controller.rb` | 1-34 | 34 | `96B56C8305A2393D31749D8E755F752803173580DB98A7A748F3399765D0DCA3` |
| 1 | `sig/thread_collaboration.rbs` | 1-27 | 27 | `0CEB6016627E6CE0173CD7A86F801AAE3C2D1781028440E0E55D971E119F9284` |
| 1 | `sig/thread_read_state.rbs` | 1-14 | 14 | `5D7C8A93050688AE744F35140CBAD7D3DE858A86D6C0BC743153EB844591674E` |
| 1 | `sig/thread_assignment.rbs` | 1-21 | 21 | `28690764AF32C568ABAD1318D0AD5009D813CDFEFECF7AB06A58E929C48F9448` |
| 1 | `sig/thread_notes.rbs` | 1-27 | 27 | `6E27A93613F2DEF04088B811D160866118428E9035B68C0ADFEE7C581E3AC452` |
| 2 | `test/be_02/collaboration_controller_helper.rb` | 1-80 | 80 | `5C6E4613FFA6EE750C1F6BDA920B1AB747BF0526419FEC66F352465320611BC8` |
| 2 | `test/be_02/collaboration_controller_test.rb` | 1-98 | 98 | `355B5133784BD26E4350DE06A1293523EC82D1C678A5F1D3F650CA4EAB785DBE` |

Pass 1: zero observed defects / 175 physical LOC = 0 defects/KLOC. Pass 2: one observed defect / 178 physical LOC = 5.62 defects/KLOC. Assignment: one distinct defect / 353 physical LOC = **2.83 defects/KLOC**. These are review observations, not estimated residual defect rates.

## Context and unreviewed interfaces

Repository-relative context consulted: `AGENTS.md`; current checkpoints in `README.md`, `state.md`, `documentation.md`; `.planning/STANDARDS.md`, `.planning/README.md`, `.planning/AGENT_ORCHESTRATION.md`; `docs/completion/be02-implementation-brief.md`, `be02-cd-contract.md`, `be02-drafts-implementation.md`, `be02-collaboration-implementation.md`, `be02-write-boundary.md`; and `.planning/consultations/results/be-02/decisions.md`. Contract authority is **1.0.0-collaboration.1** and accepted decisions govern the bounded implementation. Older checkpoint evidence was not treated as acceptance of this new code.

Unassigned implementations were not inspected:

- `protected_write` publishes strict raw-body/query validation, keyword target-user callbacks, current session/Auth checks, ordered SQL guard acquisition, deadline enforcement, response-budget enforcement and transaction completion. `protected_read` publishes the protected snapshot and read response boundary. These interfaces were checked against controller calls, not their implementation.
- `ThreadReadState`, `ThreadAssignment`, `ThreadNotes`, `ThreadCollaboration`, `WriteInput`, response serializers and cursor services own validation, resource visibility, concurrency/version rules, immutable replay, response projection and pagination. Their assigned RBS signatures were reviewed; their Ruby implementations were not.
- The inherited `WriteBoundaryHarness`, real routes/middleware, private SQL guard routines, database schema/RLS, Auth/session implementation, integration tests, serializers' tests and fixture generators remain unreviewed. In particular, the helper's `super` behavior cannot be certified from this assignment.

## Executed evidence and handoff

Executed: read-only document/code inspection within assigned ranges, physical-line counting, initial and final SHA-256 collection, Orca check/status/heartbeat commands, and creation of this report only. The report target did not exist before creation. No code edit, agent/model call, ultrareview, SSH, Docker operation, host application test, commit, frontend action or external-channel post occurred. No disposable Docker resources were created, so no Docker cleanup was required.

Application runtime, lint, RBS/typechecks, unit tests, integration tests, PostgreSQL/Auth/RLS checks, concurrency/revocation races, router behavior, mutation checks and visual checks: **NOT_RUN**. The statically sound controller call shapes do not satisfy these remaining acceptance gates. The coordinator should assign CH-01's narrow test repair, then run the relevant authorized Docker validation and incorporate this review into its central review ledger; this worker must not modify that ledger or execute those checks.
