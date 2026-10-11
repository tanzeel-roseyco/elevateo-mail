# Opus 5.5 — BE-01 independent opinion

Scope: BE-01 only, issue #3, base `103baeb042925badbbc50dc0d3d3bfbf09ce8344`. I used no tools. Every check below is proposed and **not run**. I state no dependency versions, because the separate pin audit owns them. Claims about Supabase components that need primary-source confirmation are labelled as evidence gaps.

## 1. Verdict

**Change, then support.** The direction of the brief is sound: one Rails authority, real local Auth, PostgreSQL and Storage, restricted roles, and the no-live default. Four items block implementation until they are corrected:

- **B1:** the transaction-local context mechanism is underspecified for Rails.
- **B2:** the Storage access path contradicts the "no service role in ordinary requests" rule.
- **B3:** the brief never closes Supabase's own `anon`/`authenticated` exposure of the application schema.
- **B4:** "runtime cannot reach a mail provider" has no enforceable mechanism.

Everything else below is an optional improvement or a scope trim.

## 2. Recommendations

### R1 — Make context-setting structural, not conventional (blocker B1)

**Affected:** `apps/server` database access and the RLS policies (brief §5, D-02).

**Problem.** ActiveRecord runs statements in autocommit unless a transaction is open. `set_config(..., true)` or `SET LOCAL` issued outside an explicit transaction expires right after its own statement. The following query then runs with no context. If the policies treat absent context loosely, it runs with the wrong context.

**Fixes:**
- Route all restricted-role access through one wrapper, such as `Tenancy.with_context(principal) { ... }`. The wrapper opens a transaction, sets `app.user_id` and `app.org_id` locally with bound parameters, then yields. Do not build the SQL by string concatenation.
- Write policies with `current_setting('app.user_id', true)`. A missing or empty value must evaluate to deny. A malformed UUID must produce an error, not a match.
- Connect the API directly as a restricted login role that is not the table owner and lacks `BYPASSRLS`. Do not use `SET ROLE` switching.
- Enable `FORCE ROW LEVEL SECURITY` on every application table so the migrator-owned tables cannot leak through ownership later.
- Grant the worker role only what BE-01 needs, which is close to nothing. A future cross-tenant job scan gets explicit worker policies in BE-03, not bypass.
- Decide whether Rails talks to PostgreSQL directly or through the Supabase pooler in transaction mode. I recommend direct for BE-01. If the pooler is used, the pool tests must run through it, and prepared-statement behaviour becomes a test item.

### R2 — Resolve the Storage credential contradiction explicitly (blocker B2)

**Affected:** brief §3 and §7, D-02, and BE-05's planned download proxy.

**Problem.** The planned design keeps buckets private and proxies downloads through Rails. Rails therefore needs some server-side Storage credential. Two options exist:

- **Per-user JWTs with `storage.objects` policies that join application membership tables.** This couples Supabase-owned policy to the application schema and splits authorization across two places.
- **A server-side credential.** This collides with the "never service role" wording.

**Recommendation.** Use a private bucket with no `authenticated` or `anon` object policies. Rails reaches Storage through one `StorageAdapter`. The adapter holds a server-only credential, injected only into the API container, and is never available to the database layer, clients or logs. Every adapter call happens after Rails authorization inside `with_context`.

Record this as a documented, narrow exception to rule §3 rather than leaving the contradiction implicit. The exception covers the Storage HTTP credential only, not database role bypass.

**Evidence gap.** Whether self-hosted Storage supports a narrower scoped key than the service role must come from Supabase primary sources in the pin audit.

### R3 — Close the Supabase Data API surface (blocker B3)

**Affected:** migrations and Compose.

**Problem.** Brief §3 restricts Rails roles but says nothing about Supabase's default `anon` and `authenticated` grants or PostgREST exposure.

**Fixes:**
- Put application tables in a dedicated schema, for example `app`, not `public`.
- `REVOKE ALL` on that schema from `anon`, `authenticated` and `PUBLIC`.
- Keep the schema out of the PostgREST exposed-schema list.
- Better still, omit PostgREST and Kong entirely if Auth and Storage do not require them. That is an evidence gap: verify each component's real dependencies from primary sources and do not strip services blindly.
- Omit Studio, Realtime, Edge Functions, analytics, vector and imgproxy unless a proven dependency requires them.

Rails also needs `structure.sql`, not `schema.rb`, because roles and policies are not representable in `schema.rb`. The dump must be limited to the application schema so Supabase internals never enter the migration lane.

### R4 — Enforce no-live with network topology, not configuration alone (blocker B4)

**Affected:** `ops/**` Compose files and config validation (brief §6, D-06).

**Fixes:**
- Attach runtime services (api, worker, auth, storage, db, mailpit) only to a Compose network with `internal: true`. Images are built and pulled through a separate path, which keeps the brief's separation between runtime egress and build downloads.
- Hard-code the Auth SMTP host to the `mailpit` service name. Validation rejects any other host, including `localhost`, `127.*`, `host.docker.internal` and IP literals.
- Leave Mailpit relay unconfigured.
- Disable public signup. BE-01 is invite-only per the local plan.
- Bootstrap creates fixture users through the Auth admin path, so issuing a session needs no email at all. Mailpit then only captures the invite and recovery tests.
- Publish host ports on `127.0.0.1` only.

### R5 — Migrations and roles (optional, strongly advised)

- Migrations create `NOLOGIN` group roles and policies.
- Bootstrap creates `LOGIN` roles with generated passwords written to ignored files. Passwords never appear in migrations, `structure.sql` or logs.
- Build the composite organization-aware keys this way:
  - Add `UNIQUE (organization_id, id)` on `mailboxes`.
  - Point `mailbox_memberships (organization_id, mailbox_id)` at that key.
  - Point `mailbox_memberships (organization_id, user_id)` at `organization_memberships`.
- Do not add a foreign key into `auth.users`. That couples the application to an internal schema owned by Supabase migrations. Store the Auth UUID and defer orphan handling to BE-02.
- Document that `CREATE INDEX CONCURRENTLY` and similar statements cannot sit inside the transactional migration guarantee.

### R6 — Windows-host reality (optional; my platform focus)

The user develops on Windows 11, so the PowerShell route is a real path, not a courtesy.

- Add `.gitattributes` forcing LF for `*.sh`, Dockerfiles and entrypoints. CRLF entrypoints are the classic first failure on Windows.
- Use named volumes for PostgreSQL and Storage data, not bind mounts on NTFS. Bind mounts cause performance and permission problems.
- The PowerShell wrapper should only call the same `docker compose` commands as the shell wrapper, so behaviour cannot diverge.
- Run the same command list through both wrappers in CI or locally, and record the results.

### R7 — Scope trims and keeps

- **Keep the worker** as a health-only process with outbound hold defaulting to held from a config or file source outside the database. It proves the shared image and separate commands cheaply.
- **Keep OpenAPI** to `/health`, `/ready` and the error envelope with a request ID. The future UI depends on that stable error shape for denied, conflict and held banners. That is the only UX-relevant contract in BE-01.
- **Readiness** must report each dependency check it actually performed and the hold state, never a static "ok".
- **Typing:** pick exactly one of Sorbet or RBS/Steep, scoped to domain and config code.

## 3. Strongest objection

**Failure scenario.** Pool tests pass under one Puma thread with direct connections. Production-like settings then add a transaction-mode pooler and concurrency. A code path that queries outside `with_context`, such as a model callback, eager-load or health query, runs on a connection with no context. If any policy uses `coalesce` to a permissive default, or an index-only path bypasses an assumption, data leaks. Equally plausible, the restricted role sees nothing and someone "fixes" it by granting `BYPASSRLS`.

**Simpler alternative.** Skip RLS in BE-01 and rely on Rails scoping only. This is cheaper, but it discards the second boundary that D-01 and D-02 accepted. I reject the alternative and instead require the negative tests below, plus a CI grep or lint check that flags `BYPASSRLS`, `SECURITY DEFINER` and superuser connection strings in `apps/server`.

**Secondary objection.** Pinning "minimal Supabase" without its real dependency graph may produce a stack where Auth or Storage silently fail health. Readiness must exercise a real token issuance and a real object put/get, not just open ports.

## 4. Acceptance checks (all proposed, not run)

### Restricted role and RLS

All run as the actual API login role, never as superuser or owner.

| Case | Expected |
|---|---|
| Query without `with_context` | 0 rows, or error |
| Context for org A | Reading org B's mailboxes or memberships returns 0 rows; inserts referencing org B fail |
| Org member who is not a member of the private mailbox | Cannot read it or its memberships |
| Malformed UUID in context | Errors; never matches |
| Forged composite FK: membership with org A and org B's mailbox | Fails even when performed by the migrator role |
| Role attribute check | `pg_roles` shows the API and worker roles lack `rolsuper`, `rolbypassrls` and table ownership |
| `relforcerowsecurity` | True for every `app.*` table |

### Pool isolation

Pool size 1, against the same connection path production would use:

1. A commits, then B runs with no context. B is denied.
2. A raises mid-transaction and rolls back, then B's next query is denied or sees only B's data.
3. A's context is set, then A runs a raw `SELECT current_setting('app.user_id', true)` after commit. The result is empty.

Repeat the sequence with pool size 2 under concurrent threads.

If a pooler is used, repeat everything through it.

### Supabase surface

- The `anon` key and a user JWT against PostgREST, if present, cannot read `app.*`.
- Anonymous and user-JWT Storage GETs on the private bucket return denied.
- An adapter read after Rails authorization succeeds.
- The object survives `stop`/`up`.

### No-live

- Config containing a non-`mailpit` SMTP host, or any Resend key pattern, fails startup with a redacted error.
- From the api, worker and auth containers, a TCP connect to an external address fails. Use a documentation-range address (TEST-NET), never a real provider.
- Invite and recovery messages appear in the Mailpit API.
- A signup attempt is rejected.

### Idempotence and recovery

- Running `bootstrap`, `migrate` and `seed` twice leaves identical row counts and unchanged credential-file hashes.
- A deliberately failing migration leaves `schema_migrations` and tables unchanged.
- Stop/start preserves Auth users and application rows.
- `stop` never removes volumes.

### Tooling

- Lint, typecheck and integration suites pass in a checks container on the internal network at one recorded commit.
- Both the PowerShell and shell wrappers are executed and logged.

### Residual uncertainty

- The exact minimal Supabase component graph and a scoped Storage credential (pin audit).
- Pooler compatibility with Rails prepared statements.
- Whether `internal: true` networks interfere with Auth's own outbound needs, such as JWKS or webhooks. These should be none locally; verify.

## Motion, C++ and UX ownership note

BE-01 has no motion, C++, Qt or graphics surface, and I propose none. The only client-facing contribution is a stable error envelope (`code`, `request_id`, human-safe message) and a readiness payload exposing hold state. FE-02 needs both so the UI can show accurate held, denied and conflict states without inventing status.

## Top three recommendations

1. **Structural tenancy wrapper plus forced RLS**, proven by role-attribute assertions and pool-size-1 negative tests on the real connection path (R1).
2. **Network-enforced no-live**: an internal Compose network, a service-name SMTP allowlist, disabled signup and admin-created fixture users (R4).
3. **Minimal, verified Supabase surface**: the application schema hidden from `anon`/`authenticated` and PostgREST, unneeded services omitted only after primary-source dependency confirmation, and `structure.sql` limited to the application schema (R3).

## Hard contradiction

Brief §3 ("ordinary requests never use the Supabase service role") conflicts with D-02 and BE-05's server-side authorized Storage proxy. Some server credential must reach Storage. Resolve it explicitly as a single adapter-scoped exception, R2, or by a scoped key if one exists, before dispatch. Do not let Devin settle it implicitly.
