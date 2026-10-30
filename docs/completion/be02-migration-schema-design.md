# BE02-MIGRATION-SCHEMA-R1: bootstrap schema prerequisite

Status: design and three independent consultations complete; implementation and runtime verification pending. Date: 2026-10-14 Australia/Sydney. This is the bounded repair brief for the coordinator's Astra LOW writer, not evidence that migrations pass.

Create `app_drafts_private` only in the privileged bootstrap, owned exactly by `elevateo_owner`. Rails migration `20261013000004` must assert the prerequisite before either direction, create/drop only its own objects, and retain the namespace on rollback. Do not grant database CREATE, repair unexpected ownership or ACLs, or enable live transport.

## Evidence and authority

The coordinator reported R3 failing at the real `db:migrate` step with `PG::InsufficientPrivilege: permission denied for database postgres`, after the private-session, thread and protected-write migrations. The inspected drafts SQL attempts database-level schema creation; bootstrap currently creates `app`, `app_meta` and `app_auth`, but not `app_drafts_private`. PostgreSQL requires database CREATE for schema creation; adding `IF NOT EXISTS` alone cannot establish an existing schema's owner. [PostgreSQL 17 CREATE SCHEMA](https://www.postgresql.org/docs/17/sql-createschema.html)

- R3 archive SHA256: `0b912b001fcd7f0392b20434a57e47dfc90fd40a75788491f5922b57d910e07c`; runtime project: `be02-95e5142d918d4a0ca3dae89acfd81d7e`.
- Source HEAD at packet freeze: `5785eba47f3709debb2815c8d86608f7e62d02f3`. The pre-existing working tree was dirty; per-file hashes identify reviewed content. The runtime archive and working tree are separate identities.
- Requested synthesis identity: `gpt-6-astra`, effort `max`. Coordinator message `msg_2919e1bcf4cc` confirmed both requested/effective launch metadata; the worker independently observed terminal display `GPT-6-Astra max`. These are launch/display observations, not a self-reported model identity.
- Root reported independently verified R3 cleanup, 16/16. Later message `msg_9d6266c1323c` reported Auth/RLS concurrency passing all three schedules in 7.48 seconds, exact catalog restoration and no owned sessions. That message arrived after packet freeze and is separate evidence; it does not establish a successful application migration.
- The worker performed documentation/source inspection and authorized Claude CLI consultations only. No Docker, SSH, application tests, installs, deployment, commits, application source edits or production operations occurred.

The accepted backend workflow and current task permit this bounded design without reopening general standards approval. Production provisioning and activation remain separate. Obsidian was unavailable: the schedules below are analytical predictions, not executed simulations or an Obsidian-connected exercise.

## Consultation verification

The native Claude CLI reported `2.1.296 (Claude Code)`; current help was checked before launch. Three fresh subprocesses received the identical frozen common packet, followed only by their separately documented focus prompt. Each used `--safe-mode --print --model <exact identity> --tools "" --no-session-persistence --output-format json`, a 900-second bound, argument arrays and stdin packet bytes. No shell-interpolated prompt, fallback model, tools, ultrareview or shared opinion was used. Existing native authentication was reused without exposing credentials.

| Requested and returned identity | Distinct returned session | Verified result |
| --- | --- | --- |
| `claude-fable-5` | `a3f133dc-dd1c-44e2-887c-857faeb447bd` | Exit 0, success, non-error, substantive 12,773-character answer |
| `claude-opus-5-5` | `16786f05-eefc-47eb-bcd6-6af647c55418` | Exit 0, success, non-error, substantive 12,411-character answer |
| `claude-fable-5-1` | `b67105a8-1dea-4825-86fa-566699c2500d` | Exit 0, success, non-error, substantive 11,923-character answer |

Each result's sole `modelUsage` key matched its requested identity, with positive output tokens, no permission denials, no timeout and empty stderr. All three substantive opinions were read before synthesis. [Verified results and provenance](../../.planning/consultations/results/be02-migration-schema-r1/README.md) include verbatim advice, individual recommendation dispositions, source hashes and execution metadata. Common packet SHA256: `429728aa2478ff3d85581dfba7523bd83283c5c32ceb5f5798b1e211007ad910` (291,910 bytes).

The common packet supplied actual governing-document content and the user's complete adversarial rubric. It explicitly bounded large historical documents: README lines 1-40, state lines 1-45 and documentation lines 1-115; their remaining portions were omitted equally for every opinion. `LOCAL_BUILD_PROMPT.md` was capped at line 68, but its actual 66 lines were all included. AGENTS, STANDARDS, orchestration, consultation instructions, architecture/client/activation plans and the other documents listed in the manifest were supplied in full. Model-specific focus prompts were hashed separately. No previous opinion was supplied.

## Accepted behavior and exact guard contract

### Bootstrap

Inside the existing administrative bootstrap transaction, after existing role/ownership prerequisites and before COMMIT, explicitly branch on namespace absence. Create the missing namespace with `AUTHORIZATION elevateo_owner`; whether it was just created or already exists, assert the contract below. Do not add it to an unconditional PUBLIC revoke, alter its owner, normalize its ACL, or drop/recreate it. A valid nonempty namespace is an accepted prerequisite and remains unchanged.

The existence branch makes the creation responsibility explicit; a following assertion is mandatory. Concurrent administrative bootstrap/migration/drift probes are serialized by the root harness. A concurrent unexpected CREATE may fail and roll back; no new locking/retry framework is needed for this repair.

### Shared semantic predicate

The bootstrap and migration must enforce the same namespace state. The bootstrap runs as the existing trusted administrator; the migration additionally requires `current_user = elevateo_owner`. Assert conditions in this order, with clear errors identifying missing prerequisite, wrong owner, owner privilege loss, or foreign ACL:

1. The namespace exists and its owner OID equals the resolved `elevateo_owner` OID. Check this independently of ACL expansion; an empty ACL must not suppress the ownership check.
2. Expand `COALESCE(nspacl, acldefault('n', nspowner))` with `aclexplode`. Every effective ACL entry has owner as both grantee and grantor. Reject PUBLIC, known runtime roles, unknown roles and foreign grantors; reject rather than revoke them.
3. Owner has **both** schema CREATE and schema USAGE, using two separate privilege checks joined with AND. Empty ACLs and either individually revoked owner privilege fail. Accept NULL/default and semantically equivalent explicit owner-only ACLs without changing their representation. Do not reject an owner entry solely for `is_grantable`: owner grant options are implicit. [PostgreSQL privilege rules](https://www.postgresql.org/docs/17/ddl-priv.html)
4. Independently require no effective schema CREATE or USAGE for `elevateo_api`, `elevateo_worker` and `elevateo_app_read`. Keep existing bootstrap role-membership/reachability guards intact; do not replace them with direct-ACL checks. Migrator's existing ability to SET ROLE to owner is intentional and is not a runtime-role denial target.

PostgreSQL interprets a comma-separated privilege list as **any**, so `has_schema_privilege(..., 'CREATE, USAGE')` cannot prove both owner permissions. `acldefault` and `aclexplode` support semantic checks rather than textual ACL ordering comparisons. [PostgreSQL information functions](https://www.postgresql.org/docs/17/functions-info.html)

Do not blanket-ban all `pg_default_acl` rows or alter default privileges. Existing harmless hardening can have rows. Check the actual newly created namespace's ACL so any creation-time grant leakage fails within bootstrap's transaction. Future table/function default-privilege behavior remains an explicitly uninspected dependency; existing object grant/revoke code is unchanged and its real permission tests must run. Default privileges affect future objects and are role/object-type specific. [PostgreSQL default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)

### Migration and rollback

Add one small `be02_drafts/prerequisite.sql` read-only assertion block, using the existing migration SQL-part loader. Run it first in both `up` and `down`; it creates no persistent helper function. Bootstrap duplicates the namespace predicate because it is a separate administrative entry point. This bounded duplication is deliberate; SQL preflight is reused between migration directions. No generic schema registry or new dependency is needed.

Remove CREATE SCHEMA and the schema REVOKE from `tables.sql`; retain all table definitions, constraints, RLS and object permissions. Remove DROP SCHEMA from `down.sql`; retain explicit function/table/policy drops in their existing dependency order. Update the migration and SQL AIDEV comments to explain bootstrap ownership and destructive object rollback. The migration guard must reject a direct admin-current-user run before creating superuser-owned tables.

Both directions must remain within Rails' PostgreSQL DDL transaction. Verify that the actual runner/configuration provides it; source inspection alone does not prove error atomicity. Do not add transaction suppression or catch-and-continue. A failed prerequisite leaves task objects and migration bookkeeping unchanged. Successful down removes the migration's objects and version record; successful up recreates them and records the version. Ledger rows deleted by down are not recovered by up; exercise this only on explicitly disposable fixtures.

The retained bootstrap namespace may contain an unrelated sentinel object, which both bootstrap rerun and migration down preserve. Do **not** enforce namespace emptiness: the migration owns its listed objects, not the entire bootstrap namespace. Existing non-CASCADE drops must still fail atomically on unexpected dependencies of those objects. PostgreSQL's schema RESTRICT drop used to reject any residual object; its removal intentionally changes that namespace-wide condition. [PostgreSQL DROP SCHEMA](https://www.postgresql.org/docs/17/sql-dropschema.html)

This last choice differs from Opus and Fable 5.1's proposed empty-namespace rollback assertion. Preserving unrelated objects and avoiding a partial catalog enumeration is the smaller ownership-consistent rule. Checking the same owner/ACL contract before down deliberately favors fail-closed data handling over rolling back through privilege drift. Recovery from drift is an administrator's separately reviewed action, not an automatic migration repair.

## Analytical tradeoff schedules

These are proposed state transitions and tests, not measured execution.

| Initial state / event | Accepted behavior | Tradeoff or rejected alternative |
| --- | --- | --- |
| Namespace absent; bootstrap then migration | Admin creates exact owner-only namespace; owner migration preflight passes and creates task objects | Database CREATE remains unavailable to owner/migrator/runtime roles |
| Namespace absent; migration first | Named prerequisite failure before object DDL | More actionable failure than a generic database permission error; requires documented bootstrap ordering |
| Correct owner, NULL or explicit owner-only ACL; existing rows | Bootstrap rerun preserves namespace OID, ACL representation and rows | No unconditional revoke that materializes/normalizes ACLs |
| Wrong owner, including empty ACL | Independent owner check fails; transaction leaves state unchanged | No ownership transfer, implicit adoption or ACL-expansion row-loss bypass |
| PUBLIC/unknown/runtime grant or owner privilege loss | Bootstrap/up/down reject without repairing drift | A pre-guard revoke would hide the condition; an OR privilege check would accept partial owner rights |
| Valid target at version 00004; down then up | Down retains namespace, deletes only task objects; up uses same prerequisite | Namespace ownership remains with bootstrap; data rollback is destructive and explicit |
| Namespace includes unrelated sentinel | Rerun and down preserve it | Reject blanket emptiness checks that unnecessarily couple rollback to unrelated objects |
| A foreign object depends on a task object | Non-CASCADE drop fails and the migration transaction restores earlier drops | No dependency destruction to force rollback success |
| Admin changes ACL between bootstrap and migration | Migration preflight detects drift | Guard at bootstrap alone is insufficient |

| Small alternative | Disposition and reason |
| --- | --- |
| Grant database CREATE to owner/migrator, temporarily or permanently | Reject: expands authority beyond the private schema and violates the task |
| Run all migrations as bootstrap administrator | Reject: broadens authority and can create objects under the wrong owner |
| Only replace CREATE with IF NOT EXISTS | Reject: does not supply the missing prerequisite and silently accepts pre-existing wrong ownership |
| Bootstrap creation plus no migration guard | Reject: misses wrong ordering and drift after bootstrap |
| Put identical preflight blocks in both tables.sql and down.sql | Viable but not selected: existing SQL-part loader permits one small migration-local assertion file, reducing duplicate security logic |
| Move ledger into app/app_meta | Reject: changes privacy boundary and uninspected qualified references, grants and functions |
| Move all draft objects into bootstrap or install a privileged creator function | Reject: expands the administrative boundary and duplicates Rails object lifecycle |
| Broaden this patch to app/app_meta ownership guards or later migrations | Defer to separate bounded inspection; no demonstrated current failure or reviewed dependent source here |

## Bounded source-only repair assignment

The Astra LOW writer must verify hashes before starting, inspect AIDEV anchors, preserve existing unrelated work, and implement only the following production changes. Target roughly 100 or fewer added production lines; exceed only for a concrete correctness requirement reported to root. No dependency, framework, role graph or table-contract redesign is authorized by this brief.

| Allowed production file | Exact responsibility |
| --- | --- |
| `ops/db/bootstrap.sql` | Explicit create-if-absent branch and strict namespace assertions inside the existing transaction; no normalization or broader grants |
| `apps/server/db/migrate/20261013000004_create_app_drafts_operations.rb` | Invoke prerequisite SQL first for both directions through existing loader; update coupled comments |
| NEW `apps/server/db/be02_drafts/prerequisite.sql` | Read-only namespace/acting-role assertions defined above; no persistent helper, DDL or repair |
| `apps/server/db/be02_drafts/tables.sql` | Remove schema creation/revoke only; update ownership comment; retain domain DDL |
| `apps/server/db/be02_drafts/down.sql` | Remove namespace drop only; update lifecycle comment; retain explicit object rollback |

Allowed regression additions: NEW `ops/tests/be02-guards/schema-prerequisites.sh` and NEW `ops/tests/be02-guards/schema-prerequisites.sql`, with a narrow wiring change in `ops/tests/be02-guards/run.sh` if that harness is suitable after inspection. They must exercise real production bootstrap and real Rails migration entry points, not reimplement their predicates in test code. Root owns launching their Docker environment. If the existing harness cannot invoke Rails or isolate destructive states, report that dependency and obtain a bounded root dispatch adjustment; do not silently build another runtime harness or run tests on the host.

The writer must first read the existing harness/run entry, database connection setup and write-boundary helper chain in new review slices of at most 200 LOC. Those are outside this consultation's inspected scope. Root should also perform a bounded inventory of other CREATE SCHEMA statements to detect later blockers; any additional repair needs its own scoped source evidence, not an automatic expansion of this change.

The inspected `ops/tests/be02-guards/fixture.sql` does not create the private schema and should remain downstream of production bootstrap. It provides reduced Auth fixture objects; it is not proof of actual Supabase Auth integration. The draft helper inserts mailbox/membership fixtures and deletes ledger rows as administrator during teardown; schema lifecycle tests therefore require an isolated disposable database and must finish/restabilize before those ordinary fixtures run. Do not mutate schema/roles while existing draft tests or concurrency schedules are active. Do not insert duplicate CREATE SCHEMA into fixture SQL to mask ordering mistakes.

Root must keep README Current state, state/documentation and code-reviews.md synchronized in any implementation commit. This design worker's write allowance excludes those existing files, so this report supplies the review accounting for root to append. No implementation commit or permission expansion is implied by publication of this brief.

## Required real PostgreSQL regressions

Use the pinned PostgreSQL runtime in root-owned Docker, actual roles, production bootstrap and Rails migration commands. Use exact source/archive identities in results. Catalog assertions must inspect owner, ACL, namespace OID, object existence, role graph, database privileges and Rails version bookkeeping, not merely command exit codes. Give every negative case a deliberate expected error and ensure it cannot pass because setup itself failed.

| Case | Required assertion |
| --- | --- |
| Fresh positive | Bootstrap, actual required Auth dependencies, prior migrations and 00004 succeed in order; complete migration chain is then attempted; runtime role privileges remain unchanged |
| Valid reruns | Bootstrap twice before migration and again with seeded draft/ledger data; namespace OID, owner, ACL representation, rows and role memberships are unchanged |
| ACL equivalence | NULL/default ACL and explicit owner-only ACL both pass; preserve each actual representation |
| Owner privilege negatives | Separately revoke owner CREATE, owner USAGE, then both; each fails. Include empty ACL to expose vacuous ACL checks |
| Wrong owner | Admin-owned and another-role-owned namespace fail before task DDL; include wrong owner plus empty ACL; test bootstrap and migration entry |
| Foreign ACL negatives | PUBLIC USAGE and CREATE, known runtime grants, app_read inherited access, an unknown NOLOGIN grantee and a foreign grant option each fail without grant removal |
| Boundary timing | Apply valid bootstrap then ACL/owner drift before up; apply drift before down on a migrated fixture; preflight fails and task objects/bookkeeping remain unchanged |
| Missing prerequisite / wrong actor | Missing namespace on up produces named prerequisite error; admin as current_user is rejected; actual migrator login with current_user owner is accepted |
| Creation defaults | In an isolated fixture, configure a schema-creation default that produces a foreign ACL; verify actual resulting catalog behavior and bootstrap's transaction rejection. Do not assume which role's defaults apply without observing it |
| Role/authority regression | Actual API/worker logins cannot use/create in private schema, read operations or SET ROLE to owner/migrator; app_read has no schema rights. Database CREATE remains false for owner, migrator, API and worker |
| Membership drift | Synthetic unwanted inherited/SET reachability is rejected by existing bootstrap graph guards; snapshot graph before and after. Do not count a direct-ACL-only check as coverage |
| Up/down/up | With later dependent migrations first rolled back in their actual dependency order, isolate target 00004: down removes its objects/version, retains namespace OID/owner/ACL; up succeeds using the same namespace and restores the version |
| Retained sentinel | Unrelated owner-owned sentinel survives bootstrap rerun, target down and subsequent up; no CASCADE is introduced |
| Dependent-object failure | Inject an external dependency on a target object: down fails atomically, retaining prior objects, rows and version; remove only fixture dependency before retry |
| Failure atomicity | Snapshot before failing bootstrap/up/down and compare afterward; no committed partial role grants, table drops, schema creates or bookkeeping writes. Bootstrap already owns BEGIN/COMMIT, so do not rely on an outer rollback to contain it |
| Existing behavior | Run draft integration/replay/pagination/retention/access tests and the existing guard/Auth/RLS suites, plus required lint/type/unit/integration checks; preserve grants and all non-schema domain behavior |

Use a separate disposable database/runtime or explicitly restored fixture states for destructive/drift cases. Preserve evidence until assertions finish; a teardown that erases the fault before checking state is not a valid negative test. Rerun clean bootstrap and confirm restored catalog before normal suites. Tests must assert the privilege denials on actual login connections, not only an administrator connection using SET ROLE.

## Acceptance, review and cleanup

- Source diff contains only the bounded repair/tests and corresponding root-owned documentation updates; no database CREATE grants, role membership expansion, silent ACL repair, schema ownership transfers or schema CASCADE.
- Fresh regression logs demonstrate each state above, correct migration transaction/version behavior, and unchanged protected-write/session permissions. The complete application migration command must actually pass before the original runtime blocker is marked fixed.
- Root pins the repaired source, performs fresh Docker validation and records exact commands/exits/results. This worker supplies no runtime pass. UI/client/native checks remain separate existing project requirements.
- Root assigns adversarial implementation reviews in at most 200-LOC slices and a dedicated design reviewer, applying STANDARDS and the supplied full rubric; linters own formatting. Resolve findings with regression evidence, then update defect counts/density against actual new reviewed LOC.
- Root cleans only task-owned disposable containers/images/build cache after its tests, verifies mounts and exact volume ownership before removal, preserves persistent data and reports reclaimed host/Docker space. Follow Windows compaction constraints if applicable. This worker created no Docker resources and makes no new cleanup claim.

## Bounded review accounting and limitations

| Slice | Exact inspected source ranges | Unique LOC | Checklist coverage |
| --- | --- | ---: | --- |
| S1 | `ops/db/bootstrap.sql:1-148` | 148 | Bootstrap transaction/role authority, schema creation, role reachability and rerun behavior |
| S2 | Migration wrapper `1-18`; drafts tables `1-45`; down `1-11`; grants `1-10` | 84 | Failing CREATE boundary, rollback coupling, table contracts, RLS and unchanged object permission intent |
| S3 | Draft database helper `1-76`; guard fixture `1-45`; draft database test `1-47` | 168 | Fixture lifecycle, real guarded API calls, ledger teardown and observed regression coverage |
| Total | Exact files, full hashes and slice hashes in manifest | **400** | No other implementation/test source reviewed for this assignment |

Confirmed source defects: **1**, the bootstrap/migration authority mismatch. Defect density: **2.5 defects/KLOC** (1 / 400 inspected LOC). The necessary rollback change follows the new bootstrap ownership boundary and is not double-counted as a separate pre-existing defect. Errors in proposed opinion predicates are advice findings, not additional source defects. The unguarded app/app_meta owner pattern is an untriaged follow-up outside this repair, not a claimed runtime failure.

The review considered correctness, deliberate errors, null/empty ACL behavior, permission boundaries, maintainability, duplication, fixture/data coupling and test/documentation obligations. No request-path loop or new dependency is proposed; catalog checks run at bootstrap/migration entry. Existing draft field limits were visible but not revalidated. Formatting is delegated to tooling. Evidence does not establish complete application, security or test coverage.

Uninspected dependencies include the write-boundary helper chain, draft test lines 48-133, policies/scope/save/operations SQL, migrations before/after 00004, database configuration, other fixtures, test runners including `ops/tests/be02-guards/run.sh`, `ops/tests/be02/test-suites.sh` and `ops/tests/be02/acceptance_runtime.py`, and role/auth guard code beyond bootstrap. These require separately bounded review before edits or broader claims. All frozen implementation source hashes and supplied document hashes still matched when consultation artifacts were exported.

Next owner: root dispatches Astra LOW for the bounded implementation and new dependency inspection, then root performs Docker verification and the required adversarial reviews. There is no outstanding exact-model consultation gap.
