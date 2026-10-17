# BE02 repair review: exact numeric input and byte streams

Review date: 2026-10-13 Australia/Sydney. **Static review complete; all runtime acceptance NOT_RUN.**

Observed new defects: **0 across 289 unique physical source lines; 0.00 defects/KLOC**. This is the result of the bounded inspection below, not a claim that the application or unreviewed callers are defect-free. WT-01 and WB-T01 are **statically addressed**. Two test-evidence gaps and the outstanding integration/signature gates are recorded separately; they are not counted as implementation defects.

## Identity, authority and scope

- Coordinator: `term_8f25c176-1dd9-44a7-925d-664e96ec7ca7`.
- Actual reviewer terminal: `term_f4d1a3c3-0c92-4375-9bbd-9bcd0ecd4e7b`.
- Task: `task_edc268eb57ba`; dispatch: `ctx_1299e79d788a`; run: `run_5cc7ae2ab900`.
- Requested identity: independent Codex correctness reviewer. Orca launch metadata requests `codex`, with model and effort unspecified/null. Observed Orca projection reports provider `codex`, model `gpt-6-astra`; the terminal preview displays `GPT-6-Astra max`. These are observed metadata, not a claim of separate provider attestation. No additional agent/model was called.
- Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.
- Coordinator checkout and sole written artifact: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion/docs/completion/review-be02-repair-numeric-input.md`.

The latest dispatch controls this read-only review. Applicable global/project AGENTS instructions, current README/state/documentation sections, `.planning/STANDARDS.md`, `.planning/AGENT_ORCHESTRATION.md`, the repair manifest, the three original coordinator reports and relevant frozen C/D contract prose were read. The full rubric supplied in this dispatch was used despite historical documentation saying that rubric was unavailable. No source, tests, root documentation, code-reviews ledger or commits were modified. Formatting belongs to lint/CI; lint is NOT_RUN here. No application or syntax execution, Docker, SSH, extra agents, activation or external posts occurred.

## Frozen source coverage and integrity

All hashes are full-file SHA-256, verified before source review and rechecked before completion. The pre-completion recheck at `2026-10-12T23:41:51.7401663Z` matched every pin; no drift was observed. Inclusive physical counts include comments and blank lines.

| Pass | Source path relative to source root | Inclusive range | Physical lines | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `apps/server/lib/elevateo/write_input.rb` | 1-133 | 133 | `87aa266b2c9f54eb921e57581009970081b3dc82a0b6ec8d9049f27317985f76` |
| 1 | `apps/server/sig/write_input.rbs` | 1-25 | 25 | `1a84a2e6f5234bd25940e03f0cbec5ad5e62304838722b2a1d37db085193e407` |
| 2 | `apps/server/test/be_02/write_boundary_input_test.rb` | 1-131 | 131 | `2045b4ec9c18b6ac32bd4239ce1f44c258fe738b8c698329f0845ac47b26bf94` |

Pass 1: **158** lines. Pass 2: **131** lines. Combined unique source: **289**, with no overlap or additional implementation/helper/upstream source inspected. Each pass is below 200; total is below 400. Documentation code fences/source snippets outside this allocation were omitted. Prose and whole-file hash/count metadata are not additional source coverage.

Repair manifest: `docs/completion/be02-write-input-repair.md`, 105 prose/document lines, SHA-256 `4bcbc54bedebb276cee9d43f6b05d9e9e9a06f7bcc3beb5b77dd6f98a5280d43`.

The static API reasoning uses the manifest's explicitly reported pinned contracts: JSON 3.0.2 converts the original decimal/exponent token via `decimal_class`; `allow_duplicate_key` rejects duplicates before post-parse `object_class` conversion; BigDecimal 4.1.3 provides string conversion, underflow exception mode and `save_exception_mode` restoration. The manifest attributes these to the [pinned JSON parser](https://github.com/ruby/json/blob/v3.0.2/ext/json/ext/parser/parser.c), [JSON common API](https://github.com/ruby/json/blob/v3.0.2/lib/json/common.rb) and [BigDecimal implementation/API](https://github.com/ruby/bigdecimal/blob/v4.1.3/ext/bigdecimal/bigdecimal.c). This reviewer did not independently read those upstream implementations or the lockfile. Actual installed parser behavior, exception classes and signature availability remain execution gates.

## Disposition of every original finding

Original findings are taken from coordinator reports `review-be02-write-transport.md`, `review-be02-write-boundary-tests.md` and `review-be02-write-boundary-races.md`. Existing findings are not counted again as new defects.

| Finding | Static disposition in this assignment | Rationale and limit |
| --- | --- | --- |
| WT-01: Float rounding admits nonintegral JSON versions | **Statically addressed** | `write_input.rb:43-58` preserves original decimal tokens using the reported parser contract, scopes underflow exceptions and rejects nonfinite values through validation. Lines 117-123 check bounds before conversion, compare the exact value with its integer conversion and return an Integer. Test lines 79-100 exercise real JSON tokens, near-integer fractions, positive/negative tiny nonzero values, extreme underflow, integral decimal/exponent forms, range edges and the safe-integer boundary. Runtime and caller compatibility remain unverified. |
| WB-T01: character-sliced ShortStream misrepresents Rack byte reads | **Statically addressed** | Test lines 51-56 use bounded StringIO reads. Lines 65-76 establish a four-byte scalar split into 1/2/1 bytes, EOF, exact byte-cap success, cap-plus-one rejection and valid JSON after split multibyte reads. The former character-slicing implementation would fail the first split assertion. The production reader accumulates binary bytes before marking final UTF-8 encoding (`write_input.rb:30-40`). |
| WB-T02: missing actual controller/header/DELETE failure evidence | **Unknown here** | The manifest reports controller repairs, but the helper/controller source is outside this assignment. Direct input-helper tests cannot establish actual DELETE routing, Content-Length independence at dispatch, closed HTTP envelopes, authorization ordering or absence of business effects. Requires caller review and runtime acceptance. |
| F1: invalid overflow fixture fails to isolate serialized byte limit | **Unknown here** | The manifest reports valid 4096/4097-byte commit/rollback fixtures. Those controller fixtures are outside this assignment. The small direct response test at lines 102-112 is not independent proof of a transaction boundary or the reported replacement fixtures. |
| F2: expiry race may begin after expiry and hide a stale-clock defect | **Unknown; excluded** | Concurrency/deadline source was expressly excluded, and the input-repair manifest does not claim F2 closure. This report provides no disposition on the unfinished deadline/RLS work. |

No original finding is declared unaddressed on the basis of omitted context. The two addressed findings have static evidence, not a runtime pass.

## Full-rubric conformance checklist

| Review area | Bounded assessment |
| --- | --- |
| Purpose and contract | Consistent with frozen C/D contract prose at lines 39-43: reject duplicate keys, count actual bytes and accept only mathematical integers within range without string coercion. Parser preservation and field-specific normalization remain separate. |
| Null, empty and wrong types | `object` rejects non-String input and non-object JSON; malformed/empty JSON takes the parser error path. Nested null/booleans/empty arrays remain representable for later field validation. `integer` rejects null, booleans, strings, arrays and objects by type; `body` enforces exact required keys. Empty byte streams succeed at cap zero; any byte fails. Field-specific nullable/empty-array semantics belong to unreviewed consumers. |
| Maximums and precision | Bounds precede `to_i`; huge positive exponents do not reach integer allocation when outside the field bound. Tiny finite nonzero values compare unequal to zero, and reported scoped underflow behavior prevents extreme exponents becoming accepted zero. Request reading uses max+1 actual bytes, query input caps at 8192 bytes and JSON nesting caps at 16. The transport cap depends on callers invoking this reader. |
| State and cross-module coupling | `save_exception_mode` encloses mode mutation and parsing, supporting restoration on normal return and exceptions under the reported API contract. Parsing validates only after leaving that scope. Input RBS adds BigDecimal to the recursive write alias. All consumers must narrow through scalar helpers before persistence/digest/serialization; their signatures and runtime compatibility were not inspected. |
| Simplicity, responsibilities and duplication | Small transport, object, query and scalar helpers retain clear roles. No new domain backend or speculative abstraction appears. `UniqueObject` is insufficient as the sole duplicate detector with reported JSON 3 conversion behavior, but the explicit parser option supplies enforcement; keeping the class is not an observed defect. No actionable duplication or convoluted control flow was found within this slice. |
| Names, comments and documentation | Names communicate their roles. AIDEV comments explain legacy Auth separation, byte-count trust, exact-token preservation, exception-mode restoration and bounds-before-conversion. RBS comments explain the write-only type boundary; the frozen manifest documents changes and acceptance limits. No stale comment was observed in assigned source. |
| Happy-path and failure tests | Authored cases cover Unicode, closed keys, nested duplicates, escaped-key aliases, query aliases, transport rejection, split UTF-8, zero/exact/overflow caps, integral forms, fractions, underflow, type errors and version bounds. The test file exercises helpers; it does not itself establish route/transaction behavior. Two state/type assertion gaps are detailed below. All cases are NOT_RUN. |
| Input security and authorization | Decoded duplicate/unknown query keys, invalid escapes, invalid UTF-8, NUL/surrogates, nonfinite values and invalid media/origin/encoding are rejected in the inspected paths. No SQL, secrets, logging or permission grant is introduced here. Authorization belongs to callers; this review cannot certify its order or rollback behavior. |
| Performance and resource bounds | Byte accumulation is bounded under the declared Rack input contract; recursive validation is depth-limited by JSON parsing. Integer conversion follows range checks. No database queries or unbounded retry loops appear. Parser resource behavior at full route caps was not measured, and `object` alone does not impose a raw byte cap. |
| Standards and evidence | The visible RBS mirrors the helper surface and retains typed input boundaries. No confirmed scoped standards violation was observed. Strict typing, dependency resolution, lint, real database behavior and integration tests remain NOT_RUN. Formatting checks are delegated to lint/CI. |

## Test-evidence gaps and acceptance gates for the coordinator

These are bounded evidence gaps, not newly confirmed implementation defects or claims that the complete suite lacks coverage. They were sent through Orca status messages `msg_56b37a86b77d` and `msg_d2adb834790f`.

1. **Exception-mode restoration is not asserted by the assigned tests.** The implementation at `write_input.rb:48-53` uses the appropriate reported scoping API, but test lines 79-100 only inspect values/errors. Add or locate assertions that the prior exception-mode state is unchanged after successful parsing, syntax/duplicate rejection and extreme-underflow rejection, with underflow initially both disabled and enabled. A regression that sets underflow mode without restoring it can satisfy the present value/error assertions while changing subsequent request behavior. This is an analytical mutant, not an executed result; acceptance requires the pinned Docker runtime and safe restoration of the test's own ambient state.

2. **Numeric equality does not expressly verify the normalized type.** Successful cases at test lines 82-83 and 92-94 assert equality only. The current implementation returns `to_i` at line 123, so no normalization defect is observed. Add or locate an explicit Integer-class assertion for decimal/exponent success cases: an analytical mutant returning the original integral BigDecimal can preserve numeric equality while violating the promised normalized boundary. The expected acceptance is both the exact value and an Integer result before consumer use.

3. **Keep caller and signature acceptance open.** Root must verify the reported WB-T02/F1 repairs, actual authorized-caller field validation and rollback/no-ledger/no-business-mutation behavior, and unchanged authority/context precedence. Actual route recognition and PostgreSQL semantics need separate integration evidence. The seven other signatures and runtime consumers named in the manifest were not read here. RBS parsing, BigDecimal signature loading and the affected strict typecheck must succeed in the actual pinned environment; the textual BigDecimal reference is not evidence that its signature is available.

4. **Execute the pinned behavioral suite.** Original-token conversion, decoded duplicate rejection and exception translation depend on the exact JSON/BigDecimal versions reported by the manifest. Run the affected Docker unit/integration suites and their meaningful failure cases before acceptance. No host or container test was authorized or run by this reviewer, and no historical green result is transferred to this repair.

The design reasoning above is analytical only. Obsidian is unavailable; no analytical scenario or mutant is described as executed. Dedicated system design review belongs to the coordinator's separate review assignment and is not substituted by this correctness report.

Final bounded outcome: **0 newly observed defects / 0.289 KLOC = 0.00 defects/KLOC; 2 original findings statically addressed; 3 original findings outside this review's verified disposition; all runtime acceptance NOT_RUN.**
