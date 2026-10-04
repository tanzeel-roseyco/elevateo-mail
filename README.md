# Elevateo Mail

A Gmail-style Windows inbox and consent-based campaign application, planned for ten independent users. The current browser prototype demonstrates a unified inbox, floating composer, campaigns, contacts and settings using nine fictional sender identities.

This repository contains the frontend prototype and a credential-free backend foundation in `backend/`. The frontend still uses fictional browser data. Backend dispatch is simulated; live sending, DNS writes and production deployment remain disabled. See [backend setup and contracts](docs/backend-foundation.md).

## Current state

- Product planning: [master plan](docs/product-master-plan.md), [backend blueprint](docs/backend-blueprint.md), [efficiency plan](docs/efficiency-plan.md), [draft standards](.planning/BACKEND-STANDARDS.md) and [research synthesis](docs/research/2026-10-04/README.md) completed as proposals. Six initial and ten follow-up research assignments are complete; the ten ran in waves of up to three children. Backend foundation implementation was explicitly authorised on 2026-10-05; production and desktop decisions remain open.
- Latest requirements: ten private users across Google organisations/personal Gmail, up to ten connected mailboxes each (100 total); Resend opted-in campaigns; maximum 30 outgoing emails per connected mailbox per day. Effective pilot ceiling: 300/user/day and 3,000 total/day. The earlier 600/user/day figure is a later expansion scenario. Aliases share quota; rolling-window/per-recipient counting is proposed. Private Connections will support selected-mailbox AI read/draft access, separately enabled sending, and reviewed DNS changes on explicitly approved subdomains. Preserve company root MX.
- Repository renamed: local directory `C:\Users\Tanzeel\Code and projects\Elevateo Mail`; private remote [tanzeel-roseyco/elevateo-mail](https://github.com/tanzeel-roseyco/elevateo-mail). Product branding changed; existing browser-storage keys are intentionally preserved.
- Proposed stack: existing React + Tauri desktop, Workers/D1/R2/Queues cloud backend, local Codex and restricted Claude fallback. Under A$15 hosting is conditional on measured mailbox/history allowances; external Google approval and AI data-policy review remain launch gates.
- Frontend prototype complete on `feature/frontend-prototype`: Overview, Activity, Mail, Compose, Campaigns (list, detail, creation flow), Contacts (table, detail panel, CSV import), Settings (appearance, sender identities, notifications, sending and unsubscribe, account), global search.
- Fresh checks on 2026-10-04 in Docker: ESLint and typecheck clean, 101 unit/component tests passed (99.69% domain line coverage), production build 176.72 KB gzipped initial JS, Playwright 27 passed / one intentional mobile skip. [Validation and limitations](docs/validation/2026-10-04.md).
- Fresh visual QA: rendered desktop overview and mobile drawer show Elevateo Mail without branding clipping; full browser journeys passed. No native Windows desktop shell exists yet.
- Adversarial review: historical prototype 57 defects, 56 fixed, one deferred; this rename zero defects across 168 reviewed lines. Four planning findings have explicit dispositions in `code-reviews.md`. Dependency audit separately reports three moderate development-tool entries for one Vitest advisory; upgrade remains outstanding.
- Known deviation: star, archive, draft, settings, contact, and campaign edits write to the store directly instead of going through `MailroomGateway` (deferred review finding; awaiting a decision).
- Backend foundation implemented on `feature/backend-foundation`: owner-scoped API and D1 migrations, hashed sessions, durable outbox/quota, fake provider, dormant Gmail/Resend adapters, signed fake events, consent/suppression, AI read/draft scope and manual DNS policy. [Implementation and limitations](docs/backend-foundation.md). Frontend gateway integration, real authentication/OAuth, inbox sync, desktop/CLI bridge and production deployment remain outstanding.
- Backend verification on 2026-10-05: Docker lint, strict typecheck, dry-run Worker bundle and 24 unit/integration/workflow tests pass. Adversarial/design reviews found 12 defects, all fixed; [validation and cleanup](docs/validation/2026-10-05-backend.md). Live sending, DNS and deployment stay disabled.

## Stack

React 19, Vite 7, TypeScript (strict), React Router 7, Zustand, zod, Tailwind CSS 4, Radix dialog primitives, lucide icons. Tests: Vitest + Testing Library, Playwright. Engineering standards: `.planning/STANDARDS.md` (approved 2026-10-01).

## Setup and run

```bash
npm ci
npm run dev        # http://localhost:5173
```

State is stored in `localStorage` (`mailroom:data:v1`, `mailroom:appearance:v1`). Settings → Account → **Reset prototype data** restores the demo dataset.

## Test

All checks run in a container (the image is based on the Playwright image and must match the `@playwright/test` version):

```bash
docker build -t elevateo-mail-check .
docker run --rm elevateo-mail-check          # lint, typecheck, unit, build, e2e
```

Individual scripts: `npm run lint`, `typecheck`, `test`, `build`, `e2e`, or `check` for all of them.

Backend checks (no credentials; all commands run inside Docker):

```bash
docker build -t elevateo-mail-backend-check -f backend/Dockerfile .
docker run --rm elevateo-mail-backend-check
```

Remove the task-owned image and build cache after checks. Backend dependencies and their justification are documented separately; root frontend dependencies are unchanged.

## Deploy

Not deployed. `npm run build` produces a static site in `dist/`; any static host needs an SPA fallback to `index.html`.

## Sitemap and navigation

The left sidebar holds **Compose** and the four main areas; **Settings** is pinned at the bottom. Global search runs across the top. On tablets the sidebar becomes an icon rail; on phones it is a drawer and Compose moves to the top bar.

| Route | Page |
|---|---|
| `/overview?range=&domain=` | Daily summary: alerts, sent / delivered / replies / bounces / unsubscribes, awaiting response, running campaigns, recent activity. Every metric links to its filtered list. |
| `/activity?kind=&range=&domain=&page=` | The event list behind each metric. |
| `/mail/:folder/:threadId?` + `?q=&domain=&identity=&campaign=&unread=` | Unified inbox. Folders: inbox, starred, sent, drafts, archive, spam, trash. List or split-pane reading. |
| `/campaigns?q=&status=` | Campaign list. |
| `/campaigns/new?step=` | Creation flow: details → recipients → message → schedule → review. |
| `/campaigns/:id/:tab?` + `?status=&page=` | Detail tabs: overview, recipients, emails, replies, activity, settings. |
| `/contacts?q=&status=&page=&contact=` | Contact table; `contact` opens the detail panel. |
| `/contacts/import` | CSV import with preview and validation. |
| `/settings/:section` | appearance, identities, notifications, sending, account. |
| `/search?q=` | Grouped results for messages, contacts, campaigns. |

Filters, the open conversation, tabs, and the wizard step are URL state, so browser back/forward and direct links work, and list filters survive opening and closing a conversation.

## Architecture sketch

```
src/
  domain/    Pure rules and zod schemas. No React. (send validation, suppression, mail views,
             event queries, CSV import, colour contrast, rich-text parsing)
  data/      ports.ts      MailroomGateway interface: the backend seam
             mockGateway   in-browser implementation with simulated latency and failures
             store.ts      Zustand client cache + validated localStorage persistence
             seed.ts       deterministic fictional dataset (840 contacts, 6 campaigns)
  app/       Router (sitemap), shell, sidebar, global search, notifications, appearance
  features/  overview/ mail/ compose/ campaigns/ contacts/ settings/ search/
  ui/        Reusable components: Button, Badge, Field, Modal, toast, confirm, Bits
  styles/    Design tokens as CSS variables mapped into the Tailwind theme
```

Dependencies point inward: `features → data → domain`. Design tokens are CSS custom properties, which is what lets theme, accent, background, and density change at runtime.

## Mocked features

- **Sending**: "Simulate send" writes the message to local state and logs sent + delivered events. No email leaves the browser. Recipients at `@fail.test` trigger a simulated provider failure.
- **Receiving**: inbound mail is seed data; no new mail arrives.
- **Campaign scheduling**: status changes are local. "Simulate next batch" stands in for one sending day.
- **Delivery, bounce, reply, unsubscribe events**: seed data plus simulated sends.
- **Domain verification (SPF / DKIM / DMARC)**: static mock values; flooda.co DKIM is "pending" to demonstrate the alert.
- **Attachments**: file name and size only; nothing is uploaded or downloadable.
- **CSV import**: parsed and validated in the browser.
- **Account and security actions**: shown disabled and labelled as prototype features.
- **Load failure**: open any URL with `?simulate=load-error` to see the error state.
- **Campaign wizard**: form state is in memory; reloading mid-flow restarts it.

## Future backend integration points

`MailroomGateway` in `src/data/ports.ts` is the intended seam. Many current edits still bypass it; move them behind the gateway and update pending/error/conflict UI before replacing `mockGateway`. The real backend also requires pagination, multi-label mail and dynamic verified identities.

| Port / area | Future backend behaviour |
|---|---|
| `load()` | Replace whole-state loading with paginated API lists and message detail calls. |
| `sendMessage(draft)` | API validates approval, ownership, consent and mailbox/user quotas; records a durable intent; calls Resend for eligible opted-in campaigns or Gmail for authorised personal mail. Unknown outcomes require safe reconciliation. |
| `setCampaignStatus` | Start, pause, resume as API calls; the server records the lifecycle event. |
| `runCampaignBatch` | Removed: a server-side scheduler owns pacing, sending windows, and follow-ups. |
| `createCampaign`, `importContacts` | API calls; the server re-checks suppression and consent. |
| Event log (`ActivityEvent`) | Fed by Resend webhooks: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, plus our unsubscribe endpoint. |
| Inbound mail (threads) | Authorised Google history sync and notifications, with durable ingestion, reply matching and recovery. Optional app-subdomain receiving is separate future scope. Preserve company root MX. |
| Domain status | Resend domains API. |
| Store mutations (star, archive, settings) | Become PATCH calls with optimistic updates. |
| Message bodies | Inbound HTML will need server-side sanitising; the prototype renders a safe markdown subset only. |

## Planning documents

- `docs/product-master-plan.md` — plain-English product/stack plan, diagrams, budget and section-specific decisions
- `docs/backend-blueprint.md` — data ownership, sending/recovery rules, API direction, operations and build gates
- `docs/efficiency-plan.md` — cost worksheet, workload bounds and performance targets
- `docs/connections/README.md` — private provider connections, AI permissions and approved-subdomain DNS design
- `.planning/BACKEND-STANDARDS.md` — proposed backend/desktop standards, awaiting approval
- `docs/research/2026-10-04/README.md` — research evidence, disagreements and practical conclusions
- `docs/desktop-agent-planning.md` — earlier desktop, CLI, and hosting discussion
- `.planning/STANDARDS.md` — approved engineering standards
- `documentation.md` — product context, decisions, open questions
- `state.md` — current status and next steps
- `code-reviews.md` — review coverage and findings
- `AGENTS.md` — instructions for implementation agents
