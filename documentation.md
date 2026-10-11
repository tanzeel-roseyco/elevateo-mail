# Product requirements and decision record

Design date: 2026-10-11. This document supersedes the earlier planning assumption of 18 connected outreach mailboxes. It does not erase the original requirement for consent-based sending.

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

The current source-intake request explicitly authorizes collecting all six codebases in this repository. See [source inventory](third_party/README.md), [independent dossiers](docs/reference-repositories/README.md) and [goals](docs/goals-and-traceability.md). Archival source import is complete; runtime integration remains future work.

## Product boundary

The first release is a company mailroom: named addresses, shared conversations, assignment, team status, per-user read state, composer, drafts, search, attachments and audit history. Individual mailbox permissions allow private addresses where required. Ten users do not imply ten paid email accounts or ten servers; people, addresses, mailboxes and provider identities are separate concepts.

Company correspondence must meet the provider's rules. Marketing sequences are a later, explicitly scoped module with consent evidence, unsubscribe and dispatch-time suppression. The original ambition to resemble Instantly/Smartlead informs workflow quality; Resend is not an approved transport for unsolicited cold outreach. See the [current provider constraints](docs/mail-delivery-and-hosting.md).

This is an API-based mailbox product. Full Gmail/Outlook history synchronization, conventional IMAP access from Apple Mail, calendars, contacts synchronization and federation are not implied by the first release. Add Gmail/Graph adapters later if existing account history becomes a requirement. Do not move existing company MX records to Resend until that migration is separately designed and tested.

## Decision status

| Decision | State | Rationale |
| --- | --- | --- |
| Resend + self-hosted Supabase | User selected | Explicit current instruction |
| Company mailbox + web + Mac + Windows + AI connectors | User requested | Current product direction |
| Strict TypeScript / React-Vite / Node / Tauri 2 | Recommended, approval pending | Greenfield repository; shared contracts and UI with few runtimes |
| PostgreSQL job queue, separate API and worker | Recommended, approval pending | One durable source of truth; API restarts must not lose jobs |
| VPS, Docker Compose, reverse proxy, off-host backups | Recommended, approval pending | Small fixed team; operational ownership must be deliberate |
| Resend stable send/receive APIs, not private-beta Inboxes | Recommended | Avoid availability and response-shape dependency on limited beta |
| MCP read/search/draft first; human-controlled sending | Recommended | Enforce permissions and prevent email content from granting actions |
| Best-of reuse by selective adaptation | Recommended | Audited foundations need reliability/security fixes; no blind merge |
| Engineering standards | Draft, not approved | Existing explicit repository gate remains in effect |

## Proposed permissions

Organization roles: owner, administrator, member. Mailbox roles: viewer, contributor, sender. A membership in the organization does not automatically disclose every mailbox. Administrator can manage access, but reading content requires mailbox membership; access changes are audited. Emergency access must be explicit, temporary and visible.

Viewers can read approved content; contributors can draft, assign and label; senders can finalize a reviewed draft for dispatch. Connector grants intersect the user's current mailbox permissions and granted scopes, and can never increase them. A connector with `drafts:write` cannot issue a send request.

## Working assumptions, not settled facts

Start with one company, 10 staff and a few shared addresses on a new receiving subdomain. Use online-first clients and the smallest useful service set. The old figure of 18 addresses is not confirmed. No actual company domain, provider account, budget, message volume, storage growth, data residency, legal retention, SSO vendor or continuity target is assumed known.

Before deployment, resolve the actual addresses and existing MX provider, new-address versus migration scope, ordinary correspondence versus marketing, peak inbound/outbound volume and attachment sizes, region, backup retention and who owns server maintenance. These questions do not block designing or reviewing the system. They do block safe DNS migration and final capacity/SLA commitments.

## Design artifacts

The architecture contains C4-style context/container views and trust boundaries. The database tutorial contains the conceptual ER model and constraints. Contracts document route shapes, transaction boundaries and state transitions. The implementation plan turns them into measurable milestones. Each remains a proposal until its approval/implementation status changes explicitly.
