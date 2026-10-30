# BE-02 adversarial review: write transport

## Result

**One observed P2 defect; runtime NOT_RUN.** The input boundary can accept mathematically fractional JSON numbers after binary floating-point rounding. The remaining inspected transport logic has no additional definite defect established within this assignment; that is zero additional defects observed, not proof of correctness.

Assignment: `write_transport`, task `task_069b002bab3c`, dispatch `ctx_f7c8d026bc24`, run `run_5cc7ae2ab900`. Source repository: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. All source paths below are relative to `apps/server/` unless explicitly identified otherwise. This report is the sole file changed, in the coordinator's Local Completion repository.

Review basis: the supplied full adversarial rubric; governing AGENTS instructions and `.planning/STANDARDS.md`; relevant current-state material in README, state and documentation; local-completion and orchestration instructions; `docs/completion/be02-implementation-brief.md`, `be02-cd-contract.md`, `be02-drafts-implementation.md`, `be02-collaboration-implementation.md`, `be02-write-boundary.md`; and accepted `.planning/consultations/results/be-02/decisions.md`. The C/D contract is **1.0.0-collaboration.1**. Historical prose outside the relevant current-state sections is not additional code coverage.

## Coverage and measurement

Files were counted and SHA-256 hashed before inspection. The final hash/count check matched the initial inventory for every assigned file. Physical LOC includes blank lines and comments; no unassigned implementation or test source was opened.

| Pass | Assigned range, inclusive | Physical LOC | SHA-256 |
| --- | --- | ---: | --- |
| 1 | `lib/elevateo/write_input.rb:1-123` | 123 | `6536C922F1F64836720CA5ACD193E390036AE092C5E932F9D86321854591F24D` |
| 1 | `lib/elevateo/write_response.rb:1-27` | 27 | `64964FD1AE92F0C94470E80A1937A2050C10FE62637010126D08F5E98C5A6B39` |
| 1 | `lib/elevateo/collaboration_error.rb:1-38` | 38 | `BF6E4FC1E32FDDFF67A871B7450F0BEF46DA93780D5BBB21D5D8F598C52F4AD3` |
| 2 | `app/controllers/v1/write_controller.rb:1-48` | 48 | `A8755E7DFE2C279209D2FB5F242BEC628C604A62A78C0C2A489E47EA1E7B6D10` |
| 2 | `sig/write_input.rbs:1-22` | 22 | `F2ED45554AB9A6A4748C0159D8A5E3C2492E7EA2C22EAD496F09E41FFF488239` |
| 2 | `sig/write_controller.rbs:1-13` | 13 | `37D2D3F8F8B5F90DD7FBC87EAE2B9FC8B25DFC235EB7D549261466D64DCF968D` |
| 2 | `sig/write_response.rbs:1-8` | 8 | `BDE029FD025B65C960214436FB2C6E5145093FBE240C584B698C8EF7CF4C8861` |
| 2 | `sig/collaboration_error.rbs:1-10` | 10 | `101EB25D0CA89A5301B338086857821BE14D182F32099D80090D2821E56A5A63` |
| 2 | `config/routes.rb:1-34` | 34 | `64E46D57BE35229723054543A139595E6741E28676C1BFBCE3B892165978888C` |

Pass 1: **188 LOC**. Pass 2: **135 LOC**. A focused reread of the response/error files covered 65 already-counted lines. Each inspection pass stayed below 200 physical lines. Assignment total: **323 unique physical LOC**, below the 400-line ceiling, comprising 270 Ruby and 53 RBS lines.

Observed defects: **1**. Defect density: **1 / 323 x 1000 = 3.096 defects/KLOC**. These are bounded static-review metrics, not an estimate of all remaining defects. The coordinator can incorporate this record into `code-reviews.md`; this dispatch explicitly permits only the assigned report output.

## Finding WT-01 — P2 / medium: fractional JSON numbers become valid integers

**Location:** `lib/elevateo/write_input.rb:46` and `:110-113`.

**Contract:** C/D JSON numeric fields accept mathematical integers within their bounds. In particular, ResourceVersion is 0 through 2147483647. Numeric strings are invalid, while mathematically integral JSON spellings such as `1.0` and `1e0` must remain equivalent to `1`.

**Failure scenario:** a caller supplies `expected_version: 0.99999999999999999` as an unquoted JSON number in an otherwise valid draft request. `JSON.parse` uses a binary Float for the decimal token and loses the distinction between that fractional value and `1.0`. The later `value == value.to_i` check therefore accepts the rounded value and returns integer 1. A save or version comparison can proceed against version 1 instead of rejecting the malformed numeric value with 400 `request_invalid`. The same parsing/validation seam can round an extremely small nonzero exponent such as `1e-400` to zero, or a fractional value immediately above the maximum back into the accepted range.

This is a static trace through the parser and integer validator, **not an executed Ruby request or test result**. The bounded defect is loss of exact JSON-number semantics; no unauthorized write or end-to-end database outcome was executed or claimed.

**Minimal fix:** retain an exact decimal representation or numeric-token information until mathematical integrality and range have been checked, then normalize accepted numbers to Integer. Update the shared scalar validation and its relevant RBS/value types together. Do not simply reject all decimal/exponent spellings or all Float values: that would also reject valid mathematical integers such as `1.0` and `1e0` required by the contract. Keep the existing byte and nesting bounds and preserve the contract's syntax/authentication/context/scope precedence.

**Regression requirements:** exercise the raw JSON parser followed by the integer boundary, not only preconstructed Ruby values. Reject `0.99999999999999999`, `1e-400`, `-1e-400`, and `2147483647.0000001`; accept equivalent integral spellings of 0, 1 and 2147483647; retain rejection of numeric strings, booleans, null and out-of-range integers. Add an otherwise authorized request regression proving that the rounded fractional version returns 400 and does not mutate data or create a durable operation record; retain the specified authentication/context precedence for invalid-authority requests. Run the relevant existing input, request and transaction regression suites in the coordinator's Docker environment.

**Notification:** reported promptly through Orca escalation `msg_bbf55ef6c435` before report completion.

## Checklist and bounded observations

| Area | Static review result and remaining limit |
| --- | --- |
| Duplicate JSON keys and closed request objects | `UniqueObject#[]=` rejects an already-present decoded key; `body` requires the exact required-key set. Nested objects use the same configured class. Parser behavior and duplicate-key fixtures were not executed. |
| Unicode, null and empty values | Raw JSON must be valid UTF-8; recursive string checks reject NUL and surrogate code points. Scalar helpers reject incorrect null/type values. Text limits use character length and explicit empty-string policy. Route-specific optional/nullable field semantics belong to unreviewed callers. |
| Actual request bytes and short reads | The reader consumes at most the configured maximum plus one sentinel byte and continues across short reads; it does not rely on Content-Length. A zero maximum rejects a nonempty DELETE body. Rack stream behavior was not executed. |
| Query parsing | Raw query size is capped at 8192 bytes; each component is percent-decoded once; malformed escapes, repeated decoded keys and keys outside the allowlist are rejected. Bracket-array keys do not bypass the allowlist. Canonical decimal list/revision parsing and cursor validation are caller/dependency responsibilities outside scope. |
| Origin, content type and content encoding | Exact expected Origin comparison, the bounded UTF-8 JSON media-type pattern and identity encoding are checked before body processing. Missing content type is allowed only for the no-body branch. Actual server header normalization was not executed. |
| Integer and maximum semantics | **WT-01** prevents claiming exact integer conformance. Range bounds are otherwise explicit; no finding was established in UUID normalization or strict boolean validation. |
| Protected-write ordering | Transport, raw query/body and header syntax precede authentication. The controller authenticates before entering the documented SessionWrites transaction; at most two caller-supplied target UUIDs are normalized. Current authority, stale-context precedence and revocation checks under locks belong to the unreviewed transaction/session foundation. |
| Inherited callback and Rails params risks | The assigned controller uses raw `request.query_string` and the body stream, with no `params` access. Root supplied the inherited callback interface described below: no inherited body parser or authentication before-action. Individual C/D controllers' `request.path_parameters` usage is documented but unreviewed; full Rails dispatch/recognition is NOT_RUN. |
| Error shape and vocabulary | The assigned error builder emits exactly code, fixed message and bounded nonempty request_id, with the exact generic 404 text. NUL removal, UTF-8 repair and a conservative byte bound keep IDs bounded. `Retry-After` is restricted to 429/503 and range 1..300; its Integer type is declared in RBS, while the runtime constructor checks range only. Conformance of internal caller types was not reviewed. |
| Response status, serialization and commit seam | Serialized bytes are copied/frozen; the verifier checks positive budget, actual bytes, a JSON object and 2xx/409 status, converting validation failures into `internal_error`. It does not itself verify full response schemas, terminal-conflict code/status relationships, or a separate 4096-byte error cap when passed a larger success budget. See the assurance limit below. |
| State and races | The boundary passes identity, context, version, CSRF, target guards, deadline and budget into SessionWrites. No transaction/revocation implementation or race was reviewed/executed here. Immutable serialized bytes avoid subsequent mutation of the caller's original string. |
| Scope, structure and performance | The small input/error/response modules have distinct roles; no additional definite over-engineering, duplicated business logic, hot database loop or unrelated behavior change was established. Bounded parsing and recursive validation scale with the bounded request/response. Database query costs are unreviewed. |
| Typing, comments and documentation | Assigned RBS signatures and relevant AIDEV anchors were read. Comments explain transport separation, actual-byte enforcement, terminal-conflict commits and error-ID repair. No typecheck/linter ran. Documentation records the new contract and test intent, not successful runtime acceptance. |
| Happy/failure-path tests | Published test inventories describe input, controller, rollback, deadline, SQL permission and concurrency coverage. Test source is outside this assignment, so coverage adequacy and passing status cannot be certified; WT-01's regression remains required. |
| Formatting | Delegated to the coordinator's lint pipeline; no style defects or formatting changes are asserted. |

### Response-schema assurance limit, not a second established product defect

`WriteResponse#verify!` is a structural/byte guard, not a complete contract validator. For example, a constructed 409 response containing `{}` satisfies its visible checks. A 409 response also inherits the supplied route budget rather than imposing the contract's independent 4096-byte error ceiling. These are static properties of the assigned class, not executed tests.

The published service interfaces say that business projectors validate output and construct only the appropriate success or terminal conflict responses before commit. Those implementations are unreviewed in this assignment, so I cannot establish that a live caller emits an invalid envelope, nor certify that every caller enforces the missing invariants. Cross-file integration review must verify exact closed wire shapes, permitted statuses/codes, current-request IDs and the error ceiling before the transaction commits. Do not infer full serializer or rollback safety from this bounded transport review alone. Coordinator clarification was requested as `msg_a32fb8ed8819`; no reply was available at report completion, so this remains an explicit assurance limit rather than an additional counted defect.

## Route declaration inventory

The declarations in `config/routes.rb:21-33` contain the expected 13 C/D operations across nine route patterns:

| Method | Path |
| --- | --- |
| GET | `/v1/drafts` |
| GET, PUT | `/v1/drafts/:draft_id` |
| GET | `/v1/draft-operations/:operation_id` |
| PUT | `/v1/threads/:thread_id/read-state` |
| GET, PUT | `/v1/threads/:thread_id/assignment` |
| GET, POST | `/v1/threads/:thread_id/notes` |
| GET | `/v1/mailboxes/:mailbox_id/members` |
| PUT, DELETE | `/v1/mailboxes/:mailbox_id/members/:user_id` |
| GET | `/v1/search` |

The static declarations are present. Actual Rails recognition, encoded-path handling, callback invocation and controller loading are **NOT_RUN**, and individual action implementations are **UNREVIEWED**.

## Published dependency interfaces — source UNREVIEWED

- **ApiController / ReadController / ApplicationController:** coordinator response to Orca question `msg_623de604e5ea` states that ApplicationController registers generic StandardError handling; ApiController registers `around_action :api_boundary` plus AuthError rescue; the boundary creates the deadline/security headers and yields; `api_body` is explicitly invoked rather than a callback. ReadController adds no callbacks and its explicit `protected_read` owns read parsing/authentication. This is root-supplied dependency context, not added source coverage. Accordingly no inherited callback defect was established in `protected_write`.
- **SessionWrites and deadline foundation:** the documented transaction interface receives the authenticated identity and request authority tuple, locks session then sorted generation guards then business rows, rechecks authority, invokes the business block, and verifies serialization/deadline before commit. Raised errors and invalid/oversized responses roll back; terminal draft conflict ledgers may commit through a serialized 409. Native PostgreSQL timing, pool checkout, rollback behavior and actual revocation races are separately reviewed dependencies, not evidence from this dispatch.
- **Draft and collaboration services/projectors:** documented callers own resource semantics, exact successful payloads, correct success/conflict statuses, protected scope checks and response projection validation. Draft terminal conflict/replay handling, note 201 versus 200 behavior, memberships, cursor semantics and target eligibility were not inspected.
- **Rack, Rails and JSON runtime:** relied on their published integration role only; no framework or installed dependency source was inspected and no runtime assertion was executed.

## Executed evidence and remaining work

Executed: read-only file count/hash inventory, assigned source/RBS and documentation inspection, focused static reasoning, Orca check/heartbeat/escalation and coordinator interface clarification, final matching source hash/count check, and creation of this report. No application code was executed.

**NOT_RUN:** lint, typecheck, unit/integration/request tests, actual route recognition, database/Auth execution, transaction/revocation/concurrency tests, deadline timing, Docker, browser/UI checks and deployment. No source edit, agent/model call, SSH, commit, push, live send or external-channel post occurred. No Docker resources were created or require cleanup.

Remaining: fix WT-01 with exact numeric parsing and regression coverage; finish cross-file response/authority assurance in the separately assigned reviews; then run the required application checks in Docker under coordinator ownership. This review is complete as a bounded static assignment and is not application acceptance or approval to publish.
