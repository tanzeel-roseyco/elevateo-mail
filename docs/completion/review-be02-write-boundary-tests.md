# BE-02 write boundary tests — independent adversarial review

## Result and limits

**Two medium test-evidence defects observed in 201 unique physical lines; 9.95 defects/KLOC. Runtime: NOT_RUN.** This is a static review of the assigned tests and harness, not a finding that the production boundary is exploitable or a certification that the surrounding suite is complete. Both findings describe incorrect or insufficient evidence within this assignment; other tests may cover the missing behavior and were not inspected.

- Source repository: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.
- Assignment: `write_boundary_tests`; task `task_79067a4f11c1`; dispatch `ctx_68e9235b1ba7`; run `run_5cc7ae2ab900`.
- Contract: `1.0.0-collaboration.1`; review date: 2026-10-13, Australia/Sydney.
- The coordinator corrected the proposed `write_boundary_helper.rb` path to `write_boundary_test_helper.rb` in message `msg_11eea5aab731`; the correction was acknowledged.
- Only this report was written. Source files, root tracking documents, other reviewers' outputs, and production dependencies were not changed.

## Bounded coverage and integrity

Paths below are relative to `apps/server/`. Counts include every physical line, including comments and blank lines. Each file was counted and hashed before its review pass; hashes and counts were rechecked unchanged at 10:01:15 +11:00.

| Pass | File | Inclusive range | Unique physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `test/be_02/write_boundary_test_helper.rb` | 1–106 | 106 | `C610F8082452659C1FEAECCEA15A984B6853705EA42C943EECAC6C5206E89CD0` |
| 2 | `test/be_02/write_boundary_input_test.rb` | 1–95 | 95 | `A632E77706DC5FF35F6B2EE0D81E5DEF9BFFE28618EA66CC38FA8CA2F3DF885E` |

Neither pass exceeded 200 lines; the assignment used 201 of the allowed 400 unique lines. Rereading the same lines did not increase unique coverage. Pass 1 has zero observed defects, which is not proof of correctness; both counted defects are in pass 2, with pass 1 referenced only to identify available caller scaffolding. Overall density is `2 / 201 × 1000 = 9.95` defects/KLOC.

Governing/context documents consulted include the supplied AGENTS instructions and project `AGENTS.md`, current README/state/documentation, `.planning/STANDARDS.md`, workflow/planning instructions, `docs/completion/be02-implementation-brief.md`, `be02-cd-contract.md`, `be02-drafts-implementation.md`, `be02-collaboration-implementation.md`, `be02-write-boundary.md`, and accepted `.planning/consultations/results/be-02/decisions.md`. Documentation is context, not additional reviewed code. Existing AIDEV anchors in both assigned files were read and preserved.

Contract-context hashes recorded during review:

- `docs/completion/be02-cd-contract.md`: `2F37E8ECB60F40A17AB2E1F6EDBBDA64BF5F0312C38C55161F20F6ABDE87426E`.
- `docs/completion/be02-write-boundary.md`: `F133E30D74600F944807F0E9CD5968AD4DCCC147627C3A957DB56FA5569CE7A4`.
- `.planning/consultations/results/be-02/decisions.md`: `173F9088CB548076A5A8D04CE87573F000338789744E92567BD7FA915DE680F9`.

## Findings

### WB-T01 — Medium: the short-reading double violates the byte-oriented IO contract

**Location:** `test/be_02/write_boundary_input_test.rb:52–56`, used at lines 59–64.

`ShortStream#read(maximum)` uses `String#slice!(0, [maximum, 2].min)`. On a UTF-8 string this length counts characters, whereas `IO#read(length)` limits bytes. For example, the static Ruby semantics of `ShortStream.new(+"é😀").read(2)` return both characters, totaling six UTF-8 bytes, rather than at most two bytes. Current stream fixtures contain ASCII only, so the mismatch is hidden.

**Concrete failure scenario:** a reader that wrongly validates each short chunk as complete UTF-8 could reject a valid emoji split across real IO reads. The assigned tests still accept it because their only Unicode checks pass complete strings directly to `Input.body`, `Input.object`, or `Input.text`, and the stream double never exercises split multibyte sequences. Conversely, reusing this double with a valid Unicode fixture can make correct byte-bounded code appear incorrect because the double itself over-delivers bytes.

**Minimal fix:** implement the short-reading fixture over `StringIO#read([maximum, 2].min)` or equivalent byte-oriented storage. Preserve EOF and byte-count behavior; do not add a general stream abstraction.

**Regression:** prove that each returned chunk is no larger than the requested byte count, including when an emoji is split. Read a valid multibyte value exactly at its byte budget successfully, reject the same data plus one byte, and parse valid JSON whose multibyte scalar crosses chunk boundaries. Keep field code-point limits distinct from serialized request-byte limits. These are proposed regressions, not executed examples.

**Notification:** reported to the coordinator as `msg_9904a735921c`.

### WB-T02 — Medium: byte-limit and encoding assertions do not establish caller rejection before mutation

**Location:** `test/be_02/write_boundary_input_test.rb:37–48,51–64`; caller scaffold at `test/be_02/write_boundary_test_helper.rb:73–102`.

The comment at line 51 claims independence from HTTP Content-Length, but the associated tests call `Input.read` directly and supply no headers or request. The test named `test_actual_byte_bound_and_bodyless_delete` likewise issues no DELETE request. The encoding test calls only `Input.transport!`; it cannot establish that the controller invokes that check before authentication or business work. The helper provides a controller dispatcher and arbitrary header overrides, but these assigned input tests do not use it.

**Concrete failure scenario:** a caller skips reading a body when Content-Length is zero or underreported, allowing a body-bearing DELETE to proceed, while `Input.read` remains correct. Another caller invokes the operation before rejecting gzip. All direct unit assertions in this file remain satisfied in either case; they cannot detect unauthorized body handling or an already-applied mutation. This is a caller regression gap in the assigned evidence, not an assertion that either bug currently exists in unreviewed production code or that another suite lacks coverage.

**Minimal fix:** retain the useful unit tests, narrow the comment/name to their actual scope, and add bounded dispatch regressions through the published write controller. Use an IO stream with actual bytes and an explicitly misleading or absent Content-Length. Exercise actual DELETE dispatch with `body: false`; the existing helper defaults to POST, so the request method must be set for that case. Add the unsupported Content-Encoding case at the same boundary.

**Regression:** dispatch nonempty bodyless requests with zero, underreported, and absent Content-Length; dispatch a body exceeding `max_bytes` while the header claims a smaller size; dispatch a non-identity encoding. Assert exact `400 request_invalid` and the closed error envelope, no authentication/business callback invocation, no guard/commit, and unchanged business state. Include an exact-byte-budget success control so unconditional rejection cannot satisfy the regression. Claims about real database mutation still require the separately published PostgreSQL tests.

**Notification:** reported to the coordinator as `msg_93670cf08af7`.

## Published interfaces and unreviewed dependencies

No implementation source outside the two assigned files was opened for code review. The following interfaces are taken from the handoff documents or their use in the assigned harness; they are not independently verified here.

| Component | Published/consumed interface | Assurance limit |
| --- | --- | --- |
| `V1::WriteController#protected_write` | Accepts `allowed_query`, `required`, `max_bytes`, `budget`, `guard_users`, and `body`; yields `connection:`, `identity:`, `session:`, `input:`, `query:`, `deadline:`; expects a `WriteResponse`. | Controller, API base, and application controller implementations unreviewed. The probe forwards keyword arguments and returns the operation result. |
| `Elevateo::WriteInput` | Transport checks, actual-byte stream bounds, closed JSON/query parsing, Unicode validation, and typed scalar validation. | Parser implementation unreviewed. Direct negative assertions establish intended local checks only. |
| `Elevateo::WriteResponse` / `CollaborationError` | Validate serialized object JSON and byte budget before commit; use contract statuses and bounded error envelopes; only successful responses and specified terminal conflicts may commit. | Response/error implementation unreviewed. The test named “before_commit” invokes `verify!` without a transaction. |
| Session write/guard layer | READ COMMITTED transaction; bounded deadline; session then sorted authorization-generation locks; revalidation after waits; no Auth HTTP inside the transaction. | PostgreSQL functions, session layer, privilege checks, revocation races, and other tests unreviewed. |
| ActiveRecord/Rack and `auth_test_helper` | The fake exposes pool checkout/checkin, transaction state, query/bind capture, and a guard metadata row; inherited fixtures provide cookie, configuration, metadata and session presentation. | External library and fixture code unreviewed. Returning simple arrays and an in-memory list only models the narrow orchestration surface. |

The connection double intentionally cannot prove SQL validity, locking, revocation ordering, rollback of database changes, or privilege enforcement. Its transaction method also discards the supplied options, so this harness alone does not verify READ COMMITTED isolation. Its shallow list snapshot is not a general-purpose transactional store. These are assurance limits to reconcile with the published separate database tests, not additional counted defects in this assignment.

## Checklist against the rubric and contract

| Area | Static assessment |
| --- | --- |
| Scope, line caps, integrity | Complete: two bounded passes, 201 unique LOC; initial and closing source hashes match. |
| Purpose and test-double fidelity | Keyword-forwarding probe and guard/transaction observations fit the published orchestration role; WB-T01 limits stream fidelity, WB-T02 limits caller evidence. |
| Null, empty, minimum/maximum inputs | Missing required body, extra key with null, empty stream, one-byte bodyless failure, integral/nonintegral numbers, overflow, and small Unicode scalar limits are represented. Null alone for a required key is not isolated by the extra-key case. Real route maxima and lower-bound scalar cases remain unverified here. |
| Duplicate JSON/query keys | Negative cases cover top-level, nested object, and array-contained duplicates; query duplicates include a decoded-key alias. Valid nested objects/arrays with the same key in separate sibling objects, and escaped JSON-key aliases, have no explicit control in these assigned lines; surrounding suites unreviewed. |
| Unicode | Valid accented/non-BMP scalars and a surrogate pair are present; invalid UTF-8, NUL and unpaired surrogates are rejected by expected assertions. Stream-split and full request-budget Unicode evidence is missing: WB-T01. |
| Transport and mutation safety | Exact-origin variants, media-type rejection and gzip rejection have unit assertions; misleading lengths, real DELETE handling and ordering before state mutation require WB-T02. |
| Exact statuses and wire shapes | Negative input helper checks `request_invalid` code, not its 400 status; one error case checks 404/message; request ID bounds are checked. Full closed envelope, cache/security headers, all status mappings and maximum error budget are not established by this file. |
| Serialization and response budgets | Assertions expect an 11-byte budget to accept the valid response and a 10-byte budget to reject it; invalid JSON/object/scalar cases expect `internal_error`. Overflow asserts exception type only. Real transaction rollback and endpoint-specific budgets remain outside reviewed evidence. |
| Authentication, permissions and races | Accepted priorities retained: invalid/revoked session 401 before stale-context 409; stale valid context before business semantics; inaccessible resources generic 404. No runtime or dependency review establishes those priorities or revocation behavior here. |
| Design, complexity, naming and comments | Harness stays small; no unnecessary new abstraction or obvious hot-path query loop identified. AIDEV separation of fake versus PostgreSQL evidence is useful. Byte-bound comment and bodyless/commit-oriented test names exceed direct unit evidence as described above. |
| Documentation and testing | Published handoff distinguishes deterministic tests from PostgreSQL tests and marks runtime NOT_RUN. Fixes should keep the test descriptions and handoff evidence aligned. No lint/style assessment performed; formatting belongs to linters. |

Checklist limitations are not silently promoted to extra defects or global absence claims. The two counted findings are the concrete assigned-evidence problems detailed above.

## Executed evidence and coordinator handoff

Executed actions were read-only source/document inspection, AIDEV inspection, physical line counting, SHA-256 checks, path verification, and Orca coordination, followed by writing this report. **Application tests, Docker tests, host tests, lint, typechecks, integration/concurrency tests, mutation tests and actual-client checks: NOT_RUN**, as required by the dispatch. No agents, model calls, SSH, commits, frontend work or production activation were performed.

The coordinator can assign the two minimal test repairs and then execute the existing Docker verification matrix, including real PostgreSQL isolation/revocation tests. Before counting the caller gap as outstanding across BE-02, reconcile the unreviewed controller suite with WB-T02; any existing equivalent regressions should be cited rather than duplicated. The result here is a completed bounded static review with two observed defects, not proof of production correctness or a runtime failure report.
