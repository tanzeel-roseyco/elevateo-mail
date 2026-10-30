# BE02 bounded grants repair

Implementation handoff for D1, D2 and D4 in `be02-review-db-entry-grants.md`.
Task `task_96d263fb6675`, dispatch `ctx_2415d39a0970`; execution and final acceptance belong to root.

<!-- AIDEV-NOTE: Repair source only; root must attach Docker evidence and independent review before closing defects. -->

## Changes

- D1: bootstrap now permits only the five measured membership edges, with exact member, role, grantor and ADMIN/INHERIT/SET options. Every edge touching an application role, including its use as grantor, is checked before role mutation. Unknown direct, intermediate and outward paths fail transactionally. Effective SET, inherited and administrative reachability is checked after the legacy transition; the migrator-to-owner-to-private-owner path remains available.
- D2: private grants revoke existing function permissions from PUBLIC and all five named application principals before applying one entrypoint allowlist. Effective function permissions and grant options must exactly match that allowlist. Schema creation/delegation, table/column access and sequence access also fail the boundary assertion. Existing default ACLs are not silently rewritten; each future BE02 function batch must finish with this grants phase.
- D4: Auth bootstrap checks effective privileges for all six application roles before granting anything. The private owner may read only `id`, `user_id`, `created_at` and `not_after` on `auth.sessions`; table permissions, column writes/delegation, extra-column/other-table reads, Auth sequence permissions and schema creation/delegation are rejected. Runtime roles cannot hold Auth table/column permissions. Existing schema/type/RLS prerequisites remain in force.

`apps/server/db/be02/tables.sql` already revokes PUBLIC table and sequence access. This repair makes no claim that a PUBLIC table ACL hole existed.

The membership decision follows PostgreSQL's distinction between inherited privileges and SET reachability; the assertions use effective privilege inquiry functions. See [PostgreSQL 17 role membership](https://www.postgresql.org/docs/17/role-membership.html), [privilege inquiry functions](https://www.postgresql.org/docs/17/functions-info.html), and [default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

## Regression handoff

Root integrated the `guards` service and invocation into the existing isolated harness. The container entrypoint is:

```sh
bash /workspace/ops/tests/be02-guards/run.sh
```

Use the already pinned PostgreSQL 17 image. Required environment: `PGHOST=db`, `PGUSER=supabase_admin`, `PGDATABASE=postgres`, `PGPASSWORD`, `MIGRATOR_DB_PASSWORD`, `API_DB_PASSWORD`, `WORKER_DB_PASSWORD`, and `BE02_GUARDS_DISPOSABLE=1`. Mount `ops/db`, `ops/tests/be02-guards` and `apps/server` read-only at their `/workspace` paths; `/tmp` must be writable. Root runs the service before initial bootstrap and before Auth/API/worker consumers start.

The runner creates one unique `be02_guards_*` database from `template0` and drops that exact database on exit. Baseline application roles are cluster scoped and intentionally remain for the subsequent root bootstrap; therefore this suite requires root's disposable task cluster, never a shared cluster. Injected extra roles, memberships, Auth ACLs, default ACLs and private objects are rolled back. No role deletion, volume cleanup or global pruning occurs in the suite.

The unmodified bootstrap and Auth scripts run twice for fresh/idempotent cases. For injected failures, the runner removes exactly the outer `BEGIN;`/`COMMIT;` pair from temporary copies and wraps the same body in its own transaction, retaining `ON_ERROR_STOP`. This prevents a missing guard from committing an injected cluster membership; an unexpected accepted fixture still rolls back and fails the case.

Coverage provided for root execution:

- API/worker direct and intermediate owner paths, inherited owner access, changed membership options, outward membership and private-owner parent drift.
- Preservation of the measured legacy/current transition and unrelated membership, real runtime SET denial, and the approved migrator path.
- Auth table DML/read grants, column DML, extra reads, grant options, runtime grants, PUBLIC grants, sequences, schema privileges, RLS and type drift; permitted four-column read plus denied private-token read/write.
- Actual BE02 SQL loaded under both global and schema-specific named-role function defaults, including grant options; exact facade sizes, API/worker happy paths, null rejection, helper and cross-facade denial.

The Auth/app fixture is deliberately minimal. Real pinned Auth migrations, full Rails foundation/RLS, migration down/up and end-to-end acceptance remain root integration evidence.

## Verification and defect accounting

Docker guard execution: **NOT RUN**. SQL/migration tests: **NOT RUN**. Unit/integration tests: **NOT RUN**. Lint/typechecks: **NOT RUN**. Independent adversarial/design review: **NOT RUN**. No host application tests, Docker/SSH operations, commits, frontend edits or contract edits were performed by this worker.

The frozen source review reported **5 defects / 347 physical LOC = 14.41 defects/KLOC**. This repair addresses the **3 assigned defects** in source; **0 are claimed runtime-verified closed**, and post-repair defect density is **not measured**. This is implementation evidence, not a replacement independent review. D3 and D5 remain root-owned; their source was not changed here.

Root owns `code-reviews.md`, shared state/README updates, bounded independent reviews and execution evidence. Each changed source file below is under 200 physical lines, allowing one file per bounded review assignment.

## Source manifest

SHA-256 values describe the exact worker handoff bytes, excluding this report's self-referential hash (sent with completion).

| Changed path | Physical lines | SHA-256 |
| --- | ---: | --- |
| `ops/db/bootstrap.sql` | 127 | `8037683b9c86175a4c2810ccac4e653ab546d2ac0d3237008d119f455965b5d1` |
| `ops/db/bootstrap-auth-grants.sql` | 60 | `aa61c9348e58a436afe54baa2b1e4368a1c0e2f70dd9505a6be56964192da0ab` |
| `apps/server/db/be02/grants.sql` | 59 | `11cde598e34c53454ff653f5814ddfa2e00931f99b39f49dee3f449214504b85` |
| `ops/tests/be02-guards/run.sh` | 94 | `688baa0a42271a0d8766ff06767257eeed6e9fb65f268c4b596db02b2692e1cb` |
| `ops/tests/be02-guards/membership.sh` | 88 | `27a1cf2c0dc4656df3e2307ea3b71ca8796f7e8a9535a50a87db118375ca66f1` |
| `ops/tests/be02-guards/fixture.sql` | 21 | `687fcc2aa6c3ee27a76c42edf33cd82e33367edfe474a1de81a95b33aad491de` |
| `ops/tests/be02-guards/auth.sh` | 55 | `b2d9375c09b1e474eacfd0fff40ea886bd04d91eee20abcbe5788b146d27affd` |
| `ops/tests/be02-guards/private-grants.sql` | 87 | `f2a03c7d4ec9035b4a606eac0ddb34da41278e5b7a0022785e2c3d11799a3204` |
