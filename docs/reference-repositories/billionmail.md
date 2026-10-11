# BillionMail — independent source dossier

**Disposition: retain the AGPL-3.0 source snapshot for reference; incorporate none of its application code into Elevateo's runtime.** Its useful lessons concern mail-server responsibilities, operational visibility and permission design. Running a conventional mail stack would add responsibilities that the user-selected Resend transport is intended to avoid.

## Identity, provenance and license boundary

| Field | Recorded value |
| --- | --- |
| Upstream | [Billionmail/BillionMail](https://github.com/Billionmail/BillionMail) |
| Audited commit | [`fc36c76c050c3775c5e899faf7403cf0262d2744`](https://github.com/Billionmail/BillionMail/tree/fc36c76c050c3775c5e899faf7403cf0262d2744) |
| Commit date | 2026-06-11 |
| Local source snapshot | [third_party/upstream/billionmail](../../third_party/upstream/billionmail) |
| License | [GNU Affero General Public License v3](../../third_party/upstream/billionmail/LICENSE); retained source and bundled notices keep their original terms |
| Size in original inventory | 1,483 tracked files; 854 selected source files; 103,874 selected source lines; 103 test-classified paths |
| Inventory limitations | Heuristic original counts; neither a coverage percentage nor a count of independently reviewed lines |
| Overall audited score | **49/100**, reuse value **4/10** |
| Evidence | [Scorecards](../research/audit-scorecards.json), [immutable pins](../research/repository-pins.json) |

The user's source-intake request permits retaining this snapshot as reference material. It does not relicense the source or approve its integration into the proposed product. A separate directory is **not a license exemption**. Preserve upstream copyright and third-party notices, including notices accompanying bundled frontend assets. Any future copying, translation, linking, modification or service integration needs an explicit licensing decision; independently applying an architectural idea is different from copying its implementation. This document makes no legal determination about a hypothetical future combination.

The tracked `ssl-self-signed/key.pem` is intentionally omitted from the intake because it is public private-key material and unsuitable as a deployment credential. The intake manifest records this omission. Other tracked source is retained with its original provenance. This is therefore a documented reference snapshot with an exclusion, not a byte-for-byte executable distribution. No generated certificate/private key replaces it; no upstream installer or Compose stack was run in this intake.

Seven-dimension scores below retain the original outreach-product rubric. The 4/10 product-fit score is not a new score for today's company-mailbox requirements. Component scores are separate judgments. The weighted total is `sum(score × weight) / 10`, rounded half up. All findings concern the pinned snapshot, not future upstream releases.

## Architecture and data flow

The application combines a GoFrame API/service tree, Vue/Pinia frontend, PostgreSQL, Redis and a conventional mail-hosting stack. Postfix moves SMTP mail, Dovecot supplies mailbox access/storage integration, Rspamd filters mail and Roundcube supplies webmail. The core also manages domains, templates, batch campaigns, statistics, AI functions and Docker/host operations.

```text
Admin browser → Vue routes/components → GoFrame controllers
  → RBAC + domain services → PostgreSQL / Redis
  → batch task executor + worker pool → SMTP / relay / Postfix
  → mail logs and task results → statistics UI

Internet mail → mail-server stack → mailbox storage / Dovecot → webmail

Core administration → Docker socket / mail configuration / host helpers
```

This is an integrated mail platform. Self-hosted Supabase is a database/auth/storage platform and does not replace Postfix or Dovecot. In Elevateo's proposed design, Resend performs external transport and ingestion, while our database owns conversations and access rules. Importing BillionMail's stack alongside Resend would duplicate responsibility and add operations work without satisfying a confirmed requirement for IMAP client access.

## Module map and trust boundaries

| Verified source path | Responsibility | Elevateo disposition |
| --- | --- | --- |
| [docker-compose.yml](../../third_party/upstream/billionmail/docker-compose.yml), [Dockerfiles](../../third_party/upstream/billionmail/Dockerfiles), [conf](../../third_party/upstream/billionmail/conf) | Mail infrastructure, networks, volumes and host privileges | Reference-only infrastructure lessons; do not use as Elevateo's deployment |
| [core/internal/cmd/cmd.go](../../third_party/upstream/billionmail/core/internal/cmd/cmd.go), [core/api](../../third_party/upstream/billionmail/core/api), [core/internal/controller](../../third_party/upstream/billionmail/core/internal/controller) | Application startup, route contracts and HTTP controllers | Learn explicit layers; write new typed Node contracts |
| [init.sql](../../third_party/upstream/billionmail/init.sql), [database_initialization](../../third_party/upstream/billionmail/core/internal/service/database_initialization) | Base mail-host tables and application schema bootstrap/changes | Study responsibilities; do not import DDL into Supabase |
| [core/internal/model/entity](../../third_party/upstream/billionmail/core/internal/model/entity), [core/internal/dao](../../third_party/upstream/billionmail/core/internal/dao) | Data models and data-access layer | Reference only; Elevateo needs organization/mailbox-scoped schema |
| [rbac/jwt.go](../../third_party/upstream/billionmail/core/internal/service/rbac/jwt.go), [middlewares/rbac.go](../../third_party/upstream/billionmail/core/internal/service/middlewares/rbac.go) | Session/API token handling and route permission checks | Study default-deny and negative token cases; never port JWT implementation |
| [batch_mail/task_executor.go](../../third_party/upstream/billionmail/core/internal/service/batch_mail/task_executor.go) | Task state, worker pool, rate control, circuit breaker and counters | Study failure boundaries; new PostgreSQL-owned jobs are required |
| [mail_service/sending.go](../../third_party/upstream/billionmail/core/internal/service/mail_service/sending.go), [relay/config_sync.go](../../third_party/upstream/billionmail/core/internal/service/relay/config_sync.go) | SMTP transport and relay configuration | No launch use: replace responsibility with new Resend integration |
| [domains/domains.go](../../third_party/upstream/billionmail/core/internal/service/domains/domains.go), [domains/dns.go](../../third_party/upstream/billionmail/core/internal/service/domains/dns.go) | Domain configuration and DNS checks | Use as a conceptual checklist; new provider-specific health status |
| [maillog_stat/maillog_stat.go](../../third_party/upstream/billionmail/core/internal/service/maillog_stat/maillog_stat.go), [warmup/rate_limiter.go](../../third_party/upstream/billionmail/core/internal/service/warmup/rate_limiter.go) | Mail-log analytics and sending/IP ramp limits | Borrow metric questions, not code or assumptions about inbox placement |
| [dockerapi/dockerapi.go](../../third_party/upstream/billionmail/core/internal/service/dockerapi/dockerapi.go) | Container and host management | Explicitly excluded from user-facing API architecture |
| [core/frontend/src/features/EmailEditor](../../third_party/upstream/billionmail/core/frontend/src/features/EmailEditor), [core/frontend/src/store](../../third_party/upstream/billionmail/core/frontend/src/store) | Vue editor and client state | UI research only; no Vue bundle inside proposed React/Tauri application |
| [askai/openai.go](../../third_party/upstream/billionmail/core/internal/service/askai/openai.go), [askai/project.go](../../third_party/upstream/billionmail/core/internal/service/askai/project.go) | Model-provider clients, streamed generation and project/template functions | Reference only; not the requested Claude/Codex MCP connector |

The core crosses from content/application administration into infrastructure administration. That privilege boundary is the decisive architecture concern for a small company mailbox: a normal mailbox API should not also be able to control the host's containers.

## Scores

| Dimension | Weight | Score / 10 |
| --- | ---: | ---: |
| Architecture | 15% | 6 |
| Code maintainability | 15% | 5 |
| Security / permissions | 20% | 4 |
| Sending / data reliability | 20% | 5 |
| Product fit | 10% | 4 |
| Tests / verification | 10% | 6 |
| Operations | 10% | 4 |

| Component | Score / 10 | Assessment and pinned evidence |
| --- | ---: | --- |
| Mail-server stack | 7 | Integrated Postfix/Dovecot/Rspamd/Roundcube is capable but imposes DNS, IP reputation and mail-ops responsibility. [docker-compose.yml:144](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/docker-compose.yml#L144) |
| Batch sender | 5 | Worker pool, pacing and circuit breaker; in-memory task coordination and deferred DB updates need crash tests. [core/internal/service/batch_mail/task_executor.go:138](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/batch_mail/task_executor.go#L138) |
| Roles and operations log | 6 | Default-deny route permission mapping and an operation-log model exist. [core/internal/service/middlewares/rbac.go:129](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/middlewares/rbac.go#L129) |
| Session/token implementation | 3 | Token classes are generated, but request authentication does not enforce access-token subject and API-token invalidation is incomplete. [core/internal/service/rbac/jwt.go:136](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/rbac/jwt.go#L136) |
| Transport security | 3 | Both implicit TLS and STARTTLS paths disable certificate verification. [core/internal/service/mail_service/sending.go:210](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/mail_service/sending.go#L210) |
| Frontend and editor | 7 | Vue component/editor structure and 404 passing frontend tests; not a cold-outreach feature parity claim. [core/frontend/package.json:16](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/frontend/package.json#L16) |
| Analytics and deliverability | 6 | Mail-log statistics, domain checks and IP ramp policies are useful references; not evidence of inbox placement performance. [core/internal/service/warmup/rate_limiter.go:1](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/warmup/rate_limiter.go#L1) |
| Host isolation and deployment | 3 | Core mounts Docker socket and multiple sensitive host paths; compromise has a broad operational blast radius. [docker-compose.yml:195](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/docker-compose.yml#L195) |
| Testing and maintenance | 6 | Many tests including integration-labelled Go files; no tracked CI workflows at this snapshot. [core/frontend/vitest.config.ts:23](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/frontend/vitest.config.ts#L23) |


## Subsystem assessment

**Database and migrations.** [init.sql](../../third_party/upstream/billionmail/init.sql) defines `domain`, `mailbox`, `alias` and `alias_domain`, reflecting a traditional mail host with credentials, maildirs and quotas. Application schema lives in `core/internal/service/database_initialization`: `rbac.go` creates account/role/permission associations; `batch_mail.go` defines contacts/groups, templates, email tasks, recipient results, unsubscribe records, API mail logs and tags; other files initialize operation logs, relays, statistics and IP warmup. These models mix operational mail hosting and marketing. Elevateo instead needs organizations, memberships, mailbox permissions, conversations, messages, drafts, immutable send snapshots, jobs, attempts, webhook events and audit history. Upstream account-role tables are not evidence of Supabase RLS or row-level mailbox privacy. Use versioned migrations with tested upgrade/restore paths rather than copying bootstrap SQL.

**Identity and permissions.** Permission middleware defaults to denial when route metadata cannot be determined and checks module/action/resource permissions; administrator bypass is explicit. These are useful concepts. Refresh/access/API token distinctions are not consistently enforced, and the blacklist mechanism cannot revoke its non-expiring API tokens (B1/B2). Elevateo should use Supabase's identity lifecycle and independently tested application mailbox permissions. Connector credentials need revocable server-side grants, not indefinite bearer tokens with no active revocation check. Operation logs are a useful model but do not prove immutable or complete audit coverage.

**Batch queue and sending.** `TaskExecutor` holds running/paused booleans, cached task configuration, channels, a worker pool, counters and a failure threshold in memory. This is more capable than a single send loop, but in-memory coordination and deferred database updates still require crash/restart validation. Circuit breaking protects a failing provider; it does not prove durable ownership or prevent ambiguous resends. A production attempt ledger, stable logical keys, bounded leases, provider-aware idempotency and explicit `unknown` reconciliation remain necessary.

**Transport and inbox hosting.** SMTP, Postfix queues, Dovecot mailbox storage, spam filtering, certificates, MX/DKIM/SPF/DMARC, address aliases and IP reputation are separate operating responsibilities. BillionMail gathers them; our proposed product delegates transport to Resend and presents company conversations itself. The TLS bypass in the pinned SMTP path must not be copied. A successful SMTP submission or delivery event is not proof of inbox placement, human reading or campaign quality. Self-hosting the application does not mean self-hosting the public SMTP server.

**Frontend and collaboration.** The Vue/TypeScript interface includes administration, campaigns, logs, contacts and a structured email editor with Pinia state and a sizable test suite. Those tests are a positive maintenance signal. They do not establish the exact shared-inbox UX we need: concurrent draft versioning, per-person read state, assignment, mailbox privacy and scoped connector actions must be separately specified. React and Vue component trees should not be combined just to retain an editor. There is no validated Tauri Mac/Windows installer in this audit.

**AI and connectors.** `askai` contains API-key/base-URL/model configuration and generation functions, including an HTTP-request tool name. This is application-side model integration, not evidence of secure Claude/Codex MCP authorization. A subscription-backed desktop client and a server API account are different mechanisms. Elevateo's initially proposed MCP surface remains read/search/draft only, using existing mailbox authorization; model access and content disclosure are explicit configuration choices. Incoming email and generated HTML remain untrusted.

**Dependencies.** [core/go.mod](../../third_party/upstream/billionmail/core/go.mod) declares Go 1.24.0, GoFrame v2.10.0 (plus a v1 module dependency), JWT/v5, Docker SDK, PostgreSQL/Redis drivers, DNS/ACME libraries, worker-pool and model-client packages. The upstream `CLAUDE.md` says Go 1.22, so the manifest is the more concrete version evidence. [core/frontend/package.json](../../third_party/upstream/billionmail/core/frontend/package.json) includes Vue 3.5.27, Pinia 3.0.4, TypeScript 5.9.3, Rsbuild, Vitest 4.0.18, editors and charts. Preserve the original lockfiles as evidence; do not adopt this dependency tree for React/Node code.

**Deployment and operations.** The Compose snapshot uses PostgreSQL 17.4-alpine and Redis 7.4.2-alpine plus mail-service containers. The core mounts the Docker socket, configuration, logs and mail data, and adds network capabilities. A read-only socket filesystem mount does not make Docker API calls read-only. No tracked GitHub CI workflow was found at this pin. Full mail-host backups would include database state, message stores, config and key material; our smaller proposal still needs both PostgreSQL and private-object backups and a restore drill. No resource benchmark supports claiming this full stack is efficient for our ten-person workload.

## Findings, confidence and corrections

| ID / severity | Pinned evidence and failure mode | Confidence / limits | Elevateo response |
| --- | --- | --- | --- |
| B1 / High | [jwt.go:95](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/rbac/jwt.go#L95) creates `refresh_token` subjects. [Authentication at 189](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/rbac/jwt.go#L189) does not enforce access-token type and [reloads account roles at 241](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/rbac/jwt.go#L241) | Source-confirmed; endpoint exploitation not exercised end to end | Do not port token implementation. Validate identity token claims and intended token use; test wrong-class, expired and revoked credentials |
| B2 / High | [API tokens have no expiration](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/rbac/jwt.go#L110); [invalidation at 165](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/rbac/jwt.go#L165) and [blacklist check at 176](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/rbac/jwt.go#L176) bypass them | Source-confirmed limitation of this revocation path; separate account controls are not evaluated as substitutes | Store revocable connector grants; check status/scope/current mailbox access on every operation |
| B3 / High | [Implicit TLS](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/mail_service/sending.go#L207) and [STARTTLS](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/mail_service/sending.go#L235) use `InsecureSkipVerify` | Source-confirmed; practical exposure depends on network and selected transport path; no interception test | New Resend HTTPS adapter with normal certificate verification and bounded timeout; reject global trust bypasses |
| B4 / High | [Compose socket mount](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/docker-compose.yml#L195) plus [host command helpers](https://github.com/Billionmail/BillionMail/blob/fc36c76c050c3775c5e899faf7403cf0262d2744/core/internal/service/dockerapi/dockerapi.go#L366) create a large privilege boundary | Source-confirmed architecture risk; not a demonstrated remote exploit | No Docker socket or host shell in mailbox API/worker. Infrastructure administration remains separate |

## Verification ledger and supply-chain evidence

| Check | Prior audit result | What it does not establish |
| --- | --- | --- |
| Frontend Vitest | **404 tests passed in 51 files**, local DOM environment | Production-browser sanitization, accessibility, multi-user permissions or native package behavior |
| Selected Go packages | `rbac`, `middlewares`, `batch_mail` passed (2.417s, 2.450s, 4.282s respectively) | Complete backend service coverage or a real mail-server deployment |
| JWT tests inspected | Several tests manually invoke the JWT parser instead of `JWTService.ParseToken` to avoid its Redis path | A passing token-generation test cannot establish revocation or middleware token-class safety |
| Frontend dependency audit | 159 advisory records: 8 low, 64 moderate, 86 high, 1 critical, in the prior pnpm report | These are report records, not unique vulnerabilities, confirmed exploits or directly comparable counts from another package manager |
| Full Go test/vet suite | Not recorded as complete | No whole-repository pass claim |
| Go vulnerability scan / container-image audit | Not recorded | No clean bill of health for transitive modules or container images |
| Live DNS/MX, SMTP, IMAP, provider and delivery testing | Not performed | No inbox-placement, reputation or production transport claim |
| Backup/restore, load, failover and privilege-boundary penetration tests | Not performed | No availability, RPO/RTO or host-isolation certification |

All executable results above were obtained in the earlier local audit, not rerun during source intake. No BillionMail Docker Compose stack, installer or live credential setup was executed. Its upstream development instructions are preserved as reference content; they are not a reason to run infrastructure while documenting it.

## Useful concepts, exact references and rejection targets

**No code port from this repository is selected.** The source is retained so decisions are inspectable. The following are independently implementable design goals with source locations for comparison, not permission to copy AGPL implementation into a differently licensed application.

| Concept / reference | Independent Elevateo implementation | Acceptance evidence |
| --- | --- | --- |
| Default-deny permission decisions: `core/internal/service/middlewares/rbac.go` | Explicit operation policies using current organization/mailbox membership, not route-name inference alone | Negative tests for cross-mailbox IDs, removed members and unknown operations |
| Distinguish identities from mailboxes: `core/internal/model/entity/account.go`, `mailbox.go`, `role.go` | Supabase user identity separate from mailbox/address/membership records | Two users can share a mailbox; company membership alone does not grant its content |
| Domain/DNS health: `core/internal/service/domains/dns.go`, `domains.go` | Provider domain verification status and clearly explained DNS setup/checks | Correct handling of pending/failed/verified status; no automatic existing-MX replacement |
| Operation history: `core/internal/model/entity/operation_log.go` | Audited actor, action, resource, request ID and immutable send snapshot references | Changes to membership, drafts, send approval and connectors produce attributable events without secret leakage |
| Circuit breaker and metrics: `core/internal/service/batch_mail/task_executor.go` | Rate-limited Resend adapter, durable retry state, unknown-send alerts and queue age metrics | Provider outages defer work without losing intent or duplicating accepted mail |
| Deliverability visibility: `core/internal/service/maillog_stat/maillog_stat.go` | Deduplicated provider-event projections with explicit submitted/delivered/bounced meanings | Out-of-order or duplicate events do not regress state; delivery is never labeled as human reading |
| Contact/consent separation: `core/internal/service/database_initialization/batch_mail.go` | Later marketing module with consent evidence and organization-scoped suppression | Opt-out blocks new dispatch; imports cannot invent consent; current release remains a company mailbox |
| Editor and UI test scope: `core/frontend/src/features/EmailEditor` and adjacent tests | New React composer supporting safe content and versioned drafts | Rendering, attachment permissions, stale draft conflicts and no unauthorized send via connector |

Explicit rejection targets are the combined mail-host runtime, Docker/host-management routes, custom JWT implementation, certificate-verification bypass, in-memory ownership assumptions, Vue dependency bundle, warmup/IP-management feature set and AI-generation stack as a substitute for MCP. These decisions limit maintenance effort and retain the selected Resend/Supabase responsibility split.

## Contribution to our goals

| Goal | Contribution and remaining gap |
| --- | --- |
| R01: ten-person company mailbox | Teaches account/mailbox separation and operations; does not supply the proposed collaboration/permission model |
| R02: Resend | Clarifies which conventional mail-host responsibilities Resend replaces; no selected provider code reuse |
| R03: self-hosted Supabase | PostgreSQL design comparison only; schema/Auth/RLS/private Storage must be designed independently |
| R04: web subdomain | Web administration reference, not the chosen React company-inbox implementation |
| R05: Mac and Windows downloads | No validated desktop distribution from this audit; use one frontend/backend and separately tested Tauri packaging |
| R06: Claude/Codex connectors | Existing AI model calls are not connectors; new scoped MCP adapter required |
| R07: efficient compute | Avoid duplicated SMTP/IMAP/filter/host-control infrastructure; benchmark the smaller proposed service set |
| R08: architecture/database tutorial | Demonstrates data plane versus administration, transport versus mailbox storage, and identity versus mail address |
| R09: Codex CLI/repository update | Evidence is documented in the requested repository; upstream authorship and license remain intact |
| R10: source intake and strict documentation | Reference snapshot, original license, omission record, scores and no-integration boundary are explicit |

For the design lesson, trace a sent message through API authorization, durable PostgreSQL intent, Resend transport and provider-event reconciliation. Then compare that path with Postfix/Dovecot/host administration above. The first avoids operating a public mail server; it still requires reliable application state, secure access and recoverable backups. See [mail delivery and hosting](../mail-delivery-and-hosting.md), [architecture](../architecture.md) and [database tutorial](../backend-database-tutorial.md).
