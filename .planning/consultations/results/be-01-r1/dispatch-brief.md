# BE-01-R1 — bounded Astra LOW dispatch

**Design ready. No repair has been implemented or tested by this handoff.** Read [decisions.md](decisions.md), [synthesis.md](synthesis.md) and the immutable [V01–V13 requirements](brief.md). The coordinator records the actual writer execution and frozen implementation base before dispatch.

| Field | Required value |
| --- | --- |
| Task | BE-01-R1 / [issue 6](https://github.com/tanzeel-roseyco/elevateo-mail/issues/6) |
| Parent | [Draft PR 5](https://github.com/tanzeel-roseyco/elevateo-mail/pull/5), [BE-01 issue 3](https://github.com/tanzeel-roseyco/elevateo-mail/issues/3) |
| Consulted code base | `5a9d83ad4de7403f349131bf0c3e45df7fd97c28` |
| Later documentation-only head | `eedc43b736791e7e41656d405f10caf3d4164e01`; coordinator verified only README/state/evidence changes versus the consulted source, 34 insertions and two deletions |
| Common evidence SHA-256 | `a7fd40b1483a10e3f71f7fbef1c949c3ca32758f9776b19d20f3ccd4bd51cb05` |
| Actual design owner | `gpt-6-astra`, max, `/root/plan_synthesis`; native spawn evidence recorded in synthesis |
| Intended implementation owner | A separately spawned and verified `gpt-6-astra`, low; one writer, dedicated checkout |
| Branch | `fix/astra-low/be-01-r1`, reserved/verified by coordinator |
| Output | Three coherent repair units A/B/C, regressions/evidence and one linked draft fix PR; no auto-merge |
| Concurrency | Devin remains paused while this writer changes its backend foundation; no second writer on these files |
| Stop/checkpoint | Report within 30 minutes; after two unsuccessful repair attempts, unexpected grantor/privilege semantics, unsupported publication or invalid egress topology, stop the affected unit and return evidence to coordinator |

The user's existing $10 approval applies to Devin only. The coordinator's refreshed account observation is $6.59 prepaid credit and $0 on-demand; the earlier $7.74 observation is stale. This is not an Astra or Claude budget. This dispatch starts no Devin session and authorizes no purchase/top-up. Subsequent authorized Devin continuation retains coordinator monitoring every two minutes and the supported sleep action; no hard per-task USD cap or complete billing telemetry is claimed.

The coordinator is preparing `C:\Users\Tanzeel\Code and projects\Elevateo Mail - BE01 Repair` for the separate writer. Reported host free space is 1.68 GB and administrator privileges are unavailable. These facts constrain local Docker execution, not repair acceptance: source implementation can proceed, then the coordinator may explicitly authorize remote Docker verification of the frozen source checkpoint through the already provisioned Devin session. Windows bind-mount and Windows Docker-network acceptance remains pending until actually exercised. Never replace missing platform evidence with a Linux pass.

## Scope and order

1. **A — authority:** reproduce T1/T2/T3/M1 on the exact base in a disposable database, then implement owned-transaction/nesting/cache boundaries and the grantor-aware additive membership migration. Run real restricted-role/cache/pool/migration regressions.
2. **B — credentials and liveness:** replace blanket secret injection with the accepted matrix, make existing credentials immutable and first creation exclusive/atomic, then add truthful atomic-heartbeat liveness. Run environment, file-failure/race and worker tests.
3. **C — trustworthy egress evidence:** replace the false-denial fixture with namespace probes, a gateway-published local external route, equivalent internal/open controls and ID-owned cleanup. Run invalid-probe, negative-control and foreign-resource survival tests.

Do not repair by changing FORCE/default-deny RLS, making API writable, adding worker table access, widening runtime/migrator permissions, editing the applied foundation migration, rotating existing credentials or deleting data. Do not implement real Auth integration, Storage adapter, remaining seed/check lifecycle, provider/business endpoints, FE or native clients.

## Allowed files

- `apps/server/lib/elevateo/tenancy.rb` and its RBS; `config.rb` only if a failing role-specific regression requires a change.
- One new additive membership migration and `ops/db/bootstrap.sql`; no rewrite of the applied foundation migration or vendored upstream initialization.
- `compose.yaml`, `ops/compose.secrets.yaml`, a minimal `ops/compose.r1-test.yaml` test profile, `ops/bin/generate-secrets.rb` and directly corresponding tests.
- Worker heartbeat/probe files and its Compose healthcheck; Dockerfile only if required to run the accepted existing toolchain/probe. Preserve pins and nonroot runtime.
- `apps/server/test/be_01_r1/**`, minimal existing Rails test setup, `ops/tests/**` for this repair, and necessary thin Docker invocation wrappers. No new framework/dependency without explicit justified selection.
- `docs/evidence/be-01-r1.md`. Coordinator owns shared README/state/documentation/ADR/code-reviews updates and supplies the synchronized patch before any commit; otherwise leave the diff uncommitted for coordinator integration.

Search existing AIDEV anchors before edits; preserve their intent and update corresponding comments in the same change. Add short comments at security/transaction/cache/publication/cleanup decisions, not obvious statements. All changed code, tests and indirect effects require bounded independent review.

## Frozen harness shape and command contract

The following are implementation targets, **not currently executed commands or claims that missing services exist**. Provide thin Linux and PowerShell Docker orchestration using one shared container test implementation. Host scripts only invoke Docker/Compose and manage exact task-owned resources; Ruby/application assertions run inside containers. Do not expose a Docker socket in runtime or restricted test containers.

Use a unique project `be01r1-<nonce>` and a task-specific ignored credential path. First generate that scratch credential file with the accepted generator inside a disposable pinned Ruby container; do not invoke Compose interpolation before the file exists. The R1 Compose override must make fixture names, database/Storage volumes, ports and paths project-specific and must reject collisions with existing `elevateo-local` data. It must not accidentally select fixed production/local-volume names from inherited configuration. Preserve existing persistent data. Baseline reproduction uses a separate exported base source/context and distinct project, never shares repaired fixtures, and excludes unsafe execution of the old cleanup script against foreign resources.

Add only these necessary test lanes to the test profile: `r1-fixtures` (separate administrator process), `r1-api-test` (API login), `r1-worker-test` (worker login), and a migration-check tool using the existing migrator lane. Use the pinned server image for test execution and the pinned existing Ruby image for network/filesystem probes. Restricted tests must assert their session/current role, flags, ownership and inability to assume privileged roles before asserting rows. Fixture creation uses synthetic IDs and does not claim real Auth provisioning.

The wrapper must execute and record the equivalent of these commands with resolved task-specific paths/project, failing immediately on unexpected exits:

```text
docker compose --project-name <task-project> --env-file <task-env> -f compose.yaml -f ops/compose.r1-test.yaml --profile tools --profile r1 build api
docker compose <same selectors> up -d --wait db
docker compose <same selectors> run --rm bootstrap
docker compose <same selectors> run --rm migrate
docker compose <same selectors> run --rm r1-fixtures
docker compose <same selectors> run --rm r1-api-test bundle exec rails test test/be_01_r1/tenancy_test.rb
docker compose <same selectors> run --rm r1-worker-test bundle exec rails test test/be_01_r1/worker_role_test.rb
docker compose <same selectors> run --rm r1-api-test bundle exec steep check
docker compose <same selectors> up -d --wait api worker auth rest storage mailpit
docker run --rm --network container:<verified-target-id> <pinned-Ruby-image> ruby <mounted-probe> <literal-endpoint> <port>
```

`<same selectors>` is documentation shorthand, never a shell argument. Container paths/mounts and exact inherited command overrides must be finalized in the thin wrapper; do not assume a service's default entrypoint permits appended commands. Required lint/config checks use the existing pinned project tools inside Docker. Missing tools are reported, not silently skipped. No application test runs on the host.

The migration-check tool orchestrates fresh/legacy up/down/up, bootstrap repetition and failing migration in a disposable database; administrator catalog observations stay in a separate tool process and cannot turn the restricted test into a privileged harness. Containerized filesystem regressions operate only on task-owned scratch directories and exercise the actual Windows bind mount as well as the Linux filesystem. Environment checks consume private inspection data and emit names/assertions only. Network probes use the exact accepted E/internal/open topology and explicit outcomes in R1-07; host orchestration must not interpret a Docker exit as a blocked connection.

The final evidence file records the concrete wrapper invocation on Linux and Windows, all expanded nonsecret commands, image digests, commit, test cases and outcomes. Existing `scripts/dev seed/check` gaps remain pending BE-01 work; do not label the new focused harness as full lifecycle completion.

## Acceptance and closure

All V01–V13 remain mandatory. In particular:

- Reproduce vulnerable baseline behavior safely, then show the regression fails on base and passes on the repair. For destructive old cleanup/generator behavior, use isolated disposable resources/scratch files only; a skipped reproduction is recorded, not counted as a pass.
- Real executor-enabled query-cache and restricted-role tests cover both authorized reads and absent/malformed/foreign claims, commit/exception, mismatched nesting, pool size one and a small concurrent pool. No all-denied or raw-PG-only substitute.
- Prove grantor/options and row preservation on fresh and retained-volume paths, including bootstrap after migration down. Unknown grants stop the migration work.
- Inspect actual environments/DSNs/mounts privately; demonstrate secret-byte/permission preservation, concurrency and failure behavior. No secret values or interpolated Compose output enters logs/Git.
- Healthy idle held worker and stopped/stuck/malformed heartbeat cases are distinguished from unfinished dependency readiness.
- Both local and unrestricted external-route controls pass; confined targets pass the denial checker; equivalent open control fails because it connects. Missing probe/target, timeout, fixture setup failure and foreign-resource cleanup cases cannot yield a security pass.
- Run required lint, meaningful Steep, unit/integration/config checks at the final revision. Independently review every changed line in assignments of at most 200 lines with the user's full rubric and a dedicated design reviewer. Record deduplicated defects/density; linters own formatting.
- Immediately clean exact task-owned disposable containers/images/caches after tests or failure; inspect mounts, preserve persistent database/Storage/credentials, and report Docker usage plus host free space and compaction limits. Never use global prune or `down -v`.

Do not close issue 6 until these checks and independent review pass at the final integrated repair commit. Do not close BE-01 or enable live activity. Only after coordinator integration may the paused Devin author resume remaining accepted BE-01 from the recorded repaired base.
