# cold-cli — independent source dossier

**Disposition: preserve as an MIT-licensed reference snapshot; selectively port scheduling rules, parsing behavior and regression cases under the local-completion brief and engineering baseline. Do not embed its executable as Elevateo's mail backend.** Its strength is a focused sequence engine and unusually useful behavioral tests. It does not supply the shared company-mailbox application requested for ten people.

## Identity, provenance and audit boundary

| Field | Recorded value |
| --- | --- |
| Upstream | [andersmyrmel/cold-cli](https://github.com/andersmyrmel/cold-cli) |
| Audited commit | [`041c834156e873a897f19fcf9b5e040896e39d1d`](https://github.com/andersmyrmel/cold-cli/tree/041c834156e873a897f19fcf9b5e040896e39d1d) |
| Commit date | 2026-10-06 |
| Local source snapshot | [third_party/upstream/cold-cli](../../third_party/upstream/cold-cli) |
| License | [MIT, copyright 2026 Anders Myrmel](../../third_party/upstream/cold-cli/LICENSE); preserve the notice in copied/adapted portions |
| Size in original inventory | 80 tracked files; 71 selected source files; 34,097 selected source lines; 35 paths classified as test files |
| Inventory limitations | Heuristic source/test counts describe repository shape; they are not coverage percentages or counts of reviewed lines |
| Overall audited score | **59/100**, reuse value **8/10** |
| Audit evidence | [Scorecards](../research/audit-scorecards.json), [immutable pins](../research/repository-pins.json) |

This document distinguishes source inspection, prior executable verification, proposed adaptation and work not performed. No upstream software was executed during source intake. Previous test observations apply only to this pin and the earlier local audit environment. The seven-dimension scores retain the original outreach-product rubric; product fit 5/10 is not a fresh score for today's company-mailbox scope. Component scores are separate judgments, not another term in the weighted total. The total is `sum(score × weight) / 10`, rounded half up.

## Architecture and data flow

The executable uses Go/Cobra commands, an exported `pkg/engine` facade and a largely flat `internal` package. SQLite is the default; a PostgreSQL implementation shares much of the SQL through a dialect-aware store. Google/Gmail access is delegated to a `gws` subprocess. Separate SMTP and IMAP adapters connect conventional mail hosts. Neither provider family is Resend.

```text
Operator / coding agent
  → Cobra command validation, preview or activation
  → campaign + lead + account records
  → eagerly materialized scheduled_sends
  → CLI tick ownership lock
  → reply / bounce polling → cancellation / suppression decisions
  → due-row selection + template rendering + account budgets
  → gws or SMTP send
  → sent row, events and email-message snapshots
```

Eager scheduling makes planned work inspectable before execution. Rebalancing shares an account's budget between campaigns, keeps a lead's sequence on one sender and respects local send windows. These are valuable invariants, but the product remains campaign-oriented: its email rows reference campaigns and leads rather than a general company conversation with participant and mailbox membership boundaries.

The architecture is small in runtime count. Its `cmd/cold-cli/main.go` was 2,953 lines and `internal/campaign.go` 2,150 at the audit pin, indicating substantial command/domain concentration. Adding an HTTP wrapper would not create tenant authorization, safe parallel worker ownership or a desktop app.

## Module map and ownership

| Module / verified source path | Responsibility | Elevateo disposition |
| --- | --- | --- |
| [cmd/cold-cli/main.go](../../third_party/upstream/cold-cli/cmd/cold-cli/main.go) | Cobra commands, operator output and outer tick lock | Keep as reference. Elevateo uses typed API contracts and its own authorization |
| [pkg/engine/engine.go](../../third_party/upstream/cold-cli/pkg/engine/engine.go) | Public wrappers for campaigns, tick and inbox operations | Learn narrow interfaces; do not assume wrappers enforce ownership |
| [internal/db.go](../../third_party/upstream/cold-cli/internal/db.go), [store.go](../../third_party/upstream/cold-cli/internal/store.go), [sql_runner.go](../../third_party/upstream/cold-cli/internal/sql_runner.go) | Schema bootstrap, backend selection, lock lifetime and SQL rebinding | Replace with versioned PostgreSQL migrations and explicit transaction boundaries |
| [internal/scheduler.go](../../third_party/upstream/cold-cli/internal/scheduler.go) | ComputeSchedule, RebalancePendingSchedules, account budgets, timezones | Highest-value behavioral port for later scheduling; do not import its table schema wholesale |
| [internal/campaign_preflight.go](../../third_party/upstream/cold-cli/internal/campaign_preflight.go) | Duplicate/history/suppression and recipient gate | Adapt only organization-scoped permission and policy checks |
| [internal/tick.go](../../third_party/upstream/cold-cli/internal/tick.go) | Poll, choose due work, render, send, record and pace | Rewrite orchestration around durable jobs/attempts; preserve useful tests |
| [internal/gws.go](../../third_party/upstream/cold-cli/internal/gws.go), [smtp.go](../../third_party/upstream/cold-cli/internal/smtp.go), [imap.go](../../third_party/upstream/cold-cli/internal/imap.go) | External-provider adapters | Reference only; initial provider is a new Resend adapter |
| [internal/send.go](../../third_party/upstream/cold-cli/internal/send.go), [reply.go](../../third_party/upstream/cold-cli/internal/reply.go), [email_message.go](../../third_party/upstream/cold-cli/internal/email_message.go) | Message construction, threading, reply/bounce classification and snapshots | Port narrow parsing/normalization cases only after reviewing edge cases |
| [internal/template.go](../../third_party/upstream/cold-cli/internal/template.go), [csv.go](../../third_party/upstream/cold-cli/internal/csv.go) | Placeholder aliases, unresolved values, CSV validation/BOM handling | Candidate utility behavior; strict validation before approval instead of silent content changes |
| [internal/secrets.go](../../third_party/upstream/cold-cli/internal/secrets.go) | `env:` and opaque `secret:` references with injected resolution | Adopt the reference-versus-secret separation; never expose server credentials to clients |
| [internal/inbox_needs_reply.go](../../third_party/upstream/cold-cli/internal/inbox_needs_reply.go), [inbox_audit.go](../../third_party/upstream/cold-cli/internal/inbox_audit.go) | Provider-verified review queues | Model evidence freshness; rebuild for mailbox permission scopes and incoming Resend events |

## Scores

| Dimension | Weight | Score / 10 |
| --- | ---: | ---: |
| Architecture | 15% | 7 |
| Code maintainability | 15% | 7 |
| Security / permissions | 20% | 5 |
| Sending / data reliability | 20% | 5 |
| Product fit | 10% | 5 |
| Tests / verification | 10% | 8 |
| Operations | 10% | 5 |

| Component | Score / 10 | Assessment and pinned evidence |
| --- | ---: | --- |
| Scheduling and preflight | 8 | Eager plans, shared rebalance logic, previews and template validation are excellent behavioral references. [internal/scheduler.go:1](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/scheduler.go#L1) |
| Send transport | 6 | Provider interfaces and secret references are useful; acceptance and database state still have a crash gap. [internal/tick.go:308](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/tick.go#L308) |
| Locking and concurrency | 6 | SQLite file locks and Postgres advisory locks protect the CLI tick; public library consumers need explicit locking. [internal/store.go:204](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/store.go#L204) |
| Reply and bounce processing | 7 | Per-account reply cursors, overlap and deduplication exist; polling failure does not stop outbound sends. [internal/reply.go:156](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/reply.go#L156) |
| Data model | 7 | Dialect-aware store, indexed send ledger and event history; no application user/role system. [internal/db.go:1](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/db.go#L1) |
| Security and governance | 4 | Secret references and workspace checks help operators; no shared application identity, approval or immutable audit boundary. [internal/secrets.go:1](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/secrets.go#L1) |
| CLI and integration facade | 8 | Machine-friendly commands and engine facade are useful for operations and controlled adapters. [pkg/engine/engine.go:103](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/pkg/engine/engine.go#L103) |
| Team UI | 0 | No web UI or 10-person collaboration layer in this repository. [README.md:1](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/README.md#L1) |
| Operations and tests | 7 | Substantial behavioral test suite; cron-based deployment and no tracked CI workflow at this commit. [internal/tick_test.go:1](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/tick_test.go#L1) |


## Subsystem assessment

**Database.** `accounts` and `campaigns` have `workspace_id`; `campaign_accounts` and `campaign_leads` provide associations. `scheduled_sends` holds assigned sender, step, variant, due time and threading fields. `events` supplies historical counts; `email_messages` stores inbound/outbound content; `manual_reply_attempts` adds a unique idempotency key for a separate manual-reply flow; `kv` stores support state. Pending-send and account/day indexes are useful references. A good mechanism in manual replies must not be assumed to exist in the campaign tick: the latter still has finding C1. The startup schema/ALTER approach is not Elevateo's proposed versioned migration process. SQLite concurrency tests cannot validate PostgreSQL RLS, lease races or transaction-pool behavior.

**Authentication and permissions.** This is a local operator CLI. Explicit workspace ownership checks prevent accidental mixing but do not authenticate an end user. The upstream design deliberately searches preflight contact history across workspaces by default; that behavior must not expose another company's contacts in an online service. Elevateo will use Supabase Auth plus current organization and per-mailbox authorization and RLS defense in depth. A CLI process's filesystem and environment access is not a suitable permission model for ten web users.

**Queue and transport.** The CLI obtains an SQLite file lock or PostgreSQL advisory lock on a dedicated connection. PostgreSQL session locking requires a stable connection; the upstream README cautions against a transaction-pooled URL for tick. The exported `Tick` does not acquire the lock itself. Resend jobs should instead have atomic per-job ownership, immutable snapshots and a durable attempt record before external I/O. A lease is not a cure for an ambiguous accepted send: expiration must trigger reconciliation, not unconditional resending. Per-provider rate budgets replace a sleep shared across all senders.

**Inbox and UI.** Reply matching, deduplication, bounce handling and stored content are useful references. There is no web interface, shared assignment system, per-user read state, Tauri shell or signed installer. The separate provider-verified needs-reply queue can fail closed, while the main campaign tick logs polling failures and continues; these behaviors must not be conflated.

**AI and connectors.** The README describes coding-agent-friendly CLI usage. That is not an authenticated Claude/Codex MCP connector or an AI authorization system. Elevateo's proposed connector exposes scoped search/read/draft tools to the existing API, checks current mailbox membership and never gains sending rights from email text. No generic shell-execution tool will wrap this CLI.

**Dependencies and operations.** [go.mod](../../third_party/upstream/cold-cli/go.mod) declares Go 1.25.3, Cobra 1.10.2, pgx/v5 5.9.2, modernc SQLite 1.46.1, go-imap 1.2.1 and yaml.v3 3.0.1. These are snapshot facts, not recommendations to pin future Elevateo dependencies. `go.sum` provides module checksums. A Go vulnerability scan was not recorded; absence of an advisory report is not evidence of no vulnerabilities. Cron/operator deployment and secret-reference injection are understandable, but no tracked CI workflow was found at this pin. SQLite on each desktop would fragment the shared company mailbox; the proposal keeps one server-side PostgreSQL database.

## Findings, confidence and required corrections

| ID / severity | Evidence and failure mode | Confidence / verification | Required response before any equivalent is shipped |
| --- | --- | --- | --- |
| C1 / High | [tick.go:308](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/tick.go#L308) calls the provider before [row update and event insert at 324](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/tick.go#L324). Database failure can leave accepted mail pending and records inconsistent | Source-confirmed control flow; crash scenario not exercised end to end | Persist attempt before I/O; retain `unknown`; reconcile accepted mail; transactionally record final state, audit and outbox |
| C2 / Medium | [tick.go:381](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/tick.go#L381) sleeps 90–140 seconds between sends across accounts | Source-confirmed; roughly 26–40 sends/hour is a code-derived upper pacing range before latency, not a benchmark | Per-provider/account rate allocation and bounded concurrency. Earlier 500–2,000/day assumptions are not current requirements |
| C3 / Medium | [engine.go:103](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/pkg/engine/engine.go#L103) delegates without the [store lock](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/store.go#L204) acquired by the [CLI](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/cmd/cold-cli/main.go#L1817) | Source-confirmed API mismatch; no parallel hosted exploit/probe performed | Ownership must be part of the worker contract; test two workers against real PostgreSQL |
| C4 / Medium | [tick.go:93](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/tick.go#L93) logs polling failures, then reaches [sending](https://github.com/andersmyrmel/cold-cli/blob/041c834156e873a897f19fcf9b5e040896e39d1d/internal/tick.go#L177) | Source-confirmed; stale-inbox send not exercised end to end | Alert on ingestion lag; gate automated follow-ups on freshness and final suppression checks; make any override explicit and audited |

These are institutional-readiness risks, not claims of a demonstrated production compromise. Ten users reduce capacity needs but do not remove duplicate-send, authorization or history-integrity requirements.

## Verification ledger

| Check | Prior audit result | Limits |
| --- | --- | --- |
| `go test ./...` | All three packages passed: `cmd/cold-cli` (69.341s), `internal` (2.767s), `pkg/engine` (2.076s) | Earlier local Go 1.25.3 run; not rerun during source intake and not a Docker application acceptance run |
| Source inspection | Schema, locks, tick flow, adapters, secret references and regression-test locations inspected | Not every line independently reviewed |
| Real-provider sending/receiving | Not performed | No mailbox credentials or external email side effects |
| Production PostgreSQL concurrency/RLS | Not performed | SQLite and mocked seams do not prove hosted isolation |
| Crash-after-provider-acceptance probe | Not performed for cold-cli | C1 remains supported by source analysis |
| Web/native UI, accessibility and installer verification | Not applicable to supplied CLI | All must be built and tested for Elevateo |
| Dependency vulnerability scan | No recorded Go scan | Reassess only dependencies selected for actual application integration |

## Exact adaptation candidates and acceptance gates

The following are **proposed ports**, not code already integrated. The full snapshot is available now for traceability. Any copied or translated implementation must retain MIT attribution and an entry identifying source commit/path, destination, changed behavior and regression evidence.

| Candidate | Source and existing behavioral tests | Target design / acceptance gate |
| --- | --- | --- |
| Deterministic schedule allocation | `internal/scheduler.go` and `internal/scheduler_test.go` | Optional future scheduling module, pure TypeScript functions. Verify timezone/DST boundaries, shared sender budgets and preview-versus-dispatch agreement |
| Budget and same-sender invariants | `internal/tick_test.go`: `TestTick_DailyLimitEnforcement`, `TestTick_DailyLimitTimezone`, `TestTick_Step1BackfillsThreadID`, `TestTick_RebalancesFollowUpsFromActualSentTime` | Express invariants as PostgreSQL-backed tests around Elevateo's jobs/attempts, not its original tick implementation |
| Reply deduplication and bounce distinction | `internal/reply.go`, `internal/reply_test.go`: `TestProcessReplies_Dedup`, `TestProcessReplies_GmailDSNClassifiedAsBounce`; `internal/tick_test.go`: `TestTick_DSNClassifiedAsBounceNotReply` | Resend event/import pipeline. Duplicate event IDs cannot duplicate messages; DSNs cannot be misclassified as human replies |
| Template/CSV validation behavior | `internal/template.go`, `internal/template_test.go`, `internal/csv.go`, `internal/csv_test.go` | Later permitted marketing import/composer tools. Surface invalid fields before immutable approval; do not silently strip meaningful approved content at dispatch |
| Preflight distinction between duplicates and suppression | `internal/campaign_preflight.go`, `internal/campaign_preflight_test.go` | Later consent-based campaigns only. Organization-scoped history, mailbox authorization and dispatch-time suppression; verification does not establish consent |
| Secret-reference abstraction | `internal/secrets.go` | Server-side credential references resolved by worker configuration. Tests prove client output/logs contain no provider secrets |
| Provider interface test discipline | `internal/gws.go`, `internal/tick_test.go` | Fake Resend provider with deterministic accepted/failed/ambiguous outcomes; real database transactions and no live email tests by default |

Reject direct reuse of CLI-wide mutable state as application authorization, the global tick sleep, send-before-attempt flow, startup schema mutation and Gmail subprocess runtime as launch dependencies. These replacements are required even if a smaller wrapper looks faster initially.

## Contribution to our goals

| Goal | Contribution and unresolved work |
| --- | --- |
| R01: ten-person company mailbox | Scheduling/inbox behavior only; users, assignments, private mailboxes and per-user read state are new work |
| R02: Resend | Provider-interface lessons; a new send/receive/webhook adapter is required |
| R03: self-hosted Supabase | PostgreSQL concepts only; no Supabase Auth, RLS or private Storage integration supplied |
| R04: web subdomain | No reusable web application; build the proposed React/API surface |
| R05: Mac and Windows downloads | CLI binary is not the requested desktop mailbox; Tauri packaging remains separate |
| R06: Claude/Codex connectors | Command clarity informs MCP contracts; scoped and revocable connector access is new work |
| R07: efficient compute | Small core and database-first scheduling are useful; do not run one CLI/database per staff member |
| R08: architecture/database tutorial | Study eager plans, transaction gaps and locks alongside [the tutorial](../backend-database-tutorial.md) |
| R09: Codex CLI and repository update | This dossier records evidence for reviewed coding work; it does not claim this source was written by Codex |
| R10: source intake and strict documentation | Pinned source, original license, scores, risks and adaptation map are retained; no production integration is implied |

The learning exercise is to move one database transition across the provider call in C1 and explain why no placement alone creates exactly-once email. The solution needs a durable attempt identity, provider-aware deduplication/reconciliation and honest uncertainty—not just a larger SQL transaction. See [reliability contracts](../contracts-and-reliability.md).
