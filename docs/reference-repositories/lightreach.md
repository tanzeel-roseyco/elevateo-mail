# lightreach — independent repository dossier

Target-architecture update (2026-10-12): historical source findings below are unchanged. Elevateo destination suggestions are superseded by the current [adoption matrix](../component-adoption.md) and [polyglot proposal](../../.planning/POLYGLOT_ARCHITECTURE.md): Rails domain/API/worker, TypeScript UI/MCP, Mac Rust/Tauri and C# Windows. Required named opinions remain pending.

Review date: 2026-10-11. Classification: **reference source; not an Elevateo runtime dependency**.

## Identity, license and intake boundary

- Upstream: https://github.com/nahumoore/lightreach
- Audited and archived commit: `c0723a25dbcc1b19ec4bdbd0f882de31ace2df87` (2026-07-23).
- License: **MIT**, copyright © 2026 Nahuel Moreno. Preserve the license and copyright in every copied or substantially adapted component; examine any file-specific third-party notices as well.
- Local source: [complete pinned reference snapshot](../../third_party/upstream/lightreach/); [license](../../third_party/upstream/lightreach/LICENSE).
- Audit inventory: 175 tracked files; 97 selected source files; 13,913 selected source lines. The audit heuristic found zero behavioral test files and no tracked CI workflows. Counts are heuristic source metrics, not a completeness/security guarantee.
- Intake preserves upstream source, configuration and lockfiles for examination. It does not install dependencies, start SMTP/IMAP, grant MCP access or declare those dependencies approved for Elevateo.

The upstream [AGENTS.md](../../third_party/upstream/lightreach/AGENTS.md) routes to [CLAUDE.md](../../third_party/upstream/lightreach/CLAUDE.md). That handbook explicitly describes a single-user product, future authentication and one persistent web process. Those are useful facts about upstream; its implementation instructions do not govern Elevateo’s source archive or override our architecture.

## What this project actually supplies

Lightreach is a compact self-hosted outreach application: SMTP connections, IMAP collection, lead import, multistep sequences, campaigns, schedules, analytics and an MCP interface. It has a recognizable inbox and useful pure TypeScript helpers. It is not a ten-person shared mailbox with individual permissions, personal read state or organizational isolation.

The strongest contribution is understandable small components. The weakest boundaries are identity, incoming HTML and crash recovery. It should inform our React interface and narrowly scoped utilities after adaptation; copying its complete web server would import the defects below.

## Architecture and dataflow

```text
Browser → Next server components / server actions → Drizzle → SQLite WAL
                                                     ↑
Next Node instrumentation → timer scheduler → SMTP transport → Internet
                          → timer inbox poller → IMAP → inbound_emails
MCP HTTP route → global bearer check → tools → shared actions / database
```

`packages/core`, `packages/db` and `packages/ui` provide useful separation by responsibility. The deployment boundary remains a single Node web process: `apps/web/instrumentation.ts` starts both timers. Database persistence survives a process restart, but the background execution ownership and ambiguous-send recovery do not become durable merely because SQLite is durable. An external cron replacing the timer alone would not fix those invariants.

### Verified module map

| Source location | Responsibility | Elevateo disposition |
| --- | --- | --- |
| [apps/web/app](../../third_party/upstream/lightreach/apps/web/app/) | Next pages, server actions and MCP HTTP endpoint | UI behavior reference; rewrite requests against authorized Node API |
| [apps/web/instrumentation.ts](../../third_party/upstream/lightreach/apps/web/instrumentation.ts) | Starts scheduler/poller on web process boot | Do not port; explicit separate worker process |
| [apps/web/lib/scheduler.ts](../../third_party/upstream/lightreach/apps/web/lib/scheduler.ts) | Claim rows, choose connections, check windows/caps, render and send | Failure-case reference; new durable PostgreSQL jobs |
| [apps/web/lib/enqueue-leads.ts](../../third_party/upstream/lightreach/apps/web/lib/enqueue-leads.ts) | Adds campaign step-one work for new leads | Deferred campaign reference, not mailbox MVP |
| [apps/web/lib/inbox-poller.ts](../../third_party/upstream/lightreach/apps/web/lib/inbox-poller.ts) | IMAP collection, threading/reply and bounce classification | Threading cases useful; baseline Resend inbound importer replaces polling |
| [packages/core/src](../../third_party/upstream/lightreach/packages/core/src/) | Variables, CSV, encryption, rotation and mail helpers | Review functions individually; no wholesale package import |
| [packages/db/src/schema.ts](../../third_party/upstream/lightreach/packages/db/src/schema.ts) | SQLite tables/types | Entity comparison only; new Supabase PostgreSQL schema |
| [packages/db/drizzle](../../third_party/upstream/lightreach/packages/db/drizzle/) | Versioned SQLite migration history | Migration discipline reference; not runnable against Supabase |
| [packages/ui/src/components](../../third_party/upstream/lightreach/packages/ui/src/components/) | Typed visual primitives and shared shell | Candidate selective adaptation after accessibility/notice review |
| [apps/web/lib/mcp](../../third_party/upstream/lightreach/apps/web/lib/mcp/) | Tool registration, global-token auth, redaction | Tool ergonomics reference; new grants and API boundary |
| [Dockerfile](../../third_party/upstream/lightreach/Dockerfile), [docker-compose.yml](../../third_party/upstream/lightreach/docker-compose.yml) | One web server, migration step, persistent SQLite volume | Operations reference only; cannot host proposed stack unchanged |

## Database and ownership analysis

The schema models ten tables: `connections`, `lists`, `leads`, `sequences`, `sequence_steps`, `campaigns`, `campaign_connections`, `messages`, `inbound_emails`, `app_settings`. A connection combines a sending identity, SMTP secret, optional IMAP settings, daily limit, status and poll tracking. Campaigns associate a list with a sequence and connections. The `messages` row acts as both send work and delivery history.

`inbound_emails` has threading headers and a unique `(connection_id, uid)` index. It stores `isRead` on the message row, making read/unread global across everyone using the instance. Upstream also keeps the connection’s IMAP UIDVALIDITY and duplicate markers; an IMAP extension would need to test validity resets and cross-mailbox duplicates deliberately. It is not a replacement for Resend event identity.

Missing for our company-mailbox model are organization membership, explicit mailbox membership, per-user conversation state, immutable draft versions, provider events, a distinct send-attempt ledger, scoped connector grants and accountable audit events. These are schema changes, not a new login page. The planned Supabase schema must enforce organization/mailbox relationships with constraints, RLS and API authorization. A “Supabase URL” substituted into the SQLite client would not migrate this design.

## Identity, secrets and authorization

There is no application user authentication in the inspected baseline. Server actions read/write shared rows without establishing an actor. SMTP passwords are encrypted with Node AES-256-GCM under an environment key; this is useful at-rest separation from the SQLite file but does not create authorization, rotation, key versioning or an audited secret-management process.

MCP uses a constant-time bearer comparison and refuses a missing token, which are positive local details. However, the token can be revealed or rotated through unprotected web actions. One shared token is not a ten-user access model. `redactConnection` removes the two known encrypted password fields; a future added secret field would not automatically be removed. Elevateo response DTOs should explicitly allow permitted fields.

## Sending, receiving and UI analysis

The SMTP transport enables mandatory STARTTLS when implicit TLS is off and specifies connection/greeting/socket timeouts. It strips line breaks from the sender display name and carries threading headers. Those intentions should become Resend adapter tests; the adapter must follow Resend’s supported contract rather than emulating arbitrary SMTP settings. Upstream’s cold-outreach footer and warming assumptions are not our consent or provider-policy design.

The scheduler has a process-local reentrancy guard and conditional claims. On first tick it unconditionally puts every `sending` row back to `queued`. Network success followed by a crash before result persistence can therefore send twice. Elevateo needs separate attempts, stable request identity, a persisted uncertain outcome and provider-aware reconciliation, not that startup reset.

The inbox combines received content with outbound history using message headers and fallback matching. Useful UX includes quote folding, categories and connection selection. The UI is still single-user: assignment, private mailbox access, competing drafts and personal read state need independent design. Quote extraction is a presentation helper, not HTML sanitization. Incoming HTML must pass an allowlist sanitizer and isolated sandboxed renderer before display, with remote assets blocked by default.

## MCP and desktop implications

The pinned MCP implementation registers lists, leads, sequences, connections, campaigns, messages, inbox, settings and stats. In particular, `apps/web/lib/mcp/tools/inbox.ts` exposes `reply_to_email`, which directly calls a sending action. That authority is excluded from the initial Elevateo connector. Our read/search/draft connector must call the same authorized API as the UI, intersect current user mailbox permissions with a revocable grant, redact response fields and audit tool use. Incoming email is untrusted data, never permission to invoke another tool.

No macOS or Windows native shell is supplied. Only portable React primitives are candidates for our proposed Tauri UI. Next server actions, the SQLite driver and SMTP secrets must remain outside the desktop bundle. All clients should share the company backend instead of each laptop running a scheduler and database.

## Independent scorecard

These are the 2026-10-11 audit judgments for the earlier outreach brief. Product fit is not a new score for Elevateo’s company-mailbox requirements. Each dimension is 0–10; the total is `sum(score × percentage weight) / 10`, rounded half up. Reuse value is distinct from production readiness.

| Dimension | Weight | Score /10 | Why |
| --- | ---: | ---: | --- |
| Architecture | 15% | 6 | Clear packages, but web and background execution share one process. |
| Code maintainability | 15% | 6 | Strict TypeScript and small helpers; several feature views still hold many responsibilities. |
| Security / permissions | 20% | 2 | No web identity; raw incoming HTML and exposed token administration. |
| Sending / data reliability | 20% | 3 | Process guard is useful, but startup requeue loses send outcome certainty. |
| Product fit | 10% | 6 | Compact outreach features; this is the earlier outreach-fit score, not shared-mailbox readiness. |
| Tests / verification | 10% | 2 | Typechecks pass; no behavioral suite or tracked CI found. |
| Operations | 10% | 3 | Documented one-process deployment; no demonstrated recovery/restore or independent worker failover. |

**Weighted total: 39/100. Reuse value: 5/10.**

### All nine component assessments

| Component | Score /10 | Assessment | Pinned source evidence |
| --- | ---: | --- | --- |
| App shell and UI primitives | 7 | Reusable typed components and a compact feature set; useful as design/component references. | [packages/ui/src/components/button.tsx:1](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/packages/ui/src/components/button.tsx#L1) |
| Leads and sequences | 6 | CSV mapping, variables and spintax are useful; need stricter input and global-suppression policies. | [packages/core/src/variables.ts:12](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/packages/core/src/variables.ts#L12) |
| Scheduler and retries | 3 | Serial guard and conditional claims help within one process; restart blindly requeues all sending rows. | [apps/web/lib/scheduler.ts:112](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/apps/web/lib/scheduler.ts#L112) |
| SMTP transport | 6 | Explicit STARTTLS requirement, timeouts and header cleanup are positive. | [packages/core/src/email/transport.ts:107](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/packages/core/src/email/transport.ts#L107) |
| IMAP/inbox | 3 | Reply matching and duplicate handling exist, but raw incoming HTML reaches the DOM. | [apps/web/app/(dashboard)/inbox/inbox-view.tsx:322](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/apps/web/app/%28dashboard%29/inbox/inbox-view.tsx#L322) |
| Data storage | 5 | SQLite WAL is reasonable for a local tool; shared ownership, roles and durable attempt identity are absent. | [packages/db/src/client.ts:13](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/packages/db/src/client.ts#L13) |
| Identity/MCP | 1 | MCP checks a bearer token, but unauthenticated server actions can reveal/rotate that token. | [apps/web/app/(dashboard)/mcp/actions.ts:23](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/apps/web/app/%28dashboard%29/mcp/actions.ts#L23) |
| Deployment | 3 | Documented one-process deployment; no safe active/active or independent worker failover. | [CLAUDE.md:183](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/CLAUDE.md#L183) |
| Tests | 2 | Typechecks pass; no existing behavioral test suite found. A parser probe confirms unsafe attributes survive. | [packages/core/src/email/quote.ts:87](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/packages/core/src/email/quote.ts#L87) |

## Dependencies, operations and actual checks

| Area | Pinned-source observation | What was actually verified |
| --- | --- | --- |
| Web | Next `16.2.6`, React `19.2.4`, MCP SDK range `^1.29.0` | Direct TypeScript checks passed for web/core/db/ui |
| Core | Nodemailer, IMAPFlow, Mailparser, Papa Parse, Zod | Source review of transport/parsing; no live SMTP/IMAP acceptance test |
| Data | better-sqlite3, Drizzle, SQLite WAL | Client/schema inspected; no production migration/backup restore drill |
| Build tooling | pnpm `10.33.4`, Turborepo, TypeScript | Initial wrapper check hit local Corepack cache/sandbox failure; direct compiler checks then passed |
| Behavioral tests | None found under the audit’s tracked-file heuristic | One external audit parser probe retained an unsafe HTML event attribute |
| Dependency scan | pnpm metadata: 123 records: 4 critical, 53 high, 60 moderate, 6 low | Snapshot advisory metadata, not 123 distinct exploitable vulnerabilities |
| Deployment | Persistent Node process; named SQLite volume; optional reverse proxy documented | No internet deployment, load test, UI exploitation test or native package test |

The pnpm record format can repeat advisory paths and differs from npm output. Counts include the scanned dependency tree and cannot be compared directly with another repository’s npm totals. They are not a new current advisory scan and do not establish reachable exploitability. A real port needs a fresh lockfile and dependency review for the selected files only.

The carried-forward [scorecards](../research/audit-scorecards.json) retain check outcomes. No upstream execution or dependency installation was performed for this source-intake dossier. Upstream test absence was established by the earlier bounded search; it is not a claim to prove no test exists anywhere outside the pin.
## Findings and verification boundaries

Severity describes the potential consequence in a deployed application. Source-confirmed findings are not claims that a live installation was exploited. No production provider account was used.

### L1 — High: No web authentication; MCP token management is unprotected

The handbook explicitly defers auth. Web server actions perform writes without user checks, including revealing and rotating the MCP token. The bearer check on /api/mcp does not protect the surrounding application.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end.

**Required treatment:** Add central identity/session enforcement to every read and action, server-side role checks, and authenticated token administration.

**Source:** [CLAUDE.md:147](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/CLAUDE.md#L147); [apps/web/app/(dashboard)/mcp/actions.ts:23](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/apps/web/app/%28dashboard%29/mcp/actions.ts#L23); [apps/web/app/api/mcp/route.ts:16](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/apps/web/app/api/mcp/route.ts#L16).

### L2 — High: Stored HTML injection through incoming email

IMAP data is persisted as bodyHtml, quote splitting preserves markup and event attributes, and the inbox renders the result with dangerouslySetInnerHTML. A crafted incoming message can reach an active HTML sink when a user opens it.

**Evidence level:** Source-confirmed plus pure parser reproduction; browser execution not tested.

**Required treatment:** Sanitise all email HTML and render in a sandboxed isolated frame; block remote assets by default.

**Source:** [apps/web/lib/inbox-poller.ts:431](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/apps/web/lib/inbox-poller.ts#L431); [packages/core/src/email/quote.ts:87](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/packages/core/src/email/quote.ts#L87); [apps/web/app/(dashboard)/inbox/inbox-view.tsx:322](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/apps/web/app/%28dashboard%29/inbox/inbox-view.tsx#L322).

### L3 — High: Restart can resend an already accepted message

Startup changes every sending row back to queued, without lease age or provider reconciliation. A crash after SMTP acceptance but before sent persistence causes a duplicate on restart.

**Evidence level:** Source-confirmed; failure scenario not exercised end to end.

**Required treatment:** Keep a stable attempt identity and unknown outcome state; reconcile before retrying and never globally reset in-flight rows.

**Source:** [apps/web/lib/scheduler.ts:112](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/apps/web/lib/scheduler.ts#L112); [apps/web/lib/scheduler.ts:454](https://github.com/nahumoore/lightreach/blob/c0723a25dbcc1b19ec4bdbd0f882de31ace2df87/apps/web/lib/scheduler.ts#L454).

## Exact component decisions and prerequisites

All destinations below are **proposed**, not files already integrated into the application. The archived source stays unchanged; an adaptation belongs outside `third_party/upstream` and must record source SHA, paths, license, transformations and tests.

| ID | Exact upstream source | Decision / proposed target | Required change and acceptance proof |
| --- | --- | --- | --- |
| L-PORT-01 | [packages/core/src/variables.ts](../../third_party/upstream/lightreach/packages/core/src/variables.ts) | Candidate adaptation → `packages/domain/src/templates/variables.ts` | Limit template/input length; use own-property or Map lookup; define missing/fallback semantics; escape per rendering context. Test mixed case, blank, fallback, inherited-key and HTML values. Do not label this a sanitizer. |
| L-PORT-02 | [packages/core/src/csv.ts](../../third_party/upstream/lightreach/packages/core/src/csv.ts) | Deferred contact-import adaptation → `packages/domain/src/contacts/import.ts` | File/row/column limits, duplicate headers/contacts, malformed address errors and row-level feedback. Consent is independent of valid email syntax. Keep formula-safe exports a separate boundary. |
| L-PORT-03 | [packages/core/src/email/quote.ts](../../third_party/upstream/lightreach/packages/core/src/email/quote.ts) | Candidate quote-boundary reference → `packages/domain/src/mail/quote-boundaries.ts` | Prefer plain-text first; sanitize every HTML fragment at the render boundary. Test malformed/nested HTML, multilingual separators, empty content and the retained-event-attribute regression. Never use regex tag stripping as a security control. |
| L-PORT-04 | [packages/ui/src/components/button.tsx](../../third_party/upstream/lightreach/packages/ui/src/components/button.tsx), [packages/ui/src/components/sidebar.tsx](../../third_party/upstream/lightreach/packages/ui/src/components/sidebar.tsx) | Selective React design/component candidates → `packages/ui` | Audit embedded notices and actual needed dependencies; accessible focus/keyboard/reduced-motion behavior; responsive web and native-shell UI verification. Avoid importing the whole UI tree by default. |
| L-PORT-05 | [apps/web/lib/mcp/server.ts](../../third_party/upstream/lightreach/apps/web/lib/mcp/server.ts), [apps/web/lib/mcp/tools/inbox.ts](../../third_party/upstream/lightreach/apps/web/lib/mcp/tools/inbox.ts) | Tool catalog reference → `apps/mcp` | Rewrite handlers to authorized Node API, scoped grants and revocation. No direct SQL, shared global token or sending tool. Prove two users cannot cross mailbox boundaries. |
| L-PORT-06 | [apps/web/lib/mcp/redact.ts](../../third_party/upstream/lightreach/apps/web/lib/mcp/redact.ts) | Redaction intention → `packages/contracts` | Explicit output allowlist instead of subtracting today’s secret columns; future secret field must remain absent in API/MCP responses. |
| L-PORT-07 | [packages/core/src/email/transport.ts](../../third_party/upstream/lightreach/packages/core/src/email/transport.ts) | Behavior reference only → `packages/providers/src/resend` | New Resend implementation with stable request identity, timeout handling and typed errors; no Nodemailer/SMTP credential table required for initial release. |
| L-REPLACE-01 | [apps/web/lib/scheduler.ts](../../third_party/upstream/lightreach/apps/web/lib/scheduler.ts), [packages/db/src/schema.ts](../../third_party/upstream/lightreach/packages/db/src/schema.ts) | Do not port execution/schema → PostgreSQL worker and migrations | Real Postgres concurrency tests; persist attempt before I/O; reconcile unknown sends; per-user read state and mailbox-scoped foreign keys/RLS. |

## Traceability to our goals

| Requirement | Contribution | Gap / mandatory delivery evidence |
| --- | --- | --- |
| R01 — about 10 company users | Inbox/composer interaction examples | New users, mailbox grants, assignments, per-user read state and draft conflict tests |
| R02 — Resend | Transport separation and mail-header examples | New Resend adapter and authenticated/deduplicated receive events; no automatic SMTP substitution |
| R03 — self-hosted Supabase | Small explicit schema and versioned migrations | PostgreSQL schema, Auth/RLS, private Storage and actual restore test |
| R04 — web subdomain | React components and responsive shell references | Authorized API, TLS/origin controls and validated email rendering |
| R05 — Mac/Windows downloads | Portable React primitives | Tauri integration and separate target-OS signing/install/update tests |
| R06 — Claude/Codex | MCP tool registration ergonomics | Per-user scoped grants; search/read/draft only; integration tests in both clients |
| R07 — efficient compute | Compact feature set; one application codebase | Separate API/worker, durable jobs and measured Supabase/VPS capacity |
| R08 — architecture/database tutorial | Concrete example of single-user assumptions becoming schema constraints | Explain why durable rows differ from reliable execution and why read state belongs to membership |
| R09 — Codex CLI/repository update | Pinned source available for code-assisted comparison | CLI workflow and remote publication evidence remain project-level records |
| R10 — comprehensive source intake | Full pinned reference snapshot plus this component/finding dossier | Preserve manifest/hash/license; no runtime adoption implied by archival presence |

## Release gates derived from this review

1. Deny every unauthorized web and connector read/write, including token administration.
2. A malicious incoming message cannot execute script, load remote assets automatically or invoke connectors.
3. A provider-accepted send followed by worker failure enters reconciliation; restart does not blindly resend.
4. One user marking a thread read does not alter another user’s read state; assignments are separate shared state.
5. Selected utilities have their own regressions, current dependencies and attribution; upstream typecheck counts do not transfer to Elevateo.
6. Application tests run inside the project’s required Docker workflow, with real PostgreSQL isolation/locking tests and platform UI/package checks before release.

**Disposition:** keep the entire snapshot as reference; consider the small components above after review; replace identity, persistence, queue ownership, provider integration and content security. The 39/100 score does not disqualify every function, and a good function does not make the whole application deployable.
