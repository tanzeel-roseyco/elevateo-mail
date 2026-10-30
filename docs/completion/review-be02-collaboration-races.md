# BE-02 collaboration races: bounded adversarial review

Task: `task_a91fed7074a8`; dispatch: `ctx_adc7f73b204b`; run: `run_5cc7ae2ab900`.

Source checkout: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.
All code locations below are relative to that checkout's `apps/server` directory.

**Result: 2 observed regression-test defects (1 MEDIUM, 1 LOW), across exactly 254 unique physical code lines: 7.87 defects/KLOC. Runtime: NOT_RUN.** These findings identify assertions that can falsely pass; they do not establish corresponding production failures. No application acceptance or complete race coverage is claimed.

## Scope and provenance

Physical line counts and SHA-256 hashes were recorded before inspection. Blank lines and comments count toward the limits. Each file was its own pass; rereading the same ranges added no unique coverage. No unassigned implementation or helper code was inspected.

| Pass | Assigned file and inclusive range | Physical LOC | SHA-256 | Observed defects | Defects/KLOC |
| --- | --- | ---: | --- | ---: | ---: |
| 1 | `test/be_02/collaboration_concurrency_test.rb:1-112` | 112 | `7BB7BE6A8014DE68060500595D2FF54407B12C006BB34414109942FBE4A29F8E` | 0 | 0.00 |
| 2 | `test/be_02/collaboration_services_test.rb:1-142` | 142 | `B5C3E55047F9A7ECF18DE261F70904741F681D7C03B63C8795E00D3EA08AB039` | 2 | 14.08 |
| Total | No overlap | **254** | Two frozen files | **2** | **7.87** |

Both passes are below 200 physical LOC, and the assignment is below 400 unique physical LOC. Zero observed findings in pass 1 is not proof of correctness.

Context consulted: project `AGENTS.md`, root README/state/documentation checkpoints, `.planning/STANDARDS.md`, `.planning/README.md`, `.planning/AGENT_ORCHESTRATION.md`, accepted `.planning/consultations/results/be-02/decisions.md`, and `docs/completion/be02-implementation-brief.md`, `be02-cd-contract.md`, `be02-drafts-implementation.md`, `be02-collaboration-implementation.md`, and `be02-write-boundary.md`. The governing C/D version is **1.0.0-collaboration.1**. The concurrency file's line 5 and services file's line 12 AIDEV anchors were read; source was not edited.

## Findings

### R1 — MEDIUM: no-op tests can pass after the returned state or timestamp changes

**Location:** `test/be_02/collaboration_services_test.rb:54-58` and `:79-82`.

The maximum read-state no-op assertion checks only HTTP status 200. The matching assignment no-op checks only `assignment_version == 1` and the number of SQL calls. Neither checks that the existing timestamp is preserved; the maximum read-state case also omits the returned boolean and maximum version, while the assignment case omits the assignee.

**Concrete failure scenario:** a refactor builds an otherwise valid no-op DTO using a new timestamp or null instead of the stored `@time`. Both tests still pass, despite the contract requiring the original time and version to survive a no-op. The maximum read-state response can also report a different in-range version while retaining status 200 and pass line 55. This is a static false-pass scenario, not an executed mutation or a claim that the service currently does so.

**Minimal fix:** parse the maximum no-op response and assert `[true, 2_147_483_647, @time]` for `read`, `read_state_version`, and `updated_at`; assert `[@target, 1, @time]` for the matching assignment response. Retain status and query-count assertions. Add the corresponding assignment-at-maximum matching no-op and genuine-change 503 cases if another assigned test owner has not already covered them; this slice contains neither.

**Regression:** the revised checks must fail when either no-op projection substitutes a fresh/null timestamp or changes the preserved value/version. A matching assignment at maximum must succeed without changing value/version/time; changing it at maximum must yield 503 `temporarily_unavailable`. Persisted no-write behavior also needs the separately owned database checks; mock query counts alone do not prove it.

### R2 — LOW: uppercase UUID coverage uses fixtures whose case cannot change

**Location:** `test/be_02/collaboration_services_test.rb:24` and `:96-99`.

Every generated UUID contains only digits and hyphens. Consequently, `@box.upcase == @box` and `@note.upcase == @note`; the apparent uppercase first-create/retry cases exercise exactly the original strings.

**Concrete failure scenario:** UUID validation regresses to rejecting uppercase hexadecimal letters, or replay comparison stops canonicalizing case. These cases still pass because no input contains an uppercase letter. The contract requires parsing equivalent UUID values and binding/emitting lowercase hyphenated identifiers.

**Minimal fix:** give these fixtures valid UUIDs containing hexadecimal letters, explicitly assert that uppercasing changes them, and reuse the same value with opposite case across create/retry. Assert canonical lowercase identifier bindings using the existing `Connection#calls` recorder, as well as the emitted identifiers and expected 201/200 statuses.

**Regression:** reject-uppercase and skip-normalization mutations must fail the new cases. Invalid UUID strings must remain rejected. A real database retry should continue resolving to one note; that database behavior is outside this assigned slice.

## Requirement checklist and boundaries

| Area | Static evidence in the assigned ranges | Assessment |
| --- | --- | --- |
| Distinct local sessions for read contention | Concurrency lines 8-10 create a random cookie digest and require successful creation; lines 16 and 91-110 run the contender under a pool lease and report its backend PID. | A fresh local cookie session is explicitly requested. Sharing the upstream Auth session ID is not itself a defect: the published write guard locks the cookie-bound local session. Actual distinct connections/session rows remain runtime evidence. |
| Differing read writes and final state | Lines 12-20 hold the first scope through the wait, assert first version 1, then second false/version 2 and exactly one stored row. | Appropriate ordering/result assertions are present. This cannot isolate the generation guard from business-row contention. |
| Assignment commits before target revocation | Lines 25-46 obtain the target guard through `scope(targets:)`, serialize assignment before allowing the scope to finish, then assert retained historical assignee and denial of a subsequent assignment. | Both result lifetime and post-revocation behavior are represented. The helper's lock observation is unreviewed. |
| Target revocation commits before assignment decision | Lines 52-65 explicitly lock target sessions and the target generation, remove membership, wait for the writer, commit, and require exact `[404, not_available, This item is unavailable.]` before stale expected-version conflict. | The contract's authority-before-conflict priority and unchanged existing assignment/version are asserted. |
| Correct blocking lock, not an unrelated lock | Calls at concurrency lines 17, 35 and 60 provide `wait_for_lock` only the waiter PID; line 36 describes the target guard. | **UNREVIEWED dependency requirement.** The assigned code does not expose blocker PID/guard-key verification. The helper owner must establish what its observation proves; a generic lock wait alone does not identify the protected generation. No helper defect is asserted without its code. |
| One assignment winner under concurrent matching CAS | No two-assignment-writer race appears in these files. | **UNREVIEWED elsewhere.** Implementation notes advertise database coverage. These three concurrency tests do not independently prove a single winner or exclude duplicate successful assignments. |
| Immutable-note duplicate collapse and hidden collisions | Services lines 96-107 simulate first creation, exact retry, own mismatch, other-author collision, an invisible result, and inaccessible thread. | Useful unit branches; no concurrent insertion or real RLS collision here. Database uniqueness, same-author hidden scope, and other-author races remain **UNREVIEWED**. |
| No-ops, limits and empty state | Read absent false/0/null and assignment absent null/0/null are exact; invalid assignment versions include null, negative, fractional, string and over-maximum. | No-op preservation has R1. Assignment maximum behavior is not exercised in this slice. |
| Exact notes and byte budgets | Services lines 110-122 include whitespace, 4,096 emoji/control code points, empty, 4,097 characters, NUL and null. Lines 125-140 bound serialized list bytes, require a nonempty shortened page, and check cursor continuation from the last emitted ID/time. | Post 65,536-byte and list 262,144-byte assertions match the contract. Mock rows establish projection checks, not persisted exact text or real database pagination. The 50-item cap is exercised through a larger supplied result, with byte pressure requiring fewer items. |
| Error order and closed wire shape | Ineligible target precedes CAS; stale same-target assignment conflicts; inaccessible notes precede invalid cursor. Unit `assert_code` checks code, and the revocation race checks exact status/code/message. | Relevant priorities are present. Full exact response keys, error request IDs, HTTP mappings and middleware headers require separately owned controller/contract coverage. |
| Boundaries, authorization and secrets | Invalid boolean, caller actor field, invalid version, inaccessible thread, note length/control characters and cursor scope are exercised. Cursors use a visibly disposable test secret. | No credential exposure or direct test-input SQL interpolation observed. SQL fixture changes use bound values. Actual service validation, SQL grants and RLS are unreviewed. |
| Error handling, names, comments and complexity | Small test helpers and explicit exception propagation through thread values; comments identify separation of unit and database proof. | No additional concrete defect observed. Pool acquisition, database deadlines, rollback and lock-wait timeout enforcement live in dependencies. Formatting is reserved for linters. |
| Documentation and standards | Handoffs explicitly label runtime evidence NOT_RUN and reserve integrated acceptance for the coordinator. | This report preserves that status. No implementation, architecture, dependency or production activation change was made. |

## Published interfaces treated as unreviewed

- `CollaborationDatabaseCase` / `collaboration_database_helper`: fixture lifecycle, `create`, `scope`, `state`, `assignment`, `member_change`, connection acquisition/cleanup and lock-wait observation. Call sites were reviewed; implementations were not. Their published role is to provide actual API-role transactions, guarded admin changes, bounded database waits and task-owned fixture cleanup.
- `ThreadReadState`, `ThreadAssignment`, `ThreadNotes`: public service methods receive the current connection/identity/session; writes return a pre-serialized result with `json` and `status`; reads return JSON. Their implementation, SQL and authorization are unreviewed.
- Protected-write foundation and SQL authorization helpers: published lock order is cookie session, sorted actor/target generation guards, then business rows; guards remain held through validation/serialization/commit. Membership changes must use the same guards. Implementation and grant enforcement are unreviewed.
- `Cursors`, response projection, controllers, canonical generated consumers and other database tests: expiry/signature binding, exact envelopes/status mapping, membership/RLS/uniqueness enforcement and actual route integration are unreviewed. The service mock records calls but returns predetermined rows independently of the SQL/binds.

## Executed evidence and handoff

Executed: local read-only documentation/code inspection, physical line counting, SHA-256 hashing, AIDEV search, and Orca inbox/status operations; this report is the sole authored file. Findings were sent promptly in Orca status message `msg_dc09dfadd2b3`.

**NOT_RUN:** application tests, mutation tests, syntax/lint/type checks, database/HTTP/concurrency runtime, Docker, browser/manual UI, model calls, subagents, SSH, commits and publication. Mutation scenarios above are analytical. No Docker resources were created, so no Docker cleanup was necessary.

Next owner should strengthen the two assertions/fixtures, reconcile this report with the separate helper/database reviews, then run the authorized Docker verification. In particular, acceptance still needs evidence that observed waits belong to the expected generation guard and that exactly one assignment CAS and one identical-note insertion wins. Do not infer missing global coverage or runtime success from this bounded review.
