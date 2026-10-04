# Fable frontend design report

Branch `design/fable-frontend`. Frontend-only prototype work on the existing mock app. Nothing here sends email, connects a provider, or enforces a quota.

**Verification status: final build passed in Docker on 4 October 2026.** Lint, typecheck, 135 unit/component tests and 29 browser tests passed; one desktop-only split test is intentionally skipped on mobile. Initial JS is 180.49 KB gzip against the 250 KB budget. Final browser screenshots are in `output/fable/`. Evidence and limits: [validation](../validation/2026-10-04-fable.md).

Implementation was delegated to the installed Claude CLI using the verified `claude-fable-5-1` model, then reviewed by Codex agents in small slices. The parent integrated regression and saved-data fixes. No new dependencies were added.

## Verified review fixes

| Finding | Fix | Regression |
|---|---|---|
| Folder badges counted every mailbox while folder links kept the mailbox scope | `MailRail` counts inbox/spam unread and drafts inside the selected `domain`/`identity` scope. Search, unread and campaign filters are ignored because they reset on a folder change | `MailPage.test.tsx`: scoped Inbox and Drafts badges |
| Mailbox label hidden on narrow and split rows, domain-only on desktop | Every row in every layout shows `mailboxLabel`: local part plus the domain's first label, e.g. `l.macdonald@boltloop`. Unique across all nine addresses | `MailPage.test.tsx`: label uniqueness and row text |
| Next up could hide a paused campaign behind draft campaigns | Tasks are grouped by kind and concatenated in fixed priority (reply, paused, running with pending, draft campaigns, message drafts) before the four-item cut | `NextUp.test.tsx`: four drafts stored before one paused |
| Selection contract unclear | Ticks belong to the list as filtered. Any change to the query string (mailbox, search, unread, campaign) or folder clears them. Opening and closing a conversation does not change the query string, so it keeps the ticks and the scroll position | `MailPage.test.tsx`: cleared on mailbox change; kept across open/close |
| Split view too narrow at 1024 | Split now needs 1280px. The list column is 360px there and 420px from 1536, leaving the reader about 460px at 1280. Below 1280 the saved preference is ignored and the toggle is hidden | Browser regression checks 390/1280 row fit and 1024 single-pane fallback; manual split inspection |
| 30 per mailbox per day is a confirmed rule | `DAILY_LIMIT_MAX` is 30 (was 500). The Settings default (was 40), the seeded campaign limit (was 40), all three number inputs and the Overview mailbox table use that one constant. The `AIDEV-QUESTION` is replaced by a resolved note | `domain/boundaries.test.ts` limit test updated from 500 to 30 |

Additional verified fixes:
- Campaign and mailbox metadata wrap without clipping on phone and split rows. The mailbox tooltip exposes the full address.
- A load-only migration accepts previously valid integer limits from 1–500 and clamps values above 30 while preserving other stored data. Invalid limits and unrelated malformed records still fail validation. Twenty-three persistence cases cover migration, preservation and failures.
- The batch test passes with 90 pending recipients across three identities. This remains a simulation, not production quota enforcement.
- Draft search and filtered-neighbour tests now verify actual user input and exact expected navigation.

## Direction: "Ledger"

A calm ink-on-paper workbench rather than a coloured dashboard.

- **Paper and ink.** Warm off-white canvas (`--bg #ecebe6`), white work surface, near-black text, warm hairlines. Dark theme keeps the same structure on charcoal. `--surface` and `--fg` are unchanged because `domain/appearance.ts` and its contrast tests mirror them.
- **Ink for the constant action, accent for state.** Compose is solid ink (`bg-fg`), so it keeps its weight whatever accent the user picks. The accent is reserved for "where am I / what is selected": current nav item, active mailbox, ticked rows, filter chips, unread dot.
- **One accent, now indigo by default** (`#4f46e5`, an existing preset). Saved preferences are untouched; only new or reset profiles see it.
- **Typography carries hierarchy.** System fonts only. Two utilities in `styles/index.css`: `.eyebrow` (11px small caps section label) and `.figure` (tabular, tightened headline numbers). Page titles are 22px; everything operational stays at 13–14px.
- **Squared geometry.** Nav items, chips and buttons use 6–8px radii instead of pills; panels use hairline borders and no shadows. Active nav items get a 3px bar as well as a tint, so the state survives any accent choice.
- **Mailbox markers.** Each sending domain has a small fixed-colour square (`DomainDot`). It is decorative and always sits next to the domain or address in text.
- No new dependencies, fonts, charts, animation loops or polling. One hover transition on the Next up arrow, covered by the existing reduced-motion rule.

## Workflow rationale by section

### Shell and sidebar
Same navigation model and routes. Ink Compose, monogram mark, active bar, unread count as a small tabular badge, and a permanent line: "Prototype · mock data. No email is sent." The mobile top-bar Compose matches. The profile button is now neutral so the top bar has no competing accent block.

### Mail: rail and mailbox switching
- New `MailRail` holds the folder list and, from tablet width up, a **Mailboxes** list: All mailboxes, the three domains with unread inbox counts, and the three addresses of whichever domain is open.
- A mailbox is a **scope**. Rail links set the existing `?domain=` / `?identity=` parameters, so Back, Forward and deep links restore it. Folder links now carry that scope with them (other filters still reset on a folder change). A link with only `?identity=` opens the right domain group.
- Phones keep the two existing selects for domain and address; from `md` up those selects are hidden because the rail replaces them.
- Drafts now respect the mailbox scope as well as the search box.

### Mail: list
- **Filter state is always visible.** Under the controls, one row shows the result count and a removable chip per active filter (mailbox, search, unread, campaign) plus Clear filters. It also shows when a filter leaves zero results.
- **Bulk actions take over that same row.** Ticking any row tints it and swaps the chips for the bulk toolbar (same actions as before, plus Clear selection). Select all stays at the left in both states, so nothing jumps.
- **Rows.** Flat white rows; unread is dot plus weight; each row shows which mailbox received it as marker plus a short label (`lachlan@boltloop`) in every layout. The label hides once the list is narrowed to one address. Inbox rows gain a per-row Archive button on hover or keyboard focus, with the same Undo toast.

### Mail: reader
- **Pinned reply bar.** Reply (primary), Reply all, Forward sit in a footer that never scrolls away, with "Replies go from <address>" so the sender is known before the composer opens.
- **Newer / Older links and "3 of 28"** in the reader toolbar walk the list exactly as filtered and sorted, keeping the query string, so triage does not need the list.
- Message column is capped at `max-w-3xl` for comfortable line length on wide screens.

### Overview
Order is now: alerts (problems) → **Next up** (work) → sending ledger → awaiting / running → mailboxes → recent activity.
- **Next up** (`NextUp.tsx`) is a short ordered queue with one emphasised first item: reply to the person who has waited longest, then paused / running-with-pending / draft campaigns, then unfinished drafts. At most four are shown. Failures and DNS stay in Alerts and are not repeated.
- **Sending ledger.** The five metric cards became one ruled strip with large tabular figures and a rate where it is meaningful (delivered and bounces of sent; replies and unsubscribes of delivered). The rate is omitted when the window makes a part exceed its base. Each cell still links to its filtered Activity list.
- **Mailboxes panel** (`MailboxPanel.tsx`): per address, unread, awaiting reply, and simulated sends today against the 30-per-mailbox pilot limit. Each row opens that mailbox's inbox. The footer states that sends are simulated and the limit is not enforced.

### Campaigns list
- Status filters show counts (portfolio counts, independent of the search box).
- The table now answers "how far along and is it working": progress bar with processed-of-total and percent, replies with reply rate of delivered, sender domain under the name.
- No horizontal scroll: Next action shows from `xl`, Replies from `md`, and on phones the status badge moves under the campaign name.

Campaign detail, wizard, contacts, settings, activity and search were not restructured; they inherit the palette, title size and button geometry.

## Changed files

| File | Change |
|---|---|
| `src/styles/index.css` | Ledger palette, `.eyebrow`, `.figure`, indigo fallback accent |
| `src/domain/appearance.ts` | Default accent constant only (`#4f46e5`) |
| `src/app/Sidebar.tsx`, `src/app/Shell.tsx` | Ink Compose, mark, active bar, prototype note, neutral profile button |
| `src/ui/Bits.tsx` | `DomainDot`; page title size |
| `src/features/mail/MailRail.tsx` (new) | Folders + mailbox switcher; `FOLDERS` moved here |
| `src/features/mail/MailRows.tsx` (new) | `ThreadRow`, `DraftRow` moved out of MailPage; mailbox marker; row Archive |
| `src/features/mail/MailListTools.tsx` (new) | `ActiveFilters` chips, `BulkBar` |
| `src/features/mail/MailPage.tsx` | Now orchestration only (about 300 lines, was 398); reader neighbours; draft scope |
| `src/features/mail/ThreadView.tsx` | Neighbour links, reading measure, pinned reply bar |
| `src/features/overview/NextUp.tsx` (new), `MailboxPanel.tsx` (new), `OverviewPage.tsx` | Next up, mailbox panel, ledger strip |
| `src/features/campaigns/CampaignsPage.tsx` | Counts on filters, progress and reply-rate columns, responsive columns |
| `src/features/mail/MailPage.test.tsx`, `src/features/overview/NextUp.test.tsx` (new) | First pass: three mail tests, three Next up tests. Review fixes: four more mail tests, one more Next up test |
| `src/domain/schema.ts`, `src/domain/identities.ts`, `src/data/seed.ts` | Review fix: `DAILY_LIMIT_MAX` 30, default and seeded limits use it |
| `src/features/settings/SendingSettings.tsx`, `src/features/campaigns/CampaignWizard.tsx`, `CampaignTabs.tsx` | Review fix: limit inputs take their maximum from `DAILY_LIMIT_MAX`; Settings hint states the ceiling |
| `src/domain/boundaries.test.ts` | Review fix: limit test now checks 1–30 |
| `src/data/store.ts`, `src/data/persistence.test.ts` | Load-only migration for previously valid higher limits; 23 persistence cases |
| `e2e/fable.spec.ts` | Geometry regression for campaign mailbox rows and split breakpoint |

Routes, storage keys and the gateway are unchanged. Consent and suppression behaviour is unchanged. Daily-limit configuration validation now caps at 30; this does not implement a per-mailbox sending ledger.

## Tradeoffs

- **Mailbox switcher in the mail rail, not the global sidebar.** It keeps the sidebar to five destinations and puts the scope beside the folders it affects. Cost: it is not reachable from Campaigns or Contacts without going to Mail first; the Overview mailbox panel partly covers that.
- **Selects on phones, rail from tablet up.** Two controls for one parameter pair, but each is the natural control for its width, and both write the same URL state.
- **Folder links keep the mailbox scope.** Faster for someone working one mailbox; slightly surprising if they expected a folder click to show everything. The chip row makes the scope visible and one click removes it.
- **Row Archive is hover/focus only.** It keeps rows quiet, and touch users still have the checkbox plus bulk bar and the reader toolbar. It is not discoverable on touch tablets.
- **Flat read rows.** Dropping the grey read-row shading makes the list cleaner but leans on the dot and weight for unread.
- **Default accent changed.** A one-line domain constant; existing users are unaffected. Revert by restoring `#2563eb` in `domain/appearance.ts` and the CSS fallback.
- **MailPage split into four files.** More files, but the three new ones fit one review slice each (roughly 100–150 lines). MailPage itself is still about 300 lines and needs two slices.

## Known limits and open points

- The 30/day limit is a validated setting and a reference figure. The prototype still does not count or block sends per mailbox.
- Short mailbox labels are distinct for the nine fixtures. Arbitrary future domains with the same first label need a fuller disambiguation rule before real-provider integration.
- "Sent today" counts simulated `sent` events since local midnight. It is not a rolling 24-hour or per-recipient count.
- Opening a conversation under "Unread only" marks it read, so it leaves the filtered list and the neighbour links disappear for it.
- Bulk-moving the open conversation in split view still leaves the reader on the "not in this folder" state, as before. Only the new per-row Archive closes the reader.
- On phones, Drafts gives no visible sign of an active mailbox scope beyond the "No drafts match" empty state.
- No new keyboard shortcuts (j/k, e) were added; existing tab-order operation is unchanged.
- No AI or Connections mock-ups were added, so nothing implies a connected provider or local AI.
- The mailbox list is the nine fixture addresses. Ten mailboxes per user across arbitrary domains would need the rail groups to scroll and the fixed `DomainDot` colours to become data.
- Still writes star/archive directly to the store rather than through `MailroomGateway` (existing deferred finding; the new row Archive reuses the same `move` path).

## Validation record and future visual checklist

The final Docker run includes every review fix. Lint, typecheck, all 135 unit/component tests, build and 29 browser journeys passed. Domain-only coverage is 99.69% lines, 98.71% branches and 100% functions. It is not whole-application coverage. Campaign batching and saved-data regressions pass.

Final manual browser inspection covers desktop Overview, domain/address scope and folder counts, split reading at 1280/1440, phone inbox/campaign layout and dark appearance. Automated geometry assertions cover the 1024 fallback, with schema boundary tests for 30/31. See the validation report for exact evidence; the checklist below is a reusable future checklist, not a claim that every theme/background permutation was manually inspected.

Future visual checklist, light and dark, at 1440, about 900, and 390 wide:

1. **Shell.** Ink Compose button and "E" mark; active nav item shows bar plus tint; the prototype note is readable and hidden on the tablet icon rail; nothing clips over a custom background image.
2. **Mail rail.** Clicking a domain narrows the list, opens its three addresses, and puts `?domain=` in the URL; clicking an address adds `?identity=`; All mailboxes clears both; Back restores the previous scope; folder links keep the scope. At 390 the Mailboxes list is absent and the two selects are present; from 768 it is the reverse.
3. **Filter row.** Each active filter appears as a chip; removing one removes only that filter; the count matches the rows; the row still shows with zero results.
4. **Bulk bar.** Ticking a row tints the row and swaps chips for actions without the header changing height on desktop; Clear selection restores the chips; the bar wraps cleanly at 390.
5. **Rows.** Unread rows are clearly distinguishable in both themes; the mailbox marker is visible in dark theme (boltloop's is near-black); row Archive appears on hover and on keyboard focus, and Undo restores. Ticks clear when a filter or mailbox changes and survive opening and closing a conversation.
6. **Reader.** Reply bar stays pinned while a long thread scrolls and is not covered by anything on mobile; Newer/Older move through the list and keep filters; the dimmed arrow at either end is not focusable; split view works at 1280 and 1440.
7. **Overview.** Next up shows a sensible first item and links to it; the ledger strip has no stray grey cell at any width (the fifth cell spans two columns below `xl`); rates read correctly; the mailbox table fits at 390 without the bar and links into the right inbox.
8. **Campaigns.** No horizontal scroll at 390; status badge sits under the name on phones and in its own column from 640; names truncate rather than wrap; filter counts match.
9. **Contrast.** Muted text on the new `--surface-2` and chips on `accent-soft` with the Amber and Slate presets.
10. **Untouched pages** (campaign detail, wizard, contacts, settings, search, activity) still look coherent on the new palette.

## 5 October 2026: brand palette and new areas

The Ledger layout is unchanged. The palette moved from warm paper and indigo to white, dark grey and gold, as chosen by the user; Compose stays ink. The sidebar's "E" monogram is replaced by the transparent logo and "Mail" reads "Inbox". Connections and AI Assistant reuse the Settings two-pane pattern, the existing badges, callouts and row geometry, so no new visual vocabulary was introduced. The "Known limits" item above about AI and Connections mock-ups no longer applies: both now exist and are labelled as previews on every screen. Details: [documentation](../../documentation.md), [validation](../validation/2026-10-05-brand-connections.md).
