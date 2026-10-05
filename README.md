# Elevateo Mail

A Gmail-style inbox and consent-based campaign application planned for web, Windows and macOS, for ten independent users. The current browser prototype demonstrates a unified inbox, floating composer, campaigns, contacts and settings using nine fictional sender identities.

This repository currently contains a **frontend-only interactive prototype**. There is no backend. All data is fictional and lives in the browser; sending, scheduling, and domain verification are simulated and labelled as such in the UI. Nothing here connects to Resend, Gmail, or DNS.

## Current state

- **Backend integration milestone, 5 October 2026 (committed locally, not pushed, not deployed):** a second build, `npm run build:api`, talks to the real backend foundation through an explicit HTTP adapter and shows no fixture data. One journey works end to end against the backend's simulated provider: load mailboxes, browse paginated messages, open a lazily loaded body, compose, review, approve and track a send request through awaiting approval, queued, sending, accepted, rejected, cancelled and unknown. A lost answer or a reload recovers the same request; nothing is re-sent. Limits, capacity and permissions are the server's. Campaigns, contacts, AI, provider connections, DNS, enrichment and search are shown as unavailable. The demonstration build is unchanged apart from the AI-permission fix (a disconnected or failed mailbox is never readable by the assistant) and reworded permission claims. Docker checks: lint and typecheck clean, 267 unit/component tests, 45 demonstration browser tests (one intentional mobile skip), 20 browser tests against the real backend; initial JS 183.13 KB gzip (demonstration) and 162.68 KB (API). 14 Codex reviewers: 21 confirmed source defects, 16 fixed, 5 open. **The application is not complete**: see [validation and production gates](docs/validation/2026-10-05-backend-integration.md), [contract notes](docs/contracts/integration-v1-frontend-notes.md), [handover](docs/handover/2026-10-05-backend-integration.md), [suggestions and decisions needed](docs/proposals/2026-10-05-integration-suggestions.md) and the [review log](code-reviews.md).
- [Excalidraw agent brief PDF](output/pdf/elevateo-mail-excalidraw-agent-brief.pdf): four copyable prompt pages plus seven actual Fable screenshots across six reference pages. Includes the original PNGs and plain-text prompt as embedded attachments. All ten pages visually verified; no Excalidraw board or application code was created for this document handoff.
- **Branch `design/fable-frontend`, 5 October 2026 (verified, committed locally, not pushed):** gold accent, white light theme, dark-grey dark theme and the transparent logo; sidebar is Overview, Inbox, Campaigns, Contacts, AI Assistant, Connections, Settings. New **Connections** area (Mailboxes, Sending, AI, Enrichment, Domains) and **AI Assistant** preview, all labelled as previews: nothing connects to Google, Resend, an AI, an enrichment service or DNS, and there is nowhere to enter a key. Up to ten mailboxes with per-mailbox usage against 30 a day (displayed, not enforced). Loading, empty, error-with-retry and offline states. Docker checks: lint, typecheck and build passed; 187 unit/component tests; 45 browser tests plus one intentional mobile skip; initial JS 183.23 KB gzip. Eleven Codex review agents found 14 source defects (all fixed) and 16 test weaknesses (all addressed); one design finding deferred. [Validation](docs/validation/2026-10-05-brand-connections.md), [review log](code-reviews.md), [decisions needing approval](docs/proposals/2026-10-05-open-decisions.md), screenshots in `output/fable/`.
- **Earlier on `design/fable-frontend`:** Fable 5.1 designed the Ledger frontend: mailbox switching, visible filters, bulk actions, row Archive, pinned replies, a Next up work queue and clearer campaign progress. Codex review fixes include scoped counts, narrow-screen row wrapping, a 1280px split breakpoint and saved-data migration for the confirmed 30/day configuration ceiling. Actual per-mailbox quota enforcement remains backend work. Final Docker checks: lint/typecheck/build passed, 135 unit/component tests and 29 browser tests passed, one intentional mobile skip; initial JS 180.49 KB gzip. Desktop/mobile/light/dark visual checks are recorded in [validation](docs/validation/2026-10-04-fable.md). [Design report](docs/design/fable-design.md) and previews in `output/fable/`. Earlier PDF/image deliverables are copied into this worktree. Older verification figures below describe the previous branch.
- Distribution scope now includes web plus directly downloadable Windows `.exe` and Mac `.dmg` apps; no store listing is planned. [Distribution PDF addendum](output/pdf/elevateo-mail-distribution-plan.pdf) extends the earlier Windows-focused master PDF. Local CLI AI is initially desktop-only; signed updates, OS-specific checks and separate signing/build costs are planned. No installers or production web app exist yet.
- Reader edition: [10-page master plan PDF](output/pdf/elevateo-mail-master-plan.pdf), [frontend sketch](output/imagegen/elevateo-mail-frontend-sketch.png) and [system design sketch](output/imagegen/elevateo-mail-system-design.png). All PDF pages were rendered and visually inspected. Hunter and AMF provide optional enrichment; AI performs personalisation. Documentation and concept artwork only; no application code changed for this edition.
- Product planning: [master plan](docs/product-master-plan.md), [backend blueprint](docs/backend-blueprint.md), [efficiency plan](docs/efficiency-plan.md), [draft standards](.planning/BACKEND-STANDARDS.md) and [research synthesis](docs/research/2026-10-04/README.md) completed as proposals. Six initial and ten follow-up research assignments are complete; the ten ran in waves of up to three children. No backend implementation approval is recorded.
- Latest requirements: ten private users across Google organisations/personal Gmail, up to ten connected mailboxes each (100 total); Resend opted-in campaigns; maximum 30 outgoing emails per connected mailbox per day. Effective pilot ceiling: 300/user/day and 3,000 total/day. The earlier 600/user/day figure is a later expansion scenario. Aliases share quota; rolling-window/per-recipient counting is proposed. Private Connections will support selected-mailbox AI read/draft access, separately enabled sending, and reviewed DNS changes on explicitly approved subdomains. Preserve company root MX.
- Repository renamed: local directory `C:\Users\Tanzeel\Code and projects\Elevateo Mail`; private remote [tanzeel-roseyco/elevateo-mail](https://github.com/tanzeel-roseyco/elevateo-mail). Product branding changed; existing browser-storage keys are intentionally preserved.
- Proposed stack: existing React + Tauri desktop, Workers/D1/R2/Queues cloud backend, local Codex and restricted Claude fallback. Under A$15 hosting is conditional on measured mailbox/history allowances; external Google approval and AI data-policy review remain launch gates.
- Frontend prototype complete on `feature/frontend-prototype`: Overview, Activity, Mail, Compose, Campaigns (list, detail, creation flow), Contacts (table, detail panel, CSV import), Settings (appearance, sender identities, notifications, sending and unsubscribe, account), global search.
- Fresh checks on 2026-10-04 in Docker: ESLint and typecheck clean, 101 unit/component tests passed (99.69% domain line coverage), production build 176.72 KB gzipped initial JS, Playwright 27 passed / one intentional mobile skip. [Validation and limitations](docs/validation/2026-10-04.md).
- Fresh visual QA: rendered desktop overview and mobile drawer show Elevateo Mail without branding clipping; full browser journeys passed. No native Windows desktop shell exists yet.
- Adversarial review: historical prototype 57 defects, 56 fixed, one deferred; this rename zero defects across 168 reviewed lines. Four planning findings have explicit dispositions in `code-reviews.md`. Dependency audit separately reports three moderate development-tool entries for one Vitest advisory; upgrade remains outstanding.
- Known deviation: star, archive, draft, settings, contact, and campaign edits write to the store directly instead of going through `MailroomGateway` (deferred review finding; awaiting a decision).
- Not started: backend, installed desktop host, local AI/MCP bridge, real Gmail/Resend/self-hosted integration, DNS broker, authentication, deployment. The new limits and permissions are documented, not implemented in the mock app.

## Stack

React 19, Vite 7, TypeScript (strict), React Router 7, Zustand, zod, Tailwind CSS 4, Radix dialog primitives, lucide icons. Tests: Vitest + Testing Library, Playwright. Engineering standards: `.planning/STANDARDS.md` (approved 2026-10-01).

## Setup and run

```bash
npm ci
npm run dev        # http://localhost:5173
```

State is stored in `localStorage` (`mailroom:data:v1`, `mailroom:appearance:v1`). Settings → Account → **Reset prototype data** restores the demo dataset.

API-backed mode is a separate build: `npm run build:api` then `npm run preview:api` (port 4174), with `API_PROXY_TARGET` pointing at a running backend so `/v1` is same-origin. It needs a session token issued by that backend and never falls back to demo data. The supported way to run it is the Docker integration stack below.

## Test

All checks run in a container (the image is based on the Playwright image and must match the `@playwright/test` version):

```bash
docker build -t elevateo-mail-check .
docker run --rm elevateo-mail-check          # lint, typecheck, unit, build, e2e
```

Individual scripts: `npm run lint`, `typecheck`, `test`, `build`, `e2e`, or `check` for all of them.

Browser tests against the real backend (needs the backend worktree beside this one):

```bash
docker build -t elevateo-mail-it-web .
docker build -f integration/server.Dockerfile --build-context harness=integration -t elevateo-mail-it-server "../Elevateo Mail - Backend"
docker compose -f integration/compose.yaml up --abort-on-container-exit --exit-code-from web
docker compose -f integration/compose.yaml down
```

This starts the backend Worker with local D1, synthetic sessions and its durable fake provider, builds the API bundle and runs `e2e-integration/`. No credentials are involved and no real email is sent.

## Deploy

Not deployed. `npm run build` produces a static site in `dist/`; any static host needs an SPA fallback to `index.html`.

## Sitemap and navigation

The left sidebar holds **Compose** and six areas (Overview, Inbox, Campaigns, Contacts, AI Assistant, Connections); **Settings** is pinned at the bottom. Global search runs across the top. On tablets the sidebar becomes an icon rail; on phones it is a drawer and Compose moves to the top bar.

| Route | Page |
|---|---|
| `/overview?range=&domain=` | Daily summary: alerts, sent / delivered / replies / bounces / unsubscribes, awaiting response, running campaigns, recent activity. Every metric links to its filtered list. |
| `/activity?kind=&range=&domain=&page=` | The event list behind each metric. |
| `/mail/:folder/:threadId?` + `?q=&domain=&identity=&campaign=&unread=` | Unified inbox. Folders: inbox, starred, sent, drafts, archive, spam, trash. List or split-pane reading. `domain`/`identity` are the mailbox scope set from the rail (selects on phones) and follow folder links. |
| `/campaigns?q=&status=` | Campaign list. |
| `/campaigns/new?step=` | Creation flow: details → recipients → message → schedule → review. |
| `/campaigns/:id/:tab?` + `?status=&page=` | Detail tabs: overview, recipients, emails, replies, activity, settings. |
| `/contacts?q=&status=&page=&contact=` | Contact table; `contact` opens the detail panel. |
| `/contacts/import` | CSV import with preview and validation. |
| `/assistant` | AI Assistant preview: conversations awaiting a reply in mailboxes the assistant may read; prepares a simulated draft for review. |
| `/connections/:section` | mailboxes, sending, ai, enrichment, domains. All previews; nothing is connected. |
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

- [Master plan PDF](output/pdf/elevateo-mail-master-plan.pdf) — reader edition with the two new concept sketches; confirmed requirements, proposals and unresolved decisions are labelled
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
