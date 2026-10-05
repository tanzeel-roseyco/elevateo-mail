# Product and design context

## Confirmed product
Elevateo Mail is a personal inbox and consent-based campaign application planned for web, Windows and macOS. Ten independent users can connect up to ten mailboxes each across separate Google Workspace organisations or personal Gmail. Users remain private from each other.

Each connected mailbox may send at most 30 emails per day through the app. This permits at most 300 per user and 3,000 across the pilot. Rolling 24-hour counting by recipient delivery, including CC/BCC, is proposed; aliases, reconnects and different sending routes must share the same mailbox quota. The app cannot limit messages sent elsewhere.

Existing inboxes need real Gmail sync and notifications. Resend is suitable for eligible opted-in campaigns on owned verified domains, not a replacement for Gmail mailbox hosting. Named self-hosted providers follow through explicit capabilities; “any provider” is not an implemented promise. Users can add mailboxes, import recipients and import history.

Cloud scheduling keeps approved campaigns running while the PC is off. Local Codex is the primary AI provider; restricted Claude fallback uses each user's own account. Read selected mailboxes and draft are defaults; sending requires separate permission and approval. Hunter and AMF provide optional enrichment data; AI performs personalisation. AMF's role is confirmed, but its exact product/API still needs identification. Provider keys belong to their user.

## Canonical planning documents
- [Distribution PDF addendum](output/pdf/elevateo-mail-distribution-plan.pdf): web access, direct Windows/Mac downloads, desktop-only local AI, signed updates and separate release costs. Extends the earlier master PDF's Windows-only scope; implementation remains unstarted.
- [Master plan PDF](output/pdf/elevateo-mail-master-plan.pdf): requested reader edition, with [frontend](output/imagegen/elevateo-mail-frontend-sketch.png) and [system architecture](output/imagegen/elevateo-mail-system-design.png) concept sketches. Generated using the built-in image tool; [generation and edit prompts](output/imagegen/sketch-prompts.txt). All ten PDF pages were rendered and visually inspected.
- [Product master plan](docs/product-master-plan.md): plain-English decisions, diagrams and section-specific review.
- [Backend blueprint](docs/backend-blueprint.md): data ownership, API boundaries, failure handling and rollout.
- [Efficiency plan](docs/efficiency-plan.md): resource/cost controls and measurable performance targets.
- [Connections contracts](docs/connections/README.md): provider capabilities, AI permissions and approved-subdomain DNS.
- [Draft backend standards](.planning/BACKEND-STANDARDS.md): approval required before backend/desktop execution.
- [Research index](docs/research/2026-10-04/README.md): six initial and ten follow-up assignments, evidence and limitations.

## Current prototype and its limits
The browser prototype has no real backend, provider integration, authentication, AI bridge or DNS access. Its 840 contacts, six campaigns and nine sender identities are fictional fixtures, not production capacity or permissions. Sending, scheduling, events and domain status are simulated.

- Campaign recipients need recorded opt-in and subscribed status; rules recheck suppression at simulated dispatch. Ordinary replies currently show warnings instead of campaign blocks. Production must classify message purpose and cannot permit this path to bypass marketing suppression.
- Campaign times use Settings' sending timezone. Replies default to the receiving identity; reply-all excludes our own addresses.
- Banners are per identity and opt-in. Changing sender restores that identity's default.
- Delivered means recipient-server acceptance, never read/opened. The backend must separately record provider acceptance and delivery evidence.
- Single stored folder per thread is a prototype simplification; Gmail integration requires labels and provider identifiers.
- Message bodies render a small markdown subset as React nodes. Real inbound HTML needs sanitisation and isolated display before rendering.
- Navigation and filters use URL state. Validated Zustand/localStorage data and seed fallback are prototype-only, not server persistence or recovery.
- Existing mailroom:data:v1 and mailroom:appearance:v1 keys remain unchanged after the product rename.
- MailroomGateway is the backend seam; several direct store mutations are a documented deferred review finding. Move these with pending/error/conflict UI when integrating the API.

## Design direction on design/fable-frontend (final build verified)
"Ledger": warm paper canvas, white work surface, ink text and hairlines; ink marks the constant action (Compose), the accent marks state (current area, active mailbox, selection, filters). System fonts only, no new dependencies. Full rationale: [design report](docs/design/fable-design.md). Actual Fable 5.1 delegation and Codex review completed. Final Docker checks passed: 135 unit/component tests, 29 browser tests, lint, typecheck and build; one intentional mobile skip. Initial JS 180.49 KB gzip. [Verification and visual evidence](docs/validation/2026-10-04-fable.md).

- A mailbox is a URL scope (`?domain=`, `?identity=`) chosen in the mail rail from tablet width up and by selects on phones. It follows folder links; other filters reset on a folder change. Drafts honour it.
- Folder badges count inside the mailbox scope, so a badge matches the list its link opens. Each row names its mailbox with a short label (`lachlan@boltloop`) in every layout.
- Active filters are always shown as removable chips with a result count. Ticking rows swaps that row for the bulk toolbar. Ticks belong to the list as filtered: any filter, mailbox or folder change clears them; opening and closing a conversation does not.
- Split reading needs a 1280px window; below that the list is single-pane.
- The reader keeps Reply, Reply all and Forward pinned, states the address replies go from, and links to the newer and older conversation in the filtered list.
- Overview separates problems (Alerts) from work (Next up: longest-waiting reply, stalled campaigns, drafts).
- 30 sends per mailbox per day is the confirmed rule. In the prototype it is one constant (`DAILY_LIMIT_MAX`) that caps the Settings and campaign limit fields, sets their default and the seed, and is the reference figure in the Overview mailbox table. The prototype validates the setting only: it does not count or block sends per mailbox, and the table counts calendar-day simulated `sent` events, not a rolling window. A load-only migration clamps previously valid limits above 30 and preserves other saved data. Invalid records still fail validation.
- Domain colour markers are decorative and always paired with the domain or address in text.

## Backend direction, not implemented
One modular backend and one authoritative sending scheduler. Durable database records own users, mailbox connections, consent, suppression, campaign state, send intents and audit events. A queue wakes workers; it is not the source of truth.

Reserve quota atomically before dispatch. Check ownership, permission, consent, suppression and approval at the final admission boundary. Deduplicate incoming events. Treat timeout after a send request as an unknown outcome until reconciled; do not promise exactly-once external delivery or blindly retry.

Bound sync, imports, search, retained bodies and attachments. Load message bodies when needed, keep local AI off until requested, and separate urgent inbox/send work from imports. All runtime inputs and provider events are untrusted. Keep credentials out of logs/client bundles and isolate each user on every read, write and object lookup.

## Hosting and performance
Under A$15/month is the hosting target, excluding external email/AI subscriptions, Google verification and signing. Proposed 50 GB total cloud file storage including backups is not an agreed quota. Illustrative Workers/R2 base is A$10.47; a busy 100-mailbox, five-minute reconciliation scenario is about A$11.87 before push-driven work, retries, backup independence and other overages, using assumed FX/tax. These are estimates, not guarantees or measured benchmarks. See the efficiency plan for arithmetic and sources.

A small health screen should expose stale sync, unknown sends, overdue work, auth errors, capacity and backup age. Reuse provider logs and bounded counters. Name an independent outage checker, alert destination, backup trust boundary, key-recovery owner and costs before launch.

## Root MX incident and inbound routing
The user's pasted CTO messages report accidental root MX replacement on boltloop.co, flooda.co and elevateoco.com, followed by restoration to Google. These messages are incident context, not independently verified DNS state or permission to modify infrastructure.

Preserve company root MX. Gmail API access requires no MX change. MX priority is a preference among mail exchangers, not per-app routing or mail duplication. App-specific receiving can use a separately approved subdomain; in.elevateoco.com reportedly already has consumers and must not be repointed without checking ownership and dependencies. A campaign Reply-To on a subdomain does not capture mail addressed directly to a root-domain mailbox.

Users requested DNS management for explicitly approved subdomains. The design uses a separate broker with exact record previews, explicit approval, server-side policy and audit. AI and the application must never receive unrestricted zone credentials. If provider credentials cannot enforce the required boundary, keep writes manual until the broker containment is established. Read-only status is the first stage.

No DNS, AWS, Cloudflare or API-key changes were made. Recoverability of historical mail has not been investigated. The reported USD10 OpenAI project cap is unverified context, not authority to create keys or a guaranteed spending control.

## Remaining section-specific decisions
1. Quotas: approve rolling 24-hour/per-recipient counting, including manual mail and CC/BCC.
2. Data: retained history, import batches, attachment storage, export/deletion and regions.
3. Identity: authentication/MFA, external Google approval path and permitted Gmail-to-AI data use.
4. Connections: identify AMF and the first self-hosted server/API; review provider capability contracts.
5. Operations: independent backups/key recovery, outage destination, consent evidence and recipient jurisdictions.

See the master plan's review table rather than reopening already confirmed user/mailbox counts.

## Primary references
- [Gmail sync](https://developers.google.com/workspace/gmail/api/guides/sync)
- [Resend documentation](https://resend.com/docs) and [acceptable use](https://resend.com/legal/acceptable-use)
- [SES receiving setup](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-setting-up.html)
- [C4 diagrams](https://c4model.com/introduction)

Capabilities, policies and prices were researched for planning and must be rechecked at integration. Separate domains reduce some reputation coupling but cannot guarantee isolation.

## Excalidraw design handoff

[Agent brief PDF](output/pdf/elevateo-mail-excalidraw-agent-brief.pdf) supplies the requested copy-and-paste prompt on pages 1–4 and actual Fable frontend captures on pages 5–10. Original PNGs and the identical prompt text are embedded as attachments. The prompt asks for eight linked planning sections, editable wireframes alongside the screenshots, plain-English explanations, missing/error states and portable Excalidraw/PDF/PNG deliverables. It distinguishes the existing simulated frontend from proposed backend, desktop, AI and DNS work.

Verification: all ten pages rendered and visually inspected; extracted text, ten bookmarks and eight attachments checked; all seven attached PNGs match their source files byte-for-byte. Document review checked each prompt section and corrected one omitted AI launch gate. This handoff does not create diagrams or change application code; prior application validation remains unchanged.

## Brand theme, Connections and AI Assistant (5 October 2026)

**Theme.** Tokens live in `src/styles/index.css`; `src/domain/appearance.ts` mirrors `--surface` for contrast maths and holds the default accent. Light: white surface on a pale grey canvas. Dark: `#25262a` panels on a `#1b1c1f` canvas. Accent: gold `#c9a227`, used for state (current page, selection, progress, primary buttons), never body text; link-coloured text is darkened automatically to keep 4.5:1. Compose stays ink so it keeps its weight under any accent. The logo is `public/logo.png` (160px, transparent, from `output/branding/`), drawn with no backing shape.

**Connections** (`src/features/connections/`, route `/connections/:section`). Rules are pure functions in `src/domain/connections.ts`; state is `connections` inside the persisted data (`mailboxes`, `resendIdentities`, `ai`), validated by `connectionsSchema`. No field holds a credential.
- *Mailboxes:* up to ten; the nine demo identities appear as connected and cannot be removed. Connecting records an address only, read-only until send permission is granted. A `+tag` alias counts as the same mailbox. Usage shows simulated sends since local midnight against 30; nothing is blocked.
- *Sending:* explains the two planned routes (the mailbox itself; Resend for opted-in campaigns on approved subdomains) and keeps campaign and transactional identities separate. Lists the limit rules still undecided.
- *AI:* which mailboxes the assistant may read, whether it may draft, whether it may send with approval. Changes are applied one at a time. The browser can never reach a local CLI, so status is always "not detected".
- *Enrichment:* Hunter and AMF, no key field.
- *Domains:* root MX is shown as protected; only a proper subdomain of a known domain can await approval; nothing can edit DNS.

**AI Assistant** (`/assistant`). Lists conversations awaiting a reply in readable mailboxes. "Prepare draft (simulated)" saves a fixed placeholder as an ordinary draft, built only from the sender's first name; message content is never copied into it. Sending is only ever done by the person from the composer.

**Gateway.** `src/data/ports.ts` adds `loadConnections`, `connectMailbox`, `disconnectMailbox`, `importMailboxHistory`, `updateAiAccess` and `prepareAiDraft`, each returning the resulting DTO; the mock is `src/data/mockConnections.ts` and re-validates everything a server would. `?simulate=connections-error` fails the first Connections load to show the retry state.

**Resilience.** `src/ui/Async.tsx` provides `useLoad`/`LoadGate` (skeleton, error with retry) and the offline banner; connect, import and draft actions are disabled while offline.

**Limits.** Quota figures are a display derived in the browser and must be replaced by a server usage figure; they are not enforcement. Gateway adapters still write the cache themselves (deferred). Saved appearance preferences keep their previous accent.

## Backend integration (5 October 2026)

- Two builds. The demonstration build is the prototype with fixture data. The API build (`VITE_BACKEND=api`) contains no fixtures and shows only what the server returns; when the server cannot be reached it shows an error, never sample mail or a simulated success.
- One owner of server state: `createLive` in `src/data/http/live.ts`. The gateway (`httpGateway.ts`) only makes requests; pages call `live` actions and read the store. Sign-out, an expired session and a change of account drop all cached account data, in every tab.
- A send request is a record with an idempotency key stored in the browser before the first request is made. If it cannot be stored, nothing is sent. States shown: draft, not confirmed, awaiting approval, queued, sending, accepted by provider, rejected, cancelled, outcome unknown. Approval is not sending and acceptance is not delivery; the wording says so.
- Recovery: after a lost answer or a reload the same key is replayed or the same intent is read. Unknown outcomes are not polled and cannot be re-sent from the UI. Changing a submitted message cancels it and creates a new draft needing new approval.
- Capacity is whatever the server reports (available, accepted, held). No browser-midnight arithmetic and no reset countdown when release time is unknown.
- The inbox page position is the server cursor in the URL, so a reload reopens the same page.
- Areas without server support (campaigns, contacts, assistant, provider connections, DNS, enrichment, search) are shown as unavailable.
- Contract use and gaps: docs/contracts/integration-v1-frontend-notes.md. Evidence and production gates: docs/validation/2026-10-05-backend-integration.md.

## Server-owned send requests and cookie session (5 October 2026)

- The server owns send requests. The list (`GET /v1/send-intents`) has no subject or recipients; the exact saved content is read (`/:id/content`) when a request is opened and is held in memory only, at most twenty opened requests at a time.
- The browser persists two kinds of thing for the API build: one entry per submission that has no answer yet (`elevateo:pending:<accountId>:<idempotency key>` holding a start time and the id it replaces), and two change markers other tabs listen for (`elevateo:account`, `elevateo:sync`). No message text, subject, recipient or token.
- Each pending key is its own storage entry, so two tabs never rewrite a shared list. At twenty unresolved keys a new submission is refused; none is dropped.
- Lost answer: in the same tab the identical request is repeated under the same key. After a reload the content is gone, so the key is looked for in the server's list, ten pages of fifty per check, continuing where the last check stopped. Only reaching the end of the list proves the request was never saved; clocks are not compared.
- Edit is `POST /:id/replace`: the server cancels the old request and creates one successor atomically. A tab that loses the race is shown the winner's successor and told its own wording was not saved. A successor is never approved by being created.
- Session: `__Host-elevateo_session`, HttpOnly. Every write sends `X-Elevateo-CSRF: 1`. The page learns who it is from `GET /v1/me`. Account data is dropped on sign-out, on any 401, and when another tab reports a different account (dropped first, then the server is asked). The account is confirmed twice while loading so one account's id is never stored beside another's data.
- What is typed in Compose lives in component memory until submitted. Leaving the page discards it. Reply passes two ids through router state, never an address or subject.
- Records from the earlier version (`elevateo:sends:*`): a record is removed from the browser only when the server returns saved content under the same key that says the same thing. All others stay, are counted on the Send requests page without showing their text, and go only when the person chooses Discard. The old `elevateo:session` token is removed at start.
- Sign-in: production has none. The Docker fixture build (`VITE_FIXTURE_SESSION=1`) shows two synthetic-user buttons; any other build shows "You are not signed in".
