# BE-01 continuation — acceptance inventory and proposed next checkpoint

**Draft for coordinator disposition, not a new accepted dispatch.** No implementation, application tests, Docker runs or grantor observations were performed for this inventory. BE-01 remains incomplete. The existing three BE-01 opinions and Astra MAX decisions remain authoritative; the separately accepted R1 repair does not close omitted foundation requirements.

## Evidence and limits

- Frozen backend source: `eedc43b736791e7e41656d405f10caf3d4164e01`, read through `git show` in `Elevateo Mail - BE01 R1`. Its source matches consulted `5a9d83ad4de7403f349131bf0c3e45df7fd97c28`; intervening changes are documentation only.
- Frozen coordinator documents: `de874683a58a37204cc2d4b2d87219459f629d77`, including BE-01 decisions/dispatch, R1 dispatch, task backlog, standards and consultation procedure.
- Source inventory used committed path listings plus 96 lines across Gemfile, Steepfile, Rakefile, routes, health controller and the two lifecycle wrappers. This is an acceptance inventory, not an adversarial code review or a new defect-density denominator. No active writer diff was inspected.
- `docs/evidence/be-01.md` reports earlier Linux execution and explicitly lists unimplemented checks. Those reports are partial historical evidence, not independent acceptance at a repaired final commit. Committed `apps/server/sig`, `apps/server/test`, `apps/server/spec`, `contracts` and `.github` paths contain no files at this backend base; the R1 writer's newer work is intentionally excluded.
- Actual synthesis role is the previously verified native `gpt-6-astra` / `max` agent `/root/plan_synthesis`. No Obsidian connection is available; the dependency analysis below is analytical.
- Later operational evidence from the coordinator: the initial grantor probe failed before readiness and yielded no catalog result. Refreshed Devin balance is **$5.60 prepaid, $0 on-demand**, replacing the earlier $6.59 observation. The $0.99 difference has not been independently attributed. No dollar cap, billing completeness, purchase or top-up is assumed.

## Urgent grantor-probe revision recommendation

Do not repeat the failed command unchanged. The initial probe mounted an empty tmpfs over `/etc/postgresql-custom`. At the exact image tag, [Dockerfile-17](https://raw.githubusercontent.com/supabase/postgres/17.6.1.136/Dockerfile-17) copies `conf.d`, `supautils.conf`, `wal-g.conf` and other configuration into this directory and enables configuration includes. [Docker's tmpfs documentation](https://docs.docker.com/engine/storage/tmpfs/) explains that the mount obscures underlying files. This supports a concrete configuration-masking hypothesis; without captured diagnostics it does not establish the failed container's actual error or any PostgreSQL grantor semantics.

Recommended isolated revision, requiring coordinator execution approval of the exact script:

1. Keep the same digest-pinned PostgreSQL image, SQL source base, disposable fixture credentials, `--network none`, no published ports and PGDATA tmpfs. First inspect image labels/digest and run a no-database, no-secret, overridden-entrypoint probe against fixed configuration paths. Emit only existence/readability booleans. Verify the exact image contains the referenced configuration; the tag source is supporting evidence, not proof of digest-to-source identity.
2. Replace only the configuration tmpfs with a newly created nonce-labelled named volume. Verify absence before creation and verify its ownership label immediately afterward. Mount it at `/etc/postgresql-custom` with default copying enabled, **not** `volume-nocopy`. [Docker documents](https://docs.docker.com/engine/storage/volumes/) that an empty volume receives pre-existing image content. This matches the earlier working foundation's named configuration volume without touching that existing volume.
3. Inspect mounts before startup. Record only fixed mount destinations, types and task-owned resource IDs. Stop on unexpected anonymous volumes or foreign mounts. Confirm the copied configuration paths are present/readable before attempting SQL. Avoid reconstructing or editing upstream configuration merely to force startup.
4. During the existing bounded readiness loop inspect `State.Status`, `ExitCode` and `OOMKilled`; stop immediately if the container exited. Do not spend the entire interval repeatedly executing against a dead container. Suppress raw Docker/psql environment dumps and raw database log lines.
5. On startup failure, return fixed diagnostic fields: container status/exit/OOM, configuration-path booleans, and optional allowlisted error-category booleans. If privately consuming bounded `docker logs --tail 200`, a classifier may recognize only fixed missing-config/permission/initdb categories and print literal category names; it must never echo matched lines, unmatched text, environment values, SQL statements or token/password fragments. Unknown failures remain `unclassified_startup_failure`; no general regex-redaction claim. Do not persist raw logs.
6. Preserve the original SQL observation verbatim after readiness. No migration compatibility code may infer the grantor from this configuration diagnosis. Capture real `pg_auth_members` options and role/catalog results or leave R1-A blocked.
7. Cleanup records only resources actually created by this invocation. Verify container and volume labels, mount ownership and fixed-path content metadata before removing the exact task-owned configuration volume after its container is gone. It contains disposable probe-only configuration/key material, not existing local data. Retain any unexpected resource for coordinator inspection. Remove the image only if this invocation introduced it and no other workload uses it. Preserve source and original persistent volumes; no broad prune or `rm -v`.

A single revised, observed attempt is preferable to another blind retry. Stop on unresolved image/configuration assumptions and report sanitized evidence. This recommendation does not execute the probe, prove startup, authorize repeated expenditure or change the R1 grantor prerequisite.

## Remaining foundation acceptance matrix

“Pending” means not accepted at the final integrated revision. A prior passing report does not survive relevant repairs automatically. R1 work below is a dependency to reuse, not work for a concurrent Devin writer to overwrite.

| BE-01 acceptance | Committed evidence and remaining work | Dependency / owner boundary |
| --- | --- | --- |
| A01 pinned stack | Linux stack reportedly started; record platform child digests, final resolved gems, build provenance, SBOM/advisory results and image/source licensing. Repeat readiness at repaired head. | R1 integrated first; no silent image/version upgrades. |
| A02 validated configuration | Some rejection cases reportedly exercised. Final matrix needs missing/malformed config, redacted failures and allowlisted endpoints under repaired credential injection. | Reuse R1 secret/config regressions; add only uncovered cases. |
| A03 real Auth | Admin provisioning, token issuance, invite/recovery capture and disabled public signup were explicitly not implemented/run. Health alone is insufficient. | Proposed first continuation checkpoint; Mailpit only, synthetic identities. |
| A04 confinement | Earlier egress result is invalidated by accepted review findings. | Entire probe/topology/cleanup repair belongs to R1-C; continuation reruns accepted final harness. |
| A05 roles | Partial role/grant observations exist; complete restricted startup identity/flags/ownership/SET-role checks after repair. | R1-A/B first. Never run row-denial assertions under fixture administrator. |
| A06 all four-table RLS | Full absent/empty/malformed/foreign/nonmember/private-denied plus positive shared/private cases remain unaccepted. API write denial and worker no-access remain mandatory. | Reuse R1 Rails harness; add real-Auth fixture IDs and uncovered table/access combinations. |
| A07 composite integrity | Cross-org forged links, dual-org user and organization-removal/private-access cases were explicitly not run. | Separate fixture writer; constraint denial must be attributable to composite FK, not incidental RLS. |
| A08 pool/cache isolation | Existing wrapper defects have accepted repair design; final transaction/cache/nesting/concurrency evidence pending. | R1-A owns repair and regressions; no second wrapper implementation. |
| A09 hidden schemas | Need real HTTP denial with anonymous and actual user JWT plus role/schema assertions for app and metadata. | Real Auth first; preserve hidden PostgREST surface and restrictions on service_role. |
| A10 private Storage | No internal adapter or object round-trip exists. Need real private bucket, authorized upload/download/hash, foreign-principal rejection and direct anonymous/user-JWT denial. | Real Auth + repaired tenancy; narrow server Storage credential exception only when adapter is introduced. |
| A11 lifecycle/persistence | Wrappers route seed/check to absent services (`scripts/dev:11–12`, `scripts/dev.ps1:11–12`). Reported restart preserved migration state only. Need repeat seed/bootstrap/migrate with stable Auth IDs, membership counts, credentials and object hash; restart all three data domains. | Complete real fixtures; R1 credential-preservation tests are necessary but insufficient. |
| A12 failed migrations | Deliberate failure/transaction/version test was not run. Scoped SQL structure dump is also absent. | Reuse R1 migration harness; schema dump excludes Auth/Storage internals and credentials. Global roles remain explicit source. |
| A13 hold/readiness | Health/readiness and hold were reported, but DB mutation/restore invariance and safe probe failures remain unaccepted. | R1 heartbeat proves liveness only. No release path or pretend job tables. |
| A14 checks/types/contracts | Steepfile names signatures but committed sig directory is absent. No tests or complete check service. Need meaningful RBS for config, context, adapter, health/errors; lint/unit/integration/config/contract checks in Docker. | Reuse R1 signatures/tests, finish remaining modules and framework seams explicitly. Never count an empty target or skipped command as pass. |
| A15 Linux/Windows/resources | One historical Linux idle sample exists; actual PowerShell lifecycle not exercised. Need final revision commands and measured idle CPU/memory/disk. | Windows host disk currently limits execution; Linux evidence cannot close Windows acceptance. |
| A16 cleanup | Historical task cleanup reported; persistent volumes/credentials retained and 118.5 MB cache could not be removed by exact ID. | Every new run cleans its own disposable resources immediately; report retained resources/host space. No automatic persistent-data deletion. |

## Contracts, recovery and supply-chain boundaries

The original BE-01 allows only `contracts/openapi.yaml` for minimal `/health`, `/ready` and `{code, message, request_id}` error behavior. The committed routes/health implementation exists; its machine-readable contract and conformance checks do not. Reconcile this small operational contract with the coordinator before adding a second schema file. **Do not modify the newer FE `contracts/v1/openapi.json` or implement its session/mailbox endpoints under BE-01.** Current session identity, cookie/CSRF policy, revocation, mailbox capabilities and business read/draft routes belong to the fresh BE-02 gate, using that accepted FE contract as an input.

BE-01 must deliver the scoped app/app_meta structure dump, transactional failing-migration check, restart persistence, and proof that restoring/changing application data cannot release the configuration-held worker. These are not a complete backup system. Full database plus private-object backup/restore, external provider-ledger reconciliation, encrypted off-host copies, retention, recovery objectives and ten-user measurements remain **OPS-01**, dependent on BE-02 through BE-05 as applicable. Preserve those requirements; do not add placeholder backup/restore commands or claim a structure dump backs up Auth identities, Storage bytes or global roles. A local isolated restore used to test hold is still required before BE-01 closes.

Supply-chain acceptance requires actual final-image SBOM/advisory output and digest/platform/source linkage. The existing research pins and index digests do not establish a clean final image or license clearance. Record findings and disposition rather than silently changing the accepted stack. These checks and their cleanup consume execution budget too.

## Proposed smallest next continuation checkpoint: real identity and repeatable seed

**Candidate only, under BE-01 issue 3 / PR 5.** First complete and independently verify the relevant R1 repair at an exact integrated source head; do not resume concurrent backend authoring while the Astra LOW writer owns those files. The failed grantor probe is not that prerequisite.

Proposed bounded deliverable:

1. Add the missing containerized `seed` lane using a separate administrative fixture process. Provision exactly the two accepted synthetic identities through real Auth APIs; use returned UUIDs for two organizations and shared/private mailbox memberships. Never insert directly into `auth.users`, widen API writes or grant worker business access.
2. Make fixture setup repeatable without replacing existing users, credentials or unrelated rows. Validate Auth responses, bound pagination/retries/timeouts and fail on inconsistent existing fixture identity. Decide the exact invite/token exchange from the pinned Auth API; do not invent permanent bearer tokens, enable automatic confirmation or log recovery links. Any new fixture-only credential handling must preserve R1's immutable existing secret file and narrow runtime environment matrix.
3. Add a focused container smoke test proving actual token issuance, local invite/recovery capture, public-signup rejection, second-seed stable IDs/counts and Auth/fixture persistence after restart. Assert local recipients/endpoints and denied outbound configuration. Cover malformed/upstream-failed provisioning without treating partial seed as success.
4. Add meaningful types for new fixture boundary code and run its focused tests/lint in Docker. Expose the concrete focused invocation in evidence; do not label it the finished full `scripts/dev check` lifecycle. Keep the full A14 gap open until all foundation checks are wired and exercised.

Allowed candidate paths: a small fixture/Auth helper and RBS under `apps/server`, a seed task and its tests, the minimal Compose tools/seed service, and evidence documentation. Existing thin wrappers already name seed; change them only if genuinely needed. No new dependency, table, application session route, Storage runtime credential, provider code or unrelated refactor is implied. The coordinator supplies same-commit README/state/documentation updates.

This creates the real identities needed by remaining RLS/REST/Storage tests. It deliberately leaves A06–A10 completeness, full check lifecycle, operational contract, dump/restore and supply-chain evidence pending. It cannot close BE-01 or demonstrate frontend integration. The next coherent checkpoint would add the existing accepted private Storage adapter and remaining real-role/HTTP access tests; finish full check/recovery/provenance/platform evidence afterward.

## Dispatch prerequisites and consultation disposition

- **Existing coverage:** the three successful BE-01 opinions and accepted B01-03 through B01-07 already require these omitted Auth/fixtures/Storage/types/lifecycle checks. A coordinator resume of the same BE-01 task, with unchanged boundaries and the separately accepted R1 refinements, need not pretend these are new design approvals. Freeze the repaired base and cite both gates; independently review all new code in assignments at most 200 lines with the full rubric and a dedicated design reviewer.
- **No gate waiver:** if the coordinator turns this draft into a distinct continuation task, changes privilege/schema/session/Storage boundaries, adds a service/dependency or narrows the final acceptance contract, the mandatory three fresh exact-model opinions plus actual Astra MAX synthesis apply before implementation. Accepted B01-01 explicitly says to propose a separately consulted continuation if the recorded budget cannot cover the bounded task. This draft does not decide that uncertainty away or launch consultations.
- **Still unresolved:** final R1 head and evidence; actual grantor/options; real pinned Auth invite/token behavior; how fixture secrets/identifiers remain stable without modifying an existing protected secret file; exact final full-check composition; operational-contract ownership reconciliation; platform feasibility; and final-image advisory disposition. Routine fixture implementation can use existing design only while these stay within its accepted boundaries. Material changes return to synthesis.
- **Budget:** refresh remaining credit after the probe. $5.60 is an observation, not a promised allowance for this checkpoint. Request one small explicit authoring checkpoint with a ten-minute report boundary, coordinator polling every two minutes and supported sleep on uncertainty or exhausted credit. Count image pulls, tests and cleanup in the plan. No enforced USD cap is claimed; do not promise complete BE-01 within this balance or authorize a purchase. Resume further work only through coordinator disposition of observed progress/cost.
- **Exit evidence:** exact source/head, commands, test results or failures, unresolved acceptance IDs, sanitized Auth identity/count assertions, Docker resource ownership/cleanup, and a source checkpoint for bounded independent review. No real mail, activation, automatic merge or task closure.

The immediate priority is a diagnosed isolated grantor probe and completion of the accepted R1 repair. This draft is ready for later refinement after those results; it must not delay R1 review slots.

## Later execution proposal: actual Rails and PostgreSQL at checkpoint 5785eba

This section supersedes only the earlier immediate execution priority. It is an unexecuted runbook proposal, not application source or an acceptance result. The corrected grantor probe has since succeeded, R1 source is committed, and independent static review is recorded by the coordinator. Keep the earlier continuation inventory as historical planning evidence.

Repair source: `5785eba47f3709debb2815c8d86608f7e62d02f3`. Baseline source: `eedc43b736791e7e41656d405f10caf3d4164e01` (its application source equals `5a9d83a`). Preserve the coordinator's 31-blob manifest before and after execution. No tracked edit, dependency update, migration rewrite, authoring task or acceptance relaxation is authorized by this runbook.

The coordinator reports the preceding isolated ops batch: heartbeat 2 tests / 14 assertions passed; egress 9 tests / 39 assertions passed with one PowerShell skip; secrets failed while loading the undeclared-in-that-preparation `base64` gem. This does not establish a generator defect. The complete committed Rails lock already includes `base64` 0.3.0; use the full application bundle for all three suites. Do not prepare another bespoke gem subset. The raw log is preserved at coordinator commit `73ce4b2`, `docs/evidence/be-01-r1-ops-result/run.log`; its outer runner returned 0 despite the secrets command returning 1. The next runner must record each status and return nonzero if any required command failed, timed out or was not executed; a later passing command must not replace an earlier failure.

### Budget, deadline and stop conditions

Refresh the actual remaining prepaid balance before dispatch; the latest coordinator UI observation is **$4.20 remaining and $0.00 on-demand**, with a $0.97 balance change over the preceding ops interval (not independently reconciled per-action billing). This is not a hard API-enforced cap. Keep purchases/top-ups disabled. The proposed single execution window is **12 minutes maximum including cleanup**: up to 7 minutes for one build, 4 minutes for the database/test phases, and 1 minute reserved for cleanup. The larger window replaces the five-minute SQL-only proposal because installing the complete locked bundle is necessary to run the real regressions. The coordinator polls every two minutes and uses the supported sleep control on uncertainty, exhaustion, unexpected spend or expiry. No automatic rebuild, dependency substitution, second attempt or unbounded diagnosis. A phase timeout is an incomplete result; stop and clean up. This is a wall-clock boundary, not a claimed USD enforcement mechanism.

### Immutable inputs and one image

1. Export the exact repair Git tree to a new nonce-owned directory outside the working repository. Export the whole tree so ops suites can resolve their existing relative requires. It contains committed files only, never an existing `.env`, credentials or uploads. Record source and manifest hashes; the live checkout is not a test input. The current batch does not export or execute the historical baseline.
2. Build the existing `apps/server/Dockerfile` from the repair export's `apps/server` context once. Its base is `ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2`. Do not change Gemfile, lockfile or Dockerfile. Native compilation and the existing `bundle install` run in Docker.
3. Isolate build cache in a new nonce-named `docker-container` Buildx builder; record its newly created container/volume IDs, mount layout and actual BuildKit image identity. Do not change the default builder. This prevents task cleanup from pruning someone else's cache. The [Docker container driver](https://docs.docker.com/build/builders/drivers/docker-container/) stores its state in a dedicated volume. Follow the reviewed cleanup sequence below; [Buildx removal flags](https://docs.docker.com/reference/cli/docker/buildx/rm/) alone do not verify resource ownership. This does not pin or certify the build toolchain or close the SBOM gate.

```bash
# Variables below are nonce-owned absolute export paths/names validated by the wrapper.
docker buildx create --name "$builder" --driver docker-container --driver-opt restart-policy=no
timeout 420s docker buildx build --builder "$builder" --load --progress=plain \
  --label "elevateo.r1.run=$nonce" --tag "$app_image" "$repair_export/apps/server"
```

4. Before database work, run a network-none container from the image and require `bundle check` plus SHA-256 equality of `/app/Gemfile` (`19044c02efd7ed6fd03abec9f6e051e10248d53b820dd964592fc2e689abfe60`) and `/app/Gemfile.lock` (`67b2f69a0ed30c1d9926ab2940fe54173991d238192feca38a8f04b97390ea23`). These are canonical LF Git-blob hashes from `docs/evidence/be-01-r1-git-blobs.json`, not physical Windows checkout hashes. Derive them from the frozen Git object and verify all 31 manifest entries before and after testing. Record Ruby, Bundler, Rails, pg, minitest, minitest-mock and base64 versions. A lock mutation inside the image fails this checkpoint; do not silently copy it back.

### Current executable checkpoint and resource contract

Build once, run full-bundle ops, then use **one fresh repaired cluster** for real repaired T1–T3, authority, tenancy and worker tests. The historical baseline and rollback/upgrade phases described below remain pending. This changes the execution checkpoint, not final R1 acceptance. The frozen main script is `docs/evidence/scripts/be-01-r1-full-run.sh` (121 lines, SHA-256 `fbbf64d9329b9056bea105ddb8c7dfa38abd238ac85ddcc98004aafe49e50aa2`); its helper is `be-01-r1-resources.sh` (184 lines, SHA-256 `c134518c1122e0b4d9e51c79ebaa9a54fdcd9cf595265dfeda5d31ac0ad6637f`). Both use LF bytes. Independent review and the dedicated design re-review are static evidence only; no execution is claimed.

The current dispatch consists only of `docs/evidence/scripts/be-01-r1-full-run.sh` and `be-01-r1-resources.sh`. Freeze their final hashes after independent review, with each review assignment at most 200 lines. Execute the reviewed wrapper unchanged; the historical and lifecycle examples below are deferred planning references, not additional commands for the paid executor. No second cluster, baseline export, rollback or migration lifecycle suite is included in this checkpoint.

- Retain the successful probe's pinned PostgreSQL image, copied configuration-volume preflight, PGDATA tmpfs, early-exit readiness checks, sanitized diagnostics and fail-closed ownership/mount validation. Image: `supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`.
- Instead of `--network none` for PostgreSQL, create one nonce-labelled **internal** Docker network. Attach only the current PostgreSQL container (alias `db`) and each short-lived app client. No host ports, host networking, Docker socket, external service, Auth, Storage, Mailpit or provider is needed for this R1 batch. A successful internal run is not an egress acceptance result.
- Use one fresh repaired PostgreSQL cluster with a nonce configuration volume and fresh PGDATA tmpfs. A later baseline comparison requires a separate cluster because PostgreSQL memberships are cluster-wide; two databases in one cluster are not independent lanes.
- Application containers run as UID 10001, read-only root filesystem, dropped capabilities, no-new-privileges, writable task-only tmpfs at `/tmp`, `/app/tmp`, `/app/log`, `HOME=/tmp`, `BUNDLE_APP_CONFIG=/tmp/bundle`, `BUNDLE_FROZEN=true`, workdir `/app`. Inspect their exact mount source/destination/type/read-only flags before starting. Creation uses `--rm`; retain and report any container whose ownership/mount validation fails rather than deleting it.
- Current app invocations use the immutable repaired source baked into the image and the whole repaired export mounted read-only at `/src`. The `app baseline`/`app repair` notation below belongs only to the deferred lifecycle proposal; it does not describe implemented wrapper subcommands.
- Each app invocation receives only `RAILS_ENV=test`, local/hold=true, DB host `db`, DB name `postgres`, the selected role and **its own** disposable fixture password, pool size, process (`api`, `worker`, or `migrate`), a disposable SECRET_KEY_BASE, and the already required internal URLs/SMTP settings from `ops/compose.r1-test.yaml`. Never give the API/worker admin or migrator credentials, a shared env file, JWT/service key, DSN or inherited host environment. No process connects as admin then SET ROLE to fake a restricted login.
- Run the repaired bootstrap, migrations, fixtures and repair-state catalog checks in the order implemented by the reviewed wrapper. Administrative `psql` operations use `-X -v ON_ERROR_STOP=1`; API/worker suites use their own restricted logins. Catalog checks referencing application tables must follow the foundation migration. The wrapper never substitutes administrator observations for restricted-role results.
- `ops COMMAND...` runs the same full app image with network none and the entire repair export mounted read-only at `/src`; existing relative requires then resolve correctly. No database or application credentials are supplied. Preserve independent exit status, counts and explicit skips for every command.

### Current expected evidence

First run the full-bundle ops suites; these do not need PostgreSQL. Aggregate failures without converting skips into platform passes. A loading/dependency failure stops database work; a genuine test failure is reported for coordinator disposition, not edited remotely.

```bash
ops bundle exec ruby /src/ops/tests/secrets_test.rb --seed 1 --verbose
ops bundle exec ruby /src/ops/tests/heartbeat_test.rb --seed 1 --verbose
ops bundle exec ruby /src/ops/tests/egress_test.rb --seed 1 --verbose
```

Then require the fresh repaired bootstrap and migrations, fixture insertion, repair-state membership catalog, repaired T1/T2/T3 driver, authority guards, tenancy with pool sizes 5 and 1, and worker role suite. These are real Rails/PostgreSQL invocations. The driver requires exit 0 and exactly one `REPAIR_PASS` result for each T1/T2/T3; a prerequisite error or missing case proves neither regression behavior nor repair. Preserve every command's status and test counts. This checkpoint does not execute the historical reproduction or demonstrate a reversible upgrade/rollback lifecycle.

### Deferred lifecycle proposal: reference only, not this dispatch

The following payloads retain the complete lifecycle requirements for a subsequent authorized batch. Their conceptual wrapper functions and down-state probe are not part of the current executable wrapper. No result is claimed for an omitted phase.

**Cluster L: historical baseline and then a deliberate upgrade.** Start a fresh cluster using the successful setup and frozen baseline bootstrap. Migrate the historical app before inserting fixtures: the full catalog script references four tables and cannot run against bootstrap-only schemas.

```bash
bootstrap baseline
app baseline elevateo_migrator 5 bundle exec rails db:migrate
fixtures
catalog legacy                         # Save all four row fingerprints as L0.
app baseline elevateo_api 5 bundle exec ruby /r1/baseline_driver.rb baseline
# Freeze the baseline's three JSON case records before deliberately upgrading L.
bootstrap repair
catalog absent                         # Compare all four fingerprints with L0.
app repair elevateo_migrator 5 bundle exec rails db:migrate
catalog repair                         # Same fingerprints; exact owner grantor/options.
```

The baseline driver should exit **1** with exactly one result for each T1/T2/T3, each explicitly `REPRODUCED`. A nonzero exit alone proves nothing: `SETUP_ERROR`, `NOT_REPRODUCED`, missing/duplicate cases, process timeout and incidental failures remain distinct. Preserve all three outcomes even if one fails; do not reinterpret a prerequisite failure as a reproduced defect. After the upgrade, require two applied migration versions, the owner-issued API edge (`ADMIN=false`, `INHERIT=true`, `SET=false`) and absent privileged legacy edge. Tear down L by exact verified IDs before creating F. The upgraded L observations do not replace the independent repaired regression run.

**Cluster F: fresh repaired foundation, actual suites and rollback lifecycle.** Bootstrap twice before the foundation migration, then record an explicit zero count of API read-role memberships. Do not call the full table-fingerprint catalog yet.

```bash
bootstrap repair
bootstrap repair
app repair elevateo_migrator 5 bundle exec rails db:migrate VERSION=20261012000001
fixtures
catalog absent                         # Save all four row fingerprints as F0.
app repair elevateo_migrator 5 bundle exec rails db:migrate
catalog repair
app repair elevateo_api 5 bundle exec ruby /r1/baseline_driver.rb repair
app repair elevateo_api 5 bundle exec ruby test/be_01_r1/authority_guards_test.rb --seed 1 --verbose
app repair elevateo_api 5 bundle exec ruby test/be_01_r1/tenancy_test.rb --seed 1 --verbose
app repair elevateo_api 1 bundle exec ruby test/be_01_r1/tenancy_test.rb --seed 1 --verbose
app repair elevateo_worker 5 bundle exec ruby test/be_01_r1/worker_role_test.rb --seed 1 --verbose
app repair elevateo_migrator 5 bundle exec ruby test/be_01_r1/membership_migration_test.rb --seed 1 --verbose
catalog repair                         # Compare F0; suite must restore the up state.
bootstrap repair
catalog repair                         # Bootstrap must preserve the owner edge and F0.
app repair elevateo_migrator 5 bundle exec rails db:migrate:down VERSION=20261012000002
catalog absent
# Execute the restricted down-state probe below, then repeat bootstrap while down.
bootstrap repair
catalog absent                         # No silent API re-grant; compare F0.
app repair elevateo_migrator 5 bundle exec rails db:migrate:up VERSION=20261012000002
catalog repair                         # Restore exact edge/version; compare F0.
app repair elevateo_api 5 bundle exec ruby /r1/baseline_driver.rb repair
```

Use the actual Ruby file invocations above, not a global Rails test task that could invoke schema maintenance under the restricted API role. Repaired diagnostics require exit 0 and three `REPAIR_PASS` case records. Run tests sequentially; migration tests temporarily remove the edge and must not race API tests. Assert fixture fingerprints after every catalog checkpoint rather than merely printing them. Only migration 20261012000002 is rolled back; foundation/data remain intact.

The **down-state probe** is an API-login process, because the normal restricted test helper deliberately requires the repaired membership and therefore cannot validate the down state. Load `./config/environment`; assert both session/current identities equal `elevateo_api`, zero API read-role edges, and `pg_has_role(..., 'elevateo_app_read', 'USAGE')` and `SET` are false. Then attempt `SELECT id FROM app.mailboxes`: accept denial only from the database's `42501` insufficient-privilege SQLSTATE through the actual ActiveRecord exception cause. A connection failure, missing table, arbitrary exception, empty successful query or administrator observation is not this proof. Print a fixed success marker only after all assertions. This small operational probe must be included in the frozen wrapper review, not improvised after a failure.

### Further deferred lifecycle stimuli

These are required before full R1-A closure and remain pending after the current checkpoint. Do not append them to its execution window.

1. With the repair edge present, add the measured privileged legacy edge explicitly (`GRANTED BY supabase_admin`, ADMIN false / INHERIT true / SET true). Require two pre-transition edges, run repaired bootstrap, then require exactly the preserved owner edge and unchanged version/fingerprints. The normal catalog's three state names intentionally reject the temporary dual-edge state; use an explicit two-edge assertion before bootstrap.
2. Inject an owner-issued API edge with SET true. Capture its exact catalog state, run repaired bootstrap and require its specific unexpected-membership failure plus unchanged edge/options/versions/fingerprints. Restore only that deliberately changed option using the owner identity; never normalize an unrecognized failure. The committed migration suite separately checks its unknown-option branch.
3. Down only migration 20261012000002. Revoke the owner ADMIN prerequisite as the measured administrator using `RESTRICT` while no dependent API edge exists. Require the **actual versioned Rails up** to fail for the named missing-ADMIN prerequisite, with no edge/version/data change. Repaired bootstrap restores its prerequisite but leaves the API edge absent; actual up then restores the owner grant. Never use CASCADE or grant CREATEROLE.

### Cleanup and honest exit record

On success, test failure, timeout or startup failure, stop/remove only recorded task-created containers after nonce ownership and complete expected-mount verification. A killed Docker CLI does not prove its daemon-side workload stopped. Verify/stop the actual container or task builder. PGDATA is synthetic tmpfs; remove only each checked nonce configuration volume after its database and verification helper are gone. Inspect its configuration-only content metadata and label first. Any failed ownership/content inspection means retention and an explicit cleanup failure, not forced deletion.

Inspect the dedicated builder's identity and exact state/cache mount before removing its recorded container. Builder registry metadata may be removed with `--keep-daemon --keep-state` only after verified container removal or successfully confirmed absence; these flags do not establish cleanup by themselves. Remove the exact cache volume only after successful ownership/content verification. A failed inventory or inspection is unknown state: retain and report failure, never reinterpret it as absence. Remove the exact task app image and only task-introduced unreferenced base/tool images. Preserve pre-existing images, source exports, evidence, repositories, credentials and persistent data. Remove the exact internal network only after its task containers are gone. No global prune, wildcard deletion or anonymous-volume purge. Report Docker usage and actual remote host free space before/after, exact deleted IDs, retained resources and cleanup failures. Windows compaction is unrelated to this remote Linux batch and is not claimed.

Return actual timestamps, image identities, all 31 source-blob and bundle checks, independent ops results, repaired case records, suite counts/skips, observed migration versions and membership catalog, and cleanup. Explicitly mark historical reproduction, transition/rollback lifecycle and any unexecuted assertion pending. This batch does **not** close broader BE-01, Steep, actual hostile privilege/ownership fixtures, worker stop/stall, real egress topology, Windows filesystem/PowerShell, Auth, Storage, HTTP contracts, UI integration or final publication gates. No execution or result is claimed by this proposal.
