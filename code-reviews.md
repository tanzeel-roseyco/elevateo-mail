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

## 2026-10-04 — PDF reader edition and concept sketches

Artifact review only: ten rendered PDF pages visually inspected, page count/text presence verified, and sketch responsibilities checked against the corrected enrichment/AI split. Remaining observed layout defects: **0**. Code defect density: **not applicable (0 application source lines changed)**. This was a manual artifact review, not a new adversarial source review or application test run. The architecture sketch simplifies provider events and file access; its caption and the backend blueprint supply the exact responsibilities. Backend standards remain a proposal.

## 2026-10-04 — Web and desktop distribution addendum

Artifact review only: both PDF pages rendered and visually inspected; text extraction and six source-link annotations checked. Remaining observed layout defects: **0**. Code defect density: **not applicable (0 application source lines changed)**. Canonical planning documents now distinguish browser access, native CLI access, OS signing, updater signing and release costs. No application tests were rerun for this documentation change; no installers or production website were built or published.

## 2026-10-05 — Independent frontend/backend handover review

Reviewed frontend commit 48c437d (design/fable-frontend) and backend commit 49fc23e (feature/backend-foundation), with three scoped reviewers: backend implementation, frontend contracts/permissions, and documentation-based design tradeoffs. No application source changed. Earlier agent test results were inspected, not independently rerun.

Reviewed source: backend 261 lines; frontend 252 lines. Four findings: backend 3 (11.49 defects per 1,000 reviewed lines); frontend 1 (3.97 per 1,000). Combined 4 / 513 = 7.80 per 1,000 reviewed lines. These are scoped review figures, not whole-project defect estimates. Findings remain open:

1. P1: worker lifecycle never calls ledger reconciliation; a crash after durable receipt can leave unknown sends and quota reservations stranded. Add bounded operational reconciliation without resending, tested through Worker lifecycle.
2. P2: supported 60-second approval TTL is shorter than five-minute relay cadence. Coordinate expiry and scheduling; test approval immediately after a cron tick.
3. P2: dispatch catches validation and provider exceptions without diagnostic context. Validate before invocation; retain redacted correlation and outcome diagnostics without releasing ambiguous-send reservations.
4. P2: frontend assistantQueue/checkAiDraft permit retained grants for disconnected/error mailboxes. Require connected status and regression tests.

Design/contract findings (excluded from source defect count): frontend direct-send result cannot express immutable create/approve/status lifecycle; browser-midnight quota conflicts with rolling reservations; authentication exists only as seeded sessions; several frontend methods lack endpoints; mailbox disconnect/cap semantics differ; no distinct backend AI draft grant. Next milestone: credential-free real HTTP integration with synthetic sessions, real local D1 and durable fake sending. Separate mock demo mode; unsupported actions must not emulate success.

Tradeoff scenarios: lost acceptance response must reconcile instead of resend; backend outage must show retry instead of mock mail; future approvals must disclose held quota; provider identities must not globally strip plus tags; polling/history/context require bounds even at 3,000 maximum daily recipients. Obsidian was unavailable, so these are analytical scenarios, not executed Obsidian simulations. Live providers, OAuth, actual inbox sync, local CLI bridge, DNS and distribution remain later gates.
