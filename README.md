# Outreach Mailroom

A Gmail-style workspace for consent-based email outreach: one unified inbox across nine sender identities, a floating composer, campaigns, contacts, and settings.

This repository currently contains a **frontend-only interactive prototype**. There is no backend. All data is fictional and lives in the browser; sending, scheduling, and domain verification are simulated and labelled as such in the UI. Nothing here connects to Resend, Gmail, or DNS.

## Current state

- Frontend prototype complete on `feature/frontend-prototype`: Overview, Activity, Mail, Compose, Campaigns (list, detail, creation flow), Contacts (table, detail panel, CSV import), Settings (appearance, sender identities, notifications, sending and unsubscribe, account), global search.
- Checks passing in Docker: ESLint, `tsc`, 101 unit/component tests (99% line coverage on `src/domain`), production build (177 KB gzipped initial JS), 27 Playwright e2e tests across desktop (1440px) and mobile (390px).
- Visual QA done from e2e screenshots of the main desktop and mobile flows.
- Adversarial code review recorded in `code-reviews.md`: 57 defects found, 56 fixed, 1 deferred.
- Known deviation: star, archive, draft, settings, contact, and campaign edits write to the store directly instead of going through `MailroomGateway` (deferred review finding; awaiting a decision).
- Not started: backend, real Resend integration, authentication, deployment.

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
docker build -t outreach-mailroom-check .
docker run --rm outreach-mailroom-check          # lint, typecheck, unit, build, e2e
```

Individual scripts: `npm run lint`, `typecheck`, `test`, `build`, `e2e`, or `check` for all of them.

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

## Future Resend integration points

Everything a backend will own goes through `MailroomGateway` in `src/data/ports.ts`. Replace `mockGateway` in `src/data/gateway.ts`; features and UI stay as they are.

| Port / area | Future backend behaviour |
|---|---|
| `load()` | Fetch threads, contacts, campaigns, events, identities, settings from our API. |
| `sendMessage(draft)` | Our API calls Resend `emails.send` with the chosen identity, signature, optional banner, and (for campaign mail) the unsubscribe footer and `List-Unsubscribe` header. |
| `setCampaignStatus` | Start, pause, resume as API calls; the server records the lifecycle event. |
| `runCampaignBatch` | Removed: a server-side scheduler owns pacing, sending windows, and follow-ups. |
| `createCampaign`, `importContacts` | API calls; the server re-checks suppression and consent. |
| Event log (`ActivityEvent`) | Fed by Resend webhooks: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, plus our unsubscribe endpoint. |
| Inbound mail (threads) | Resend inbound webhooks, matched to threads server-side. |
| Domain status | Resend domains API. |
| Store mutations (star, archive, settings) | Become PATCH calls with optimistic updates. |
| Message bodies | Inbound HTML will need server-side sanitising; the prototype renders a safe markdown subset only. |

## Planning documents

- `.planning/STANDARDS.md` — approved engineering standards
- `documentation.md` — product context, decisions, open questions
- `state.md` — current status and next steps
- `code-reviews.md` — review coverage and findings
- `AGENTS.md` — instructions for implementation agents
