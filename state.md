# Project state

## Current integration milestone — 6 October 2026

The active worktree is `C:\Users\Tanzeel\Code and projects\Elevateo Mail - Integration`, branch `feature/application-integration`. Frontend and backend are integrated locally. Nothing has been pushed or deployed; no live sending or DNS writes occurred.

Implemented: owner-isolated inbox and plaintext reading, contacts and explicit consent, sticky suppression, immutable send approval and lost-response recovery, campaign drafts and short sequences, Google login, Gmail sync/manual threaded replies, Resend transport/events/unsubscribe/receiving reply stop, optional Hunter enrichment, bounded search/import, selected-message AI context, native draft tickets, job health and expired-record maintenance. Provider capabilities are configuration gated. Every campaign step needs separate approval. Resend sequence activation is default-off and bound to the exact receiving channel; live acceptance is still required before enabling it.

The Windows Claude companion has bounded process and protocol fixture coverage. The local-only desktop draft handoff is implemented and the Tauri shell compiles; Codex primary/fallback and macOS companion remain incomplete. Unsigned Windows/macOS packaging is scripted but installers have not been built or accepted. No operating-system filesystem/network sandbox or installed-app acceptance is claimed. DNS currently provides restricted read/change-plan primitives, not a live write executor. Notifications require an open tab refresh; there is no closed-app push.

Latest checkpoints: backend static checks and 264 tests passed; final web lint/typecheck/build and 485 tests passed; 39 of 40 API browser checks passed, with the obsolete enrichment assertion corrected and its affected journey passing separately. Four compiled Tauri tests, five native protocol tests and twelve Windows process fixtures passed; the mobile sequence browser regression passed separately. Local simulated load admitted exactly 3,000 sends across 100 mailboxes and rejected 100 over-limit attempts. These are separate checkpoints, not production acceptance. See `docs/validation/2026-10-06-takeover.md` and `docs/completion-matrix.md` for evidence and outstanding work.

The ledger uses provisional rolling limits of 30 recipients/mailbox and 300/user, with ten mailboxes/user. Production policy approval, real provider acceptance, desktop packaging/signing, cloud backup/key recovery and measured hosting cost remain gates. Under A$15/month is unproven. Root MX stays untouched. Credentials remain last; see `docs/credentials-last.md` for the configuration checklist and `docs/completion-matrix.md` for implementation gaps.

## Historical planning and milestone record

The record below describes earlier stages; the current integration section above supersedes its status claims.

Status: verified frontend prototype on feature/frontend-prototype, with the verified Fable redesign isolated on design/fable-frontend. Backend and desktop remain planned, not implemented.

Status: backend foundation implemented on feature/backend-foundation under explicit 2026-10-05 authorisation. Frontend work belongs to the separate Fable worktree; desktop and live integration remain pending.

## Historical branch design/fable-frontend
- **5 October 2026, server-owned send requests (committed locally, not pushed):** built against backend `2305895`. Send-request history, content and state come from the server; the browser keeps only per-account idempotency keys of unanswered submissions. Edit is the server's atomic replacement. Session is an HttpOnly cookie; the pilot-token screen is removed. Request history is server-paged. Legacy browser records are reconciled or kept until discarded. The five findings open after the previous milestone are closed. Open: one P2 (the 20-key limit is not atomic across tabs) and the production gates in docs/validation/2026-10-05-server-recovery.md (no production sign-in, no lookup-by-key route, no server push, one journey only). Not deployed; no real provider.
- **5 October 2026, backend integration milestone (committed locally, not pushed):** API-backed build (`VITE_BACKEND=api`) added beside the demonstration build. `src/data/http/` holds the HTTP adapter and the single cache owner (`live.ts`); `src/features/live/` holds its pages; `src/domain/sendLifecycle.ts` holds the send state rules. Verified in Docker against the real backend Worker (`49fc23e` + its uncommitted integration work): 267 unit, 45 demonstration browser, 20 real-backend browser tests. AI-permission defect fixed. Open: 5 review findings (cross-tab write race, token and message text in browser storage, successor drafts across tabs, unbounded unfinished records) and the production gates in docs/validation/2026-10-05-backend-integration.md. Not deployed; no real provider. Suggestions and decisions needed: docs/proposals/2026-10-05-integration-suggestions.md.
- Worktree: C:\Users\Tanzeel\Code and projects\Elevateo Mail - Fable Frontend. Changes are uncommitted and not pushed.
- Actual installed Claude CLI model `claude-fable-5-1` produced the Ledger redesign and first review fixes. Codex agents reviewed small slices, including a dedicated design review; parent integrated remaining fixes.
- Faster inbox management: mailbox rail, scoped folder counts, visible filter chips, bulk actions, row Archive/Undo, pinned replies and filtered conversation navigation. Overview adds Next up, sending figures and mailbox activity. Campaigns shows status counts, progress and reply rates.
- Final Docker verification: lint/typecheck/build passed; 135 unit/component tests, 29 browser tests passed and one intentional mobile skip. Initial JS 180.49 KB gzip; no new dependencies. Desktop/mobile/light/dark visuals inspected. See docs/validation/2026-10-04-fable.md.
- Previously valid saved limits above 30 migrate down to 30 without discarding unrelated saved data. Invalid records still fail validation. The UI setting is validated; daily mailbox sending enforcement is not implemented.
- Earlier PDF and concept-image deliverables are copied here; final frontend screenshots are in output/fable/.
- Review accounting is in code-reviews.md. No real provider, AI, DNS, native packaging or backend was added.
## Repository
- Local: C:\Users\Tanzeel\Code and projects\Elevateo Mail
- Private GitHub: https://github.com/tanzeel-roseyco/elevateo-mail
- Product and repository branding renamed. Existing mailroom:* browser-storage keys are preserved to avoid losing prototype data.

## Completed
- Created output/pdf/elevateo-mail-excalidraw-agent-brief.pdf: ten pages, four-page copyable prompt and seven Fable mockups. All pages rendered and inspected, embedded PNGs verified byte-for-byte, text and bookmarks checked. Section review found one AI launch-gate omission, corrected before delivery. Document-only work; no application tests, Docker, deployment, commit or push. The editable Excalidraw board remains future work.
- Temporary PDF builder, intermediate PDF, text extract and render images remain in tmp/pdfs/excalidraw-brief: cleanup command was rejected as blocked by policy. Final PDF and original screenshots are intact.
- Added requested web and macOS scope alongside Windows. Proposed direct `.exe`/`.dmg` distribution and one shared backend; initial local CLI AI is desktop-only. Distribution PDF addendum records signing costs and native release checks. No installers, downloads site or production web app has been built or published.
- Distribution PDF verification: both pages rendered and visually inspected; text and six clickable source links checked. No application source changed or Docker testing required for this document-only update.
- Reader edition: output/pdf/elevateo-mail-master-plan.pdf (10 pages), plus frontend and system-design PNGs in output/imagegen/. Rendered and visually inspected all PDF pages; text, page count and output links checked. Latest correction: Hunter/AMF supply optional enrichment, AI handles personalisation. This artifact-only change did not rerun application tests or use Docker.
- Approved frontend standards and interactive browser prototype: inbox, compose, campaigns, contacts, activity, settings and search.
- Six initial research assignments (three Codex, three actual Claude CLI sessions), followed by ten connection/efficiency assignments; reports and synthesis in docs/research/2026-10-04/.
- The ten follow-up assignments ran in waves because the environment permits three concurrent child agents; ten simultaneous agents were not available.
- Product master plan, backend blueprint, efficiency plan, connection/provider/MCP/DNS contracts and draft backend standards.
- Scoped branding review: 168 lines, six changed lines, zero confirmed defects. Four planning findings incorporated into the synthesis or retained as explicit launch decisions.
- Historical frontend review: 57 defects found, 56 fixed, one deferred. Fresh Docker validation on 2026-10-04: lint/typecheck/build passed; 101 unit/component tests and 27 browser tests passed, with one intentional mobile skip. Desktop/mobile branding visually inspected. See docs/validation/2026-10-04.md for evidence and cleanup.

## Confirmed pilot
Ten completely separate users, up to ten mailboxes each (100 total). Maximum 30 outgoing emails per connected mailbox per day: effective maximum 300/user/day and 3,000 total/day. The earlier 600/user/day figure is an expansion scenario, not a pilot allowance.

Existing Google inboxes from separate organisations/personal Gmail; Resend for eligible opted-in campaigns; staged self-hosted support. Users bring their own provider keys and local Codex/Claude accounts. AI can read selected mailboxes and draft by default; sending is separately enabled and approved. Approved campaigns run in the cloud when the PC is off.

Private Connections can manage explicitly approved subdomains through a narrowly authorised broker. Preserve company root MX and existing inbound consumers. No DNS or provider credentials were changed. Hunter and AMF provide optional enrichment; AI performs personalisation. Exact AMF product/API identification remains open.

Hosting target: under A$15/month, excluding mailbox/provider/AI subscriptions, external verification and signing. Proposed 50 GB cloud file allowance and history/import limits remain subject to review; cost examples are conditional.

## Approval and launch decisions
- Backend foundation implementation authorised explicitly on 2026-10-05, credentials last. Production/desktop standards and policy decisions remain open; the foundation uses conservative simulation defaults.
- Review master plan sections individually: rolling 24-hour/per-recipient quota semantics; history, imports and storage; authentication/MFA and regions; one named self-hosted adapter and AMF identity; Google external OAuth and AI data-policy compliance; independent backup/key recovery and outage alerts.
- Frontend STANDARDS section 3 private-helper amendment still needs confirmation.
- Dependency maintenance: three moderate development-tool audit entries share one Vitest advisory. No production dependency entry was reported; upgrade and revalidation remain outstanding.
- Deferred prototype review finding: some mutations bypass MailroomGateway. Route them through the API seam with pending/error/conflict handling during backend integration.

## Next live integration sequence, after release decisions
1. Authentication and two-user isolation; one real Gmail connection and incremental sync.
2. Durable sending ledger, quota reservation, consent/suppression, recovery and cloud scheduling.
3. Resend and a named self-hosted adapter; controlled history imports.
4. Windows shell and restricted local AI bridge; Connections permissions.
5. Scoped DNS changes only after record-level authorisation is proven; restore/load/security/Windows launch checks.

Read output/pdf/elevateo-mail-master-plan.pdf for the reader edition, then docs/backend-blueprint.md for implementation detail. docs/product-master-plan.md remains the editable planning source. Research reports are evidence; older capacity scenarios do not override the pilot above.

## Branding and implementation brief — 2026-10-04
User selected gold accents, white light mode and dark-grey dark mode. Preserve Fable layouts. Transparent gold logo saved to output/branding/elevateo-mail-logo-transparent.png; RGBA alpha verified 0–255. Copyable implementation prompt saved to output/elevateo-mail-build-prompt.txt. No application code changed; credentials remain the final integration stage. Backend standards remain unapproved. Latest Fable work remains local and uncommitted.

## Brand theme, Connections and AI Assistant — 2026-10-05
- Branch `design/fable-frontend`, committed locally, not pushed. Frontend only; the backend agent's `feature/backend-foundation` worktree was not touched.
- Done: gold/white/dark-grey tokens and transparent logo; sidebar renamed Mail → Inbox and gained AI Assistant and Connections; Connections sections Mailboxes, Sending, AI, Enrichment, Domains; AI Assistant draft-preparation preview; offline banner; shared load/error gate; six new `MailroomGateway` methods returning DTOs; saved data from before this change loads with default connections.
- Verified in Docker on fleet-02: 187 unit/component tests, 45 browser tests (one intentional mobile skip), lint, typecheck, build; initial JS 183.23 KB gzip. Visual QA in both themes at desktop and phone sizes. See docs/validation/2026-10-05-brand-connections.md.
- Reviewed: 1,054 source lines, 14 defects (13.28 per 1,000 lines), all fixed; 16 test weaknesses addressed; one design finding deferred (single cache coordinator for gateway adapters). Reviewers ran on `gpt-6.1-sol`, not the `gpt-5.6-sol` named in the routing rules.
- Needs approval before any quota is enforced: daily window, To/CC/BCC counting, whether Resend sends draw on a mailbox's allowance, alias matching. See docs/proposals/2026-10-05-open-decisions.md. Backend standards remain unapproved.
- Not done, by design: credentials, real providers, deployment, DNS, desktop shell. Saved appearance preferences keep their old accent; only new or reset profiles get gold.

Read docs/product-master-plan.md first, then docs/backend-blueprint.md. Research reports are evidence; older capacity scenarios do not override the pilot above.

## Backend foundation handover (2026-10-05)
Interrupted CLI backend files were preserved and extended. No frontend source or Fable worktree was changed. See docs/backend-foundation.md, code-reviews.md and output/backend-agent-result.md for contracts, verification, review dispositions and credentials-last gates. Real sending, DNS writes, deployment and pushing remain disabled.

Backend completion verification (2026-10-05): final Docker types/lint/typecheck/dry-run bundle and 24 tests passed. Twelve adversarial/design defects fixed. Task-owned Docker image/cache removed; persistent volumes retained. See docs/validation/2026-10-05-backend.md. Committed implementation retains disabled real sending, DNS and deployment; original CLI artifacts remain uncommitted.


## Credential-free HTTP integration milestone (2026-10-05)

Backend-owned first journey implemented: capability discovery, stable mailbox inventory/independent AI read-draft flags, bounded summaries/lazy plaintext bodies, authoritative mailbox/owner quota and immutable create-approve-inspect-cancel. Portable runtime DTOs and HTTP client are the frontend seam: [integration v1](docs/contracts/integration-v1.md). [Docker-only synthetic fixture instructions](docs/integration-fixtures.md). Actual Fable gateway/UI wiring is still owned by Fable and has not been claimed complete here.

Due approval enqueues immediately; one-minute relay performs bounded reconciliation. Unknown outcomes never release quota or trigger blind resend. Independent persisted-envelope digest rejects corruption before invocation; legacy undigested requests fail closed. Only connected records count toward ten connection slots, while historical charges survive replacement under the provisional 300 owner/30 mailbox rolling 24-hour recipient policy. Ten users therefore permit at most 3,000 recipient sends/day under this rule; production policy approval remains open.

No credentials, DNS writes, real providers, external email, deployment or push. Original interrupted CLI artifacts remain preserved. Docker types/lint/typecheck/dry-run bundle, all 38 tests and the separate HTTP demo passed. Six review defects were fixed. [Validation and cleanup](docs/validation/2026-10-05-integration.md) records scoped image/cache removal, retained persistent volumes and the host-space/compaction limitation. Credentials-last production gates remain in fixture instructions.

## Server-owned recovery and browser boundary (2026-10-05)

Continued feature/backend-foundation from 5fe7193. Read Fable integration 5973eb4 and handover a5aa594; its worktree was not edited. Contract was extended before implementation: opaque GET /v1/me, bounded owner GET /v1/send-intents, lazy GET /:id/content, atomic POST /:id/replace, and bodyless POST /v1/session/logout. Identical replacements converge; conflicts never approve or send automatically. Docker-only cookie provisioning is separate from the Worker. HttpOnly/Secure/SameSite cookies, exact Origin plus CSRF marker, D1 expiry and revocation protect the browser boundary. Non-browser bearer compatibility remains.

Canonical handoff: docs/handover/2026-10-05-server-recovery.md. Fixture instructions: docs/integration-fixtures.md. Recovery content lives in D1, not frontend localStorage. Separate AI permissions and all existing conservative send/quota/unknown recovery protections remain. Production IdP, actual combined browser cookie/visual verification and live integrations are incomplete. No credentials, external sending, DNS, deployment or push; original uncommitted CLI artifacts preserved.
Final Docker verification: generated types, lint, strict typecheck, dry-run bundle and 45/45 tests passed; separate HTTP simulated acceptance demo passed. Adversarial/design review complete, three source/test and one documentation finding fixed. Task image and 24 exact build-cache records removed (1.203 GB reported); persistent volumes retained. Validation: docs/validation/2026-10-05-server-recovery.md.
