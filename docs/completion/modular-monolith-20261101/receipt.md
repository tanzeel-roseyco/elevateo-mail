# Modular-monolith verification - 2026-11-01

Branch: `tanzeel-roseyco/feature-modular-boundaries`. One atomic implementation/documentation commit;
its SHA is reported with delivery. Nothing pushed, merged, deployed or sent to a live mail provider.
No fleet, DNS, Cloudflare or production actions. No database files or suppression/index SQL changed.

## Result and scope

1. Domain slicing: explicit ownership for 194 runtime files, grouped by business capability; legacy flat
   paths remain. New mailbox snapshot persistence resides under its capability directory.
2. Encapsulation: explicit constant exports, exact legacy exceptions, private snapshot SQL, and static guards.
3. Data isolation: connector foreign reads replaced by mailbox DTO API; 76-table ownership catalog,
   shared tenancy kernel, eight non-kernel foreign keys and stored-routine safety exceptions documented.
4. Communication: synchronous public contracts and exact SQL routine callers; existing durable jobs,
   intents and receipts retained. No new event bus or RPC split.
5. Deployment: production API, workers and private gateway share the pinned backend image. Infrastructure
   and client adapters remain separate; private gateway HTTP is an existing exception.
6. Build guards: standard gate includes architecture tests. Deliberate violation fixtures establish
   rejection. The architecture suite passes; the full backend gate is NOT green due to the schema and mailflow failures below.

See [modular-architecture.md](../../modular-architecture.md) for maps, all exceptions, limits and follow-ups.
The scanner is a stdlib static architecture guard, not a general Ruby/SQL interpreter or security sandbox.

## Exact commands

All tests run inside Docker Desktop. Python is host orchestration only. Every Docker invocation uses:

```powershell
$env:DOCKER_CONTEXT='desktop-linux'
docker build -t elevateo-modular-check apps/server
docker build --build-arg SERVER_IMAGE=elevateo-modular-check -f ops/tests/completion/Dockerfile.mox -t elevateo-modular-mox .
$serverImage = docker image inspect elevateo-modular-check --format '{{.Id}}'
$moxImage = docker image inspect elevateo-modular-mox --format '{{.Id}}'
python ops/tests/completion/local_backend.py --execute-final-gate --server-image $serverImage --mox-image $moxImage
```

Server image: `sha256:989e6743009416ede232d7373057b05884ec7333ae023bd3df207472985b972d`.
Build logs record successful export.
Mox image: `sha256:17fdbc0ff0038bd21dd9627873d90a549e5c158a386267384c1ea32e6b73d17e`.
The full runner bind-mounts this branch's backend source read-only. Images are disposable verification
artifacts, not published release images. Build log stderr was captured by PowerShell as NativeCommandError;
Docker's image inspection and successful gate launches independently confirmed the builds completed.

Final focused command (explicit process exit captured in `final-architecture-lint.log`):

```powershell
docker run --rm --network none --mount "type=bind,source=$((Resolve-Path apps/server).Path),target=/app,readonly" --workdir /app elevateo-modular-check sh -c 'bundle exec ruby test/architecture/boundaries_test.rb && bundle exec rubocop --lint --format simple --cache false'
docker run --rm --network none --tmpfs /private:rw,mode=1777 elevateo-modular-mox
```

The full standard suite runs `ops/tests/be02/test-suites.sh`: every selected `bundle exec ruby <test>`,
then `bundle exec steep check`, then `bundle exec rubocop --lint --format simple`.
The final focused rerun changes only RuboCop cache behavior because the source is mounted read-only.

## Verification history

First attempt failed due to a CRLF shell edit and the existing migration rollback dependency.
LF was restored. Second complete attempt ran 231 standard suites: 1,355 tests / 14,956 assertions,
0 failures / 0 errors / 4 protocol skips. Steep reported no type errors. RuboCop found 22 fixture
warnings; explicit assertion parentheses and an explained literal-interpolation fixture exemption fixed
all 22. Final focused rerun: 18 tests / 38 assertions, 0 failures / 0 errors / 0 skips, and all 531 files
lint clean (exit 0). The full gate result is retained as failed, not relabelled after isolated repair.

Existing connector tests exercise happy reads/drafts, revoked/expired grants, mailbox separation,
missing messages, bounds and citation validation. No production authorization or send behavior changed.
Review packets and defect densities are recorded in [code-reviews.md](../../../code-reviews.md).

## Schema follow-up

`test/administration/organization_access_migration_test.rb`: 1 test / 4 assertions / 1 error.
`CreateOrganizationAccess#down` attempts to drop `app.authorize_outreach_content_read(text)` while
`tenant_read` policies on `email_finder_jobs`, `email_finder_domains`, `email_finder_people`,
`email_finder_results`, `email_finder_suppressions`, and `health_read` on `email_finder_rate_state`
still depend on it. Coordinate rollback ordering so dependent finder policies are rolled back first,
or explicitly restore them around the function rollback. Never use blind CASCADE. No migration was
added here because this schema is explicitly assigned to the concurrent worker.

## Not run

No production deployment, live sends, remote/fleet tests, UI validation or unrelated frontend/native
builds. The README backend runner separately defers historical BE01 R1 fixtures, MCP, native bridge and
restore drill; those separate gates were not rerun for this backend-only change. Existing historical
receipts are not claimed as current passes. No external Obsidian simulation (connector unavailable).


## Dedicated results from latest full run

| Suite / evidence log | Tests | Assertions | Failures | Errors | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Gateway authority database (021) | 5 | 21 | 0 | 0 | Pass |
| Attachments database (022) | 7 | 44 | 0 | 0 | Pass |
| Campaign database (023) | 7 | 17 | 0 | 0 | Pass |
| Mailpit worker protocol (024) | 1 | 6 | 0 | 0 | Pass |
| Gateway migration ACL (025) | 2 | 44 | 0 | 0 | Pass |
| Assignment options migration (026) | 1 | 7 | 0 | 0 | Pass |
| Organization access rollback (027) | 1 | 4 | 0 | 1 | Fail: finder RLS dependencies |
| Campaign rollback (028) | 4 | 48 | 0 | 0 | Pass |
| Boot admission (033) | 2 | 12 | 0 | 0 | Pass |
| Real Mox application chain (057) | 1 | 88 | 0 | 0 | Pass |
| HTTP acceptance (065) | 1 | 33 | 0 | 0 | Pass |
| Worker revocation drain (069) | - | - | - | - | Exit 0 |
| Mailpit entry acceptance (070) | 2 | 33 | 1 | 1 | Fail: unexpected HTTP status and Net::ReadTimeout |
| Separate Mox protocol | 4 | 6 | 0 | 2 | Fail: SMTP unavailable before submission |
| Offline Ruby contracts, separate final rerun | 19 | 264 | 0 | 0 | Pass |
| Offline Resend stub, separate final rerun | 3 | 26 | 0 | 0 | Pass |

The four standard protocol skips are not counted as passing. The separate Mox protocol run did execute
all four tests, but two errored; the application-chain success does not override that failure.
The latest full runner stopped at Mailpit entry, so final contracts/stub checks ran independently.
The first full attempt passed Mailpit entry (2/107), but the latest failure is retained as unresolved;
no transport or auth changes were made to chase an unrelated failure. Follow-up: investigate the
isolated transport readiness/HTTP status and timeout with the owning mailflow tests. No root cause is
claimed from these symptoms alone.

Exact independent contract commands (one `--network none` container; all completed with exit 0):

```powershell
docker run --rm --network none --mount "type=bind,source=$((Resolve-Path apps/server).Path),target=/app,readonly" --mount "type=bind,source=$((Resolve-Path contracts).Path),target=/workspace/contracts,readonly" --mount "type=bind,source=$((Resolve-Path apps/server/config).Path),target=/workspace/apps/server/config,readonly" --workdir /app elevateo-modular-check sh -c 'failed=0; for t in /workspace/contracts/v1/tests/send_contract_test.rb /workspace/contracts/v2/contract_test.rb /workspace/contracts/v2/completion_contract_test.rb test/send_worker/resend_wire_test.rb; do echo RUN "$t"; bundle exec ruby "$t" || failed=1; done; exit $failed'
```

## Docker cleanup

After all tests, with `DOCKER_CONTEXT=desktop-linux`, ran `docker builder prune -a -f` and
`docker image prune -a -f`. Reclaimed 6.514 GB build cache and 3.176 GB unused images (Docker-reported
logical space). Logs list exact deleted cache/image IDs. This also removed unused old verification
images under the explicitly required prune command; rebuilding or downloading may be necessary.
The runner removed its own containers/network; retained-volumes.json is empty. No volume pruning:
all 33 existing volumes (4.554 GB) remain. Other workers' schema, PWA and backend containers remain
running, with their seven active images and two active cache records (72.87 MB) preserved.

Windows C: free bytes were 31,700,025,344 before cleanup and 30,255,497,216 immediately afterward.
Concurrent workers were active, so logical Docker reclamation did not produce a measured host-space
increase. Docker/WSL shutdown and virtual-disk compaction were not attempted because they would
interrupt those workloads. No disk/volume deletion or production cleanup was performed.
