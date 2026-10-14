# Mira independent review — Nadia attachment typing/guards

Pinned author source: `8d89a183c6d146e9d81543850b8c325e324e1b64` in `completion-nadia-send810`. Actual reviewer/runtime: Mira FE806, Codex GPT-6 in Orca; no delegate or subagent. Static source review only: no application tests, Docker, database, scanner, private Storage, live network or credential access.

## Exact coverage

One read of `apps/server/sig/attachments.rbs:1-115` (115 LOC), one read of `apps/server/lib/elevateo/attachments_scan.rb:1-126` (126 LOC), then current-version diff hunks and a bounded excerpt: `attachments.rb:35-67` (33), `attachments_repository.rb:35-47` (13), `clamd_scanner_test.rb:4-14,19-29,49-63` (37), `service_test.rb:145-166` (22). **346 unique versioned source LOC viewed**, each read at most 126 LOC. The full commit adds 182 source/test lines (115 RBS, 35 scan, 5 repository, 1 service, 12 scanner test, 14 service test); all added lines in the assigned packet were viewed. Removed lines were compared in the diff but are not counted as current-version coverage. The remaining full service/repository/test files, SQL, storage, controller, and scanner infrastructure are **uncovered**, not silently reviewed. Formatting belongs to lint.

**Findings:** two actionable defects across 182 added LOC = **10.99 defects/KLOC**. This is a static density for the assigned new lines, not a runtime failure rate. The full review rubric was applied within this coverage: behavior, nil/empty/max handling, state effects, abstraction size, naming/comments, duplicated logic, tests/docs, input and permission boundaries, and loops/hot paths.

## 1. MEDIUM — missing claim keys bypass the fail-closed batch result

`attachments_scan.rb:95-105` uses `row.fetch` for `scan_attempt`, `sha256`, `storage_key` and `byte_size` before the type/value guard and before the `begin` at line 106. A row lacking any key raises `KeyError`, which `run_batch` does not catch (`:84-90` catches only `Unavailable`), so one malformed claimed row stops the remaining due items. The authored regression in `service_test.rb:145-166` covers a **present** `sha256 => nil`, which reaches the guard, but not an absent key. `attachments_repository.rb:38-44` similarly calls `row.fetch("id")` before its `is_a?(String)` check; an absent ID raises `KeyError` rather than the intended domain error.

Fix: extract optional row fields with `row[...]` and validate existence/type, or map `KeyError` to the deliberate held/unavailable outcome before returning to batch processing. Keep any already claimed item held and record a bounded missing-field regression followed by a valid item to prove the batch continues. Ensure the due-ID malformed-row case produces an intentional failure rather than an untyped exception; do not treat malformed authority data as clean.

## 2. LOW — nil socket factory escapes as `NoMethodError`

`attachments_scan.rb:29-55` assigns `active_socket = @socket_factory.call`, then unconditionally calls `active_socket.close` in `ensure`. A factory returning `nil` raises `NoMethodError` during write and again at close; the scanner's rescue (`:57-58`) covers timeout/I/O/system errors only. The previous safe-navigation close was removed. This remains fail closed when `ScanService` catches `StandardError`, but direct scanner callers lose the documented deliberate `ClamdScanner::Error` boundary. The new socket-close regression covers an actual fixture socket and protocol error, not nil factory output.

Fix: reject a nil/non-socket factory result with `ClamdScanner::Error` before the write, and close only a created socket. Add a nil-factory regression that asserts the deliberate error and no attempted close.

## Other observations and limits

`Service.list` now uses `visible.fetch(-1)` only when `rows.length > limit` and `limit` is constrained to 1..50, so that changed lookup is nonempty under the viewed code. `ClamdScanner` bounds input bytes, reply bytes and total I/O time and recognizes only exact OK/FOUND verdict shapes. `ScanService` checks attempt, digest, key and size before Storage read; valid verdicts alone reach the fenced repository write. The new RBS file uses narrow interfaces rather than `Any`, but its generic row hash cannot guarantee key presence at runtime, which makes the missing-key guard important. Existing tests include clean and failure paths; the two missing boundary cases above remain. I did not independently prove SQL authorization, Storage behavior or actual socket/DB runtime. Soren alone owns fleet Docker execution and exact cleanup evidence.
