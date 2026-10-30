# BE-02 membership service: bounded adversarial review

Review date: 2026-10-13 Australia/Sydney (2026-10-12 UTC). Source workspace: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. Run: `run_5cc7ae2ab900`; task: `task_a45d5164ef83`; dispatch: `ctx_ec58e0e39adf`.

**Result: zero observed defects in 357 unique physical lines; 0.00 defects/KLOC. Runtime: NOT_RUN.** This is a static, bounded review of the assigned controller, membership service/input validator, signatures and unit-test adapter. It does not prove application correctness or accept the unreviewed database, HTTP boundary or concurrency implementation.

## Authority and scope

The supplied full adversarial review rubric was applied against the project instructions and `.planning/STANDARDS.md`, the current-state context in `README.md`, `state.md` and `documentation.md`, `.planning/README.md`, `.planning/AGENT_ORCHESTRATION.md`, and these implementation authorities:

- `docs/completion/be02-implementation-brief.md`
- `docs/completion/be02-cd-contract.md`, canonical contract **1.0.0-collaboration.1**
- `docs/completion/be02-drafts-implementation.md`
- `docs/completion/be02-membership-search-implementation.md`
- `docs/completion/be02-write-boundary.md`
- `.planning/consultations/results/be-02/decisions.md`, including D05 authorization ordering and snapshot/guard semantics

Only the six assigned source files below were inspected as code. Dependencies were treated through their documented interfaces and are **unreviewed**. Physical LOC counts include blank lines, comments, signatures and tests. Counts and SHA-256 hashes were collected before source review and rechecked afterward; all six matched. Re-reading an assigned range does not add unique coverage. No pass exceeded 200 physical lines; total unique coverage is below the 400-line assignment cap.

## Coverage and fingerprints

All paths below are relative to `apps/server/` in the source workspace.

| Pass | File and inclusive range | Physical LOC | SHA-256 |
| --- | --- | ---: | --- |
| 1 | `lib/elevateo/mailbox_membership_input.rb:1-35` | 35 | `5840d6c8e7227db458c3e81c30a4f47e9d152ffb33a9ce211c37251686389a7c` |
| 1 | `lib/elevateo/mailbox_memberships.rb:1-97` | 97 | `4e1f78b319c1cbeb713cb2e3d4d0b5dd79feec1f641ce037d0a2e504a4f54050` |
| 1 | `app/controllers/v1/mailbox_members_controller.rb:1-47` | 47 | `00d878968c96197ddb8015f56c0385a740cea5798850e3166f4cba642851a51b` |
| 2 | `sig/mailbox_memberships.rbs:1-36` | 36 | `bf0108a5efeec2ae42a34ffe172b54e3eff9f799b78e361590030b8848041276` |
| 2 | `test/be_02/mailbox_membership_test.rb:1-88` | 88 | `dcbaf465c08bcc4e46b812a21d82af610e5b444368c01befa686c090871eebed` |
| 2 | `test/be_02/mailbox_membership_test_helper.rb:1-54` | 54 | `ec2122734dbeb77145172f170465865d135d2312c77fc98b11aaea15e2ac4410` |

Pass 1: **179 LOC, zero observed defects, 0.00 defects/KLOC**. Pass 2: **178 LOC, zero observed defects, 0.00 defects/KLOC**. Combined: **357 unique physical LOC; 0 / 0.357 = 0.00 defects/KLOC**. No dependency code or fixture implementation is included in that denominator.

## Findings

No concrete defect was established in the assigned code. Accordingly, there are no severity/location/failure/fix/regression finding entries. The limitations and pending checks below are evidence gaps, not asserted implementation defects. Zero observed defects is not proof that the feature works end to end.

## Review checklist and static evidence

| Area | Static assessment and limits |
| --- | --- |
| PUT capabilities closure; null/empty/unknown inputs | Input validator lines 12-20 requires exactly the three capability keys, validates each boolean, and closes the PUT envelope. Null/empty capabilities and extra/string-valued flags have negative test cases. Top-level Hash/string-key guarantees are supplied by the documented protected-write parser; arbitrary Ruby objects are not its external-input contract. |
| Canonical expected version | Input lines 17-27 separates JSON mathematical integer validation from canonical decimal DELETE query parsing. DELETE disallows signs, leading zeroes, fractions, exponents and whitespace, and range-checks against 2147483647. Tests exercise mathematical `7.0`, the DELETE maximum, missing revision, negative/fraction/string/null/out-of-range values and malformed decimal strings. |
| Bodyless DELETE and transport constraints | Controller lines 24-30 selects `body: false` and only `expected_membership_version`; PUT lines 14-20 declares both required fields with no added query keys. This matches the published write-boundary interface. Actual received-byte rejection, content type, duplicate keys and encoding enforcement reside in the unreviewed boundary. |
| Manager/resource priority and cursor handling | Service lines 18-35 requests the manager-authorized mailbox revision before decoding the cursor. A nil revision raises generic `not_available`; the assigned test checks 404 and exact message before an invalid cursor. Cursor scope includes resource `mailbox_members`, canonical mailbox, membership revision, ascending user order and effective limit. Position has only `user_id`. Revision change invalidation is explicitly tested. Actor/org/context/generation binding and signature/expiry validation are delegated. |
| Empty/max rosters and response budgets | The service requests at most limit + 1 rows, projects only user ID and the three booleans, and passes the documented mailbox byte budget to `ReadResponse.page`. Empty roster, limit 1, default 50, continuation, 51 rejection and <=131072 serialized bytes are asserted in the unit source. The 50-member fixture is small; it does not independently prove budget-driven page reduction. Whole-entry truncation/cursor selection belongs to the unreviewed page serializer. |
| Membership changes and state coupling | Service lines 60-64 uses a fixed parameterized SQL function call with actor session digest, canonical mailbox/target, expected revision and explicit deletion/flag bindings. No membership table is mutated directly here. Stale-version-before-no-op, last-manager protection, current target eligibility and exactly-once revision/generation changes are SQL responsibilities outside this review. |
| Fresh self-demotion proof | Service lines 69-90 validates returned metadata identity and generation, then replaces the envelope authorization version using the returned metadata. It does not sign the pre-write generation. The unit test asserts the generation-42 proof differs from generation 41 and checks the closed response fields. This verifies an authored serialization assertion, not a real self-demotion transaction or guard race. |
| Malformed database values and deliberate errors | Service lines 65-93 checks the result object, metadata actor/org/generation, membership revision, member identity and exact capability keys/types. Projection failures map to `internal_error`; conflict maps to `membership_conflict`. Tests include malformed metadata, missing generation and malformed capabilities. JSON parsing, scalar validation and SQL-status error mapping are delegated to unreviewed shared helpers. |
| Write wire shape and byte limit | Service lines 90-92 constructs the six-field result through the documented two-field session envelope, emits null member for DELETE, and verifies the actual generated JSON against 4096 bytes. PUT member projection excludes extra database fields. The controller relies on documented default PUT input/response budgets of 8192/4096. A successful DELETE result is not directly asserted in the assigned unit file. |
| Security and performance | Caller actor/org grants are absent; fixed SQL and typed bindings avoid interpolating external SQL. Roster work is bounded by 51 rows and three flags per row; there is no visible per-member query loop. Authorization correctness, fixed request deadlines and query execution plans remain outside the assigned service adapter. |
| Simplicity, naming, signatures and comments | The input module validates, the service projects/calls SQL, and the controller selects the boundary. Validation is intentionally repeated at the controller guard and service entry, using one shared implementation. No unnecessary abstraction or tangled loop was observed. RBS describes the inspected public/private methods; strict typecheck was not executed. AIDEV anchors at input line 7, service line 9, controller line 4 and helper line 9 explain the cross-file authority/test boundaries. Self-demotion and database-projection comments explain relevant intent. No source comments were changed. |
| Tests and documentation | Six authored unit tests cover normal input/list/mutation paths and multiple invalid-input/database-result paths using a recording adapter. The helper fails on unexpected extra SQL calls. The implementation and boundary docs describe the split between adapter unit tests and real-role SQL/concurrency evidence and do not claim runtime acceptance. Separate database/concurrency suites mentioned in those docs were not opened or executed. Formatting is reserved for linters. |

## Unreviewed interfaces and required integration evidence

These are prerequisites for the coordinator's acceptance, not new implementation choices or findings:

1. **WriteController / protected_write / SessionWrites:** the published boundary accepts required body keys, query allowlists, `body: false`, byte budgets and a validated target-user callback. It authenticates and checks context, holds session then sorted actor/target generation guards, and commits only valid serialized business results. Its code was not reviewed here. Verify actual body bytes on DELETE even without Content-Length, strict JSON/query parsing, write proofs, response headers, 10-second deadlines, rollback on serialization failure, and 401-before-409-before-resource/business priorities.
2. **ThreadReads / protected_read / Cursors / ReadResponse:** documented reads use one read-only repeatable-read snapshot. Shared scope construction and cursor codecs supply actor/org/context/generation binding, signing and expiry; the page serializer enforces byte caps and continuation. Verify cross-actor/org/context/generation/mailbox/route/limit cursor rejection, valid empty pages and whole-entry pagination. A complete old response after snapshot S is allowed by D05; mixed authority is not.
3. **Published SQL functions:** `app.mailbox_membership_version`, `app.mailbox_members_page` and `app.change_mailbox_membership` own manager/current-org scope, ordering, guarded membership mutations and revisions. Verify resource/manager/target 404 before stale revision, stale revision before no-op, matching absent DELETE, maximum-version changing versus no-op behavior, last-manager serialization, generation bumps, and writer/revocation orderings with real roles and deterministic barriers. These functions and their migrations are unreviewed.
4. **Projection, session presentation and error helpers:** `WriteInput`, `ThreadProjection`, `SessionStore.check!`, `SessionPresentation` and `WriteResponse` supply shared scalar validation, bounded JSON parsing, error translation and proof/serialization behavior. Verify malformed database scalar cases, successful DELETE null output, fresh self-demotion proofs under actual locks, and exact error envelopes/budgets. No additional helper code was read.
5. **Contract fixtures and broader suites:** the helper consumes existing session/thread fixtures; fixture contents, route wiring, OpenAPI definitions and other test suites are outside assigned code coverage. The document contract was the authority for this review. The coordinator must execute lint, strict typing and appropriate unit/integration/contract/concurrency checks in its authorized Docker lane before making a runtime acceptance claim.

## Executed evidence and handoff

Executed: read-only document/source inspection, AIDEV anchor inspection, physical line counting, SHA-256 capture/recheck, and Orca dispatch checks/heartbeat. A PowerShell hash-recheck pipeline initially failed to parse and was corrected; the subsequent complete six-file recheck succeeded with the original hashes. This was filesystem evidence, not application testing.

**NOT_RUN:** application execution, unit/integration/concurrency tests, lint/typecheck, Docker, SSH, frontend/browser/visual verification, or performance measurement. No agents/model calls, ultrareviews, commits, pushes, live sends or external-channel posts occurred. The only created file is this assigned report; source and other workers' artifacts were preserved. No Docker resources were created and no cleanup was needed. Repository-wide review consolidation and any dedicated design review remain with the coordinator.

Coordination used the [Orca CLI skill](C:/Users/Tanzeel/.agents/skills/orca-cli/SKILL.md) and [orchestration skill](C:/Users/Tanzeel/.agents/skills/orchestration/SKILL.md), with dispatch reporting through the provided `orca orchestration` commands.
