# BE-01-R1 — security repair design question

**Status: consultation draft; no repair approach accepted and no implementation authorized by this document.** Obtain three fresh, independent opinions on the identical frozen packet, then actual Astra MAX synthesis. Existing BE-01 acceptance is not a substitute. No regression below has been run by this brief's author.

## Task, ownership and boundary

| Field | Value |
| --- | --- |
| Task | BE-01-R1, bounded repair of the partial BE-01 foundation |
| Parent | [BE-01 issue 3](https://github.com/tanzeel-roseyco/elevateo-mail/issues/3), [incomplete draft PR 5](https://github.com/tanzeel-roseyco/elevateo-mail/pull/5) |
| Repair tracking | [BE-01-R1 issue 6](https://github.com/tanzeel-roseyco/elevateo-mail/issues/6), covering the coordinator's ten deduplicated review rows |
| Exact repair base | `5a9d83ad4de7403f349131bf0c3e45df7fd97c28`, `origin/devin/backend/be-01` |
| Repository | `https://github.com/tanzeel-roseyco/elevateo-mail.git` |
| Design question owner | Actual `gpt-6-astra`, effort `max`, task `/root/plan_synthesis`; this is preparation, not the final synthesis |
| Required independent opinions | `claude-fable-5`, `claude-opus-5-5`, `claude-fable-5-1`; all pending for R1 |
| Intended repair author | Separately dispatched `gpt-6-astra`, effort `low`, after synthesis; requested identity is not execution evidence |
| Intended branch | `fix/astra-low/be-01-r1`; coordinator reserves a dedicated checkout and links deduplicated finding issues before dispatch |
| Output | Minimal repair diff, real Docker regression evidence and a linked draft fix PR; no automatic merge |
| Subsequent work | Devin resumes the remaining accepted BE-01 only after the repair is reviewed and integrated into a recorded base |

Preserve [B01-01 through B01-08](../be-01/decisions.md), the [BE-01 dispatch acceptance matrix](../be-01/dispatch-brief.md), and the accepted dependency pins. This task repairs existing security and verification boundaries. It does not complete BE-01, implement authentication/business endpoints, create the Storage adapter, finish all lifecycle tooling, add product tables, or implement FE-01. Each remaining BE-01 check retains its actual status.

The question owner previously reviewed exactly 170 project code lines: the 85-line foundation migration, 40-line tenancy module, 31-line bootstrap SQL and 14-line database configuration. No additional project code was reviewed to prepare this brief. Operational findings below are attributed to the coordinator's separate reviewers; the packet must include their final evidence and exact source blobs. Do not attribute their inspection to this author. Obsidian is unavailable; analytical scenarios are not connection-based simulation.

## Findings supplied to the consultation

These local IDs are packet identifiers, not invented GitHub issue numbers. Preserve duplicates as corroboration without counting them twice in the combined review record.

| ID | Finding and evidence status | Required repair question |
| --- | --- | --- |
| R1-T1 | Confirmed static P1: `apps/server/lib/elevateo/tenancy.rb:27` uses `requires_new`; inside an ambient transaction its savepoint release leaves `SET LOCAL` claims active after the marker is cleared at line 35. Independently corroborated. | Should the outermost wrapper reject an unrelated ambient transaction and own the real transaction? Specify how legitimate same-principal nesting is distinguished. |
| R1-T2 | Confirmed static P2: `tenancy.rb:21-24` checks only the nested principal and yields a different supplied connection without establishing its transaction/context. Independently corroborated. | Bind nested authority to the same connection and transaction, rejecting a mismatch before yielding. |
| R1-T3 | Confirmed static P1: `tenancy.rb:28-35` changes claims through raw PG without handling the Rails query cache. Identical ActiveRecord SELECTs can reuse A's cached rows under B or after the wrapper exits. Exact pinned Rails 8.1.4 source verified. | Define an uncached protected boundary and entry/exit invalidation, including exception paths; prove restored cache state cannot reveal old rows. |
| R1-M1 | Confirmed binding-design P2: `ops/db/bootstrap.sql:24` grants API application-role membership on each bootstrap although B01-03 assigns application membership evolution to the application migration source. | Establish one versioned owner for runtime membership, including the PostgreSQL 17 grantor/admin semantics and already-initialized local volumes, without broad runtime or migrator privilege. |
| R1-S1 | Coordinator-confirmed: API and worker inherit the entire generated `.env` through a shared Compose `env_file`, including PostgreSQL administrator, JWT signing and migrator secrets. Precise Compose line references come from its reviewer, not this author's additional inspection. | Replace blanket injection with explicit per-service credential allowlists; preserve only B01-05's narrow server Storage credential exception where actually needed. |
| R1-S2 | Coordinator-confirmed: `ops/bin/generate-secrets.rb:42` unconditionally truncates the sole credential file on repeated bootstrap. A crash/write failure can destroy credentials that persistent services still require. | Make a valid existing file a byte-preserving no-op and make necessary creation/update atomic; demonstrate preservation under injected failures. |
| R1-E1 | Coordinator-confirmed B01-R08: `ops/tests/egress-check.sh:18,21` treats any failing `docker exec`, including absent/stopped containers or absent probe tools, as evidence that egress is denied. | Distinguish invalid test setup/execution from the specifically expected network denial. |
| R1-E2 | Coordinator-confirmed B01-R09: `ops/tests/egress-check.sh:10-18` uses a private-IP fixture on another Docker bridge and demonstrates bridge separation, not the runtime's external-egress restriction; removing `internal: true` can still pass. | Use a reachable external-route fixture/control arrangement that detects removal of confinement, without contacting the Internet or a real mail provider. |
| R1-E3 | Coordinator-confirmed B01-R10: `ops/tests/egress-check.sh:6-11` combines static resource names, ignored creation errors and unconditional traps that can remove foreign Docker resources. | Create invocation-unique fixtures, fail on creation errors and clean up only exact IDs successfully created by this invocation. |
| R1-H1 | Coordinator-confirmed B01-R07, P2 standards/acceptance gap: `compose.yaml:183-190` and `apps/server/Dockerfile:1-13` lack a worker health probe, so `up --wait` establishes process presence rather than the required worker health. This is not an observed runtime failure. | Propose the smallest truthful worker liveness probe, distinct from the API HTTP probe and unfinished full readiness; verify the supplied source and preserve this evidence classification. |

The coordinator records ten deduplicated findings across 665 reviewed lines (15.04 findings/KLOC): nine other static findings plus the worker standards/acceptance gap. This brief preserves that total while distinguishing the health gap from an executed failure. Its author's own earlier review remains four findings across 170 lines (23.53/KLOC), with overlaps counted only once in the combined record. The final packet must attach the coordinator's exact reviewed blobs and finding rows, including the remaining precise R1-S1 references. A newly discovered defect or material design change requires an explicit packet-refresh decision; do not silently expand the task. Existing `app_meta` configuration was independently reported to qualify Rails bookkeeping correctly: do not resurrect the disproved search-path finding.

## Invariants the repair must preserve

1. Every protected read executes on the wrapper's verified connection within its owned transaction under exactly one validated principal. Missing, empty, malformed or conflicting context cannot authorize data. No Ruby marker, pool reuse, savepoint or cache outlives that authority.
2. FORCE RLS remains on all four application tables. API is read-only; worker has no business-table access. Runtime roles cannot own tables, bypass RLS, become superuser, or assume an owner/migrator/administrative role. Restricted regressions assert those properties before testing rows.
3. Keep the composite organization/mailbox/membership constraints and acyclic policy graph. Do not weaken policies to make tests pass. Fixture insertion is a separately identified privileged operation; privileged credentials do not enter restricted test or runtime containers.
4. Runtime services receive only their own declared credentials. API/worker receive no PostgreSQL administrator password, JWT signing secret, migrator password or one another's database password. A Storage service credential is allowed only at the accepted internal adapter boundary; its absence must not be solved by leaking the entire file. No production credentials are needed.
5. Repeated bootstrap preserves existing valid secret bytes, permissions and persistent-service compatibility. A failure cannot destroy the last complete credential file. Fail clearly on an incomplete/invalid existing file; do not regenerate credentials against retained databases or rotate keys as a repair shortcut.
6. The egress check must distinguish a valid blocked attempt from a broken probe and must fail a deliberately unconfined negative-control configuration. All fixture traffic stays inside task-owned Docker networks. API/worker/Auth/catcher retain runtime isolation, Mailpit-only SMTP and the outbound hold.
7. Cleanup cannot delete pre-existing resources or persistent data. Application tests run inside Docker. No live send, warmup, provider contact, purchase, top-up, DNS change, production activation or public deployment is in scope.

## Smallest candidate repair — questions, not decisions

### R1-A: transaction, connection, cache and membership authority

Prefer one outer tenancy boundary that rejects an unrelated open transaction before changing claims and records principal, connection identity and owned transaction identity. Same-principal nesting can reuse that verified boundary; reject other connections/principals or an invalidated/replaced transaction. Keep parameter-bound transaction-local settings. Compare this with save/restore of previous settings: what extra aborted-transaction, callback and cleanup states would restoration require, and is any actual caller in this foundation worth that complexity? Do not add cross-thread context propagation or a new pooling layer.

Prefer disabling SQL result caching for the protected block and clearing the relevant execution-context/pool cache on entry and exit, while restoring the caller's prior cache-enabled state. Explain how the implementation handles exception/rollback and nested paths without restoring stale authorized results. Merely adding the principal to a Ruby marker or clearing settings in SQL cannot fix a cache hit that never reaches PostgreSQL. Do not introduce a new tenant-aware cache.

Move application runtime membership evolution to the versioned application lane if that can be done with narrow, auditable administration. Determine which principal can grant/revoke which membership under PostgreSQL 17, including grants previously made by bootstrap's privileged actor. Bootstrap may establish login/ownership prerequisites and narrowly scoped migration authority; it must not silently reapply a versioned runtime grant. No blanket `CREATEROLE`, superuser, `BYPASSRLS` or privileged runtime inheritance. If the smallest safe fix requires refining B01-03 instead, state that conflict explicitly for Astra MAX rather than pretending the current implementation conforms.

Prefer an additive reversible migration compatible with an already-applied foundation. Editing the initial migration alone does not upgrade retained volumes. `up` and `down` must document exact membership/grantor effects and preserve application rows, Auth/Storage internals and credentials. Do not drop schemas or reset volumes. Any proposal to rewrite unapplied history requires coordinator evidence that it cannot strand an initialized database; do not assume this from the PR being a draft.

### R1-B: service credential isolation and crash-safe generation

Prefer explicit Compose environment mappings from the ignored operator credential file over generating many new persistent secret files. The file used for Compose interpolation must not automatically become every container's environment or mount. Supply a service-to-secret matrix covering database, Auth, PostgREST, Storage, API, worker, migration and bootstrap processes; retain only their actual needs. Configuration validation may become service-specific if one shared validator currently forces excess secrets. Do not expose signing/administrator credentials just to satisfy a generic validator.

For a complete valid existing file, return without rewriting. For any authorized creation/update path, write a restrictive-permission temporary file in the same directory, flush/close it and use a supported atomic replacement/install operation; preserve the original on failure and remove only this invocation's unfinished temporary file. Address simultaneous invocations explicitly using a small lock/exclusive-install mechanism if needed; no last-writer-wins secret rotation. Explain the Docker/Linux and Windows invocation boundary and realistic durability guarantees. Do not write secret contents or hashes of individual secrets to evidence.

Resolve R1-H1 from the supplied source before choosing a worker change. If needed, use the smallest probe that establishes the actual idle worker's liveness/hold, with bounded execution and deliberate failure on a stopped/stuck process. It must not claim full dependency readiness, run the API HTTP check against a non-HTTP worker, or create product jobs just for health evidence.

### R1-C: trustworthy, ownership-safe egress regression

Prefer a small fixture and script correction over new operational infrastructure. Assert each target is the expected running container and that its probe is executable; establish the relevant local-network success control before interpreting denial. Use time bounds and classify results explicitly. A failed executable lookup, Docker API error or missing container is a failed test setup, never a successful denial.

Propose an entirely local Docker topology in which an unrestricted equivalent control reaches the same external-route fixture that the confined runtime attempts. Demonstrate sensitivity by removing the confinement in a disposable negative control and observing the check fail. A private address on an unrelated bridge alone is insufficient. Inspect actual network attachments; avoid host networking, Docker socket mounts in runtime services or public endpoints.

Allocate unique invocation names/labels and retain actual returned resource IDs only after successful creation. Refuse ownership ambiguity and name collisions without touching the existing resource. On partial setup failure or interruption, clean only successfully created, label-verified fixture resources in dependency order. A trap must not infer ownership from a static name or delete persistent application volumes.

## Allowed implementation paths and coordination

The intended repair author may change only the necessary subset after acceptance:

- `apps/server/lib/elevateo/tenancy.rb`; `apps/server/lib/elevateo/config.rb` only for necessary service-specific validation; corresponding `apps/server/sig/**` declarations.
- One bounded additive file under `apps/server/db/migrate/` for R1-M1, and `ops/db/bootstrap.sql`. Existing foundation SQL may change only if the accepted migration strategy explicitly justifies it.
- `compose.yaml`, `ops/compose.secrets.yaml`, `ops/bin/generate-secrets.rb`, `ops/tests/egress-check.sh` and narrowly scoped regression files under `ops/tests/`.
- `apps/server/bin/worker`, one worker probe, or the existing `apps/server/Dockerfile` only if R1-H1 is confirmed and the accepted probe needs them; no new job processing.
- Focused tenancy/migration/config regression files and minimal runner under `apps/server/test/`; test-only environment fixtures with generated disposable values. Any new dependency, lockfile change or broader lifecycle wrapper change requires an explicit justified selection in synthesis.
- `docs/evidence/be-01-r1.md` for actual commands/results and safe evidence. Frozen prior consultation artifacts, `third_party/**`, frontend/native code, `contracts/v1/**` and unrelated backend paths are excluded.

The coordinator owns shared README/state/documentation, findings/issues, `code-reviews.md`, branch integration and final cleanup accounting. Supply exact required documentation updates before committing so the same-commit documentation rule is met. No concurrent Devin writer on these paths; keep its existing session suspended during repair. An allowed directory is not authorization for a general refactor.

## Docker regression acceptance — all not run

| ID | Required actual evidence |
| --- | --- |
| V01 | Reproduce each confirmed defect against exact base, then show its regression passing at the repair commit. Record failures caused by missing foundation tooling separately; a skipped reproduction is not a passing regression. |
| V02 | Restricted API connection: authorized shared/private reads succeed; absent/empty/malformed/foreign context denies or deliberately errors. Assert login/current role, flags, ownership and inability to assume privileged roles first. Privileged fixture setup is separate. Synthetic UUID fixtures do not prove real Auth integration. |
| V03 | Ambient outer transaction: wrapper rejects before authority changes and subsequent unwrapped query has none. Same-principal/same-connection nesting succeeds; conflicting principal, second connection and invalid/replaced transaction fail before yielding. Verify commit, exception and rollback cleanup. |
| V04 | Enable actual Rails query caching. Execute identical ActiveRecord SELECTs across A commit -> B, A -> unwrapped, exception/rollback -> B and same-principal nesting. Results must reflect current authority, with no cached A rows afterward. Confirm prior cache-enabled state and safe cache contents are restored; a raw-PG-only test is insufficient. |
| V05 | Real direct pool size one and a small concurrent pool: execute the accepted A/B isolation scenarios across reused connections; inspect settings and unwrapped reads after completion. Do not use an owner/BYPASSRLS connection to claim isolation. |
| V06 | Fresh and already-initialized disposable databases: migrate up/down/up; re-run bootstrap; verify expected membership and role flags at each stage, unchanged application rows and no access escalation. Inject a failing repair migration and verify transactional effects/version handling. Keep Auth/Storage internals untouched. |
| V07 | Resolve Compose privately, then inspect actual runtime container environment/mount key names without printing values. Forbidden privileged secrets and sibling passwords are absent from API/worker; their own least-privilege connections still work. Migration/bootstrap-only secrets are unavailable to runtime probes. No raw `docker compose config` with interpolated secrets enters logs. |
| V08 | Existing valid credential file: repeated generation preserves whole-file bytes and permissions. Inject failures before/during temporary write, before replacement, and at a supported replacement-failure boundary; original remains intact and reusable. First-creation failure leaves no partial final file. Concurrent attempts cannot produce mixed/rotated credentials. Evidence uses equality assertions, not secret values. |
| V09 | Egress test rejects missing/stopped target, missing probe, fixture creation failure and unexpected probe failure. Valid unrestricted control reaches the same local external-route fixture; confined targets cannot. Deliberately unconfined negative control causes the security check to fail. No Internet endpoint or actual provider is contacted. |
| V10 | Egress cleanup tests pre-existing name collisions, partial fixture creation and interruption. Pre-existing resources survive unchanged; only current invocation's verified container/network IDs are removed. Inspect mounts and retain database/Storage volumes. |
| V11 | If R1-H1 is confirmed: live idle held worker passes its own bounded liveness probe; stopped/unresponsive fixture fails. API probe behavior remains correct. Full unfinished readiness remains separately pending. If no defect, record source/runtime evidence instead of an unnecessary change. |
| V12 | Required Ruby lint, meaningful Steep/RBS checks, focused unit/integration regressions and configuration validation pass inside Docker at the final fix revision. Record exact commands, images/digests, exit codes and outputs with secrets redacted. No command or result is claimed available merely because this brief names it. |
| V13 | Remove task-owned disposable containers/images/build caches after each build/test cycle or failure; preserve credentials and persistent data. Record exact removed/retained resources, Docker usage and host free space; use supported compaction only when safe. Independent adversarial review covers every changed line in <=200-line assignments plus design tradeoffs, with deduplicated issues and defect density. |

The accepted synthesis must freeze the concrete container commands and harness topology before implementation dispatch. Use the pinned existing Ruby/Rails/PostgreSQL images and real database roles. No host application tests, fake RLS, broad persistent-volume deletion or manufactured green acceptance. A repaired security boundary does not make the whole BE-01 acceptance matrix pass.

## Independent opinion questions and release of the gate

Each opinion must respond section by section: (1) which findings are substantiated or need evidence; (2) the smallest repair and its failure cases for R1-A, R1-B and R1-C; (3) safe grant/migration upgrade and reversal; (4) an implementable egress fixture that catches the negative control; (5) acceptance gaps and a smaller alternative; (6) whether separate sequential repair commits/tasks are necessary. Explain disagreement and affected B01 decisions. Do not vote away required regressions to save time. Do not see other opinions before returning yours.

The coordinator will attach an immutable common packet with this brief, exact base source blobs, accepted B01 decisions, final finding evidence, standards and relevant pinned-library sources. Record input hashes, exact runtime identity, session ID, exit/result status and sanitized substantive output for all three models. Later evidence must be labeled as supplemental; do not rewrite original inputs or opinions. Actual Astra MAX then accepts/adapts/rejects each recommendation, retains dissent and freezes the final scope/commands. Until then the repair remains unaccepted.

Use one repair writer and checkpoint after at most 30 minutes of implementation; report progress and actual blockers rather than broadening the work. Two unsuccessful repair attempts or a migration/permission ambiguity return to the coordinator/design gate. The coordinator reports **$7.74 existing Devin credit remaining**; that is an observed account balance, not a per-task cap or an Astra budget. No purchases/top-ups. This preparation launches no Devin work. Any subsequent Devin continuation retains the authorized existing-credit boundary, two-minute coordinator monitoring and supported sleep action, with actual telemetry limitations disclosed.

Before closing findings, independently review the exact fixed commit and its evidence, synchronize shared documentation, and integrate the repair through the recorded PR dependency. Keep all unfinished BE-01 checks open. No live sending or production activation follows from repair acceptance.

## Primary mechanism evidence already verified

- [PostgreSQL 17 SET semantics](https://www.postgresql.org/docs/17/sql-set.html): transaction-local setting lifetime informs R1-T1.
- [Rails transaction semantics](https://api.rubyonrails.org/classes/ActiveRecord/Transactions/ClassMethods.html): nested `requires_new` uses savepoints on PostgreSQL.
- [Rails 8.1.4 query-cache source](https://raw.githubusercontent.com/rails/rails/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract/query_cache.rb): cache keys and invalidation paths inform R1-T3.
- [Rails 8.1.4 adapter source](https://raw.githubusercontent.com/rails/rails/v8.1.4/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb): raw-driver access does not itself clear SQL result caches.

These sources support the mechanism analysis; they are not runtime proof of the repair, grant-transfer design, filesystem durability or egress topology.
