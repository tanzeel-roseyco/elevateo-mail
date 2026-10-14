# ATT823 bounded review and fleet request

Candidate branch `completion-nadia-send810`; exact implementation SHA is recorded in `nadia-outbox.md`. This is a review/test request, not an independent review or runtime receipt. No host application tests, Docker builds, ClamAV process, or SQL fixture were run by Nadia.

## Review packets (each <=350 unique source LOC)

- Packet A, data/roles: migration `apps/server/db/migrate/20261015000015_create_inbox_attachments.rb` lines 1–180. Verify FORCE RLS owner SELECT/INSERT/UPDATE behavior, definer grants, API key/SHA denial, import `ON CONFLICT` race, exact parent FK, scan token/attempt/next-at conditions, and irreversible rollback.
- Packet B, scanner/DB adapter: `apps/server/lib/elevateo/attachments_scan.rb` lines 1–120 plus `attachments_repository.rb` lines 1–62 (182 LOC). Verify clamd framing/result parsing, complete socket writes, deadline, fail-held transition, bounded due batch, stale verdict fence and role-specific queries.
- Packet C, private object/input: `attachments_storage.rb` lines 1–107 plus `attachments.rb` lines 1–current end (under 200 LOC). Verify internal host/bucket checks, token containment, no inbound delete/overwrite, validation, current read callback, safe list and ambiguous-commit retention.
- Packet D, unit witnesses: `test/attachments/clamd_scanner_test.rb` lines 1–61 and `test/attachments/service_test.rb` lines 1–221 (282 LOC). Verify tests would fail false clean, stale verdict, private key leakage and source-byte overwrite; explicitly separate fake scanner results from real ClamAV proof.
- Packet E, database role witness: `test/attachments/database_test.rb` lines 1–106. Verify task-owned DB guard, actual session roles, owner RLS, worker function grants and concurrent same/conflicting tuple oracle.

Felix REV878 reviewed prior source: 3 confirmed findings / 341 LOC = 8.80 findings/KLOC. This repair has **not** been independently re-reviewed; no repaired-source defect density is claimed. A dedicated design reviewer should simulate ambiguous metadata commit, stale scan clean after newer malware, API key exposure, and gateway revocation between first and second DB checks.

## Soren fleet-only request

1. In a task-owned disposable Docker source image from exact SHA, run `cd /app && bundle exec ruby -Itest test/attachments/service_test.rb` and `cd /app && bundle exec ruby -Itest test/attachments/clamd_scanner_test.rb` as separate commands, then affected RuboCop/Steep. All NOT_RUN here.
2. Migrate 00015 with real migrator role in a disposable database, then run `bundle exec ruby -Itest test/attachments/database_test.rb` with four exact task-only role URLs and `ATT823_TASK_DATABASE_NAME`. Assert owner FORCE RLS success, API/worker direct access denial, worker claim/failed verdict, concurrent same tuple returns one ID and changed digest conflicts, and cleanup. Do not point these variables at shared/persistent databases.
3. After Leonie/Soren pin a free task-only ClamAV image/config on private network with no public listener, CPU/RAM/PID limits, `StreamMaxLength` at least 10 MiB and bounded archive/decompression settings, execute an actual clean synthetic file and EICAR fixture through `ClamdScanner` in isolated containers. Prove scanner readiness/signature presence; daemon absent/timeout/oversize/invalid response stays `scan_failed` or pending, never clean. Preserve persistent data and do not perform live sends or paid calls.
4. Integrate Sabine's private gateway and Cassian route only after independent review, then prove authorized clean byte retrieval, foreign/revoked/held denial, revocation during Storage fetch, key/SHA omission from API table access, private-bucket status, no public URL, and exact cleanup. Corin 00017 import/cursor tests follow 00015 migration.

## Open integration gates

Sabine owns NEW gateway/HMAC endpoint and narrow DB helper; Nadia only repaired existing attachment files and migration 00015. Cassian owns HTTP route/DTO, Corin owns 00017 inbound cursor transaction, and Soren/Leonie own container configuration. Routes remain inactive and outbound attachments unsupported until Rowan's immutable binding is agreed. Unexecuted tests and fake clamd replies do not establish scanner or download acceptance.
