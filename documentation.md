# Product requirements and decision record

## Current execution status

Imported accepted Rowan ADV807, Nadia ADV806 and Elara ADV808 proof sources after immutable **3bf323c**. Permanent GUI-before-HTTP restoration, baseline Auth lifetime and opt-in policy wiring are source accepted by ADV821/822; candidate runtime NOT_RUN. Soren's separate immutable 3bf R12 is untouched: supervisor reports four actual core GUI cases and 16 screenshots, final immutable receipt/manual Mira review pending. Observer OFF; BE02 unaccepted; BE03 closed.

R9 c8 backend390/5792 and frontend624/all eight gates PASS retain original provenance. R10 c3 browser compilation/image and authenticated HTTP1/33/worker drain passed, but seed failed before GUI. R11 confirmed `fresh_auth_fixture_required` with pre-seed Auth count1; both diagnostics cleanup/independent absence passed. These failures remain historical evidence, not new-source test results.

F2 durable recovery remains OPEN: accepted reload loses newer memory-only buffer/operation while the committed server version survives. No durable local recovery, warning or ledger proof is inferred.

See [provenance](docs/completion/int401-current-freeze-provenance.json), [R12 handoff](docs/completion/int401-r12-setup-handoff.md), [history](docs/completion/int401-status-history-20261014.md) and [milestones](docs/completion/int401-remaining-milestones.md). Root owns acceptance and the actual vault; Cassian mirrors it; Soren alone schedules fleet Docker. Authority `task_1b0410b27785 / ctx_746eda601ef7`.

Design date: 2026-10-11; expanded planning revision: 2026-10-12. Current scoped decisions override older planning assumptions; consent-based sending remains required.

## Confirmed by the user

| ID | Requirement | Acceptance evidence at implementation |
| --- | --- | --- |
| R01 | Shared company mailbox for about 10 people | Two simultaneous users can read and work the same thread with distinct permissions/read state |
| R02 | Resend for email transport | Verified domain, authenticated inbound webhook, provider test events and controlled end-to-end send/reply |
| R03 | Self-hosted Supabase | Repeatable production Compose deployment, Auth, schema/RLS tests, private attachments and restore drill |
| R04 | Web application at a subdomain | HTTPS URL, authentication and authorized mailbox operations in supported browsers |
| R05 | Downloadable Mac and Windows clients | Install, login, logout and update validation on macOS and Windows; signed distribution artifacts |
| R06 | Claude and Codex connectors | Both clients complete authorized mailbox search/read/draft tests; cross-mailbox access denied |
| R07 | Efficient compute and resource use | Measure CPU/RAM/disk/queue age on representative workload before choosing final server size |
| R08 | Teach backend, system and database design, including CAP | Worked examples, ER model, failure cases and exercises in the tutorial |
| R09 | Use the user's Codex CLI and update this repository | CLI-authored tutorial and source tooling reviewed; Git commit and remote update verified |
| R10 | Upload all six repositories or select their best components and document them strictly | Pinned source files, complete file manifests, preserved notices, six independent dossiers and adoption/goal traceability |
| R11 | Give the next agent a local frontend reuse prompt and end-to-end local completion instructions; leave credentials last | LOCAL_BUILD_PROMPT.md and local completion plan; future implementation evidence must cover real local services, simulated transport, UI, connectors, desktop and final activation inputs |
| R12 | Codex research first; Astra MAX designs with separate Fable 5, Opus 5.5 and Fable 5.1 opinions on each task; Devin backend branches/PRs/issues and Astra LOW fixes | Evidence ledger, actual execution identities, accepted synthesis, reviewed task/fix PRs and no invented consultation results |
| R13 | Fit requested languages/frameworks to useful boundaries; reuse major projects and evaluate brick/math | Polyglot matrix, pinned/license-aware adoption decisions, one domain authority and conformance tests; no gratuitous services |
| R14 | C# Windows GUI, Java Android APK, SwiftUI iOS and suitable desktop/mobile alternatives | Separate platform artifacts and target-runtime evidence; Qt/Ionic/Electron assessed as alternatives |
| R15 | Distinct in-app Codex and Claude/Fable CLI connectors | Supported authentication/protocols, fixed-executable adapters, stream/cancel/approval tests and enforced tool/data scopes |
| R16 | Opus 5.5 owns all C++ and motion design; use Anime.js for web polish | Actual assignment identity, accessible reduced-motion behavior and measured browser/native evidence |
| R17 | Nine addresses across one or two domains; user Resend CLI; future computer-use connection to Instantly; no live sends | Inventory distinguishes aliases; read-only CLI discovery; separate account-connection and warmup gates; warmup stays disabled until no-live-send constraint explicitly changes |

The current source-intake request explicitly authorizes collecting all six codebases in this repository. See [source inventory](third_party/README.md), [independent dossiers](docs/reference-repositories/README.md) and [goals](docs/goals-and-traceability.md). Archival source import is complete; integrated application source now exists, with runtime acceptance pending as recorded above.

## Product boundary

The first release is a company mailroom: named addresses, shared conversations, assignment, team status, per-user read state, composer, drafts, search, attachments and audit history. Individual mailbox permissions allow private addresses where required. Ten users do not imply ten paid email accounts or ten servers; people, addresses, mailboxes and provider identities are separate concepts.

Company correspondence must meet the provider's rules. Marketing sequences are a later, explicitly scoped module with consent evidence, unsubscribe and dispatch-time suppression. The original ambition to resemble Instantly/Smartlead informs workflow quality; Resend is not an approved transport for unsolicited cold outreach. See the [current provider constraints](docs/mail-delivery-and-hosting.md).

This is an API-based mailbox product. Full Gmail/Outlook history synchronization, conventional IMAP access from Apple Mail, calendars, contacts synchronization and federation are not implied by the first release. Add Gmail/Graph adapters later if existing account history becomes a requirement. Do not move existing company MX records to Resend until that migration is separately designed and tested.

## Decision status

| Decision | State | Rationale |
| --- | --- | --- |
| Resend + self-hosted Supabase | User selected | Explicit current instruction |
| Company mailbox + web + Mac + Windows + AI connectors | User requested | Current product direction |
| Rails API/worker; React/TypeScript; Rust/Tauri Mac; C# Windows | Accepted local direction under ADR 0002; per-task gates remain | One domain authority and versioned cross-language contracts; inspect existing first-party work first |
| PostgreSQL job queue, separate API and worker | Working defaults for scoped local completion | One durable source of truth; API restarts must not lose jobs |
| VPS, Docker Compose, reverse proxy, off-host backups | Recommended, approval pending | Small fixed team; operational ownership must be deliberate |
| Resend stable send/receive APIs, not private-beta Inboxes | Recommended | Avoid availability and response-shape dependency on limited beta |
| MCP read/search/draft first; human-controlled sending | Recommended | Enforce permissions and prevent email content from granting actions |
| Best-of reuse by selective adaptation | Recommended | Audited foundations need reliability/security fixes; no blind merge |
| Engineering standards | Local engineering baseline; production decisions open | 2026-10-12 local-completion instruction supersedes the blanket wait within that scope; no blanket approval claimed |
| Expanded orchestration/language/client plans | Requested workflow documented; implementation pending | Follow .planning/README.md and ADR 0002; initial exact-model opinions and synthesis completed; BE-01 partial draft #5 unaccepted; FE-01 read checkpoint synthesis accepted |

## Proposed permissions

Organization roles: owner, administrator, member. Mailbox roles: viewer, contributor, sender. A membership in the organization does not automatically disclose every mailbox. Administrator can manage access, but reading content requires mailbox membership; access changes are audited. Emergency access must be explicit, temporary and visible.

Viewers can read approved content; contributors can draft, assign and label; senders can finalize a reviewed draft for dispatch. Connector grants intersect the user's current mailbox permissions and granted scopes, and can never increase them. A connector with `drafts:write` cannot issue a send request.

## Working assumptions, not settled facts

Start with one company, about 10 staff and nine addresses across one or two domains. Actual inbox/alias mapping and receiving routes remain unknown. Use online-first clients and the smallest useful service set. The old figure of 18 addresses is superseded. No actual company domain, provider account, budget, message volume, storage growth, data residency, legal retention, SSO vendor or continuity target is assumed known.

Before deployment, resolve the actual addresses and existing MX provider, new-address versus migration scope, ordinary correspondence versus marketing, peak inbound/outbound volume and attachment sizes, region, backup retention and who owns server maintenance. These questions do not block designing or reviewing the system. They do block safe DNS migration and final capacity/SLA commitments.

## Design artifacts

The architecture contains C4-style context/container views and trust boundaries. The database tutorial contains the conceptual ER model and constraints. Contracts document route shapes, transaction boundaries and state transitions. [The local agent prompt](LOCAL_BUILD_PROMPT.md) and [completion plan](docs/local-completion-plan.md) now define the bounded execution path before credentials; the release plan describes later live gates. These documents are not evidence of implemented features. The [expanded planning index](.planning/README.md) now governs research, exact agent routing, language ownership, later mobile targets and no-live-send activation. Application credentials stay last; implementation-agent authentication is a separate prerequisite.

R12 evidence clarification: supervisor reported four core flows and16 screenshots; isolated conflict/revocation failed with causes not preserved by reporter. Whole GUI remains unaccepted; next candidate runtime NOT_RUN.
