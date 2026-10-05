# Planning state

## Current integration milestone — 6 October 2026

The active worktree is `C:\Users\Tanzeel\Code and projects\Elevateo Mail - Integration`, branch `feature/application-integration`. Frontend and backend are integrated locally. Nothing has been pushed or deployed; no live sending or DNS writes occurred.

Implemented: owner-isolated inbox and plaintext reading, contacts and explicit consent, sticky suppression, immutable send approval and lost-response recovery, campaign drafts and short sequences, Google login, Gmail sync/manual threaded replies, Resend transport/events/unsubscribe/receiving reply stop, optional Hunter enrichment, bounded search/import, selected-message AI context, native draft tickets, job health and expired-record maintenance. Provider capabilities are configuration gated. Every campaign step needs separate approval. Resend sequence activation is default-off and bound to the exact receiving channel; live acceptance is still required before enabling it.

The Windows Claude companion has bounded process and protocol fixture coverage. The local-only desktop draft handoff is implemented and the Tauri shell compiles; Codex primary/fallback and macOS companion remain incomplete. Unsigned Windows/macOS packaging is scripted but installers have not been built or accepted. No operating-system filesystem/network sandbox or installed-app acceptance is claimed. DNS currently provides restricted read/change-plan primitives, not a live write executor. Notifications require an open tab refresh; there is no closed-app push.

Latest checkpoints: backend static checks and 264 tests passed; final web lint/typecheck/build and 485 tests passed; 39 of 40 API browser checks passed, with the obsolete enrichment assertion corrected and its affected journey passing separately. Four compiled Tauri tests, five native protocol tests and twelve Windows process fixtures passed; the mobile sequence browser regression passed separately. Local simulated load admitted exactly 3,000 sends across 100 mailboxes and rejected 100 over-limit attempts. These are separate checkpoints, not production acceptance. See `docs/validation/2026-10-06-takeover.md` and `docs/completion-matrix.md` for evidence and outstanding work.

The ledger uses provisional rolling limits of 30 recipients/mailbox and 300/user, with ten mailboxes/user. Production policy approval, real provider acceptance, desktop packaging/signing, cloud backup/key recovery and measured hosting cost remain gates. Under A$15/month is unproven. Root MX stays untouched. Credentials remain last; see `docs/credentials-last.md` for the configuration checklist and `docs/completion-matrix.md` for implementation gaps.

## Historical planning and milestone record

The record below describes earlier stages; the current integration section above supersedes its status claims.

Latest handoff: [Excalidraw agent brief PDF](../output/pdf/elevateo-mail-excalidraw-agent-brief.pdf), containing a four-page copyable prompt and seven actual Fable screenshots. Ten pages visually verified, eight embedded attachments checked. Section review correction makes provider data-use and CLI-isolation gates explicit. No actual Excalidraw board or application changes in this handoff.

Latest frontend work: isolated `design/fable-frontend` worktree contains the verified Fable 5.1 Ledger redesign. Final Docker checks passed: 135 unit/component tests, 29 browser tests, one intentional mobile skip, lint/typecheck/build; initial JS 180.49 KB gzip. Desktop/mobile/light/dark visual evidence and cleanup: [Fable validation](../docs/validation/2026-10-04-fable.md). Changes remain uncommitted; original planning changes were preserved. Historical checks below remain historical.

Platform scope now includes browser, Windows and macOS. See [distribution addendum](../output/pdf/elevateo-mail-distribution-plan.pdf) and master plan section 11. This supersedes the original reader PDF's Windows-only scope. Initial local AI is desktop-only. Backend/desktop implementation approval remains outstanding; no installers or production website exist.
Canonical session state: [state.md](../state.md). Product decisions: [master plan](../docs/product-master-plan.md). Detailed implementation direction: [blueprint](../docs/backend-blueprint.md).

Latest reader deliverable: [10-page PDF](../output/pdf/elevateo-mail-master-plan.pdf), with separate [frontend](../output/imagegen/elevateo-mail-frontend-sketch.png) and [system design](../output/imagegen/elevateo-mail-system-design.png) sketches. Hunter and AMF are optional enrichment; AI personalises drafts. All PDF pages were rendered and visually inspected. This edition changed documentation and artwork only; earlier application checks below were not rerun.

4 October 2026: six initial research assignments plus ten connection/efficiency assignments and synthesis complete. Confirmed pilot: ten private users, up to ten mailboxes each, 30 sends/mailbox/day; effective maximum 300/user/day and 3,000 total. History/import allowances remain open. Local directory and private GitHub repository renamed to Elevateo Mail / elevateo-mail.

Frontend-only prototype exists; branding updated and scoped adversarial review completed. Fresh Docker checks passed: lint, typecheck, build, 101 unit/component tests and 27 browser tests, with one intentional mobile skip. Desktop/mobile branding was visually inspected. Task-owned Docker resources were removed; see [validation](../docs/validation/2026-10-04.md). Three moderate development-tool audit entries for one Vitest advisory remain outstanding.

No backend, installed desktop, real provider, DNS broker or AI integration implemented. [Backend standards](BACKEND-STANDARDS.md) remain a draft requiring section-specific approval. See canonical state for historical prototype deviations and launch/storage decisions. Research contracts do not substitute for implemented features.

5 October 2026: `design/fable-frontend` now carries the gold/white/dark-grey brand theme, the transparent logo, Connections (Mailboxes, Sending, AI, Enrichment, Domains), an AI Assistant preview and loading/empty/error/offline states, committed locally and not pushed. Docker checks passed (187 unit/component, 45 browser, one intentional skip). Four limit decisions await approval: [open decisions](../docs/proposals/2026-10-05-open-decisions.md). Evidence: [validation](../docs/validation/2026-10-05-brand-connections.md).

5 October 2026, later: API-backed frontend mode wired to the backend foundation and verified in Docker against the real backend Worker (267 unit, 45 demonstration browser, 20 real-backend browser tests). One journey only: mailboxes, paginated messages, lazy body, compose, review, approve, track. Five review findings open; production gates in [validation](../docs/validation/2026-10-05-backend-integration.md). Not pushed, not deployed.

5 October 2026, later still: those five findings closed against backend `2305895` (server-listed send requests, saved content read on demand, atomic replacement, HttpOnly cookie session, server pagination, legacy-record handling). Evidence, the tested commit pair and remaining gates: [validation](../docs/validation/2026-10-05-server-recovery.md). One P2 open. Not pushed, not deployed; the application is not complete.

2026-10-05: backend foundation authorised and implemented on feature/backend-foundation, credentials last. Owner-scoped simulated API/ledger, provider contracts, signed fake events, suppression, AI scopes and manual DNS policy exist. No installed desktop, real provider integration, DNS writer or local CLI bridge exists. [Backend standards](BACKEND-STANDARDS.md) distinguish implementation authorisation from unresolved production decisions. See canonical state for historical prototype deviations and launch/storage decisions. Research contracts do not substitute for implemented features.

Backend completion verification (2026-10-05): final Docker types/lint/typecheck/dry-run bundle and 24 tests passed. Twelve adversarial/design defects fixed. Task-owned Docker image/cache removed; persistent volumes retained. See docs/validation/2026-10-05-backend.md. Committed implementation retains disabled real sending, DNS and deployment; original CLI artifacts remain uncommitted.


## Credential-free HTTP integration milestone (2026-10-05)

Backend-owned first journey implemented: capability discovery, stable mailbox inventory/independent AI read-draft flags, bounded summaries/lazy plaintext bodies, authoritative mailbox/owner quota and immutable create-approve-inspect-cancel. Portable runtime DTOs and HTTP client are the frontend seam: [integration v1](../docs/contracts/integration-v1.md). [Docker-only synthetic fixture instructions](../docs/integration-fixtures.md). Actual Fable gateway/UI wiring is still owned by Fable and has not been claimed complete here.

Due approval enqueues immediately; one-minute relay performs bounded reconciliation. Unknown outcomes never release quota or trigger blind resend. Independent persisted-envelope digest rejects corruption before invocation; legacy undigested requests fail closed. Only connected records count toward ten connection slots, while historical charges survive replacement under the provisional 300 owner/30 mailbox rolling 24-hour recipient policy. Ten users therefore permit at most 3,000 recipient sends/day under this rule; production policy approval remains open.

No credentials, DNS writes, real providers, external email, deployment or push. Original interrupted CLI artifacts remain preserved. Docker types/lint/typecheck/dry-run bundle, all 38 tests and the separate HTTP demo passed. Six review defects were fixed. [Validation and cleanup](../docs/validation/2026-10-05-integration.md) records scoped image/cache removal, retained persistent volumes and the host-space/compaction limitation. Credentials-last production gates remain in fixture instructions.

## Server-owned recovery and browser boundary (2026-10-05)

Continued feature/backend-foundation from 5fe7193. Read Fable integration 5973eb4 and handover a5aa594; its worktree was not edited. Contract was extended before implementation: opaque GET /v1/me, bounded owner GET /v1/send-intents, lazy GET /:id/content, atomic POST /:id/replace, and bodyless POST /v1/session/logout. Identical replacements converge; conflicts never approve or send automatically. Docker-only cookie provisioning is separate from the Worker. HttpOnly/Secure/SameSite cookies, exact Origin plus CSRF marker, D1 expiry and revocation protect the browser boundary. Non-browser bearer compatibility remains.

Canonical handoff: docs/handover/2026-10-05-server-recovery.md. Fixture instructions: docs/integration-fixtures.md. Recovery content lives in D1, not frontend localStorage. Separate AI permissions and all existing conservative send/quota/unknown recovery protections remain. Production IdP, actual combined browser cookie/visual verification and live integrations are incomplete. No credentials, external sending, DNS, deployment or push; original uncommitted CLI artifacts preserved.
Final Docker verification: generated types, lint, strict typecheck, dry-run bundle and 45/45 tests passed; separate HTTP simulated acceptance demo passed. Adversarial/design review complete, three source/test and one documentation finding fixed. Task image and 24 exact build-cache records removed (1.203 GB reported); persistent volumes retained. Validation: docs/validation/2026-10-05-server-recovery.md.
