# Product requirements and decision record

Design date: 2026-10-11; expanded planning revision: 2026-10-12. This document supersedes the earlier planning assumption of 18 connected outreach mailboxes. It does not erase the original requirement for consent-based sending.

Execution update 2026-10-12: the user has directed autonomous local completion. Initial exact-model consultations succeeded on base `103baeb0`; results are under `.planning/consultations/results/initial-plan`. Official Devin MCP has verified repository access and Docker. Application implementation and acceptance remain pending; initial planning opinions do not authorize skipping per-task gates. Message rendering remains text-only under the current conversation's explicit frontend rule. Production activation and live mail remain separate.

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

### Devin credit authorization (2026-10-12)

The user explicitly approved use of existing $10 Devin credit; no purchases or top-ups. BE-01 task design is accepted. Implementation was dispatched from frozen planning commit `5ae9771`. Codex polls at two-minute intervals and pauses at the 30-minute checkpoint or credit/capability loss. Official MCP sleep is verified; the Free account API omits dollar usage and offers no dollar-cap field, so no enforced task dollar cap is claimed.

BE-01 dispatched through official Devin MCP at 2026-10-11T16:34:21Z: session `257567ddf6b743c8b9dad365f52e3f99`, implementation base `5ae9771ad30923a66a2a5ed6aa5d6902d3e439d2`, branch `devin/backend/be-01`. Existing-credit-only $10 approval; no topups. First 30-minute checkpoint at 17:04:21Z. Partial commit 5a9d83ad4de7403f349131bf0c3e45df7fd97c28 is preserved in draft PR #5; no acceptance is claimed. Session suspension verified at 2026-10-11T16:50:37Z; dollar usage remains unavailable.

FE-01 read contract and exact-model synthesis are frozen in .planning/consultations/results/fe-01 and contracts/v1. Docker generation with openapi-typescript 7.13.0 reproduced identical API types; tooling audit reported zero vulnerabilities across 34 packages. This is tooling evidence, not application acceptance. Full frontend/backend integration remains open.


### FE-01 authored checkpoint (2026-10-12)

Fable 5 authored the read-only React client under apps/web. This is an **unaccepted draft checkpoint**, not a completed or deployable application. Session/mailbox/inbox/plaintext-reader code, fixture/HTTP adapters, tests and Docker/browser configurations are present. The core API contract is unchanged. Docker API type regeneration passed, but strict compilation failed on the fixture resolver return union and missing Node declarations; unit diagnostics have three failures; the isolated Vite bundler succeeds. Mandatory lint and actual visual QA have not passed.

Adversarial review covered all non-generated authored files (2,133 unique lines) plus a dedicated design review. Sixteen localized code/test defects, two documentation defects and one lint acceptance gap remain open; see code-reviews.md and docs/evidence/fe01-initial-review. Source/API design is not runtime integration: real Rails session/storage/mailbox behavior and all mutation flows remain pending. Fresh FE-01-R1 consultation and Astra synthesis must precede repair implementation. No mail, live deployment or purchase occurred.


### FE-01 Docker diagnostic results

API regeneration passed. Strict compilation failed on FE-R12 and FE-R15. Unit tests: 63 passed, 3 failed out of 66; all failures are retained DOM from previous SessionProvider tests (FE-R17, missing Testing Library cleanup with Vitest globals disabled and no setup hook). These failures prevent validation of the affected session assertions. The separate diagnostic Vite bundle succeeded (148 modules; JS 373.92 kB / gzip 115.76 kB), but does not constitute a passing production build because typechecking failed. Lint, browser/visual checks and real backend integration remain outstanding. See `docs/evidence/fe01-initial-review/unit-bundle.txt`.

All task test containers were automatically removed. The task-owned Node image (332 MB reported image size) was removed; Docker reports zero containers and zero build cache. Pre-existing Playwright/Python images and nine persistent volumes were preserved. Host free space was only 1.42 GB after cleanup; virtual-disk reclaim remains under investigation, so no host-space recovery is claimed.
