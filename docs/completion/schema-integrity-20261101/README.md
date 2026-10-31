# Schema integrity verification - 2026-11-01

Status: full backend gate PASSED. No production actions, push, merge or deployment.

## Scope and checklist

The audit includes every database Ruby/SQL file (including helper folders and later ALTERs) and the domain query surface. The [source inventory](audit-inventory.md) identifies 189 database files and 133 domain Ruby files; [DDL inventory](ddl-inventory.txt) captures CREATE/ALTER/index locations. The migrated application catalog has 79 tables and 94 foreign keys across six application-owned schemas. Provider-owned Supabase authentication tables are outside application migration ownership.

1. **Keys, relationships and values:** catalog checks require a primary key for every application table and a valid leading index for every FK. New composite FKs prevent mismatched IMAP account scope, reconciliation attempts and marketing draft/send identities. New CHECKs enforce protocol UID ranges, finite authority timestamps, bounded secrets/claims, provider event/receipt states and shapes, connector scopes and finder fields. Existing data is validated; incompatible rows abort migration.
2. **Normal forms:** finder jobs no longer contain a mutable 5,000-item collection in one JSON value. One child row owns each input/work/result. Finder people derive domain from canonical email, with an expression index matching lookup. Snapshot/projection exceptions are individually recorded in [database design](../../database-design.md).
3. **Entity boundaries and derived values:** existing memberships and other many-to-many edges remain junctions. Finder progress is a checked cached projection. Message attachment metadata remains a provider snapshot; reads return the greater of metadata and materialized rows, with a serialized 1,000-row cap and replay-safe enforcement.
4. **Indexes and transactions:** migrations111/114 build missing FK/hot-query indexes concurrently. Migrations111/114/117 remove confirmed redundant indexes; 16 remaining composite UNIQUE targets are required by actual FKs. Multi-step writes remain transactional; provider I/O stays outside transactions. Concurrent builds verify definitions and recover their own invalid indexes on retry.
5. **Safe evolution and types:** seven new reversible migrations follow 20261029000110. Finder ordinals use smallint with 1..5000 bounds. No old migration is rewritten. Lossless finder normalization requires coordinated application release; old columns are removed only after successful preflight/backfill and reconstructed on rollback. Suppression normalization refuses case-collision ambiguity, retaining every row/provenance value. No deployment was performed.

## Fix map

All fixes are one cohesive schema-integrity commit, whose SHA is reported in the final response (the receipt is included in that commit).

| Migrations / code | Fix |
| --- | --- |
| 20261101000111,00114,00117 | Indexed FK/hot paths; verified concurrent retries; redundant indexes removed; tenant-safe identity targets |
| 20261101000112; campaigns repository/runs | Canonical indexed suppression keys; hard-bounce/complaint suppression honored across review, authorization and final-send fences; campaign-only unsubscribe/manual and finder research opt-outs retain distinct purposes |
| 20261101000113; finder repository/worker | Normalized work rows, derived domain, strict fields and transactionally checked progress |
| 20261101000115 | Value/range/shape checks and composite relationship constraints |
| 20261101000116; thread reads/contracts | Materialized attachment cap, concurrent-snapshot safety, idempotent replay, accurate API count |
| Catalog tests/registry | Missing PK/FK indexes, exact/prefix/constraint index redundancy, invalid indexes, unvalidated constraints and unlisted identity/structured exceptions fail |
| Historical thread rollback fixture | Explicitly detaches the new dependent FK inside rollback-only DDL and verifies exact restoration |

## Commands

All tests execute in Docker Desktop. Python on Windows orchestrates containers only. Every Docker invocation uses `DOCKER_CONTEXT=desktop-linux` (the runner also passes `--context desktop-linux`). No fleet endpoint is used.

```powershell
$env:DOCKER_CONTEXT='desktop-linux'
docker build --pull=false -t elevateo-schema-integrity:server apps/server
docker build --pull=false --build-arg SERVER_IMAGE=elevateo-schema-integrity:server -f ops/tests/completion/Dockerfile.mox -t elevateo-schema-integrity:mox .
$schemaServerImage = docker image inspect elevateo-schema-integrity:server --format '{{.Id}}'
$schemaMoxImage = docker image inspect elevateo-schema-integrity:mox --format '{{.Id}}'
python ops/tests/completion/local_backend.py --execute-final-gate --server-image $schemaServerImage --mox-image $schemaMoxImage
```

Final packaging IDs: server `sha256:c389685887159893729080275537b7aa79965962f26b093ca02455d5aac1aae2`; rebuilt Mox `sha256:4f52ee91f87a8959fc071e008459b192c5778f021fae25e66b1dedd686d4d750`. An earlier Mox image disappeared during concurrent local work; its interrupted gate is retained as failed evidence, never counted as acceptance.

The separate disposable schema harness used the same `local_backend.Task/configure` bootstrap, generated credentials and tmpfs PostgreSQL. Its exact Compose prefix was:

```powershell
$env:DOCKER_CONTEXT='desktop-linux'
$schemaCompose = @('--context','desktop-linux','compose','--project-name','elevateo-schema-1673d6bad7c6','--env-file',"$env:TEMP/elevateo-schema-ri4g6u0c/.env.runtime",'-f','ops/compose.be02-test.yaml','-f',"$env:TEMP/elevateo-schema-ri4g6u0c/local.compose.json")
docker @schemaCompose run --rm --no-deps migrate
docker @schemaCompose run --rm --no-deps migrate bundle exec rails db:migrate VERSION=20261029000110
docker @schemaCompose run --rm --no-deps migrate
docker @schemaCompose run --rm --no-deps test bundle exec ruby test/sends/schema_integrity_database_test.rb
```

The temporary credentials are deleted after cleanup. Focused files were also run with `run --rm --no-deps test bundle exec ruby <file>` (some grouped sequentially by a container shell): `test/sends/{schema_integrity_values_database,schema_integrity_relationships_database,delivery_suppression_database,suppression_migration_database,concurrent_index_retry,redundant_unique_database}_test.rb`, `test/email_finder/{database,migration,worker}_test.rb`, and `test/attachments/database_test.rb`. The full gate independently runs these and the existing backend suite. Its standard test command executes `bundle exec steep check --jobs=1` and `bundle exec rubocop --lint --format simple` inside Docker.

Separate protocol command (exit 0):

```powershell
$env:DOCKER_CONTEXT='desktop-linux'
docker run --rm --name elevateo-schema-protocol --network none --dns 127.0.0.1 --add-host mail.dispatch.company.com:127.0.0.1 --add-host mail.second.company.com:127.0.0.1 --tmpfs /private:rw,nosuid,size=512m,mode=755 --memory 1g --cpus 1 --pids-limit 128 elevateo-schema-integrity:mox
```

## Focused verification

Latest individual suite results: 87 tests / 1,155 assertions, zero failures/errors/skips. These are separate focused checks, not added to full-gate totals. Values(28/445), delivery suppression(7/46), retry(4/14), finder worker(12/96), finder migration(1/8), finder database(9/47), final catalog(6/385), relationships(4/27), suppression migration(3/12), redundant UNIQUE(1/7), attachments(12/68).

Up/down/up of all seven migrations passed; down exited 0 in 5.72s, up exited 0 in 31.44s. Finder regression additionally proves populated down/up preservation of input, completed results and inflight work. Suppression regressions prove collisions abort without deleting evidence. Attachment tests exercise READ COMMITTED concurrency, repeatable-read rejection and full-capacity replay.

Earlier focused batch logs intentionally retain two fixture setup failures: incomplete send-intent transaction and missing organization policy. Both are corrected in `017-focused-final.log`; the later catalog run supersedes its earlier registry assertions. A batch containing a failing fixture remains a failed batch even when other suites in it passed.

## Final backend verification

Final runner returned PASSED (see `final-gate/result.json`). Counts are parsed from actual Minitest summaries in `final-gate/test-counts.json`:

| Gate | Tests / assertions | Result |
| --- | ---: | --- |
| Standard backend (237 suites) | 1,399 / 15,907 | 0 failures/errors; 4 protocol skips |
| Dedicated database/migration suites | 33 / 228 | 0 failures/errors/skips |
| Boot admission | 2 / 12 | Passed |
| Isolated Mox protocol | 4 / 406 | Passed; covers standard protocol skips |
| Real Mox application chain | 1 / 88 | Passed |
| HTTP acceptance | 1 / 33 | Passed |
| Mailpit entry | 2 / 107 | Passed |
| Ruby contracts v1/v2/completion | 19 / 264 | Passed |
| Resend offline wire | 3 / 26 | Passed |
| Steep | `bundle exec steep check --jobs=1` | No type errors |
| RuboCop | `bundle exec rubocop --lint --format simple` | 542 files, no offenses |
| Worker revocation drain and privilege/auth guards | Script checks | Passed |

Earlier runs remain failed evidence in `initial-gate/` and `followup-gate/`. They exposed historical rollback dependency/restoration fixtures, canonical-key assertions, load-fixture administrative timeout, four ambiguous-block lint offenses, and a frozen-v1 description edit. Those are corrected and the final fresh run supersedes them. An earlier live shell-script edit interrupted a completed Steep phase, and an earlier Mox image vanished; neither interrupted run is counted as passing. V1 remains byte-for-byte sealed; v2 documents the current attachment count semantics. The load regression passed within the final standard gate; no production-scale performance claim is made.

## Limits and follow-ups

No live credentials or external provider delivery are exercised. Historical BE01 R1, MCP, native bridge, restore drill, frontend builds and visual QA are separate gates and were not rerun for this database-only task. No frontend rendering was changed. Obsidian connection was unavailable; design scenarios are analytical and explicitly labelled. Deferred finder count enforcement has bounded quadratic enqueue cost at 5,000 rows; the max-size regression ran, but no standalone production-scale benchmark is claimed. Future zero-downtime deployment would require an expand/contract compatibility phase for finder writers; this branch documents a coordinated release prerequisite.

## Cleanup

All test-runner project containers were removed; final retained-volume list is empty. Removed the inspected image-hold container (no mounts) and an earlier never-started schema database container (tmpfs database, read-only source/config mounts). No volumes were pruned. `docker builder prune -a -f` reclaimed 948 MB; `docker image prune -a -f` reclaimed 3.235 GB, including task images and other unused image tags listed in the log. Rebuilding/pulling those images is required next time. Active unrelated workloads, their images/caches and all 33 existing volumes were preserved.

Host C free space measured 32,670,572,544 bytes before and 32,663,789,568 bytes afterward; concurrent builds prevent attributing host-space movement to this task. Docker/WSL shutdown and offline virtual-disk compaction were not attempted because other workloads remained active. No host-space reclamation is claimed.

Automatic approval review rejected recursive deletion of the generated Python cache directories as blocked by policy. They and the temporary orchestration helper are retained, excluded from the commit. Generated test credentials were removed by the harnesses; logs contain redacted fixture values only.
