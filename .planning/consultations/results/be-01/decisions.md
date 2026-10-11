# BE-01 accepted foundation decisions

Status: design accepted with the operational dispatch conditions below. This is not implementation authorization or evidence of a working application. Astra `gpt-6-astra` / `max`, actual task `/root/plan_synthesis`, synthesized three independently executed exact-model opinions. Execution evidence and source hashes are in [metadata.json](metadata.json); dispositions and dissent are in [synthesis.md](synthesis.md).

Task [BE-01 / issue 3](https://github.com/tanzeel-roseyco/elevateo-mail/issues/3), consultation base `103baeb042925badbbc50dc0d3d3bfbf09ce8344`, common packet SHA-256 `0d78de54f791778b5528192775cdc4ec7f507cc4a0afd72e932f3a7ebe3ab335`. The coordinator must freeze the actual implementation base and this accepted packet before dispatch. Documentation reconciliation is allowed; material architecture or requirement changes need refreshed opinions.

## B01-01 — one bounded task, two internal checkpoints

Keep one BE-01 issue, one backend writer, one branch `devin/backend/be-01` and one draft PR. Checkpoint A establishes the pinned local stack, credentials/roles, migration lane, repeatable lifecycle, hold and egress controls. Checkpoint B establishes the four application tables, RLS wrapper, synthetic fixtures and isolation/Storage checks. These are stop points, not independently accepted features. Do not merge a partial foundation as completed BE-01.

Fable 5 recommended separate BE-01a/BE-01b tasks or two PRs because of credit and review size. That dissent is retained. Review slices are bounded by changed lines, not PR count; two PRs would introduce a moving base and another complete consultation gate without reducing the required work. If the recorded budget cannot cover the bounded task, stop with evidence and propose a separately consulted continuation. Do not work beyond the budget or reduce verification to finish.

No business mailbox routes, send ledger, provider simulator, attachments product workflow, session-revocation implementation, native shell or UI adoption belongs here. A health/readiness/error contract is enough; defer generated API tooling until BE-02.

## B01-02 — audited pins and five backing services

Accept the primary-source [dependency audit snapshot](foundation-dependencies.snapshot.md) as the post-consultation pin decision: Ruby **3.4.11**, Rails **8.1.4**, **Steep 2.1.0** with RBS; Supabase self-hosted release **v0.8.2**, source commit `564eab8ad7840b13324f68b1bfac074ef8d51c21`. Use every listed image as `tag@sha256:digest`; record the resolved platform child digest and locked transitive gems during the build. No floating tags.

Backing services are **Postgres 17.6.1.136, Auth v2.196.0, PostgREST v14.17, Storage v1.74.0 and Mailpit v1.31.5**. Rails API and worker run separate commands from one Ruby image. This is an intentionally adapted local profile, not a claim of upstream drop-in support. Storage's pinned configuration depends on PostgREST; reject the four-service hypothesis. Omit image transformation only with its pinned feature flag disabled and the imgproxy dependency removed. Omit Studio, Realtime, Edge Runtime, analytics, metadata UI and Supavisor.

Rails uses its own direct PostgreSQL pool. No public Supabase gateway or direct browser/native SDK path in BE-01. Internal Auth/Storage integration tests use private service DNS. Before browser login in BE-02, implement and test the Rails Auth facade, public path/issuer behavior and current-session checks. Removing the upstream gateway does not preserve its URL semantics automatically.

The audit establishes source provenance and resolver eligibility, not native-extension compatibility, vulnerability clearance, complete image licensing or runtime support. Resolve lockfiles and collect image source/SBOM/advisory evidence in Docker. Bind the audit's two default-branch license references to actual image revisions before distribution. If pins cannot satisfy requirements, report the incompatibility; do not silently select replacements.

## B01-03 — one application migration lane and minimal schema

Rails migrations own the dedicated `app` schema and its application policies. Supabase owns its Auth/Storage schemas and upstream initialization; do not write directly to `auth.users` or alter service internals. Create synthetic identities through the real Auth administration API, then store those UUIDs as application identity references, with no cross-schema foreign key into Auth internals.

Application tables: `organizations`, `organization_memberships`, `mailboxes`, `mailbox_memberships`. Use UUID identity, explicit organization IDs and uniqueness needed for composite references. Bind `mailbox_memberships (organization_id, mailbox_id)` to the same pair on `mailboxes`, and `(organization_id, user_id)` to the same pair on `organization_memberships`. Use a unique `(organization_id, id)` on mailboxes and unique `(organization_id, user_id)` on organization memberships. Prevent private access surviving removal of its organization membership through an explicit foreign-key deletion policy. Do not build future message/send tables.

Keep Rails migration bookkeeping in a separate private metadata schema so every tenant-bearing `app` table can use FORCE RLS without pretending schema-version records are tenant data. Use a narrowly scoped SQL structure dump for application and migration metadata only; exclude Auth/Storage internals and credentials. Global role definitions remain explicit bootstrap/migration source because a schema dump is not a role backup.

Bootstrap installs local login secrets and upstream prerequisites. Application migration source owns application role membership, grants and policy evolution. Prefer NOLOGIN ownership/group roles with distinct migrator, API and worker logins. Runtime logins must not own tables, be superusers, have BYPASSRLS, inherit or SET ROLE into a privileged role. Upstream Auth/Storage service credentials and bootstrap administration have distinct purposes; do not reuse them as Rails database credentials.

## B01-04 — explicit transaction context, FORCE RLS and a trustworthy harness

Use one `Tenancy.with_context(principal)` boundary. Validate principal UUIDs, open an explicit database transaction, then bind values through parameterized `set_config('app.user_id', ..., true)` and `set_config('app.org_id', ..., true)`. Issue all protected application queries through that connection within the transaction. Do not set connection-global claims or interpolate SQL. Nested use with a conflicting principal must fail rather than changing the outer request's authority.

RLS reads those two settings with missing-setting tolerance and treats both NULL and empty values as no authority; malformed values may raise a deliberate error, never authorize a row. RLS is enabled and forced on all four tenant-bearing tables. Use default denial and acyclic policy dependencies: own organization-membership rows can be read from the context directly; organizations consult those rows; own mailbox-membership rows are limited by context; mailboxes consult organization and explicit private-mailbox membership. Avoid policies recursively querying themselves through another policy.

For this slice, API business-table grants are read-only and worker has no business-table access. Authorized application mutations are later BE-02 decisions. Negative write tests prove the current permission boundary; do not describe them as proof of future row-level mutation policies. Administrative fixture insertion and foreign-key integrity tests use a separately identified bootstrap/fixture connection. They must not contaminate restricted-runtime tests.

At restricted-test startup assert `session_user`, `current_user`, role flags, ownership and inability to assume the migrator. Test every protected table with missing context, mismatched context and an authorized principal. A user belonging to both organizations must still be unable to forge an organization-inconsistent composite foreign key, tested with a fixture writer so denial is attributable to the constraint. Test actual direct Rails pooling at size one across commit/exception/rollback and a small concurrent pool; after completion no previous claims may authorize another transaction.

BE-01 proves this mechanism with real Auth-created identities and real PostgreSQL, not a claim that request authentication exists. BE-02 must derive the principal from fully verified identity/current session; client-supplied user or organization IDs are not authentication.

## B01-05 — private Storage with one narrow server credential exception

Use real Supabase Storage with a private bucket and persistent file volume. No anonymous or authenticated direct object policies. Rails will remain the only public attachment/business authority. A centralized internal Storage adapter may hold a server-only Storage service credential for Storage HTTP operations; this is the narrow exception to the earlier blanket wording about service roles. It is never the Rails database credential, never returned to clients, and never logged or placed in image layers.

Revoke `app` schema/table access from PUBLIC, `anon`, `authenticated` and Supabase `service_role`; exclude `app` and application metadata from PostgREST exposed schemas. FORCE RLS alone does not constrain a BYPASSRLS service role. Private PostgREST/Storage endpoints and absent direct object policies are additional boundaries.

The fixture adapter accepts a server-resolved object locator only after authorization under B01-04; complete the database authorization before slow Storage HTTP I/O to avoid holding a pooled transaction across a network request. The fixture path binds the object to its mailbox. Demonstrate authorized access and denial for a different principal through the adapter, plus direct anonymous/user-JWT rejection. No public download endpoint is introduced. Full attachment mapping, quarantine, size/content handling, concurrent revocation semantics and streaming belong to BE-05. Record that a same-process privileged Storage credential is a trust boundary, not cryptographic isolation from compromised Rails code.

## B01-06 — no-live runtime and real Auth email capture

Use an internal Docker network for all application/Auth/Storage/Mailpit runtime services; no outbound-capable second network, host network mode, host Docker socket or proxy escape. Builds and dependency acquisition occur separately. Any human preview ports bind explicitly to loopback; automated application checks use service DNS inside Docker.

Auth SMTP is exactly `mailpit:1025`, using synthetic identity and an explicit local redirect allowlist. Disable self-signup, phone/OAuth/external hooks and automatic email confirmation; use bounded administrative fixture provisioning/invites with captured mail. Test real token issuance and invite/recovery capture without touching real mail accounts. Disable Mailpit relay/forward matching, relay-all, outbound webhook and reverse DNS. Reject non-allowlisted endpoints at startup, including arbitrary localhost/host-gateway lookalikes.

Inspect actual network membership and prove denied egress from API, worker, Auth and catcher. A failed connection to an unroutable test address alone is insufficient. Use an isolated external-network fixture with a successful control connection plus denied runtime connections, without contacting real mail providers. No production/provider credentials in this profile.

The worker starts and reports health but cannot dispatch. Default outbound hold is enforced by runtime configuration outside restored application database state; no release path is implemented. Test that database changes/restore cannot release it. No pretend send-job or activation tables just to test the hold.

## B01-07 — lifecycle, typing and tests

Expose `bootstrap`, `up`, `migrate`, `seed`, `check`, `stop` through one shared Compose implementation and thin shell/PowerShell wrappers. Do not duplicate lifecycle logic. Keep executable scripts LF; use named persistent volumes for PostgreSQL/Storage, not platform-sensitive source bind mounts for data. Record a real Windows invocation when the coordinator runs it; a Linux worker cannot claim Windows validation.

Steep/RBS checks owned configuration, context, adapter and health/error boundaries. Make framework seams explicit with justified annotations; an empty target or a one-function demonstration does not meet the typing gate. Do not add Sorbet as a second system. Lint, typechecks, meaningful unit/integration tests and actual service smoke checks run inside Docker.

Health is process liveness; readiness reports safe real dependency checks and the hold state without secret detail. Token issuance/object round-trips belong in smoke tests, not every readiness poll. Use a minimal documented health/readiness and `{code, message, request_id}` error contract; introduce no speculative business API or generator dependency.

Re-running bootstrap/migrate/seed must preserve generated credentials, identity IDs, membership counts and object content. Test a deliberately failing migration in a disposable database: per-migration transactional effects and that migration's version entry roll back; previous successfully completed migrations may remain. Stop/start preserves application rows, Auth identity and Storage bytes. Cleanup removes only exact task-owned disposable resources and retains those persistent volumes and ignored secrets; never `down -v` or a global prune.

## B01-08 — remaining operational gate and acceptance

The coordinator must record the implementation base/revision, repository write capability, branch reservation, exact Devin session, authorized existing-credit boundary, maximum wall time, available usage/state-read cadence/owner and supported stop action before implementation. The observed create-session schema has no budget field. The reported $10 balance and $20 message limit are not per-task spending enforcement. Natural-language cost targets and the read-only preflight are not a substitute.

Operational update supplied by the coordinator after consultation: the user explicitly authorized consuming the existing $10 Devin credit, with no purchases or top-ups; the actual MCP sleep action was verified. Free-plan dollar telemetry is absent. Proceed only within that newly authorized prepaid-credit boundary, with no added payment action, a maximum 30-minute work checkpoint, coordinator polling every two minutes and sleep/stop on exhaustion or uncertain spend/state. Record the actual observed counters and their limitations instead of fabricating dollar usage or claiming a per-session cap. The coordinator still owns the final base/session/control record. This resolves the need for another spending approval; it does not prove the implementation is affordable or complete.

Read-only Devin preflight reported clean base and working Docker; push/draft-PR scope is still a separate check unless the coordinator records newer evidence. Do not retry uncertain session creation or writes without reconciliation. Stop on budget/capability loss, an incompatible pin/design change, secrets or unexpected remote effects. A maximum of two unsuccessful repair attempts precedes escalation.

Three BE-01 opinions and this synthesis satisfy the task design consultation gate only. Full adversarial code coverage in assignments of at most 200 changed lines, the verbatim user rubric, a separate deep-design reviewer, defect issues/density, actual Docker checks and the coordinator's merge decision remain required. Obsidian is unavailable: [analytical scenarios](tradeoff-scenarios.md) preserve reasoning but do not claim the requested connection simulation occurred. No production activation, sending, purchases or external deployment is authorized.
