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
