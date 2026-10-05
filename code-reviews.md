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

## 2026-10-04 — Fable frontend design and management flows

Implementation: installed Claude CLI, verified model `claude-fable-5-1`. Adversarial Codex reviewers used the user's complete review rubric, with at most 200 lines per assigned slice. A dedicated design reviewer assessed navigation, workload priorities and responsive tradeoffs; ESLint handled style.

### Initial source coverage

| Slice | Reviewed lines | Confirmed defects |
|---|---:|---:|
| MailRail 1–148 and Bits 145–178; dedicated design review | 182 | 1 |
| Styles and appearance 1–65 | 192 | 0 |
| Shell and Sidebar | 157 | 0 |
| MailRows and Bits 1–55 | 183 | 1 |
| MailListTools and MailPage 1–95 | 196 | 0 |
| MailPage 96–295 | 200 | 0 |
| ThreadView 1–200 | 200 | 0 |
| NextUp, ThreadView 201–219 and MailPage 296 | 106 | 1 |
| MailboxPanel and Overview 1–100 | 191 | 0 |
| Overview 101–229 | 129 | 0 |
| CampaignsPage | 128 | 0 |
| **Total** | **1,864** | **3 P2** |

Initial application defect density: **1.61 defects per 1,000 reviewed lines**. All three confirmed findings were fixed: folder badges now follow mailbox scope, mailbox identity is visible on every row, and paused campaigns cannot be pushed out of Next up by drafts.

### Follow-up reviews and disposition

These passes overlap earlier coverage and must not be added as unique reviewed lines.

| Pass | Lines | Findings | Defects per 1,000 lines | Disposition |
|---|---:|---:|---:|---|
| Scoped badges and mail selection | 191 | 0 | 0 | Passed |
| NextUp and MailRows | 199 | 1 P2 | 5.03 | Metadata overflow fixed with wrapping; geometry regression added |
| Regression tests | 151 | 2 test weaknesses | 13.25 | Draft search uses real input; filtered navigation asserts exact expected ID |
| Saved-data migration and regression cases | 172 | 0 | 0 | Passed |
| Final row layout, browser regression and limit changes | 126 | 0 | 0 | Passed |

Test weaknesses are reported separately from application source density. Parent integration also caught a compatibility problem outside the agent counts: tightening the daily-limit schema could discard otherwise valid saved data. A load-only migration now clamps previously valid values above 30 without relaxing new-input validation; 23 persistence cases verify preservation and rejection paths.

### Design review

- Mailbox scope lives beside the folders it affects; the global sidebar stays small. Scenario review compared single-mailbox work, switching domains and returning from a campaign.
- Phones use selects; larger screens use a mailbox rail. Both write the same URL state, so back/forward has one contract.
- Split reading begins at 1280px; at 1024px a single pane avoids compressing message content. Browser geometry checks cover both cases.
- No new dependency was needed. Existing route splitting and system fonts keep the compressed initial JavaScript at 180.49 KB.
- Obsidian was unavailable. These were documented local scenario comparisons, not an Obsidian simulation or measured production workload.

### Verification and remaining limits

Final Docker run: lint and typecheck passed, **135 unit/component tests passed**, production build passed, **29 browser tests passed and one desktop-only test was intentionally skipped on mobile**. Domain-only coverage: 99.69% lines, 98.71% branches, 100% functions. Desktop, phone, split-reader and dark screenshots were inspected. [Evidence and cleanup](docs/validation/2026-10-04-fable.md).

No confirmed new source defect remains from these scoped reviews. Existing direct-store mutations remain deferred to API integration; this work does not certify the backend, arbitrary provider data or production sending. The 30/day rule is validated configuration, not enforced delivery accounting. The earlier development-tool audit advisory remains open. Nothing was committed, pushed or published during this frontend task.

## Excalidraw brief document review — 2026-10-04

Scope: ten-page PDF handoff, not application source. One content defect found and fixed; zero outstanding. Code defect density: not applicable (zero application lines changed). Document finding density: 1/4 reviewed prompt sections, not comparable with source KLOC figures.

| Prompt section | Result |
|---|---|
| Product and boundaries | Passed: private users, mailbox/send limits, budget and implementation status agree with the plan |
| System flows | Fixed: explicitly gate mailbox context on provider data-use review and CLI isolation; initial Claude fallback is tools-disabled drafting |
| Frontend workflows | Passed: seven actual Fable captures identified; new wireframes and missing states are proposed |
| Build map and handoff | Passed: cost/testing assumptions, decisions and editable portable deliverables remain explicit |

Parent visually inspected every rendered page and re-rendered/rechecked the corrected page. Final structural checks: ten pages/bookmarks, eight embedded attachments, seven PNGs identical to their original files, corrected prompt present both as selectable PDF text and attached UTF-8 text. No application tests were rerun; no Docker resources, deployment or infrastructure changes were required.

## 2026-10-05 — Brand theme, Connections, AI Assistant and resilience states

Implementation: Claude Code, model `claude-fable-5-1`, inline on `design/fable-frontend`. Reviewers: eleven Codex CLI agents (`codex exec`, read-only sandbox, low reasoning) using the user's full review rubric, each given at most about 200 assigned lines, plus one dedicated design-tradeoff reviewer. Session metadata reports the reviewer model as `gpt-6.1-sol` (the installed Codex default), not the `gpt-5.6-sol` named in the routing rules; the pin was not applied. Formatting was left to ESLint.

A first attempt produced no reviews: Codex's read-only sandbox could not read files on this Windows host, so every agent reported itself blocked. The run was repeated with the assigned code and its context supplied in the prompt, so no reviewer needed file access. `MailboxPanel.tsx` (four changed lines, an untracked file so absent from `git diff`) was reviewed by the parent only.

### Source coverage (round 1)

| Slice | Assigned lines | Confirmed defects |
|---|---:|---:|
| `domain/connections.ts` and connection schema | 147 | 1 P1, 1 P2 |
| `mockConnections.ts`, new ports, store changes | 102 | 1 P2 |
| `ui/Async.tsx`, `ConnectionsPage.tsx`, shell/nav/route diffs | 147 | 0 |
| `MailboxesSection.tsx` | 148 | 1 P1, 2 P2 |
| `SendingSection.tsx`, `EnrichmentSection.tsx` | 140 | 4 P1 |
| `AiSection.tsx`, `DomainsSection.tsx` | 157 | 2 P1, 1 P2 |
| `AssistantPage.tsx`, theme token and appearance diffs | 213 | 1 P1 |
| **Total** | **1,054** | **14 (9 P1, 5 P2)** |

Application defect density: **13.28 defects per 1,000 reviewed lines**. Eight of the nine P1 findings are truthfulness defects: wording that described planned behaviour as working, or an undecided limit rule as settled. The ninth is a real permission race.

| Finding | Fix |
|---|---|
| Duplicate mailbox ids passed the schema, so one AI read grant could cover two mailboxes | Schema rejects duplicate ids and addresses; regression test |
| Mixed-case mailbox address passed the schema but never matched its conversations | Schema requires lower-case; regression test |
| `updateAiAccess` accepted non-boolean permissions | Gateway parses the merged value with `aiAccessSchema`; regression test |
| Rapid AI-scope toggles were built from stale state and could re-grant a revoked mailbox | One change at a time: controls lock while a change is pending; regression test |
| Disconnect not labelled as simulated; no pending guard | Confirmation and toast say what is removed; row is busy for the whole request |
| Address input editable during a pending connect | Input disabled while busy |
| Sending routes, suppression, Resend empty state and AI personalisation described as working | Reworded as planned; suppression claim limited to campaign email |
| "AI-assisted sends count toward the daily limit" stated as fact (two pages) | Reworded as planned, rule unconfirmed, nothing enforced |
| A Resend identity on a root domain was listed as a sending subdomain | `sendingDomains` marks only proper subdomains of known roots as approvable; others say they cannot be managed; section renamed "Sending domains" after the follow-up pass |

### Test review (round 1)

| Slice | Assigned lines | Test weaknesses |
|---|---:|---:|
| `domain/connections.test.ts` | 149 | 5 |
| `Connections.test.tsx` | 176 | 7 |
| `e2e/brand.spec.ts`, new persistence cases | 159 | 4 |
| **Total** | **484** | **16** |

All sixteen were addressed: exact-id and exact-body assertions, midnight/now/future boundaries, already-answered conversations, toast isolation between tests, cancelled disconnect, rejected connect/draft/access changes, offline controls, Review draft handing over the exact draft, loaded-content waits before overflow measurement (now both edges and including Enrichment), a pixel-level logo transparency check and real forward navigation. Test weaknesses are not counted in application density.

### Design-tradeoff review

Scenarios were reasoned from the code and the documented pilot; no Obsidian simulation was run, and none is claimed.

- **Kept:** connections inside the one persisted data blob with a load-time default (a separate key would need coordinated hydration and reset); mailbox connections modelled apart from sender identities (a read-only tenth mailbox must not gain send rights); one page-level load across Connections sections; offline as a banner plus disabled network actions rather than a mutation queue; AI default of one readable demo mailbox, drafting on, sending off (real accounts should start with none readable).
- **Kept as provisional only:** client-derived quota usage. A second device or the cloud scheduler makes local counts wrong; at handover the display must read a server usage DTO and never become enforcement.
- **Changed:** gateway methods now return the resulting DTO (`Connections`, `MailboxConnection`, `AiAccess`) instead of `void`.
- **Deferred, 1 DESIGN-P2:** adapters still write the zustand cache themselves. A single cache coordinator shared by mock and HTTP adapters belongs with the existing deferred finding about direct store mutations, to be done at backend integration.

### Follow-up pass

Overlaps round 1; not added to unique reviewed lines.

| Pass | Lines | Findings | Disposition |
|---|---:|---:|---|
| `AiSection.tsx`, `mockConnections.ts` | 173 | 0 | Passed |
| `MailboxesSection.tsx`, `DomainsSection.tsx` | 226 | 1 P1 | Root domains still sat under a "subdomains" heading; section renamed "Sending domains" |

Open after review: zero confirmed source defects. Unresolved questions, not defects: whether a mailbox needing re-authorisation should lose AI access; whether an AI-scope change in flight should survive leaving the page.

### Verification

See [validation](docs/validation/2026-10-05-brand-connections.md).

## 2026-10-05 — Backend integration milestone (API-backed mode)

Reviewers: 13 scoped adversarial Codex agents (`gpt-5.6-sol`, low reasoning, read-only, verified from each run header) using the full review rubric, each given at most 378 lines, plus one dedicated design-tradeoff reviewer. The Codex sandbox could not start a shell on this machine, so each reviewer received its lines inline and could not open other files; findings that depended on unseen code were checked by the parent before being counted.

### Coverage

| Assignment | Lines | Reported | Confirmed |
|---|---:|---:|---:|
| A `sendLifecycle.ts`, `contract.ts`, `ports.ts` | 283 | 3 | 3 |
| B `httpClient.ts`, `httpGateway.ts`, `instance.ts`, `QuotaLine.tsx`, `SendPreview.tsx` | 289 | 4 | 4 |
| C `live.ts` 1–280 | 280 | 2 | 2 |
| D `live.ts` 281–556 | 277 | 4 | 3 |
| E `ComposePage.tsx`, `SignInPage.tsx`, `LiveApp.tsx` | 353 | 0 | 0 |
| F `SendsPage.tsx`, `UnavailablePage.tsx`, `LiveSettingsPage.tsx` | 333 | 2 | 2 |
| G `LiveConnectionsPage.tsx`, `LiveInboxPage.tsx` | 368 | 2 | 1 |
| H `LiveShell.tsx` (114 source) + harness, compose, Dockerfile, test support (230) | 344 | 3 | 1 source, 1 test |
| M `connections.ts`, `main.tsx`, `vite.config.ts`, integration Playwright config | 194 | 0 | 0 |
| **Source total** | **2,491** | | **16 scoped** |
| I `journey.spec.ts` | 378 | 4 | test only |
| J, K `live.test.ts` | 505 | 5 | test only |
| L `visual.spec.ts`, `httpClient.test.ts`, `sendLifecycle.test.ts` | 362 | 5 | test only |
| Design review (six core files, read as a whole) | 1,021 (overlaps above) | 7 | 5 new (1 duplicate of C, 1 rejected) |

**Confirmed source defects: 21 in 2,491 unique source lines, 8.4 per thousand lines.** 1 P0, 16 P1, 4 P2. 16 fixed, 5 open.

### Fixed (16)

- **P0** A request was still sent when its idempotency key could not be stored, so a lost answer could not be recovered after a reload. Now nothing is sent and the draft says why.
- Overlapping sign-ins shared one epoch and could finish on the wrong account; each attempt now has its own.
- A late answer to an older page read could replace a newer page.
- A second view watching a request reset the bounded check allowance.
- The body cache dropped the oldest fetched body, not the least recently used.
- An unknown outcome was re-read automatically when its page opened or the tab became visible.
- Inbox page position was held in memory only; it is now the server cursor in the URL and survives reload.
- "Simulated provider" was shown on the header badge and on accepted requests regardless of what the server reported (2 findings).
- Capabilities for an account with zero connected mailboxes were rejected as malformed.
- A mailbox inventory longer than three pages was silently cut off; it is now an explicit error.
- A caller could ask for more than 50 summaries.
- A response declaring an oversized length was read in full before being refused. A response with no declared length is still read before its size is checked.
- Storage that allows reads but refuses writes was treated as usable.
- A timestamp beyond the `Date` range passed validation and then threw during mapping.
- A mailbox reference of only spaces passed the send check.

### Open (5)

| # | Severity | Finding | Why it is open |
|---|---|---|---|
| 1 | P1 | Send records are merged with a read-then-write on `localStorage`; two tabs writing in the same instant could lose one update | Each write re-reads first and the step is synchronous; a real fix needs Web Locks or a server list endpoint. The lost update would be a status, re-read from the server on the next check, never a second send |
| 2 | P1 | Message text and recipients of send requests are stored in `localStorage` in plain text | The server cannot list a user's requests; removing this storage would remove reload recovery. Production gate |
| 3 | P1 | The session token is readable by script (`sessionStorage`) | Needs backend session issuance with an HttpOnly cookie. Production gate |
| 4 | P1 | Two tabs can each "cancel and edit" the same request and create two successor drafts | Each successor still needs its own explicit approval; a single-successor guarantee needs a server operation |
| 5 | P2 | More than 100 unfinished requests are never trimmed | Only reachable with over 100 unfinished drafts; unfinished records are deliberately never dropped |

### Rejected (4)

- "Another account's records remain after a direct account change": they are removed once the new account is confirmed (`removeOtherNamespaces`, covered by a unit test).
- "Mailbox and message ids are not URL-encoded": ids are validated against `[a-zA-Z0-9_-]` at the boundary before any use.
- "Signing in as another account destroys the first account's recovery records" (design): this is the explicit requirement to clear user-specific data on account change; recorded as a tradeoff, not a defect.
- "Harness reset reuses session tokens": intended, so a test can restore an expired session.

### Test findings

15 reported; 3 were artefacts of reviewers seeing half a file (an "unterminated" test, lifecycle coverage that lives in the other half, and a recovery test that does replay the create request with the same key). Addressed: the harness now fails when a staged crash matched no request; new unit tests cover the storage-failure refusal, overlapping sign-ins, stale page reads, least-recently-used eviction, the shared check allowance, the 50-summary cap, the cut-off inventory and oversized answers; every status label is asserted distinct; the journey test asserts the page position survives a reload. Not added: browser-level tests for session expiry seen from a second tab, an account change without sign-out, and literal rendering of markup in a message body (covered only by the schema and the plain-text element in code).

### Design-tradeoff review

Scenarios were reasoned from the code by the reviewer (lost answer, reload mid-send, two tabs, shared browser, outage, token theft). No Obsidian simulation was run, and none is claimed.

- **Kept:** one vanilla store owning all server state; bounded polling with manual check as the final authority; no optimistic status changes; build-time separation of demonstration and API modes; edit as cancel + new key + new approval.
- **Change when the backend allows:** an account id and a list endpoint for send requests (removes open findings 1, 2, 4); an HttpOnly session cookie (removes 3); a revision-checked draft update or atomic supersede.
- **Deferred:** server push for status; a query library, if search or concurrent lists arrive.

### Verification

See [validation](docs/validation/2026-10-05-backend-integration.md).

## 2026-10-05 — Server-owned send requests, atomic replacement and cookie session

Reviewers: 15 scoped adversarial Codex agents (`gpt-5.6-sol`, low reasoning, read-only) using the full review rubric, each given at most 409 lines, one dedicated design-tradeoff reviewer, then 3 scoped follow-up reviewers on the fixed regions. As before, the Codex sandbox cannot start a shell on this machine, so each reviewer received its lines inline. Each reviewer process was started directly and tracked by its own process id; all 19 exited by themselves and none was stopped.

### Coverage

| Assignment | Lines | Reported | Confirmed |
|---|---:|---:|---:|
| A `sendLifecycle.ts`, `contract.ts` 95–end, `ports.ts`, `paging.ts` | 313 | 1 | 1 |
| B `httpClient.ts`, `httpGateway.ts`, `instance.ts`, Vite/Playwright/compose config | 337 | 3 | 1 |
| C `live.ts` 1–300 | 300 | 1 | 1 |
| D `live.ts` 301–590 | 290 | 4 | 4 |
| E `live.ts` 591–end | 214 | 0 | 0 |
| F `ComposePage.tsx`, `SignInPage.tsx`, `LiveApp.tsx` | 409 | 1 | 0 |
| G `SendsPage.tsx`, `SendPreview.tsx` | 347 | 0 | 0 |
| H `LiveShell.tsx`, `LiveSettingsPage.tsx`, `LiveInboxPage.tsx` | 361 | 1 | 1 |
| **Source total** | **2,571** | | **8 scoped** |
| I `harness.ts`, `support.ts`, `visual.spec.ts` | 373 | 2 | 1 test |
| J, K `journey.spec.ts` | 617 | 8 | 3 test |
| L, M, N `live.test.ts` | 830 | 7 | 3 test |
| O `httpClient.test.ts`, `sendLifecycle.test.ts` | 299 | 0 | 0 |
| Design review (five core files as a whole) | 1,250 (overlaps above) | 8 | 5 new, 3 duplicates of D |
| Follow-up P, Q `live.ts` 190–620; R `ComposePage.tsx`, `instance.ts`, `paging.ts` | 750 (overlaps above) | 6 | 2 new, 1 duplicate |

**Confirmed source defects: 15 in 2,571 unique source lines, 5.8 per thousand lines.** 2 P0, 10 P1, 3 P2. 14 fixed, 1 open. Test weaknesses confirmed: 7, all addressed.

### Fixed (14)

- **P0** While a page loaded, another tab could replace the cookie between "who am I" and the data that followed, leaving one account's id beside another account's mailboxes. The account is now asked for again after the data and loading restarts if it changed.
- **P0** A legacy browser record was deleted once any server request with its id existed. It is now deleted only when the server returns saved content under the same key that says the same thing.
- When another tab reported an account change, this tab kept its data until the server had answered. It now drops everything first and asks afterwards; the fixture sign-in also signals before it changes the cookie.
- After a replacement made elsewhere, the recovery key was removed before the successor had been read; an outage at that moment lost it.
- The search for a lost request compared server times with the browser clock to decide it was absent. It no longer compares times: only the end of the list proves absence.
- That search restarted from the newest page every time, so a request behind more than 500 newer ones could never be found. It now continues where it stopped.
- An older read of a request arriving late could overwrite a newer state and re-enable Approve. Reads are now ordered per request.
- When browser storage was blocked, a memory stand-in accepted the recovery key, which a reload would then lose. The stand-in now refuses writes, so the submission is refused instead.
- Reply put the sender's address and the subject into browser history state. It now passes two ids and reads the message through the store.
- Two changes in the same millisecond wrote the same marker value, which raises no storage event in other tabs. Markers now carry a unique value.
- Only the first 50 legacy records were ever checked. The bound is now 200, above the 100 the earlier version could hold.
- The read-ordering table reused numbers after it was cleared (found in follow-up).
- The page trail stopped validating after 500 pages, sending "Newer" to the first page.
- A non-finite page limit was sent to the server as `NaN`.

### Open (1)

| Severity | Finding | Why it is open |
|---|---|---|
| P2 | The limit of 20 unresolved keys is checked and then written; two tabs at 19 can both add one | The result is 21 entries, each still recoverable and none dropped. A strict limit needs Web Locks; the limit exists to bound memory, which it still does |

### Rejected (15)

- Streaming byte cap on responses without `Content-Length`, and UTF-16 length: the origin is the application's own server; declared oversize is refused. Unchanged from the previous review.
- The fixture's `{error:"code"}` shape reported as a generic failure: fixture-only, and the message still says the session could not be started.
- "`!detail.revision` rejects revision 0" (twice): the revision is a 64-character hash, validated at the boundary.
- "Projects share one server and reset it concurrently": the integration config runs one worker, in order.
- Five "missing coverage" findings on the first half of `journey.spec.ts`: each case exists in the second half, which that reviewer was not given.
- "Mutable revision in the unit fake" and "message ownership in the unit fake": the real-server suite covers stale revisions and isolation.
- "Pending keys should be deleted on account change": they are account-scoped and unresolved; deleting them would discard unresolved work. They are never shown to another account.
- "Compose text survives an account change": the router is unmounted whenever the session is not ready.
- "The storage probe key could collide": the key is in the application's own namespace and never otherwise used.

### Test findings (7, all addressed)

The visual test now drops only the answer to a replacement, so "Check again" repeats a completed operation. Isolation probes send well-formed cancel and replace requests and compare a foreign id with a missing one. The legacy test compares the stored records byte for byte across navigation and reload, and includes a record whose id exists but whose text differs. The permission test asserts exactly one write. The unit fake requires both cursor parts. The two-tab replacement unit test starts both submissions before awaiting either. Legacy recovery by key is tested beyond the first list page.

### Design-tradeoff review

Scenarios were reasoned from the code by the reviewer. No Obsidian simulation was run, and none is claimed.

- **Kept:** content off the device with recovery by key; compose text in memory only; refuse at the key limit rather than evict; reconcile-then-keep for legacy records; build-time gating of the fixture sign-in.
- **Changed as a result:** resumable search without clock comparison; unique change markers; immediate drop on an account marker; content-verified legacy recovery; refusing writes when storage is unavailable.
- **Deferred to the backend:** lookup by idempotency key; an account id on every response.

### Verification

See [validation](docs/validation/2026-10-05-server-recovery.md).

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


## 2026-10-05 - Credential-free HTTP integration milestone

Full project rubric used by adversarial agents; source assignments <=200 lines and each review agent's cumulative exposure <=400. Dedicated design review used concrete state/throughput simulations. Linters own formatting. Coverage includes Worker HTTP/scheduler/queue entry points, digest validation, migrations/admission, authoritative quota/identities, DTOs/client, permissions, offline fixture/session lifecycle and operational regression tests.

| Review assignment | Lines (including rechecks) | Defects | Defects/1,000 lines |
|---|---:|---:|---:|
| Ledger/envelope/migrations/lifecycle and correction recheck | 358 | 1 | 2.79 |
| Worker/quota/runner/resources/contracts/client | 366 | 3 | 8.20 |
| Design, offline migration atomicity and HTTP journey | 331 | 2 | 6.04 |
| Remaining resources, migration helper, AI, fixture and admission regressions | 188 | 0 | 0 |
| Final operational permission/suppression/pause/cancel and strict-type corrections | 85 | 0 | 0 |

Total exposure **1,328 lines; six source defects; density 4.52/KLOC**, all fixed: independent envelope digest, database pause before immediate enqueue, explicit deferred enqueue result, concurrent mailbox permission update, atomic local migration/marker, and HTTP fixture setup cleanup. One documentation mismatch (disconnected records consuming active slots) also corrected; excluded from source density. Repeated review is exposure, not unique coverage. Docker-discovered tooling/test issues are reported in validation separately.

Design simulations (local tables; no Obsidian connection is available): ten mailboxes times30 gives300 owner capacity. Disconnect/replacement preserves owner charges, so a fully charged owner remains at zero. Unknown20 + accepted10 leaves zero; when accepted10 ages, remaining becomes10 while unknown20 stays held. A20-row reconciliation budget sweeps100 due unknowns in five ticks; five-minute backoff and ten attempts bound repeated checks, after which investigation is required. Favor positive receipt recovery over time-based release; favor one indexed D1 ledger over additional distributed state until real contention warrants complexity. Lost create responses reuse the same key; lost approval responses inspect saved state. No production latency, cost or readiness claim.

Frontend worktree and UI were not changed or visually revalidated. Fable gateway wiring and actual application QA remain its owner's handoff. See integration contract and fixture instructions.

Final milestone checks, download recovery and scoped cleanup: [integration validation](docs/validation/2026-10-05-integration.md).

## 2026-10-05 — Server-owned recovery and browser session boundary

Full mandated adversarial rubric used; individual source slices were no more than 200 lines and cumulative exposure per agent below 400. Linters handle formatting. Design reviewer simulated tab conflicts, dispatch races, pagination and expiry; no Obsidian connection was available.

| Assignment | Reviewed lines including rechecks | Source/test defects | Defects/1,000 lines |
| --- | ---: | ---: | ---: |
| Recovery route, migration, ledger | 210 | 0 | 0 |
| Session core, Docker proxy/bootstrap/run, cookie regression | 328 | 0 | 0 |
| Worker contract/client schemas and logout corrections | 275 | 1 | 3.64 |
| Recovery/session regression tests and corrected boundaries | 315 | 2 | 6.35 |
| Dedicated design review: atomicity, storage, session and cursor tradeoffs | 356 | 0 | 0 |

Exposure totals 1,484 lines (includes overlapping source and rechecks, not unique coverage). Three confirmed review source/test defects, density 2.02/KLOC, all fixed: logout accepted payloads; pagination test did not guarantee timestamp ties; Worker mint-route exclusion test used an expired session. One additional contract documentation defect fixed: obsolete opening bearer-only wording contradicted cookies. Zero unresolved findings in these assignments.

Review-requested coverage added: replacement versus operational Worker queue entry, and corrupted saved content through HTTP. Docker subsequently caught a Node/Miniflare Headers type mismatch and the empty-stream bodyless POST adapter behavior; corrected and re-reviewed. These verification findings are recorded separately, not added to adversarial defect density.

Coverage includes strict DTOs and query boundaries, every new owner-scoped route, D1 migration/account identity, single-successor transaction, HTTP persistence/lost responses, cookies/CSRF/expiry/revocation, and retained send safety. Actual browser Secure-cookie acceptance and frontend visual QA remain a combined-run requirement. [Handoff](docs/handover/2026-10-05-server-recovery.md).

## 2026-10-06 — Integrated product and account-boundary review checkpoint

This entry records the current uncommitted integration work, separately from the verified historical milestones above. Review scope includes exact send-key recovery, stale-account protection, bounded mailbox history, Contacts consent/suppression, single-recipient Campaign drafts and Overview status counts. Backend and frontend remain simulated; no live provider/DNS/deployment review is implied.

Known product UI findings at this checkpoint: three campaign defects (clipped long content; unauthorized responses retaining visible account content; an old prepared-request link surviving draft edits), plus the analogous Contacts unauthorized-content issue. Fixes and focused regression tests were added. The Contacts gateway was also changed to reuse the shared account-bound HTTP client rather than bypass its identity binding. These are five confirmed product findings in this narrow record; they are not the aggregate count for all parallel integration reviews. The Contacts effect-cleanup lint warning is a separate tooling finding, not an adversarial defect.

Defect density for this checkpoint is pending the reviewers' measured exposure reconciliation; no estimated denominator is used. Historical defect densities above apply only to their dated assignments. Final acceptance still requires the updated unit/build log, real-backend browser suite, desktop/mobile light/dark screenshots and final review dispositions. Current reported Docker evidence: 56 backend tests passed and 45 demonstration browser tests passed with one intentional skip. Newly added product browser coverage has not yet been recorded as executed here.

Design decisions: keep the existing send ledger as the sole quota/approval authority; draft preparation is not dispatch; use exact indexed recovery rather than history scans; keep account-specific UI data transient; page disconnected mailbox history rather than loading it at startup. These reduce duplicate policy and unbounded work while retaining explicit review. Production identity, provider sync, desktop isolation and operational acceptance remain separate gates, not merely missing credentials.
## Resend delivery integration review

Independent review covered 286 unique requested lines (receipt ingestion, migration, tests and provider adapter), plus bounded supporting ledger/contracts context. One confirmed P2 defect: the send adapter allowed recipient shapes that receipt correlation could not accept. Defect density: 3.50 per 1,000 requested lines. Fixed by rejecting multiple To recipients and any CC/BCC before transport; regression tests cover these shapes. Independent coordinator inspection confirms the guard precedes transport. The preceding Docker checkpoint passed 193 backend tests; this subsequent regression still requires the next Docker run.

Svix verification was independently reviewed across 101 unique lines with zero confirmed behavioral defects (0 per 1,000 lines). Docker subsequently exposed a TypeScript BufferSource generic incompatibility; explicitly typing the decoded buffer as ArrayBuffer fixed compilation. The 193-test checkpoint includes the verifier and receipt service.

Resend connection recovery UI was independently reviewed across 234 unique lines with zero confirmed defects (0 per 1,000). Disabled or invalid server provider configuration retains metadata and revocation access. Final combined web validation remains pending.

## 2026-10-06 — Dispatch, notifications, AI seam and desktop design follow-up

Independent reviewers applied the mandated adversarial rubric: functional purpose; null, empty and maximum inputs; cross-system state; authorization and validation; focused responsibilities and complexity; meaningful happy/failure tests; documentation and hot-path work. Reads were bounded to 200 lines and each assignment to 400 lines. Formatting belongs to lint. This is measured assignment exposure, not all-source coverage; assignments may overlap.

| Assignment | Reviewed lines | Confirmed defects | Defects/1,000 lines | Disposition |
| --- | ---: | ---: | ---: | --- |
| Dispatch composition and recovery | 389 | 1 P2 | 2.57 | Resend unknown rows could starve supported receipt reconciliation; selection now filters immutable fake bindings |
| Send runtime and persisted receipts | 355 | 1 P2 | 2.82 | In-memory fake receipts lost restart recovery; replaced with DurableFakeProvider |
| Campaign envelope and unsubscribe coupling | 360 | 1 P2 | 2.78 | Missing origin permitted footerless Resend campaigns; preparation now fails closed and dispatch independently verifies token/origin |
| Resend signed event route | 317 | 0 | 0 | No actionable defect found |
| Inbox arrival notifications and coupling | 347 | 0 | 0 | Open-tab refresh scope accurately limited; no background push claim |
| Contacts agent review of runtime, tests, Worker and configuration | 390 | 0 | 0 | No actionable defect found |
| Relay and UI capabilities | 180 | 0 | 0 | No actionable defect found |
| Lifecycle acknowledgement and durable recovery regression | 118 | 0 | 0 | Tests follow durable relay ownership rather than expecting blind queue retries |
| AI HTTP context/draft seam | 256 | 0 | 0 | No actionable defect found; no native CLI integration implied |
| Dedicated native design review | 184 | 0 | 0 | Offline assets only; native tooling, IPC and installation limitations documented |

Total assignment exposure: 2,896 lines, three confirmed P2 defects, density 1.04 per 1,000 reviewed lines; all three fixed. Zero findings in a slice is not proof of absence of defects elsewhere. Historical entries above retain their original checkpoint limitations.

Dedicated design analysis compared durable receipt recovery against memory-only receipts, bounded supported reconciliation against unsupported-row starvation, and immutable approved unsubscribe content against late mutation. Tradeoffs were reasoned analytically; no Obsidian connection or simulation was performed. Native fixture work remains in progress and unvalidated. Current Docker evidence and outstanding visual/native/production gates are recorded in [takeover validation](docs/validation/2026-10-06-takeover.md).

### Restore and native fixture follow-up

Independent bounded reviews covered the cold D1 restore regression (103 unique lines, zero defects, density 0/1,000) and native fixture harness (163 unique lines, zero defects, density 0/1,000). These add 266 assignment lines with no confirmed defects; source review does not establish native compilation or execution. The focused restore regression passed in Docker after the Worker build, separately from the 214-test backend suite; see output/takeover/restore-check.log. No full 215-test suite execution is claimed.

## 2026-10-06 — Gmail replies and CLI preparation

Independent Gmail reply review covered 338 unique lines and found one P2 (2.96 defects per 1,000 lines): trimming the original subject could reject a valid reply. Fixed by retaining exact reply subjects while ordinary compose still trims; nine focused Docker tests and static checks passed after the fix. Immutable source snapshots bind approved thread, recipient and headers. Custom Reply-To and reply-all are not supported.

Frontend reply review covered 428 unique lines, zero actionable defects (0/1,000). No individual read exceeded 200 lines; the reviewer exceeded the requested assignment cap by 28 lines, disclosed here rather than claiming strict compliance. Separate CLI preparation review covered 133 unique lines, zero defects (0/1,000). The adapter remains a disabled fixture and does not establish real CLI compatibility or isolation.

Dedicated design assessment favored immutable reply metadata and fail-closed provenance. Obsidian was unavailable; tradeoffs were assessed analytically, without a claimed simulation. Counts describe reviewed slices, not whole-repository coverage.


## 2026-10-06 — Sequences, native process I/O and handoff tickets

Independent bounded source reviews: Windows process I/O 339 unique lines, zero defects (0/1,000); sequence backend 340 lines, zero defects (0/1,000); sequence frontend source/tests initially 251 lines, zero defects (0/1,000). Follow-up frontend review covered the aggregate UTF-8 envelope bound, unchanged retries after due time, and regression tests; no actionable defect. The 18-line unsupported-reply browser regression was also reviewed without a finding. These counts are slice coverage, not a whole-repository assurance.

Native ticket review covered 159 unique baseline lines and found two P2 defects (12.58/1,000): a slow request could use stale request-start time, and revocation during context loading could precede ticket consumption. Fixed with elapsed-time expiry checks and an atomic consume condition that rechecks the session and mailbox grants. Five Docker regressions and static checks passed, including delayed body and mid-context session revocation.

Design review accepts at most 25 sequence records and three steps each; bounded per-record step reads are an intentional pilot tradeoff. Real activation is blocked before quota reservation until reply correlation is implemented. Installed CLI executables and administrator configuration are trusted local software; Windows process containment is not filesystem/network sandboxing. Obsidian is unavailable; these tradeoffs were assessed analytically, not through an Obsidian simulation.

## Final frontend and pilot checks — 2026-10-06

- Hunter source: 122 lines reviewed by the backend teammate; 1 P2 defect, density 8.20/1,000. Configuration status failure incorrectly hid independent revocation. Fixed and regression tested; rereview found no further defect.
- Pilot measurement: 83 lines independently reviewed by coordinator; 0 defects, density 0/1,000. Harness scheduled-entrypoint typing: 7 lines, 0 defects, density 0/1,000. Reads remained below the 200-line review limit.
- Docker web lint/typecheck/build and 480 tests across 51 files passed. API browser suite 39/40, then corrected obsolete enrichment-placeholder expectation and affected journey passed 1/1; dedicated Hunter gate regression passed in full run.
- Pilot 10 owners/100 mailboxes/10k messages: 3,100 approvals at concurrency20 yielded exactly 3,000 reservations and100 quota refusals. Detailed local latency/resource limits are in docs/validation/2026-10-06-frontend-completion.md. No cloud performance or cost claim.

## Restricted DNS, receiving and operations follow-up — 2026-10-06

| Independent review assignment | Reviewed lines | Confirmed defects | Defects/1,000 lines |
| --- | ---: | ---: | ---: |
| Resend receiving envelope, signed receipt service, route, migration, tests and immutable-send coupling | 217 | 0 | 0 |
| Receiving follow-up: Worker routing, sequence channel forwarding and transport/route regressions | 50 | 0 | 0 |
| Coordinator review: isolated DNS planner, reader and tests | 122 | 0 | 0 |
| Coordinator review: maintenance | 93 | 0 | 0 |
| Coordinator review: health | 23 | 0 | 0 |
| Coordinator review: restore | 71 | 0 | 0 |
| Coordinator review: operations | 45 | 0 | 0 |

Counts describe bounded assignment exposure, not disjoint whole-repository coverage. Coordinator counts are recorded from the coordinator's independent review reports. Reads remained within the 200-line limit and each assignment within 400 lines. Reviews applied the required functionality, boundary/authorization, state coupling, failure tests, maintainability and cost checklist; formatting belongs to automated checks. Zero findings is not proof of production readiness.

Receiving follow-up examined tests lines 32–54, Worker lines 70–78 and 161–169, and sequences lines 38–46. The signed receipt proves receipt by the provider, not sender identity. An opaque reply address plus original-recipient matching can stop a campaign; it cannot grant consent or send mail. Receipt deduplication, campaign stop and waiting-send cancellation are atomic. Already in-flight mail cannot be recalled. Trusted operators must approve the receiving subdomain: a three-label check is not public-suffix validation. Live sequence activation remains disabled pending operational acceptance. See [receiving scope](docs/resend-replies.md).

DNS review covered plan 46, reader 36 and tests 40 lines. Four focused Docker tests, scoped strict typecheck and lint passed. This boundary is read-only and is not connected to a DNS management UI. Its before-state fingerprint does not supply provider-side atomic conditional writes. No mutation executor, deployment or DNS change is claimed. See [DNS boundary](docs/dns-broker.md). Disposable test containers used `--rm`; no new images or build cache were created, and the shared backend image was retained for active work.

Dedicated design comparison favored stop-only receiving correlation over treating a webhook as sender authentication, and isolated read-only DNS planning over claiming unsafe read-then-write atomicity. Obsidian was unavailable; this was analytical tradeoff assessment, not an Obsidian simulation. Operations review counts do not establish independent off-site recovery or live monitoring acceptance.

## Final visual and desktop handoff review — 2026-10-06

- Actual 20-frame desktop/mobile light/dark review found one mobile sequence action clipping defect. Fixed with wrapping; independent 17-line contextual review found zero additional defects (0/1,000). Screenshot rerun asserted button bounds and verified both mobile themes. This is one visual defect across 20 inspected frames, not a source-line density measurement.
- Assistant title fix: five changed lines independently reviewed, zero defects (0/1,000). Existing hook reused and regression checks document title.
- Desktop handoff: 138 source lines plus 44 test lines independently reviewed in reads below 200 lines (182 unique total); zero defects (0/1,000). Checked local window capability/origin boundary, atomic overlap guard, bounded malformed/expired input, async cleanup, redacted failures, memory-only handoff/output and no false sandbox claim. Tests meaningfully exercise overlap/release, bad handoffs, unavailable runtime, loading and plaintext results. Live CLI and installed-app acceptance were not inferred from fixtures.
- Packaging follow-up: approximately50 additional script/workflow/copy lines reviewed (combined desktop assignment232 unique), zero functional defects (0/1,000). Fixed target-OS invocation, nonpublication/read-only permissions and ad-hoc Mac signing were checked; native bundler execution remains unverified. Full lint found a missing explicit Node URL import; owner fixed it, preserving behavior. Style findings are kept separate from adversarial defect density.
- Sequence capability follow-up: coordinator independently reviewed approximately90 lines including context/tests, zero defects (0/1,000). Response flag is strictly boolean, unloaded/disabled copy fails closed, configured Resend still requires per-mailbox checks and individual approval. Focused Docker13 tests plus typecheck/scoped lint passed.
- Final combined frontend checkpoint: whole-project lint, TypeScript, 485 tests/52 files and production build passed (complete-web-final.log). Updated mobile sequence browser regression passed 1/1. Generated image-only tauri-validation/dist was removed inside the disposable container before full lint; no repository ignore or source deletion. All one-off containers exited with --rm; shared preview remains until coordinator cleanup.

## 2026-10-06 — Guarded sequence activation and desktop design

Coordinator bounded activation review covered helper 13, migration 25, route 49, ledger transition deltas and tests 75 lines; follow-up covered migration 25, helper 13, relay context 60 and tests approximately 80. No additional defect was found in either bounded slice (0/1,000 reviewed lines); overlapping reads are not additive unique coverage.

Integration inspection found two defects in the 85-line relay/migration boundary: the relay still excluded all real sequences, and the transition trigger incorrectly required fresh proof for a same-status pending deferral. Both were fixed with regression assertions for gated queue admission and deferred status preservation. Defects: 2; density: 23.53 per 1,000 inspected lines. The SQL guard applies only to actual state transitions; proof remains consumed after approval/dispatch. Channel domain, endpoint and secret rotation are tested alongside removal, default-off and legacy drafts. This is scoped evidence, not all-source coverage.

Dedicated desktop design review examined 241 source/config lines across main.rs, desktop_draft.rs, tauri.conf.json and native_runtime.rs. Zero actionable design defects (0/1,000). Bundled local UI plus a narrow command and one-use server handoff avoids giving remote pages native execution authority. Manual paste reduces listener/deep-link exposure at the cost of convenience. Process locks, bounded I/O and Windows job containment address concurrency/resource lifecycle, not filesystem/network sandboxing. The installed executable, profile and managed policy remain trusted inputs; installed-CLI acceptance, macOS execution and installer visual validation remain outstanding. Obsidian was unavailable: these were analytical tradeoffs, not an Obsidian simulation. No real CLI or provider was invoked by this review.
