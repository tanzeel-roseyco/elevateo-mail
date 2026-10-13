# BE-02 draft HTTP boundary: adversarial static review

<!-- AIDEV-NOTE: Coverage is limited to the hashed 280 LOC below; shared boundary and runtime evidence remain separate. -->

Review date: 2026-10-13 Australia/Sydney. Run `run_5cc7ae2ab900`; task `task_85022b01b8d8`; dispatch `ctx_8a9b94712aef`; reviewer terminal `term_064feb26-84fd-4944-87b3-284a1d82b5f9`.

**Result: zero confirmed defects observed in 280 unique physical lines; density 0 / 0.280 = 0.00 defects/KLOC. Runtime: NOT_RUN.** This is a bounded static review, not proof that the application or its security/transaction dependencies work. No source changes or fixes were made. The known request-test runner glob omission is coordinator-owned context, not a newly discovered or independently verified defect in this assignment.

## Scope, authority and immutable review inventory

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. Paths below are relative to `apps/server`. Counts include blank lines and comments, using `System.IO.File.ReadAllLines`; hashes are SHA-256 over original file bytes. Inventory was captured before code inspection and repeated after both passes: all six counts and hashes were unchanged.

| Pass | File | Inclusive range | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `app/controllers/v1/drafts_controller.rb` | 1-42 | 42 | `c73bd590b1c79939ca55a82e1aaea74ab1f20c81a7e24399f48840fb4edfecf0` |
| 1 | `app/controllers/v1/draft_operations_controller.rb` | 1-15 | 15 | `1c24ec24f58f22bbd57a75681ba5a1157d5a8e1176cbaa417c60b321badea89e` |
| 1 | `sig/drafts.rbs` | 1-51 | 51 | `21eec472bdaa493658cd193c97643e6811e3621813ea3a3aab403d84060c69dc` |
| 1 | `sig/draft_operations.rbs` | 1-12 | 12 | `ae43997d3b843878deb554381ab7f31c80de7b517e2d9c06b3a161af0d0e2cf6` |
| 1 | `sig/drafts_controller.rbs` | 1-14 | 14 | `19686015ae9c53b46381ccc5c4fc76adc37f6fa9ee26f5bab34fada822f9f26a` |
| 2 | `test/requests/drafts_test.rb` | 1-146 | 146 | `eadd07467d20d69c29af3e3c6b9b8f906d3354e4df060f398561dc7739df8a7f` |

Pass 1: **134 LOC**, zero observed defects, **0.00/KLOC**. Pass 2: **146 LOC**, zero observed defects, **0.00/KLOC**. No overlap: **280 unique LOC** total. Each pass stays below 200; assignment stays below 400. No dependency implementation was added to coverage. Documentation, inventory commands and this report are not code-review LOC.

Context consulted: supplied full review rubric and project `AGENTS.md`; root README/state/documentation current checkpoints; `.planning/STANDARDS.md`, `.planning/README.md`, `.planning/AGENT_ORCHESTRATION.md`; local-completion handoff; `docs/completion/be02-implementation-brief.md`, `be02-cd-contract.md`, `be02-drafts-implementation.md`, `be02-write-boundary.md`; accepted `.planning/consultations/results/be-02/decisions.md`. The exact C/D contract `1.0.0-collaboration.1` governs newer wire details. AIDEV anchors were inspected at both controller line 4 locations and request-test line 29.

## Findings

No concrete correctness, security, state mutation, or maintainability defect was established within the assigned code. There are therefore no defect entries requiring severity/location/fix/regression records. Evidence limitations below are explicit acceptance work, not claims of defects in unreviewed dependencies or fabricated proof of correctness.

## Review checklist and observed evidence

| Area | Static result and precise limitation |
| --- | --- |
| Actual protected-write interface | `DraftsController#update`, lines 20-26, matches the published `protected_write(required:, max_bytes:, budget:)` interface. It uses yielded `connection`, authenticated `identity`, `session`, and parsed `input`; invokes `DraftOperations#save` inside the callback; and returns that result without rendering early. `sig/draft_operations.rbs:7` declares `WriteResponse`, matching the boundary's published return requirement. |
| Request and response budgets | PUT supplies exactly 1,048,576 received bytes and 4,096 response bytes. Lookup supplies 4,096. List/detail use `SUMMARY_BYTES`/`FULL_BYTES`, whose published values are 262,144/2,097,152. Their actual definitions and enforcement are unreviewed; declarations alone do not prove those values. |
| Query and path boundaries | List allows only `mailbox_id,cursor,limit`; detail only `mailbox_id`; lookup only `mailbox_id,draft_id`. PUT relies on the published empty-query default. Both path readers reject non-String values and pass strings to the appropriate domain boundary. UUID canonicalization, required-query presence, duplicate/percent-encoded query rejection, and complete seven-field `FIELDS` contents remain delegated, not independently established. |
| Body validation and null/empty/max inputs | PUT uses the shared required-field constant and constructs a typed payload from the validated input, not from merged body parameters. Authored tests include an empty editable draft (`subject`, `body_text`, `to`; null reply), duplicate subject keys, actual oversized JSON despite a false Content-Length, maximum Unicode/control-escaped input, and subject max+1. The test named for nullable addresses actually supplies non-null recipient members; nullable recipient members are not evidenced by this assigned test. Other payload-unit coverage is unreviewed. |
| Authentication, CSRF and priority | All four actions inherit the protected boundary and do not accept caller actor/org authority, bypass authentication, open their own transaction, or make direct Auth HTTP calls. Published boundary responsibilities include session proof/Origin, 401 before stale-context 409, then current resource authority before business conflicts. This slice contains no direct route-level CSRF/Origin/auth-priority regression and cannot prove those inherited behaviors. |
| Foreign resources and wire errors | The hidden-save test at lines 101-107 asserts 404, exact message `This item is unavailable.`, and no fake operation mutation. The conflict test at lines 87-99 asserts status 409 and the closed current-request error envelope. The controller passes the current request ID to the save service. Generic error size, all error codes, and header protections other than the asserted success `no-store` remain dependency/integration checks. |
| JSON before COMMIT | The controller returns the save service's result inside the protected callback; no commit occurs directly in these controllers. Tests at lines 87-99 expect both success and terminal conflict to finish with `begin,guard,save,commit`; lines 127-133 expect an invalid version-zero projection to produce 500/rollback with no retained fake business entry. These are useful authored checks, but no runtime execution or independent serializer/transaction implementation review occurred. |
| Read results and uncertainty | Lines 135-144 assert an empty closed summary envelope, missing-draft 404, and operation `unknown`. Operation lookup forwards the path operation ID and both required query identifiers; it does not reinterpret `unknown` as not-performed. A successful full-draft read, nonempty/max page, applied/conflict/expired lookup shapes and actual cursor behavior are not demonstrated by this request test. |
| Revocation and durable state | Controllers share the session/connection supplied by the protected boundary and introduce no cache, alternate authority or extra transaction. Session-then-generation-then-business locking, serialization under guards, conflict-ledger atomicity, replay A after B, expiration and revocation races belong to unreviewed dependencies and real PostgreSQL tests. A whole old read snapshot after revocation is permitted by the accepted contract; unconditional retroactive denial is not an acceptance requirement. |
| Types and design | Controller method names/signatures agree within the assigned declarations. The two short controllers own HTTP adaptation and delegate domain rules; no new abstraction, unnecessary loop, duplicated business algorithm or speculative feature is present. The reader factory centralizes repeated construction. RBS checking itself is NOT_RUN. |
| Comments and documentation | Controller anchors explain transaction reuse and lookup uncertainty; the test anchor correctly distinguishes the real controller/serializer from fake SQL. The implementation handoff lists these routes, caps and authored tests and explicitly leaves execution pending. Formatting is left to linters. |
| Regression inventory | Six authored test methods cover success and multiple failures, including invalid transport, hidden scope, invalid projection, overlong subject, and a durable terminal conflict. They are not accepted as passing evidence. No test or production file was changed. |

## Unreviewed dependencies and published interfaces

`V1::WriteController`/`ReadController` publish protected callbacks supplying authenticated connection/session/query/input state; they own raw query/body parsing, origin/CSRF/context checks, response validation/headers and error translation. `SessionWrites` and protected-write SQL publish session/generation guards and commit only after bounded serialization. Their implementations, signatures and test helpers were not inspected.

`Drafts::Payload` publishes validated semantic input and canonical digest construction. `Drafts#list/#detail` publish already serialized read JSON. `DraftOperations#save` publishes `WriteResponse`; `#lookup` publishes serialized metadata. `Drafts::Database`, projections, `Cursors`, read-response helpers, SQL/RLS/migrations, routes, framework configuration and their remaining tests are unreviewed. Documentation claims about these components are interface context, not this review's validation.

The assigned request harness subclasses production controllers, injects fake configuration/session services and a fake database adapter, then calls `controller.action(action).call(env)` at lines 69-82. It supplies path parameters directly and always uses a drafts URL, including the operation action. Consequently it does not exercise route recognition or the full application middleware stack. This is an evidence boundary, not an assertion that the production routes are incorrect. No claim of real PostgreSQL commit, real Auth, network HTTP, concurrency, or browser execution follows from these tests.

## Remaining acceptance and executed evidence

Coordinator integration should include the known omitted `test/requests/drafts_test.rb` in the Docker run; execute its six tests alongside shared input/controller/deadline, payload/read, database/authorization/concurrency suites; and verify the integrated routes and middleware using distinct operation/draft identifiers. Required acceptance still includes invalid/missing Origin/CSRF/context, revoked+stale priority, closed and duplicate query/path/body inputs, successful full and bounded list responses, all operation outcomes, exact byte/header/error budgets, and deterministic revocation/serialization-before-commit failures. These are already contract requirements, not new scope or findings in unreviewed files.

Actually executed: filesystem existence checks, bounded textual inspection, initial/final physical-line counts and SHA-256 inventory, AIDEV searches, Orca inbox checks/status delivery, and creation of this report. Application lint, typecheck, unit/request/integration/concurrency tests, Docker, host application tests, SSH, browser/UI, model/agent calls, commits and publication: **NOT_RUN / not performed**. No disposable Docker resource was created, so no task cleanup is owed. Source and other workers' files were preserved; only this assigned report was written. Coordinator owns root-state and `code-reviews.md` reconciliation.
