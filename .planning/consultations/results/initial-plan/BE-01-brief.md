# BE-01 — real local Rails and Supabase foundation

Status: ready for three fresh, independent task consultations; implementation approach is NOT yet accepted. Initial PLAN opinions do not count as BE-01 opinions. Draft prepared by Astra MAX from the accepted initial planning decisions on 2026-10-12.

## Task, dependencies and user result

- Task: BE-01. Dependencies: PLAN-ARCH's authority decision and PLAN-AGENTS' verified dispatch route. Research audits apply to every dependency or copied implementation introduced here.
- Requirements: local-completion Rails API/worker, real local Supabase Auth/PostgreSQL/Storage, one application migration lane, restricted application roles, durable data and cross-organization/private-mailbox isolation. No artificial auth or success stubs.
- Result: an engineer can bootstrap, start, migrate, seed and check the local foundation through documented commands. Real local Auth can issue a session, private Storage rejects unauthorized reads, and restricted Rails database access passes real PostgreSQL isolation tests. Business mailbox APIs and outbound dispatch remain later tasks.
- Repository: `https://github.com/tanzeel-roseyco/elevateo-mail.git`.
- Packet base: `103baeb042925badbbc50dc0d3d3bfbf09ce8344`. Include this entire brief, initial-plan synthesis/decisions and source hashes in the BE-01 packet. Record packet SHA-256 and the reviewed plan revision before launch. Documentation-only reconciliation may follow the consultation if it preserves that packet; changed design assumptions require refreshed opinions. Freeze the actual implementation base commit before dispatch.
- Intended isolated branch: `devin/backend/be-01`; only one backend writer. No implementation issue, PR, commit or session is claimed by this brief.

## Owner, capability and remaining operational checks

Backend owner is authenticated Devin, dispatched by Codex through the official Devin MCP route. CLI authentication is supporting evidence, not a replacement route. Astra `gpt-6-astra` at `max` owns design and synthesis; the three separately executed exact-model opinions are `fable-5`, `opus-5-5`, `fable-5-1`.

The coordinator reports successful official MCP initialization, tool discovery and GitHub integration discovery. Its read-only session `b111d44287f34ba4be9f62961e5b6424` reported fetching `main`, a clean exact base above, Docker 29.7.2, Compose 5.4.0 and a responsive daemon. Final response event: `event-01a12bc0db7b7a128d8a5f9a53728a1c`. [Session](https://app.devin.ai/sessions/b111d44287f34ba4be9f62961e5b6424). This is coordinator-provided operational evidence; this synthesis agent did not independently call that session. It proves read capability and reported tool availability, not branch push, draft-PR creation, application checks or an enforced spend cap.

Before implementation: record exact owner/session, repository write scope, branch reservation, actual create-session schema, supported stop/recovery method and cost controls. The observed create schema has no ACU/budget field. Do not invent one or claim a natural-language budget is enforced. The reported existing balance is $10 and message limit $20; these are not a BE-01 budget. Use only existing authorized credit, no purchases, a recorded task ceiling and frequent usage checks with a supported stop action; if the route cannot keep work within the available authorized amount, keep dispatch pending. Deduplicate by task tag and stored session ID before creating/retrying a session. If creation is uncertain, reconcile first.

## Allowed files and ownership

- `apps/server/**`: Rails API and worker skeleton, centralized typed configuration, application migrations, restricted-role database access and meaningful tests.
- `contracts/openapi.yaml` and minimal contract-check configuration: health/error-envelope foundations and explicitly documented future compatibility requirements. Do not publish unimplemented business routes as working endpoints.
- `ops/**`, root Docker/Compose build files, `.dockerignore`, `.gitignore`, `.env.example`, `scripts/dev*`: reproducible local services and commands. Actual secret files stay ignored; no real credentials, real mail or user uploads are test data.
- `README.md`, `state.md`, `documentation.md`, `.planning/STATE.md`, relevant standards/contracts/local-run documentation, task evidence and `code-reviews.md`: keep actual state and evidence accurate.
- One migration lane: `apps/server/db/migrate/**` owns application schema and application roles/policies; official Supabase components own their internal Auth/Storage migrations. Never hand-edit those internal schemas or introduce a second business-schema migration tool.
- No frontend adoption, native clients, provider implementation, MCP mailbox adapter, unrelated third-party snapshot edits, remote deployment, live email, DNS changes, purchases or production activation.

## Design that consultations must challenge or confirm

1. Rails is the only business-data authority. API and worker share Ruby domain code and the same schema. PostgreSQL will hold the explicit durable send-job ledger in BE-03; do not install Redis/Sidekiq or a second job database to anticipate it.
2. Run real, pinned local Supabase Auth, PostgreSQL and Storage in Docker. Pin a mutually compatible official component set and document primary-source support, image digests, licenses and required extensions before implementation. Exact Ruby/Rails/Supabase versions are BE-01 consultation decisions, not values to guess from this brief.
3. Use separate migrator/bootstrap, restricted API and restricted worker database roles. Ordinary requests never use the Supabase service role or a table-owning role to bypass policies. Bootstrap may use disposable local privileged credentials only in its narrow setup path; never expose them to client bundles or logs. Do not prohibit the local internal secrets needed to run Supabase itself.
4. Start the application schema with organizations, memberships, mailboxes and explicit mailbox access, using composite organization-aware foreign keys where cross-organization references are possible. Preserve Supabase user IDs as external identity references without taking ownership of Auth internals. Final minimal DDL is to be settled by this task's three opinions; do not build all future messaging tables now.
5. Request database context must be validated and set transaction-locally. Missing or malformed context fails closed; connection reuse and rollback cannot transfer a user's claims. Do not accept organization/user IDs from client parameters as authentication. BE-01 verifies the mechanism with restricted-role integration tests; BE-02 implements complete cookie/CSRF/current-session/revocation enforcement before protected business endpoints become usable.
6. Auth email paths, including signup, invitation and recovery, use capture-only local Mailpit or remain disabled. Allowed SMTP host is the explicit Docker service, not arbitrary localhost-looking strings. Mailpit relay is disabled. Runtime mail-provider egress is blocked; build dependency downloads are a separate concern. No Resend/live SMTP fallback or production keys in application runtime.
7. Private Storage is real. Demonstrate a fixture upload through an authorized local test path and denial of anonymous/foreign-principal download. No public catch-all bucket or mock success. BE-05 will add message-specific attachment quarantine/download authorization.
8. Configuration validates boundaries, has one access point, fails on missing critical values and redacts secrets. Select one practical Ruby static typing/checking approach, documenting its scope and limitations; do not add two overlapping type systems. Health responses expose readiness, not secret material or fabricated dependency health.
9. Worker starts and reports health but performs no provider dispatch. Local runtime defaults to outbound hold, separate from restored database state. Future provider simulator storage must remain outside the application restore boundary; it is not part of BE-01 implementation.

## Required verification, all application checks inside Docker

Create documented command wrappers for `bootstrap`, `up`, `migrate`, `seed`, `check` and `stop`, with a Windows PowerShell route and an equivalent Docker Compose route. The existing local plan's `./scripts/dev` commands are a command contract to implement, not proof the files already exist. Use a checks container on the same private network as real services; capture exact executable commands once defined. Never report proposed command names as executed checks.

Acceptance evidence must show:

| Scenario | Required observation |
| --- | --- |
| Fresh empty local setup | Pinned images start; readiness waits for actual dependencies; one application migration command succeeds; real Auth session can be issued without external email. |
| Repeat bootstrap/migrate/seed | No duplicate membership/mailbox fixtures, lost data or silently replaced credentials; deterministic synthetic fixtures. |
| Tenant/mailbox happy path | Two organizations, at least two users, one shared and one private mailbox; authorized access works through the restricted API role. Fixtures can later expand to the nine-slot/two-domain mail inventory. |
| Tenant/private negative paths | Missing context, foreign organization, nonmember and private-mailbox nonmember read/write attempts fail; forged cross-organization foreign keys fail. Do not test only as PostgreSQL superuser. |
| Pooled connection isolation | A one-connection pool alternates users/organizations across commit, exception and rollback; previous claims never authorize the next transaction. |
| Storage boundary | Authorized synthetic private object access succeeds; anonymous and foreign-principal access fail; object content survives service restart. |
| Persistence/recovery | Seeded application data and local Auth identity survive stop/start; migration failure rolls back or fails explicitly with a documented recovery path. |
| No-live boundary | Signup/invitation/recovery test messages are captured locally or rejected; nonallowlisted SMTP/provider configuration is rejected; runtime cannot reach a mail provider. |
| Tooling | Required lint, Ruby type checks and unit/integration tests pass inside containers; dependency/config/contract checks run at the same reviewed commit. |

No browser/native/UI completion claim belongs to BE-01. A local service port may be exposed for actual interactive preview, but application tests communicate through Docker service DNS and the reason for any necessary host-only check is recorded.

## Gates, bounds and review

- Consultation bounds: each separate opinion gets the identical task/evidence revision, 15 minutes maximum and at most USD 5 reported spend using supported CLI controls, matching the successful initial consultation envelope. Record observed model, session, exit and cost; no other model's response in its input. These are ceilings, not spend targets. Root may impose a lower total limit from available credit.
- Implementation bounds: one Devin writer; record an explicit actual cost/time ceiling and stop control before dispatch. Stop on exhausted credit, lost task identity, unexpected remote side effects, missing required capability, architectural scope change or secret exposure. Do not retry uncertain create/write operations blindly. Limit unsuccessful repair attempts to two before design escalation.
- Reviews: every changed code area covered by fresh adversarial assignments of at most 200 lines each, plus a separate design-tradeoff reviewer. Pass the user's full rubric verbatim. Linters handle formatting. Record exact commit/ranges, defects and defects per 1,000 reviewed lines; do not replace coverage with sampling. No blanket exemption for small fixes.
- Actionable defects become deduplicated repository issues. Bounded repairs route to Astra LOW with a reproduction, regression test and their own task opinions/synthesis; structural/auth/schema changes return to Astra MAX. Preserve review dissent and recheck actual fixed commit.
- Cleanup: inspect mounts and resource ownership; remove only task-created disposable containers, images and build caches after checks/preview. Preserve local databases, uploads and ignored credentials. Never use blind volume pruning or `down -v`. Record retained resources, actual disk usage and any safe-compaction limitation.

## Required task evidence (pending)

| Item | State |
| --- | --- |
| Exact packet/base/hash and requirement revision | Draft base above; final packet hash pending launch |
| Separate Fable 5 opinion/result identity | Pending — initial PLAN opinion does not qualify |
| Separate Opus 5.5 opinion/result identity | Pending — initial PLAN opinion does not qualify |
| Separate Fable 5.1 opinion/result identity | Pending — initial PLAN opinion does not qualify |
| Astra MAX BE-01 acceptance/adaptation/rejection and dissent | Pending all three opinions |
| Backend task budget/stop controls, write scope and session | Pending; read-only preflight does not establish them |
| Exact dependency pins/license/advisory decisions | Pending task consultation/audit |
| Implementation commits/draft PR, checks and review issues | Not started |
| Obsidian tradeoff capture | Connection unavailable; analytical scenarios alone do not claim this gate passed |
| Local merge decision / production activation | Pending local review; production remains unauthorized |

Store evidence with the BE-01 task packet, redact credentials and real message content, and synchronize the brief if accepted scope changes. No successful initial-plan consultation, preflight session or prose assertion substitutes for these checks.
