# Resend-first launch scope - 2026-10-17

## Decision and priority

The user has deferred self-hosted mailserver deployment to continuing repository development and selected Resend for the immediate application launch. Preserve the Mox research, source, tests, capacity evidence and Hetzner deployment plans; they are not prerequisites for the Resend web pilot. No self-hosted mail deployment, new capacity work or warmup infrastructure is on the immediate critical path. No new live spend, mail, DNS or production changes are authorized by this status request.

## Lead eligibility - unresolved input

Resend's current acceptable-use policy requires explicitly opted-in recipients and prohibits cold outreach, purchased lists and scraped contacts. The user has been asked whether the waiting leads opted in. Do not label unknown lead provenance as consent or silently reinterpret cold prospects as correspondence. Continue provider-independent application work while this answer is pending.

Primary source checked 2026-10-17: https://resend.com/legal/acceptable-use (page last updated 2026-10-13).

## Current implementation and evidence snapshot

This section is authoritative for the current completion wave. The initial snapshot and bounded review below remain historical evidence, not current failure or implementation status.

- **Android runtime acceptance passed:** commit `2f9c7e508ea43c26c27e7958e297bbb3bfb7ef0d` includes viewport/connectivity fixes and the relocated diagnostic helper fix. All nine Android 14/WebView 113 checks passed, including rotation, keyboard visibility, force-stop/restart authentication recovery, offline feedback and logout. Scoped cleanup passed. See [Android acceptance](android1037-acceptance.md). Distribution signing and production native release remain separate from this runtime acceptance.
- **Frontend automated validation passed:** fleet-02 Docker `root1041-web-r3` passed API generation/checks, lint, typecheck, coverage, production build and **891 tests in 67 files**. Coverage: statements 89.10%, branches 82.86%, functions 87.65%, lines 94.26%. Evidence: [gate log](qa815-evidence/root1041-web-r3.log), with `checks_exit=0` and `cleanup_failed=0`. Saved-draft send review/approval, session handling and attachment UI changes are included. Pilot browser Docker run `root1041-pilot-browser-r3` passed all 20 scenarios across Chromium, Firefox, WebKit and a 390px narrow viewport; `checks_exit=0` and `context_absent=yes`. Evidence is retained in `docs/completion/qa815-evidence/root1041-pilot-browser-r3.log` and four selected review/delivery PNGs in `docs/completion/qa815-evidence/root1041-pilot-browser-r3/`. Manual Chromium desktop and narrow-viewport inspection passed: readable aligned content, no horizontal overflow, inert hostile plaintext, clear consent/attachment status and delivered-versus-read distinction. These are controlled browser fixtures, not live provider delivery.
- **Resend implementation and backend suites passed; integrated acceptance pending:** outbound HTTP transport and guarded worker/configuration wiring, signed provider events and inbound handling, and delivery/suppression integration have been implemented in the combined backend candidate. This supersedes the initial finding that the runtime only implemented simulated/Mailpit delivery. The latest combined backend Docker run passed its complete suites, Steep and RuboCop. Integrated acceptance was blocked by a missing pinned Node image; the corrected acceptance and recovery candidate is running. Final integrated acceptance remains pending.
- **Draft attachment implementation and backend suites passed; integrated acceptance pending:** authenticated reserve/upload/finalize/list/remove API, private upload gateway, scanner integration, saved-draft browser controls and approved-send attachment binding are included in the integration work. The supported path is one attachment up to 1 MiB. Reservation, scan state, current authority and immutable approved content are enforced across the path; final integrated acceptance is still pending. See [upload contract](draft-attachment-upload.md).
- **Operations:** Resend Compose syntax validation passed. Production deployment, backup/restore, monitoring and held-dispatch acceptance remain open; syntax validation alone is not operational acceptance.
- **Live activation remains held:** credentials, verified sending domain and sender, signed webhook setup and recipient consent/eligibility remain prerequisites, followed by controlled live send/receive evidence. No live delivery, production readiness or GitHub publication of this completion wave is claimed. Self-hosted Mox deployment remains deferred.

## Historical baseline before this completion wave

The following snapshot records the starting point. Its Android failures and absent-runtime findings were superseded by the implementation and acceptance results above. Preserve its evidence references for traceability.

### Initial evidence snapshot (superseded)

- Current integration branch is fix/inline949-completion at b6cfb7bde54c54743e1f7ce0f19b0fa5b30ec68f, with reviewed Android/web changes still uncommitted.
- Latest fleet web gate android1036-web-5684fa8b9d80 passed API schema checks, lint, typecheck, 65 Vitest files / 874 tests, coverage and production build. Coverage: statements 88.98%, branches 82.57%, functions 87.47%, lines 94.23%. This does not establish final browser acceptance or live provider delivery.
- Latest completed backend gate MAIL1032 passed 1,068 tests / 12,806 assertions on its recorded earlier source. Twelve dedicated suites were deferred; it is not a fresh all-features release gate.
- Android R3 passed login, navigation, inbox/thread, rotation and three keyboard cycles, then failed authentication after force-stop/restart. Android R4 diagnostic failed before login because the relocated harness resolved request.py in the wrong directory; this is a harness failure, not a new app verdict. Its failed acceptance marker closed the run; scoped cleanup passed, shared bases and persistent data were retained. R3/R4 runtime and web R3 outer resource absence were independently verified (19 checks). R4 free host bytes changed 253769216000 to 253799583744; this shared-host delta is not attributable reclaimed space. APK signing/release and final native acceptance remain open.
- Draft attachment reservation/scanning and incoming attachment work exist. End-to-end draft upload and outbound attachment submission remain incomplete.
- No live provider/domain delivery or production readiness claim is made.

### Initial Resend implementation gap (superseded)

Mara's bounded source review found that live Resend sending is not currently implemented in the outbound runtime. apps/server/lib/elevateo/config.rb requires local mode and outbound hold, permits only Mailpit for SMTP, and rejects RESEND_* settings. apps/server/bin/send-worker selects synthetic or Mailpit drivers; smtp_transport.rb and smtp_profile.rb preserve the held remote boundary. These are intentional local safeguards, not evidence that the app is one API key away from live Resend.

Required implementation includes a Resend HTTP transport and validated secret/configuration boundary, explicit controlled production worker wiring, provider-specific idempotency/ambiguous-response tests, signed event processing and state/suppression integration, and verified reply intake. Existing local safety behavior must remain fail-closed. Confirm existing event/import capabilities before adding code; do not infer absence from this bounded outbound review.

Mara reviewed 335 unique implementation LOC plus a 20-line activation checklist, with no inspection over 200 LOC. Confirmed implementation defects: 0 (0 per 1,000 implementation LOC). The missing live provider capability is a launch gap. No tests were run by the reviewer. Requested model profile GPT-6.1 Sol low; actual serving/billing identity is not independently exposed.

## Immediate web pilot acceptance

1. Confirm lead eligibility and complete the combined backend validation of the implemented Resend transport, configuration, signed event intake, replay and reply ingestion. Preserve unknown-send handling and idempotency.
2. Finish any missing application path for contacts/import, composition, approved send, recipient suppression/unsubscribe, delivery/bounce/complaint state and inbound reply threading. Validate the complete path with isolated synthetic accounts and deterministic provider behavior; do not equate individual unit tests with end-to-end proof.
3. Run final Chromium/Firefox/WebKit and relevant existing Puppeteer/Selenium scenarios on the candidate in fleet-02 Docker. Manually inspect the actual UI, including mobile browser layout, permissions, empty/loading/error states and deep links.
4. Verify production deployment, backups/restore, monitoring, queue controls, TLS and rollback with dispatch held. Use the existing infrastructure where appropriate; do not incur new spend.
5. Configure live secrets, verified sending domain/DNS and signed webhook credentials last. A controlled owner-approved send/receive smoke test is required before a lead batch. Domain/account activation may impose external timing; no hours-to-launch promise is supported yet.

## Parallel completion and tradeoff

A web pilot can serve immediate outreach needs without waiting for native distribution or self-hosted mail delivery. This is a recommended release sequence, not a declaration that native distribution, desktop/macOS, attachments or the wider application are complete. Android runtime acceptance has passed; native distribution and the remaining acceptance requirements stay open. Defer attachment support only if explicitly scoped out of that pilot; unsupported paths must remain clearly unavailable.

Using Resend removes mailserver provisioning, IP/PTR, SMTP port access and operating a delivery server from the immediate release path. It does not remove app authorization, provider integration, reply routing, suppression, testing, backups or deployment responsibilities. Receiving is an API/webhook integration, not automatic full mailbox completion: https://resend.com/features/inbound.

## Repository and documentation status

This scope decision is recorded in the integration workspace and mirrored to local project records/Obsidian. The current integration workspace's origin is a local delivery repository, not GitHub; publication of this decision to GitHub is not claimed. Preserve the historical research under docs/mailserver and publish reviewed code/docs through the existing integration process. Do not push unfinished runtime changes as a completed release.
