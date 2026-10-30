# BE02 Auth sessions RLS compatibility decision

Status: **Astra MAX synthesis complete; bounded design ready for root's implementation decision.** Only the coordinator may open implementation dispatch `ctx_d9f45a4d471f`. This document neither opens that gate nor accepts implementation, tests, deployment, or live sending. The existing BE02 A–D decision remains in force except for its invalidated assumption that the pinned Auth sessions table could be read without an explicit RLS policy.

<!-- AIDEV-NOTE: Auth bootstrap compatibility only; root owns implementation and evidence gates. -->

## Provenance and consultation gate

Consultation task `task_c52cc4cbb85c`, dispatch `ctx_8d307b627ccb`; synthesis dated 2026-10-13 Australia/Sydney (2026-10-12 UTC). Actual synthesis runtime: `GPT-6-Astra max`, Codex terminal `term_af6be540-f302-4dca-ac51-b61b0647c365`, incarnation `c9f68bac-266e-47a0-a84c-9a1b074b8dc2`. Identity was inspected through live `orca terminal show --json`, separately from requested identity. Its evidence hash and runtime/request identifiers are in [metadata](../../.planning/consultations/results/be02-auth-rls/metadata.json).

Coordinator base: `d2de43b438ad9fb5f003d3e808a6181dbd827632`. Application base in sibling `Elevateo Mail - BE02 Codex`: `5785eba47f3709debb2815c8d86608f7e62d02f3`. Both had working-tree changes; the [frozen source manifest](../../.planning/consultations/results/be02-auth-rls/source-manifest.json) identifies actual supplied contents rather than treating HEAD as their identity. Common packet SHA-256: `0f05e36cd730420a9d93cc10be75f0bb407fa34041d960b6fda455e17f5b11b3`.

| Independent opinion | Observed canonical model | Fresh returned session | Outcome |
| --- | --- | --- | --- |
| [Fable 5](../../.planning/consultations/results/be02-auth-rls/fable-5.opinion.md) | `claude-fable-5` | `df91151b-af57-4ded-96f6-9cdce854725d` | Exit 0; success; non-error |
| [Opus 5.5](../../.planning/consultations/results/be02-auth-rls/opus-5-5.opinion.md) | `claude-opus-5-5` | `17c0cbde-a0af-4dba-951f-54e2ad188dfe` | Exit 0; success; non-error |
| [Fable 5.1](../../.planning/consultations/results/be02-auth-rls/fable-5-1.opinion.md) | `claude-fable-5-1` | `0bcd9f5d-2e1e-4356-a174-d329da92098a` | Exit 0; success; non-error |

Current help/version preflight identified installed Claude CLI `2.1.296`. Three fresh processes used exactly `--safe-mode --print --model <exact-model> --tools "" --no-session-persistence --output-format json`, with the existing authorized account, concurrency 3 and a 900-second process timeout. Each received the same actual governing documents, relevant numbered source, sanitized failure evidence, base/hashes and omissions, plus only its own focus. No opinion received another opinion. Returned `modelUsage` keys and `canonicalModel`, distinct sessions, substantive answers and exit statuses were verified. There was no fallback, authentication bypass, resume, or ultrareview. No monetary cap was supplied; the runner reported an aggregate USD 12.43845575, not an invoice attestation.

The ten required consultation documents were supplied in full. README/state current lines 1–36 were supplied; their duplicated historical remainder was disclosed as omitted. No credentials, real mail, env-bearing operational logs, live Auth catalog inventory, or running-image attestation was supplied. Obsidian was unavailable: the tradeoff scenarios below are analytical simulations, not an Obsidian connection or executable experiment.

The final source-freshness check found all supplied application files and governing decision/standards files unchanged. Three coordinator progress documents (`documentation.md`, `README.md`, `state.md`) changed during consultation. Their inspected supplied portions reconcile run 3's already-supplied RLS failure and independent frontend progress; they introduce no new Auth boundary or implementation approval. The frozen hashes remain intact in the manifest, with current hashes and the nonmaterial-change disposition in [artifact verification](../../.planning/consultations/results/be02-auth-rls/verification.json). Omitted historical README/state portions were not reconsulted. These status edits do not invalidate the bounded opinions; later material source or policy changes require root to reopen the relevant gate.

## Evidence and precise scope correction

The frozen runtime3 archive `f2677c5d4d0d753893043ca6cbbb3c7b921baa744ae1def52de3fe5180a4b6cc` has 74 passing privilege guards in sanitized `014-privilege-guards.log`, followed by the RLS rejection in sanitized `017-auth-grants.log`. Evidence is retained in the sibling application's `ops/local/be02-runtime-stage-f1fd9202222a4454843f5e657356c7aa/evidence/`. The fixture did not enable sessions RLS; those 74 guards therefore do not establish compatibility with the actual Auth setup.

The pinned Auth `v2.196.0` migration explicitly enables RLS on `auth.sessions`; this is expected vendor behavior. The consulted SQL rejects it at `ops/db/bootstrap-auth-grants.sql:18–20`. That rejection must be replaced with explicit policy validation and creation, not by changing the vendor flag. [Pinned Auth migration](https://github.com/supabase/auth/blob/v2.196.0/migrations/20240612123726_enable_rls_update_grants.up.sql).

The actual role is **`elevateo_session_owner`**. The dispatch's initial `elevateo_private_owner` wording was shorthand, corrected by the coordinator and source before consultation. The role is NOLOGIN, NOINHERIT, NOBYPASSRLS and non-superuser. Do not create an alias role. The running table owner, FORCE flag and full vendor policy inventory were not evidenced by the supplied failure log; capture and validate them during the real rerun rather than inventing their values.

Relevant source ordering is explicit:

- `helpers.sql:20–26`: invoker `auth_deadline(p_user,p_session)` selects only `id`, `user_id`, `created_at`, `not_after`, matching both bound UUIDs.
- `entry.sql:13–15`: `create_session` checks the Auth deadline before setting the private identity GUC.
- `helpers.sql:48–50`: `session_status` checks that deadline before `has_membership` establishes scoped identity; read/refresh facades use this path.
- `refresh.sql`: session checks precede identity use, and mutating paths re-evaluate with wall time after their final wait. Existing ordering and snapshot contracts remain authoritative.
- The BE02 migration creates the private SQL under `SET LOCAL ROLE elevateo_session_owner`; `grants.sql` exposes only the enumerated facade, not the Auth helper.

## Accepted policy and authority boundary

Create exactly this policy, only when absent and after the checks below:

```sql
CREATE POLICY elevateo_private_session_select
ON auth.sessions AS PERMISSIVE FOR SELECT
TO elevateo_session_owner
USING (true);
```

There is no WITH CHECK, ALL command, PUBLIC target or expression based on claims/GUCs. Policies do not grant table/column privileges. Keep only schema USAGE and column SELECT on `(id,user_id,created_at,not_after)` for the private owner; API and worker retain no direct Auth SELECT. A SELECT policy permits a visibility expression, while restrictive policies applicable to that read combine with permissive policies and can still deny it. [PostgreSQL 17 CREATE POLICY](https://www.postgresql.org/docs/17/sql-createpolicy.html).

This restores the already accepted four-column read scope for the non-login private function owner. It deliberately permits that role to read those columns across sessions. The authority boundary remains the exact private definer facade plus its ownership/ACL/role graph and the trusted Rails/Auth attestation, not a SQL caller's claimed identity. The helper still binds `id` **and** `user_id`; a missing or mismatched row produces no deadline.

A GUC identity predicate fails legitimate calls under the present ordering. Moving identity assignment earlier would change several reviewed functions and still would not make caller-set GUCs trustworthy. API SQL can forge generic claims and the custom GUC; it cannot gain table access or owner identity from doing so. An argument copied into a GUC is not a second independent attestation. Do not reorder helpers, introduce a session GUC, or expand parameter ACLs for this repair.

The policy uses the effective role during the definer call. Keep `auth_deadline` invoker-only and non-runtime-callable, retain schema-qualified table references, `search_path=pg_catalog`, scoped GUC restoration, and exact function EXECUTE allowlists. Do not create a broadly callable definer read helper. Definer privilege and safe namespace/EXECUTE handling are independent security obligations; this policy cannot compensate for a future overly broad facade. [PostgreSQL 17 function security](https://www.postgresql.org/docs/17/sql-createfunction.html).

## Smallest bootstrap implementation instructions

Retain this as the administrator-only, post-Auth-migrations phase before application traffic and migrations. Rails/migrator credentials must not receive Auth ownership or policy-DDL privileges. Keep `ON_ERROR_STOP`, a single outer transaction and explicit failure diagnostics.

1. Use a fresh administrator connection and explicitly READ COMMITTED transaction semantics before the first query. Verify both session and current identity are `supabase_admin`, the ordinary `auth.sessions` relation exists, and the private role has the accepted attributes. Set transaction-local `lock_timeout='5s'`, `statement_timeout='15s'` and a controlled catalog search path; do not persist timeout or role settings.
2. Acquire `LOCK TABLE auth.sessions IN ACCESS EXCLUSIVE MODE` in a separate statement before reading the detailed policy state or changing ACLs. Read the decisive catalog state in the following statement, after any wait. Validate the four required UUID/timestamptz columns under this lock. A vanished/wrong relation must fail, not be created by this phase.
3. Require `relrowsecurity IS NOT DISTINCT FROM true`. Disabled RLS is pinned-profile drift: fail; do not enable or disable it here. Capture table/schema ownership, RLS/FORCE flags and unrelated policies for preservation assertions. Verify the private owner neither owns the table nor inherits its owner's authority. Do not change the actual vendor owner or FORCE setting. Owner and bypass exemptions make this separate from merely observing an enabled RLS flag. [PostgreSQL RLS exemptions](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
4. Retain the existing bootstrap membership-graph contract. In this phase, fail on private-owner parent membership or API/worker membership/reachability to that role, including paths usable through SET ROLE; do not infer safety from NOINHERIT alone. Repeat effective checks in postconditions. Do not add runtime membership or mutate the role graph to make this pass.
5. Find the reserved name **on `auth.sessions`**. If present, require exactly `polcmd='r'`, `polpermissive=true`, `polroles=ARRAY[private_owner_oid]`, `pg_get_expr(polqual,polrelid)='true'`, and `polwithcheck IS NULL`. Use null-safe comparisons. An omitted USING expression is not the explicit expression contract. A same-name policy on another table cannot satisfy this check. A mismatched existing policy is a diagnostic failure: no DROP, ALTER, rename, or automatic repair.
6. Reject every other policy with `polcmd IN ('r','*')` that actually applies to the private owner, whether permissive or restrictive. Additional permissive policies signal unreviewed configuration even though `true` already admits every row; restrictive policies can silently remove required rows. Also reject an extra policy explicitly targeting the private role with another command, as mis-scoped application policy drift. Preserve other-role vendor policies and unrelated DML-only policies that do not explicitly target the private owner; do not reject or rewrite every vendor policy merely because it exists.
7. Use actual PostgreSQL policy role applicability, including PUBLIC. `MEMBER` alone is not the right predicate: PG 17.6 uses immediately available role privileges (`has_privs_of_role`), represented by `pg_has_role(...,'USAGE')`. Use CASE for PUBLIC's zero OID so PostgreSQL never tries to resolve role OID 0. These are separate from the stricter membership-graph drift checks in step 4. [PG 17.6 role matching](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/rewrite/rowsecurity.c), [role inquiry semantics](https://www.postgresql.org/docs/17/functions-info.html).

   ```sql
   -- Applicability fragment; p is a pg_policy row and private_owner_oid is validated.
   EXISTS (
     SELECT 1 FROM unnest(p.polroles) AS target(role_oid)
     WHERE CASE WHEN target.role_oid = 0 THEN true
       ELSE pg_catalog.pg_has_role(private_owner_oid, target.role_oid, 'USAGE') END
   )
   ```

8. Preserve the existing exhaustive Auth schema/table/column/sequence privilege drift checks. After all prechecks, create the one exact policy if absent and grant only the existing schema/column privileges. Verify the exact policy and allowed ACLs again before commit, together with owner/flags and role postconditions. Any failure rolls back all changes. Existing unexpected grants are errors, not permission to issue a blanket REVOKE.
9. On rerun, validate the existing policy in place and preserve its OID and unrelated catalog state. Do not count live Auth rows or compare superuser and owner result sets in production bootstrap. Such scans are unnecessary and empty-table equality would not prove that RLS works. Prove visibility using nonempty synthetic data in the disposable tests instead.

Keep the implementation cohesive; no persistent verification service or additional runtime helper is needed. Error messages should name the drift category/table/policy without emitting sessions, tokens or environment values. Retain and update AIDEV explanations at the new policy contract and race-sensitive lock ordering.

### Lock and race consequences

PG 17.6 policy create/alter/drop/rename operations take AccessExclusiveLock on the relation. Taking that same lock before inspection serializes concurrent bootstrap policy decisions without a weaker-lock upgrade or a second advisory-lock scheme. It also temporarily blocks Auth readers/writers: the short timeout makes contention a visible, rolled-back setup failure. [PG 17.6 policy implementation](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/commands/policy.c), [LOCK and snapshot ordering](https://www.postgresql.org/docs/17/sql-lock.html).

Run after Auth migrations have completed, during an administrator-exclusive setup window and before application consumers. Auth readiness does not prove that Auth holds no transactions. If the lock times out, root must arrange a quiet task-owned window and explicitly rerun; do not loop indefinitely or weaken the lock. A second bootstrap either waits and validates the first policy or fails cleanly on its bounded timeout. No lock is added to ordinary session operations.

This table lock does not establish a universal lock over role memberships, all schema ACLs, or competing superuser actions. Existing setup exclusivity is a prerequisite; postchecks are not continuous monitoring. Later privileged changes must go through reviewed administration and rerun validation. A later administrator can invalidate the configuration after commit; no guarantee against that actor is claimed.

### Bootstrap and migration lifecycle

The initial role/schema bootstrap must still work before Auth creates its tables. The second administrator phase installs this policy only after Auth migrations and before Rails creates the private facades. Rails down-migration removes application objects, not the separate administrator-managed Auth policy/grants; rerunning up must use the same validated prerequisites. A later complete role teardown must account for the policy's role dependency in its own reviewed administrator procedure. This repair does not authorize dropping vendor policies, transferring Auth ownership, or adding Auth DDL to application rollback. A pinned Auth upgrade requires renewed catalog validation and consultation if its assumptions change.

### Expiry and invalidation consequences

Keep `auth_deadline` and session-status behavior unchanged: deadline is the earlier of `created_at + 12 hours` and `not_after`; NULL `not_after` retains the 12-hour cap, positive infinity cannot extend it, and negative infinity is expired. Missing/mismatched Auth rows and invalid/future/non-finite creation timestamps fail closed. Auth shortening `not_after` remains visible according to the existing snapshot contract, and local absolute/idle expiry plus the post-wait clock checks continue to apply.

Do not add a time predicate to RLS. That would introduce another deadline evaluation point and could interfere with the already reviewed final-lock checks. A previously established REPEATABLE READ snapshot may still observe an older row/deadline for one in-flight operation; later READ COMMITTED statements see committed changes. This repair does not strengthen the accepted D05 snapshot guarantee or replace D03's trusted Auth `/user` validation. [PostgreSQL isolation semantics](https://www.postgresql.org/docs/17/transaction-iso.html).

The accepted Auth profile (12-hour timebox, 3600-second JWT lifetime, explicitly disabled independent inactivity/low-AAL/single-session restrictions) remains a separate configuration proof. RLS compatibility does not verify it. There are no provider credentials, signing-key requests, real account links or live sends in this decision.

## R1: make the owner-membership guard reject NULL

The coordinator included the existing [private-parameter review](review-be02-private-parameter.md) R1 in this repair. At `ops/tests/be02-guards/private-grants.sql:45–51`, the compound IF can evaluate to NULL and skip its exception. Today's helper returns EXISTS and is not evidenced to return NULL; this is a guard-evidence defect, not a demonstrated production authorization leak.

Materialize all three membership results so boolean short-circuiting cannot skip probes. Require the positive result `IS DISTINCT FROM TRUE` to fail, and each negative result `IS DISTINCT FROM FALSE` to fail. Keep the hostile identity sentinel/restoration checks, including detection of NULL settings; preserve normal expected true/false cases.

Add an intentional NULL-result regression that executes **the same assertion body used for the normal owner guard**. A minimal option is a test-local assertion routine, called normally and inside a controlled exception subtransaction with `has_membership` temporarily replaced by a NULL-returning stub. Catch only the expected assertion failure; unexpected success must fail the test. The caught subtransaction must restore the actual helper, and the test must check original definition/ACL/configuration plus a subsequent normal pass. No test stub or helper belongs in product SQL.

Do not substitute a separate `IF NULL IS DISTINCT FROM TRUE` demo or a copied assertion that can drift from the actual guard. Keep fixtures and any temporary routine confined to the disposable database and rollback scope. `run_case` must match the intended guard failure rather than counting a syntax error or unrelated failure as a pass.

## Recommendation disposition and dissent

| Recommendation | Source | Decision | Reason / conflict | Contract and required evidence |
| --- | --- | --- | --- | --- |
| One private-owner permissive SELECT policy with literal true | All three | Accept | Restores the accepted four-column scope under vendor RLS; no new identity mechanism | D03 boundary unchanged; exact tuple, ACL and actual-row checks |
| Per-user/session claims or GUC condition | All three comparison | Reject | Current ordering denies legitimate calls; reordering does not authenticate caller-set state | No helper/entry/refresh changes; hostile-GUC facade regressions |
| RLS enabled prerequisite; preserve vendor owner/FORCE | All three | Accept | Repair compatibility without changing vendor security flags | Capture real catalog; fixture FORCE variants; disabled-RLS failure |
| Exact in-place rerun; reject restrictive and additional effective read policies | All three | Accept | Avoid silently changing someone else's policy; detect availability/configuration drift | Catalog before/after, OID stability, malformed/extra-policy cases |
| Match inherited policies using MEMBER / unguarded PUBLIC OR | Fable 5, Opus; Fable 5.1 example | Adapt | Use USAGE for actual policy matching and CASE for OID 0; graph checks remain separate | PUBLIC and effective-inheritance cases with intended errors |
| Reject every other applicable policy, including unrelated DML | Fable 5.1; broad Fable 5 sample | Adapt | Restrict interference scan to SELECT/ALL; still reject explicit private-owner mis-scoped DML | Preserve unrelated vendor/DML policy tuples |
| AccessExclusiveLock before policy inspection | All three | Accept | Matches pinned PG DDL locking and serializes inspection/create | Concurrent bootstrap and held-lock timeout evidence |
| Extra advisory lock | Opus | Reject | Relation lock already serializes this operation; duplicate coordination adds failure paths | Single relation lock, clean rollback on timeout |
| 5-second lock timeout; 15- or 30-second statement timeout | All three | Adapt | Use 5/15 seconds, aligned with existing guard harness; bound setup interruption | Timeout category and restored state, no indefinite retry |
| Live administrator/owner row-count equivalence in bootstrap | Opus | Reject | Scans live rows and can pass vacuously on empty data | Nonempty synthetic exact-ID assertions under non-bypass role |
| NULL-safe checks; intentional NULL failure | All three, coordinator R1 | Accept/adapt | Run the real assertion, not only Fable 5's suggested assertion-shape demo | Normal pass, mutated failure, helper restoration |
| Keep product SQL ordering and public facade unchanged | All three | Accept | No demonstrated need to expand the accepted boundary | Existing facade/expiry/refresh tests on real pinned setup |
| Role and function-facade concentration risk | All three objections | Accept risk explicitly | Future owner reachability or broad definer bugs expose four-column metadata; GUC predicate does not repair that trust failure | Retain exact graph, function grants, runtime denial and scoped review |
| Broader in-app Claude adapter work | Fable 5 focus note | Defer | Belongs to AI-03 and has no bearing on this Auth bootstrap defect | Separate future consultation; no scope expansion |

Unresolved empirical questions are the running vendor owner/FORCE/policy catalog and actual compatibility after repair. The design resolves model disagreement through pinned PostgreSQL semantics, not a majority vote. No opinion proposed disabling RLS or giving the runtime private-owner reachability as an acceptable solution.

### Analytical tradeoff simulations (not executed)

| Scenario | Owner-only true with existing facade | GUC/identity policy alternative | Decision consequence |
| --- | --- | --- | --- |
| Fresh create call before GUC assignment | Bound Auth lookup can read its four columns | Empty/hostile GUC can hide the row and reject a valid session | Preserve current ordering and owner policy |
| API forges generic/private identity setting | No Auth table privilege or owner SET path; existing facade validates its bound inputs | A forgeable predicate supplies no independent authority | Test runtime denial; do not call either GUC an attestation |
| Additional PUBLIC restrictive SELECT false | Bootstrap refuses drift before consumers; an already active drift could deny sessions | Same restrictive AND denial applies | Fail with explicit policy diagnostic and preserve vendor state |
| Additional permissive read policy | Does not expand rows beyond true, but violates reviewed policy contract | May OR away the intended identity restriction | Fail configuration drift rather than silently accept either |
| Future definer accidentally exposes unbound reads | Could expose all four allowed columns | A predicate based on caller-controlled values is not a reliable remedy | Retain facade review as a mandatory independent boundary |
| Deleted Auth row / shortened deadline | Existing lookup/status rejects when visible to the current snapshot | Additional policy timing can duplicate or obscure expiry behavior | Keep expiry logic in its reviewed helper/status path |
| Two setup processes / held Auth read lock | One serializes; bounded timeout produces no partial policy/grant changes | Policy DDL requires comparable relation locking regardless of expression | Test serialization and rollback; no throughput claim |

No timings, attack success measurements or Obsidian results were produced by these scenarios. They compare consequences derived from source and PostgreSQL semantics.

## Exact proposed implementation scope

Root may authorize the following **existing** application paths in sibling `Elevateo Mail - BE02 Codex` for dispatch `ctx_d9f45a4d471f`:

| Path | Allowed purpose |
| --- | --- |
| `ops/db/bootstrap-auth-grants.sql` | Policy contract, bounded lock, drift/preservation checks; retain narrow grants |
| `ops/tests/be02-guards/fixture.sql` | RLS-enabled synthetic Auth setup and sufficient synthetic rows |
| `ops/tests/be02-guards/auth.sh` | Policy shape, RLS/ACL visibility, preservation, idempotency and concurrency regressions |
| `ops/tests/be02-guards/private-grants.sql` | NULL-safe R1 guard and actual-assertion mutation/restoration regression; facade denial checks |
| `ops/tests/be02-guards/run.sh` | Only necessary wiring/cleanup for the added guard and concurrent-connection cases |

No changes to application `helpers.sql`, `entry.sql`, `read.sql`, `refresh.sql`, `grants.sql`, Rails migrations, Auth image/version, compose, root bootstrap role graph, or runtime credentials are required by this design. No new package or external service is justified. If evidence shows those assumptions are wrong, stop that dependent change and ask root for a bounded scope/consultation revision. Do not silently widen the repair.

Root owns task/issue/PR linkage and the existing implementation branch; this worker opened none and changed no application file. Root must synchronize its task brief, README/state/relevant documentation and code-review record under its own ownership. This consultation worker owns only its results directory, this decision and ignored raw consultation evidence.

## Required acceptance evidence — all NOT RUN by this worker

| Check | Required observation |
| --- | --- |
| Real pinned clean setup | Disposable Docker with actual Supabase PG17.6 image and Auth v2.196.0 migrations; record image/source identities, ready ordering and actual owner/RLS/FORCE/policy catalog; auth-grants succeeds twice before Rails migrations |
| Actual visibility, not empty-query success | RLS-enabled fixture has multiple synthetic sessions/user combinations; private non-bypass, non-table-owner role reads the expected IDs/four columns; assert nonempty cardinality explicitly |
| Privilege boundary | Fifth column, table-wide SELECT privilege, writes, grant options, sequences, API/worker Auth SELECT and runtime SET/private helper EXECUTE remain denied; verify permitted facade counts |
| Idempotency/preservation | Existing policy OID unchanged on second run; table/schema owner, RLS/FORCE and unrelated vendor policies unchanged; only accepted column/schema grants differ on first run |
| Own-policy drift | Wrong command, wrong/multiple/PUBLIC target, restrictive instead of permissive, false/omitted/nonliteral identity expression, and inappropriate WITH CHECK fail before mutation; use a legally constructible ALL/UPDATE fixture for WITH CHECK, not invalid SELECT syntax |
| Other-policy drift | Extra effective SELECT/ALL permissive and restrictive policies, including PUBLIC, direct owner and inherited scope, fail with the intended reason; private-owner DML policy fails; unrelated other-role/vendor DML policies survive |
| Role and flag drift | Login/bypass/superuser/ownership/private parent/runtime reachability mutations fail; RLS-disabled fixture fails; both FORCE variants preserve input state and maintain the policy boundary |
| Transactional failure | Inject an error after attempted creation/grant and verify policy/ACL state returns to the pre-transaction snapshot; do not call a client disconnect alone proof of every postcondition |
| Runtime forgery and lifecycle | Real runtime session identities cannot read Auth or assume owner after forging generic/private GUCs; valid create/resolve/authorize/touch/refresh still work through unchanged facades |
| Deadline and policy expiry | Missing/foreign/deleted Auth row, forced `not_after` expiry, NULL/infinite bounds, future/non-finite creation, local idle/absolute expiry, and final-lock wait cases exercise existing denial contracts; run the current session database, expiry-race and refresh-publication suites |
| R1 evidence robustness | Normal positive/negative/null-input membership results pass; intentional NULL result fails the actual assertion; helper definition/ACL/config restored and normal assertion passes afterwards |
| Setup concurrency | Two fresh connections running the actual grants script yield one stable policy and either serialized success or a documented bounded timeout; held conflicting lock and policy-DDL contention roll back cleanly with no leaked test session |
| Completion discipline | Applicable lint/type/unit/integration checks run in Docker; scoped adversarial reviews follow the existing ≤200-line assignment rule and design review; retain sanitized outcomes and perform task-owned Docker cleanup |

Do not equate a new passing guard count with real Auth compatibility. Run the repaired script against the pinned Auth-created table, then the existing BE02 application suites. There is no UI change here and no visual/application-test claim in this decision. Native checks, broader completion and all live activation gates remain separate.

## Handoff and retained artifacts

The three opinion and Astra identity gates are satisfied for this frozen bounded design. Implementation readiness is conditional on root opening `ctx_d9f45a4d471f`; implementation acceptance remains pending every applicable regression above. A material change to the role, facade or Auth version requires fresh bounded consultation, not reuse of this decision as blanket approval.

Sanitized opinions, machine-readable identity/status metadata and source manifest are under `.planning/consultations/results/be02-auth-rls/`. Raw prompts/results/stderr, preflight and runtime identity evidence, manifests and preparation/export helpers remain ignored under `ops/local/be02-auth-rls-ctx_8d307b627ccb/` as `*.log`. They contain the exact supplied source and returned process evidence, not captured credentials or raw environment logs. They were retained for audit; no Docker resources were created, run or deleted by this worker.
