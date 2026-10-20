# EmailGuard replica — web UI (2026-10-20)

Task `task_d036e44f6d3d` (Orca dispatch `ctx_ac10b2621dde`). The web app in `apps/web` was rebuilt as a
close replica of the EmailGuard web application's design system, layout, components, settings area
and help centre, with exactly two branding exceptions: the Elevateo logo and a gold accent in place
of blue. The inbox keeps Gmail structure and behaviour (handoff `INBOX-SPEC.md`) styled with the
EmailGuard tokens (`DESIGN-SPEC.md`). Backend and contracts are unchanged.

## Scope boundaries

- No billing, plans, credits or payments anywhere in the UI.
- No EmailGuard branding or verbatim help prose; all help copy is original Elevateo text.
- Plaintext-only message rendering is preserved (`bodyHtml` is never rendered).
- Real gateway, consent and authorization rules are untouched. Settings the backend does not own
  (workspace name, invitations, tags, API tokens, webhooks, password) are **simulated UI adapters**:
  every such page shows the callout "Simulated UI adapter: not saved on the server" and stores in
  `localStorage` under `elevateo.settings.<name>.<actorId>.<orgId>` (`features/settings/simulatedStore.ts`).
  No API was added and no server persistence is claimed.
- System font stack (not Figtree). `grep -rE "blue-|sky-" apps/web/src` is empty.

## Design tokens (`apps/web/src/styles/index.css`)

Zinc neutrals as in the reference; gold scale 50–950 with `--color-accent` gold-500 `#c9a24e`,
`--color-accent-content` gold-700 `#86682d` (gold text on white: 5.2:1 AA) and
`--color-accent-foreground` slate-950 (dark text on gold fills: 8.4:1 AA). Focus ring gold-600, 2px.
Touch devices: 40px nav rows, 44px header controls (`@media (pointer: coarse)`).

## Route inventory

| Area | Route | Component | States |
| --- | --- | --- | --- |
| Dashboard | `/` | `DashboardPage` | loading skeletons, empty mailboxes, failed count (`—`/`12+`), failed conversations, Outreach unavailable |
| Dashboard | `/overview` | redirect to `/` | |
| Inbox | `/inbox` | `InboxRedirect` → first readable mailbox | loading, none |
| Inbox | `/mailboxes/:mailboxId` | `InboxLayout` + `InboxPage` (Gmail list, folders, selection toolbar, u/c/`/` shortcuts) | loading, empty folder, unavailable, write error |
| Inbox | `/mailboxes/:mailboxId/threads/:threadId` | `ThreadPage` (plaintext) | loading, not found, denied |
| Inbox | `/mailboxes/:mailboxId/drafts` | `DraftsPage` | loading, empty, error |
| Inbox | `/mailboxes/:mailboxId/drafts/:draftId` | `DraftsPage` + `ComposeWindow`(`DraftEditorPage`) | loading, error, minimised/maximised |
| Send | `/mailboxes/:mailboxId/drafts/:draftId/send-review` | `SendReviewPage` | loading, denied, failure |
| Send | `/mailboxes/:mailboxId/send-intents/:sendId` | `SendStatusPage` | loading, unknown, failed |
| Members | `/mailboxes/:mailboxId/members` | `MembersPage` | loading, empty, denied |
| Search | `/search` | `SearchPage` | idle, loading, empty, error |
| Contacts | `/people` | `AdministrationPage section="people"` | loading, empty, error |
| Outreach | `/outreach/campaigns`, `/outreach/campaigns/new`, `/outreach/campaigns/:campaignId`, `…/sequence`, `…/leads`, `…/leads/:leadId`, `…/accounts`, `…/accounts/:accountId`, `…/analytics`, `…/runs`, `/outreach/leads`, `/outreach/accounts`, `/outreach/analytics` | outreach feature module | unavailable (no Outreach API), loading, empty, error |
| Settings | `/settings` → `/settings/workspace` | `SettingsLayout` hub (5 link cards) | |
| Settings | `/settings/workspace/name`, `…/invite`, `…/invitations`, `…/create` | simulated adapters | validation, capacity refusal, empty |
| Settings | `/settings/workspace/members` | real mailboxes + organization grants | loading, empty, error |
| Settings | `/settings/profile`, `…/personal-details` (real display name), `…/password` (simulated) | | loading, denied, per-field errors |
| Settings | `/settings/tags` | simulated, 20-swatch modal | empty, capacity |
| Settings | `/settings/developer-api` | API reference link, Postman v2.1 download (`public/developer/elevateo-mail.postman_collection.json`, rebuilt from contracts by `lib/postmanCollection.ts`), white-label contact card, simulated tokens with one-time reveal | empty, capacity |
| Settings | `/settings/webhooks`, `…/create` | simulated, https-only | empty, capacity, per-control errors |
| Settings | `/settings/integrations`, `…/:slug` (`mcp`, `cli`) | static | not found |
| Settings | `/settings/personal`, `/settings/organization` | legacy redirects | |
| Help | `/help`, `/help/search?q=`, `/help/collections/:slug`, `/help/articles/:slug`, `/help/community` | help centre (10 collections, 28 articles, Copy for LLM) | empty search, not found |
| Fallback | `*` | redirect to `/` | |

Sidebar order (by team importance): Dashboard · Mail (Inbox, mailboxes, Search) · Outreach ·
Contacts (People) · Administration (Settings, Help). "Get Help" menu: Live Chat · Help Centre · Community.

## Review disposition (2026-10-20)

All coordinator checklist items in `code-reviews.md` were applied in source with regression tests
(`settings/settingsAdapters.test.tsx`, `ui/primitives.test.tsx`, `inbox/starStore.test.ts`,
`app/Shell.test.tsx`). Adjudicated without change: `GlobeAltIcon` is the Heroicons 24/outline
`globe-alt` path verbatim (two meridian arcs, one upper latitude, no lower latitude line); the Radix
Modal already restores focus to the opener for controlled trigger-less dialogs.

## Verification

Builds and tests run only in fleet-02 Docker (`mcr.microsoft.com/playwright:v1.56.0-noble`) under the
shared lock; results, screenshot paths and residual blockers are recorded in `state.md` and the
coordinator report for this task.
