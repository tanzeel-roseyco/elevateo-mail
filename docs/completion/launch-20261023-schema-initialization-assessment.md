# Production schema initialization assessment

Scope: read-only source assessment requested by the coordinator during the Google SSO dispatch. No database, Auth, role, credential, container or infrastructure mutation was performed for this assessment. The coordinator reports that `elevateo-mail-live-db-1` contains only the `postgres` non-template database, existing Supabase schemas, and no Elevateo roles, application tables or migration ledger; this worker has not independently queried that database.

## Required operator-reviewed path

The production manifest deliberately does not initialize or migrate data (`ops/production/README.md`). The available executable orchestration is `ops/ops820/source-runner.sh`, which explicitly accepts disposable `ops820-source-*` projects only. **Do not run it against production:** it invokes the pre-attachment full test runner and staged rollback verification.

Its source establishes these dependencies for a separately approved, forward-only initialization procedure:

1. Obtain a consistent backup/snapshot covering the existing database, global roles and persistent storage, with a verified restoration procedure. Inventory existing Auth/session/storage data and privileges first. Keep API, worker and attachment gateway stopped and outbound held during initialization.
2. Run `ops/db/bootstrap.sql` using the existing privileged `supabase_admin` connection to `postgres`, with the approved migrator/API/worker passwords. The script requires the expected privileged administrator identity and PostgreSQL membership capabilities; verify these prerequisites rather than weakening its guards.
3. Run `ops/db/bootstrap-send.sql` with the same privileged identity.
4. Once the existing Supabase Auth schema is ready, run `ops/db/bootstrap-auth-grants.sql` under the same operator approval. This is an Auth privilege/policy mutation, described below.
5. Run `ops/ops820/bootstrap-gateway.sql` with the separately approved attachment gateway password. This creates a narrowly restricted gateway login and schema.
6. Run only forward Rails `db:migrate` from the reviewed, immutable server revision, as `elevateo_migrator`, with `ELEVATEO_PROCESS=migrate`, the production environment and existing private database connection. Do not copy the disposable runner's version-14 staging/full-runner sequence. The migrator assumes `elevateo_owner`; migration files own the application DDL and runtime SQL grants.
7. Verify migration versions, ownership, restricted runtime privileges and preservation of existing Auth/storage data before starting held application services. Review any smoke SQL independently before use; this assessment does not authorize test or fixture scripts on production.

This is a dependency assessment, not an executable approved production runbook or permission to initialize. Scripts and all forward migrations still need operator review against the actual database version/state and backup before execution.

## Mutation and preservation boundaries

- `bootstrap.sql` creates/validates Elevateo login/NOLOGIN roles and application/private schemas, manages role memberships and ACLs, and sets runtime/migrator passwords. Re-running it can rotate those passwords; coordinate application credentials atomically. Its privileged guards must remain intact.
- `bootstrap-send.sql` establishes the private send owner/schema. Keep `ELEVATEO_OUTBOUND_HOLD=true`, `ELEVATEO_OUTBOUND_MODE=held`, and `ELEVATEO_SEND_API_ENABLED=false`; installed SQL authority is not authorization to send or start workers.
- `bootstrap-auth-grants.sql` requires an existing RLS-enabled `auth.sessions` table with the expected UUID/timestamp columns. It takes an **ACCESS EXCLUSIVE** lock with bounded lock/statement timeouts, grants a narrow four-column SELECT to `elevateo_session_owner`, and installs its dedicated SELECT policy while checking existing ownership/RLS/policies. It does not insert/delete Auth rows, but it changes live Auth permissions and can briefly contend with Auth traffic.
- `bootstrap-gateway.sql` creates/validates `elevateo_attachment_gateway` and its schema, restricts memberships/ACLs/search path, and sets its password. It does not grant direct Auth/storage access. Re-execution can rotate its credential.
- Preserve the existing `postgres` database; Auth, storage, realtime and other Supabase schemas; their roles, keys and data; and all persistent volumes. Do not use `db:create`, `db:reset`, `db:drop`, `schema:load`, test fixtures, disposable full runners, migration downs or cascading drops.
- This is not a complete audit of every historical migration. In particular, live-send authority definitions exist in the migration history; no migration or schema readiness result removes the outbound hold or permits provider calls.

## Migrator configuration boundary

Use the typed configuration and `apps/server/config/database.yml`: private DB host, database `postgres`, role `elevateo_migrator`, `MIGRATOR_DB_PASSWORD`, `ELEVATEO_PROCESS=migrate`, `ELEVATEO_MODE=production`, `RAILS_ENV=production`, and the configured pool. The migrator needs the required private service endpoint values and a valid `SECRET_KEY_BASE`; it does not need Google credentials, Auth admin/service tokens or signing keys. The disposable source runner demonstrates the private endpoint shape, not production credentials. Never print environment values or forward the entire live secret set into a migration container.

## Tenant authorization remains a separate blocker

There is no `db/seeds.rb` production tenant initializer. `apps/server/db/sec802/bootstrap_template.sql` grants a verified organization role through `app.enroll_verified_organization_grant`; the function requires that the organization and organization-membership row already exist. It does **not** create either. Mailbox policy provisioning likewise assumes existing verified entities.

An operator-approved tenant/organization membership and mailbox provisioning procedure is still required, using actual verified Supabase Auth UUIDs and a nonsecret approval receipt. Do not infer users or UUIDs from template comments, fixture data or email strings. Valid Google authentication without authorized application membership must continue to fail closed; SSO deliberately does not auto-enroll a user. Schema initialization alone therefore cannot establish successful application login or launch acceptance.
