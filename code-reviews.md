# Code reviews

## Initialization
Scope: planning documents and repository configuration only. Application source lines: 0. Application review has not started; no application was built.
Defects identified: 0. Defect density: N/A (0 application source lines; not an application quality assessment).

## 2026-10-01 — Frontend prototype (`feature/frontend-prototype`)

### Method
- 21 adversarial code-review assignments plus 1 dedicated design-tradeoff review, each run by a separate read-only Codex agent (`gpt-5.6-sol`, low reasoning) with the project review rubric as its system prompt.
- Assignments covered 150–400 lines each (the project limit is 200–400). Formatting was left to ESLint.
- Every finding was checked against the code before being accepted. All 57 were judged real.

### Coverage
| # | Assignment | Files | Defects |
|---|---|---|---|
| 01 | Schemas, identities | `domain/schema.ts`, `domain/identities.ts` | 5 |
| 02 | Send rules, mail views, activity | `domain/rules.ts`, `domain/mail.ts`, `domain/activity.ts` | 3 |
| 03 | Colour, appearance, CSV, rich text | `domain/color.ts`, `appearance.ts`, `csv.ts`, `richText.ts` | 5 |
| 04 | Seed data | `data/seed.ts` | 0 |
| 05 | Store, gateway | `data/store.ts`, `mockGateway.ts`, `ports.ts`, `gateway.ts` | 4 |
| 06 | App shell | `app/App.tsx`, `Shell.tsx`, `Sidebar.tsx`, `appearance.ts` | 2 |
| 07 | Search, notifications, overlays | `app/GlobalSearch.tsx`, `Notifications.tsx`, `ui/Modal`, `confirm`, `toast` | 2 |
| 08 | UI kit | `ui/Button`, `Badge`, `Field`, `Bits` | 1 |
| 09 | Composer | `features/compose/Composer.tsx`, `composerStore.ts` | 3 |
| 10 | Recipient input, thread view | `RecipientInput.tsx`, `ThreadView.tsx` | 2 |
| 11 | Mail page | `features/mail/MailPage.tsx` | 3 |
| 12 | Overview, activity | `OverviewPage.tsx`, `ActivityPage.tsx`, `SearchPage.tsx` | 3 |
| 13 | Campaign list and detail | `CampaignsPage.tsx`, `CampaignDetailPage.tsx` | 2 |
| 14 | Campaign tabs | `CampaignTabs.tsx` | 3 |
| 15 | Campaign wizard | `CampaignWizard.tsx` | 2 |
| 16 | Contacts, import | `ContactsPage.tsx`, `ImportPage.tsx` | 3 |
| 17 | Settings: appearance, notifications | `AppearanceSettings.tsx`, `NotificationSettings.tsx`, `SettingsPage.tsx` | 4 |
| 18 | Settings: identities, sending, account | `IdentitySettings.tsx`, `SendingSettings.tsx`, `AccountSettings.tsx` | 5 |
| 19 | Domain tests | `domain/domain.test.ts` | 2 |
| 20 | Data and component tests | `data.test.ts`, `Composer.test.tsx`, `MailPage.test.tsx` | 0 |
| 21 | E2E and configuration | `e2e/flows.spec.ts`, `package.json`, configs, Dockerfile | 2 |
| 22 | Design tradeoffs | whole architecture | 1 |

### Result
- **Defects: 57** (1 high, 37 medium, 19 low).
- **Reviewed lines: about 7,300** (TypeScript, TSX, CSS; about 6,100 excluding tests).
- **Defect density: 7.8 per 1,000 reviewed lines.**
- **Fixed: 56. Deferred: 1** (see below).

### Fixed
**High**
- Campaign-linked message accepted a recipient with no contact record, so no recorded opt-in. A campaign send to an unknown address is now blocked in `validateSend` and again in the gateway.

**Persisted-state validation** (reviews 01, 03, 06, 18)
- Emails, ISO timestamps, `HH:mm` times, daily limits (whole numbers 1–500), follow-up delays, and the nine fixed identities are now validated on load.
- Forms use the same domain checks (`dailyLimitError`, `sendingWindowError`) as the schema. Previously a cleared time or a fractional limit could be saved and then cause all stored data to be discarded on the next load.
- State that would fail validation is never written to storage.
- Background image: base64 image data only, with the 1.5 MB cap enforced on load as well as on upload; upload accepts PNG, JPEG, WebP only.
- `identityDomain` no longer accepts an address with two `@`.

**Send rules and data** (02, 05, 13)
- A reply inside a campaign conversation is ordinary mail: it warns rather than blocks when the contact has since unsubscribed.
- Date ranges exclude future-dated events.
- Sent and delivered events are logged for Cc and Bcc recipients.
- Campaign senders must be configured identities on one domain.
- Start, pause, and resume go through the gateway (`setCampaignStatus`) and record a lifecycle event.
- Deleting a campaign unlinks its conversations, drafts, and events.
- A pending save is flushed when the page is hidden or closed. Reset still works when storage is blocked.

**Mail and composer** (07, 09, 10, 11)
- Closing an untouched prefilled reply now saves it, as the toast already claimed.
- A failed send keeps edits made while the send was in flight; close and discard are disabled during a send.
- Escape saves and closes; full-screen and phone composers trap focus; focus returns to the opener.
- A conversation is never shown under a folder it is not in; links from notifications, activity, and overview open it in its own folder.
- Sent rows name the person we wrote to, not ourselves. Draft search filters drafts. Paste respects the selection. "Sent from" versus "Received by" is correct.
- The notification badge counts all unseen notifications, not only the eight listed.

**Lists, campaigns, contacts, settings** (06, 08, 12, 14–18)
- Page numbers from the URL are clamped to real pages (contacts, activity, campaign tabs).
- Campaign recipient filter and paging are URL state. Tab form state is keyed by campaign.
- Campaign start time is interpreted in the sending timezone, not the browser's, and shown in that timezone.
- An empty start time is a validation error rather than an exception.
- Import controls are locked during an import; unreadable files show an error.
- Overview and Activity re-evaluate their range every minute.
- Sidebar active state matches whole path segments.
- Appearance: stale file reads cannot overwrite a newer choice; a failed save says so instead of "Saved".
- Rejected promises (notification permission, reset) are reported to the user.
- Saving a name with surrounding spaces no longer leaves the form marked unsaved.

**Parsing and display** (03)
- Button text on a custom accent always reaches 4.5:1 (compared against pure black).
- CSV: a quote inside an unquoted field is kept as written; a leading byte-order mark is stripped.
- Italic markup is removed from one-line previews.

**Tests and tooling** (19, 21)
- `npm run e2e` builds first, so it works from a clean checkout.
- Back/forward e2e now also checks forward.
- 35 regression tests added (`domain/boundaries.test.ts`, `data/boundaries.test.ts`, composer and mail page tests).

### Deferred
- **[medium] Features write to the store directly for star, archive, drafts, settings, contact and campaign edits, rather than through `MailroomGateway`** (review 22). STANDARDS §2 says features reach data only through ports. Moving every mutation behind the gateway means making each one asynchronous with pending, failure, and rollback handling at every call site. That is the optimistic-update design the HTTP gateway needs, and it is better done once against the real API contract than twice. The README lists these mutations as integration work. **Needs a decision from the user: accept for the prototype, or do it now.**

### Design-tradeoff review (22)
Each decision was assessed at current load and at 10×, against the alternative.

| Decision | Verdict | Note |
|---|---|---|
| Zustand store as client cache | Change | Reads are fine; direct writes are the deferred item above. |
| Whole-state localStorage snapshot | Change at backend integration | Fine at 840 contacts; at 10× the full validate-and-serialise on each save and the browser quota become limits. Server persistence replaces it. |
| Navigation and filter state in the URL | Keep | Gives back/forward, reload, and shareable links at no cost. |
| One stored folder per thread | Change at backend integration | Enough for the prototype; real inbound mail needs per-user labels. |
| Markdown subset rendered as React nodes | Change at backend integration | Safe now; inbound HTML must be sanitised server-side. |
| One floating composer with autosave | Keep | Multiple composers add conflict handling with no established need. |
| Single append-only event log | Change at backend integration | Needs provider event IDs and deduplication for Resend webhooks. |

### Verification after fixes
Run in Docker on fleet-02: ESLint clean, `tsc` clean, 101 unit and component tests passing, 99.7% line coverage on `src/domain`, production build 177 KB gzipped initial JS, Playwright 27 passed and 1 skipped by design (split pane is desktop-only) across desktop 1440px and mobile 390px. Screenshots of the main desktop and mobile flows were re-inspected after the fixes.

## 2026-10-04 — Elevateo Mail rename and planning synthesis

Scope: six branding changes only, plus master plan/blueprint/standards/research documentation. No backend feature was built. Dedicated adversarial design and source review: [report](docs/research/2026-10-04/efficiency-design-review.md). Review followed the user's full rubric; style was checked by ESLint.

- Source/config coverage: 168 physical lines in five small slices (16, 80, 13, 47 and 12 lines); six changed lines. Zero confirmed new source defects. Defect density: **0 per 1,000 reviewed lines**. This does not re-certify the whole historical prototype.
- Four planning findings, excluded from code density: capacity/admission, independent recovery, premature scaffolding and excessive monitoring scope.
- Capacity: confirmed 100-mailbox pilot/3,000 daily send maximum now consistent in canonical plans. History, imports and storage allowances remain explicit approval items.
- Recovery: independent backup destination, key recovery and operator required before promising recovery targets; same-account backups are not described as independent.
- Scaffolding: create shared packages only when needed; prove one provider and two-user isolation before expanding adapters.
- Monitoring: a small product health screen, bounded provider logs and an independently tested outage alert; no custom monitoring cluster.
- Tradeoffs use documented workload/cost scenarios. Obsidian was unavailable; no Obsidian simulation or backend benchmark is claimed.

Fresh verification: Docker lint, typecheck, 101 unit/component tests, production build, and Playwright 27 passed / one desktop-only test skipped on mobile. Domain coverage 99.69% lines / 98.68% branches; initial JS 176.72 KB gzip. Desktop overview and mobile drawer screenshots inspected: correct branding and no visible clipping. Existing draft/appearance persistence journeys pass; storage keys remain unchanged.

Dependency audit separately found three moderate development-tool entries representing one Vitest advisory, not three new source defects. Upgrade requires a supported-major migration and is tracked separately; no production dependency entry was reported. [Evidence, advisory and test limits](docs/validation/2026-10-04.md).

## 2026-10-05 — Backend foundation

Three adversarial reviewers used the full project rubric, with a dedicated design reviewer. Assignments below are bounded slices; repeated exposure is included in density, rather than presented as unique coverage. Linters handled formatting. No frontend code was changed.

| Assignment | Reviewed lines | Confirmed defects | Defects/1,000 lines |
|---|---:|---:|---:|
| Ledger and core boundaries | 123 | 1 | 8.13 |
| Gmail/Resend/HTTP provider contracts | 100 | 2 | 20.00 |
| Events and owner-scoped resources | 152 | 2 | 13.16 |
| Worker/queue and durable fake provider | 129 | 2 | 15.50 |
| Schema, pause controls and durable receipt design | 121 | 1 | 8.26 |
| Recipient/config/AI/DNS policies | 136 | 2 | 14.71 |
| Corrected boundaries and ledger/provider tests | 135 | 0 | 0 |
| Corrected resources/worker/migration and API/event tests | 163 | 0 | 0 |
| AI route, recovery, enrichment, pilot cap and policy/recovery tests | 184 | 1 | 5.43 |
| Corrected policies | 86 | 0 | 0 |
| Docker/package/config/fixture and recovery tests | 133 | 1 | 7.52 |
| Permission tests and fixture/recovery recheck | 102 | 0 | 0 |
| Final persistence and trigger parser fixture | 52 | 0 | 0 |
| HTTP-to-queue workflow test | 41 | 0 | 0 |

Total review exposure: **1,657 lines, 12 confirmed defects, 7.24 defects/1,000 lines; all 12 fixed**. This is a scoped backend review, not a re-certification of the frontend or proof of production readiness.

Fixed findings: JSON media-type validation; folded Gmail UTF-8 MIME headers; malformed UTF-8 provider responses; campaign retry returning stale state; concurrent mailbox creation conflicts; relay ignoring database pause; revoked approvals starving later queue pages; missing pause row failing open; weak AI IDs/hash validation; DNS policy rejecting DKIM underscores; inadequate pause test observation; fixture leaking workerd on initialization failure. Docker also exposed tooling API/date mismatch and incomplete migration parsing; these were corrected and are excluded from adversarial defect counts.

Coverage checklist: owner/session/input boundaries; mailbox/user caps and stable identities; atomic all-path quota and exact approvals; current consent/suppression/permissions; ambiguous acceptance and durable receipts; signed event replay/conflicts and unsubscribe; paginated plaintext messages; AI selection/draft/send separation; protected DNS preview; disabled enrichment; migrations/restore/pause; relay/queue fairness; provider MIME/limits/errors; typed config, dependency locks, Docker checks and happy/failure tests. All reviewed within the foundation scope. Live OAuth, sync, alias governance, real webhooks, distributed broker behavior and frontend integration remain separately documented gates.

Design simulations (local, because no Obsidian connection is available): at 100 pilot mailboxes/3,000 daily recipients, compare one D1 transactional ledger with Redis/distributed counters: retain D1 and fail closed, accepting serialization until measured contention justifies change. Compare reservation expiry with ambiguity retention: unknown remains reserved indefinitely to prevent duplicate sends; operator reconciliation is required. Compare 100-row due scans with revoked approvals: cancel invalid approvals so the next scan progresses. Compare same-account snapshots with independent backup: local restore proves schema/state recovery only, not outage independence. Compare rolling 24-hour recipient counting with calendar/message counting: retain conservative fixed 30-recipient configuration and document final live-policy approval. No Obsidian simulation, production load measurement or cost guarantee is claimed.

Final checks and Docker cleanup evidence: [backend validation](docs/validation/2026-10-05-backend.md). New tests exercise the actual Worker handlers and real local D1; cloud queue delivery and browser/native QA are outside this backend-only task.
