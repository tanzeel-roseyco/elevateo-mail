# REV871 — independent review of Nadia ATT865 repair

**Pinned author source:** `54654885f33c0245314d75e25970b4152b603c1b` in `completion-nadia-send810`. **Reviewer/runtime:** Mira FE806, Codex GPT-6 in Orca; no subagent. Static source review only; no local application test, Docker, database, ClamAV, private Storage, credentials, or live operation.

## Exact coverage

Assigned packet from Nadia's review note: `attachments_scan.rb:24-63,91-123` (73 unique LOC), `attachments_repository.rb:37-45` (9), `service_test.rb:58-75,170-204` (53), and `clamd_scanner_test.rb:53-70` (18): **153 unique assigned source LOC**. Additional context read: `service_test.rb:1-57` (57) and `attachments_scan.rb:80-90` (11), for **221 unique versioned source LOC total**. Reads were 82, 71 and 72 source LOC, each below 180. The nine-line author packet was also read as prose, excluded from source LOC. Uncovered: other service/repository/test lines, SQL, Storage and HTTP gateway; no behavior outside this packet is certified. Formatting is delegated to lint.

**Outcome:** zero new actionable defects in 153 assigned reviewed LOC = **0 defects/KLOC**. This is static source review, not runtime PASS. The full requested rubric was considered within the bounded packet: behavior, nil/empty/limit handling, state effects, complexity and naming, duplicated logic, comments, tests/docs, input/authorization boundaries, and hot paths.

## Repair checks

1. **Four absent claim fields and continued batch:** `ScanService#inspect` now reads `scan_attempt`, `sha256`, `storage_key` and `byte_size` with optional Hash lookup before its type/value guard. An absent field becomes `nil`, raises `Unavailable`, and `run_batch` catches that outcome per ID while continuing to the next due ID. The fixture's `IncompleteClaimRepository` returns a copy missing each key, while the original claimed row remains pending. For each of four keys, the test requires one held count, one clean count, a pending malformed row and a clean second row. The predecessor's `fetch` would raise `KeyError` and fail this assertion; the fixture clean verdict does not prove real scanning.
2. **Absent due ID:** `Repository#due_scan_ids` reads `row["id"]`, checks it is a String and raises `NotAvailable` for a missing key. Its regression supplies `{}` and expects exactly `NotAvailable`, which would fail on predecessor `fetch`/`KeyError`. Discovery intentionally stops because no valid ID exists; this is distinct from a claimed item's held outcome.
3. **Nil socket:** `ClamdScanner#scan` checks the factory result and required socket methods before entering the `begin/ensure` that closes the socket. A nil result raises the deliberate `ClamdScanner::Error` without attempting `close`. The regression expects that exact class and message; the predecessor's unconditional close would raise `NoMethodError`. Existing valid socket cleanup and exact OK/FOUND recognition remain in the inspected code.

## Limits and request

No authorization check, Storage read path, scan verdict fence or route was widened by these changed lines. The test batch uses fake repository/Storage/scanner collaborators, so it cannot establish real PostgreSQL roles, ClamAV responses, socket failure handling beyond the fixture, or end-to-end byte authorization. Ask Soren to run the exact focused attachment service and clamd tests, Steep and affected lint in disposable fleet-02 Docker on an immutable integrated SHA, preserving his cleanup receipt. No such runtime result was available to Mira.
