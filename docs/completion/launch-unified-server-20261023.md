# Organization thread list — 2026-10-23

Status: implemented; full fleet backend/type/lint/HTTP/worker and contract gates PASS. Final supplemental bounded review accounting and application visual acceptance remain coordinator-owned. No release, live email, warmup, purchase or infrastructure activation is authorized by this work.

## Contract and authorization

`GET /v1/threads?filter=all&limit=50&cursor=...` returns `{context_id, authorization_version, items: ThreadSummary[], next_cursor}`. Each summary retains its own `mailbox_id`; the organization envelope has no top-level mailbox. Allowed filters are `all`, `unread`, `starred`, `snoozed`, `archive`, `spam`, `trash`; limit defaults to 50 and accepts 1–50. Unknown query keys and malformed limits are rejected.

The existing protected read wrapper supplies the authenticated tenant, authorization version and repeatable-read snapshot. One parameterized lateral query reads only RLS-visible mailboxes in that tenant, takes at most `limit + 1` candidates from each mailbox using the existing mailbox query, then selects the global `limit + 1`. Ordering remains last message timestamp descending, nulls last, then thread UUID descending. Signed cursors bind user, tenant, context, authorization version, resource, filter, limit and ordering; mismatches retain `cursor_invalid` semantics.

Pagination follows current activity order, matching the mailbox endpoint. A concurrently bumped thread before an earlier cursor appears on refresh, rather than promising a frozen cross-request snapshot. Within one authorized transaction the snapshot is stable.

The production connection remains the existing non-owner `elevateo_api` login. Foundation `visible_mailbox` RLS requires both organization membership and shared visibility or explicit mailbox membership; forced thread/message policies inherit that visibility. The organization query introduces no privileged role or security-definer bypass. The database regression asserts the actual session login. Explicit forged-tenant-claim and revoked-organization checks passed in attempt 7, alongside private grant/revocation and tenant mismatch checks.

## Implementation and regression scope

- Backend query, controller, route and RBS declarations; no frontend, auth/config, inbound or reply implementation changes.
- Unit cursor/query boundary tests, controller response/error tests, real PostgreSQL tenant/private-mailbox grant/revocation tests, 120-mailbox tied/null keyset traversal and concurrent activity/snapshot regression.
- Organization grants controller nil guards repair existing Steep errors without changing grants authority.
- Additive OpenAPI operation `listOrganizationThreads` and schema `OrganizationThreadPage`; existing `ThreadSummary` and historical contract seals remain preserved. Fable owns generated client/Postman integration and generation evidence. Current frontend source calls `/v1/threads` through `OrganizationThreadPageSchema`; its contract lock records pinned Docker regeneration. Frontend runtime/visual acceptance remains a separate lane.

## Fleet evidence

All test execution uses fleet-02 Docker under `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock`, SSH port 2222. Disposable source snapshot: `/home/tanzeel/em-work/unified-server-20261023-e82`; Windows CRLF normalization is confined to that snapshot's executable/test source.

| Attempt | Evidence directory under snapshot `ops/local/` | Result |
| --- | --- | --- |
| 1 | `be02-f21cc393eeb14564938297cc41cf693a` | Admission failed on CRLF shell script before tests; cleanup PASS. |
| 2 | `be02-7ffe40d6b4184754863508cd2f9141fd` | 116 privilege assertions PASS; auth concurrency source hash rejected CRLF SQL; cleanup PASS. |
| 3 | `be02-1991023b634e4f21b8b597abb034ac41` | 116 privilege assertions and all three auth RLS concurrency schedules PASS; build preflight failed because required tagged pinned Ruby image reference was absent; application tests NOT_RUN; cleanup PASS. |
| 4 | `be02-fff926c9853643259a92f288fb94f82d` | Rails image build PASS; migrate container admission failed because archive omitted empty log/tmp directories needed as read-only bind mount tmpfs targets; application tests NOT_RUN; cleanup PASS. |
| 5 | `be02-0a8222fdfba5432f80ae1abf520eacda` | 1,238 runs / 14,009 assertions / 1 failure / 0 errors / 4 skips; Steep PASS; lint FAILED; exact cleanup PASS. |
| 6 | `be02-0f4fc6fba68a4de8bbaa99034e92fce7` | Build PASS; Ruby admission failed on newly present mailflow support tests before cases; exact cleanup PASS. Contract harness failed before cases because its read-only RubyGem cache was not redirected. |

The pinned digest reference was restored by an exact pinned public-image pull. Empty log/tmp mount targets were created only in the disposable snapshot. Attempt 5 finished: the 120-mailbox/173-thread exhaustive traversal passed in 0.061199 seconds; a separate SSO provider expectation failed in that frozen snapshot and was reported to its owner. The only application failure was the SSO status fixture (provider nil versus google), reported to its owner. Lint reported six newly corrected ambiguous assertions and seven executable-mode warnings caused by the Windows source archive; git executable modes will be restored in the disposable snapshot. The thread database suite passed 15 runs / 259 assertions and thread query suite passed 12 runs / 143 assertions; the three organization HTTP tests passed. Full authenticated HTTP/worker stages were not reached because the aggregate application gate failed. Its cleanup removed task containers, database/config/build-cache volumes, builder, network and task image with no errors; shared base images were retained. No other lane's running resources are interrupted. Final evidence follows below; earlier failures remain historical.

## Review disposition in progress

The security review's RLS exposure claim is conditional, rather than an observed defect: the actual role/policy chain above is enforced in production and real-role tests. The query-cost concern is being measured with the dense fixture; the per-mailbox candidate limit bounds merge/projection work, but does not claim a constant-time scan regardless of mailbox history. Fixed-width UTC microsecond timestamps preserve the existing timestamp order; reusing `LIST_SQL` avoids diverging mailbox filter/cursor semantics. Nil guards in the grants controller deliberately narrow nullable projections for Steep and retain fail-closed malformed-row behavior. Broader pre-existing roster loading and grants-write authorization ordering are outside the requested type-only repair.
## Resource accounting (interim)

Attempt 5 independent label-based queries found no remaining task containers, Compose volumes or networks after the runner cleanup. Fleet host free space was 70,505,893,888 bytes at the follow-up observation; concurrent lanes prevent attributing a host-space delta to this task alone. Shared pinned base images, source snapshots and evidence logs are retained. Docker ran on Linux fleet-02, so Windows Docker virtual-disk compaction is not applicable. Local `%TEMP%/unified-server-e82-*` archives, `unified-e82-*` gate scripts and the downloaded run-5 suite log remain reproduction artifacts; no repository, credentials or persistent application data were deleted.
Attempt 7 uses the explicit runner admission fix promoted to canonical `ops/tests/be02/test-suites.sh`: the two cleanup unit tests are admitted, while the Mox app-chain suite is explicitly deferred to its dedicated BE02_MOX_APP_CHAIN harness. Existing dedicated Mox evidence is a separate lane. HOME and XDG_CACHE_HOME in the contract container point to its disposable tmpfs. The exact command is preserved in `launch-unified-server-20261023/fleet-gate.sh`.

Dense performance evidence from attempt 7: 120 mailboxes / 12,001 threads, EXPLAIN ANALYZE execution 211.186 ms, root 51 rows. Exhaustive 120-mailbox / 173-thread traversal took 0.065868 seconds. These are fixture observations, not a production latency guarantee; each mailbox still scans/sorts qualifying history using the existing query. The lateral boundary caps each mailbox contribution at 51 and the global result at 51.

## Final accepted runtime evidence

Attempt 7, `be02-ad06f73a05c0400eabedfa705a8dd6c0`, passed the full application runner: **1,251 runs / 14,142 assertions / zero failures / zero errors / four skips**, Steep exit 0, RuboCop lint **493 files / zero offenses**. Real authenticated HTTP acceptance passed **1 run / 33 assertions**, and real local/global Auth revocation worker drain exited 0. The organization database suite passed 16 runs / 273 assertions. Runtime logs, result, cleanup and source manifests are saved in [the evidence directory](launch-unified-server-20261023/). The four skips remain explicit conditional fixtures, not claims of universal native/protocol coverage.

The final contract-only rerun passed **11 runs / 115 assertions / zero failures/errors/skips**. Its test-only validator now handles OpenAPI 3.1 nullable type arrays with a positive/null/over-limit/wrong-type regression. A stale rejection of `simulated=false` was corrected to match the unchanged boolean schema and the adjacent existing live-response test. No send contract or production send logic changed. This narrow test repair occurred after run 7; only the affected contract suite was repeated. The first contract execution's 10 runs / 87 assertions / one failure / two errors is retained as failed history, not passing evidence.

Canonical OpenAPI SHA-256: `66ed9483d661271846b5dad75afd61bb521929ea8577ada3ec141cf146ea5a76`. Final contract test SHA-256, independently matched on fleet: `89a0b17673615c30d04fa1cdbee0e98401c72d799a4786ad6a2507d4be54f589`. `source-manifest.json` records current raw hashes, normalized fleet hashes and run-7 binding for all owned backend files. All match run 7 except the explicitly recorded post-run contract-test repair. Run-7 before/after source manifests are identical. Existing mailbox behavior, ThreadSummary and canonical historical folder seals remain unchanged.

Final cleanup removed five task containers, the task buildx container/registration, three exact task database/config/build-cache volumes, its internal network and task application image. `cleanup.json` records exact identities, zero errors and retained shared bases. Independent label queries found zero task containers, volumes or networks; the `--rm` contract container is also absent. Available fleet space after application cleanup was **72,027,549,696 bytes**; no reclaimed-byte delta is claimed amid concurrent lanes. No broad prune or persistent data removal occurred.

## Review and remaining acceptance

Root's bounded functional/security and dedicated design review is recorded in `launch-claude-security-20261023.md`; its requested Codex reviewers were unavailable and its actual reviewers were Claude, so no Codex identity is claimed. Review findings include conditional RLS and query-cost concerns, addressed by the actual non-owner login/forced-policy chain, forged-tenant/revocation regressions and dense measured plan above. Text timestamp ordering and shared-query interpolation retain the existing mailbox contract; this is a compatibility tradeoff, not a promise of an indexed constant-time history scan. No production query defect was established by these conditional concerns.

Supplemental review packets were sent to root: dense fixture 29 LOC; runner classification six context LOC; validator 39 context LOC (12 new/changed). Their independent final disposition remains pending; no zero-defect density or whole-project approval is claimed. Root owns `code-reviews.md`, central state/README updates and actual Obsidian synchronization. Actual Obsidian was unavailable to this worker, so analytical design tradeoffs are documented without claiming an Obsidian simulation.

Frontend source now consumes `listOrganizationThreads` through the organization schema; its runtime/visual evidence and production acceptance belong to separate lanes. No production publication, live email, warmup, paid resource or provider activation occurred. No commits were made by this worker, and unrelated dirty work was preserved.