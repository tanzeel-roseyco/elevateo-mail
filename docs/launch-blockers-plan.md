# Launch blockers execution plan (2026-10-18)

Branch audited: `integrate/unified-20261018` at `01bce1eb`. Pilot: 10 users, up to 10 mailboxes each, 30 sends per mailbox per day (peak 3,000/day, ~90,000/month), Resend-first, hosting under A$15/month. This file plans the six remaining blockers; it implements none of them. Owner routes: backend (Ruby, SQL, worker, webhooks) goes to Codex GPT 5.6 Sol low; web, Android, Tauri, CI and docs go to Claude. Every acceptance test runs in fleet-02 Docker except where a physical device or target OS is unavoidable.

## 0. Ground truth versus the completion record

`docs/completion/resend-first-launch.md` and README "Authoritative completion status" say a Resend transport, signed provider events and approved-send attachment binding are "staged in the integration work". On this branch they are not:

| Claim | What the code shows |
| --- | --- |
| Resend outbound transport implemented | `apps/server/lib/elevateo/send_worker/` holds only `durable_local_driver.rb`, `smtp_transport.rb` (Mailpit, see its `AIDEV-NOTE` at line 29) and `mox_smtp_transport.rb`. `git log --all -S"ResendTransport"` finds nothing on any branch. |
| Signed provider events / inbound handling | Only `app/controllers/v2/fake_inbound_controller.rb` exists; no webhook route, no signature verification. |
| Approved-send attachment binding | `send_api/canonical.rb:14` pins `attachments = []`; `send_api/review.rb:47` returns `attachments_supported: false`; `smtp_snapshot.rb:41` rejects any non-empty attachment array. Draft attachment staging/scanning (`db/draft_attachments`, `attachments*.rb`) is merged; the outbound half is not. |
| Android acceptance passed | True for fix `2f9c7e50` (an ancestor of HEAD) on emulator APK `8ee02a89…`; that APK predates merges `acf94f22`, `a6e8b881`, `de244e9f` and no physical-device run exists. |

Treat the two prose documents as historical until the gates in section 4 pass on one SHA.

## 1. Live Resend sending

**Root cause.** `apps/server/lib/elevateo/config.rb:21` lists `RESEND_` in `PROVIDER_PREFIXES` and rejects it; `config.rb:108` requires `ELEVATEO_OUTBOUND_HOLD=true` with "no release path exists"; `apps/server/bin/send-worker:25-30` selects only the synthetic `DurableLocalDriver` or the Mailpit `SmtpTransport`. No HTTP transport, no provider webhook, no delivery-state mapping from provider events exist. `docs/mail-delivery-and-hosting.md:11` also confirms Resend cannot send as `@gmail.com`: pilot "Gmail mailboxes" are sender identities on a verified Elevateo-controlled domain (or inbound-only via the existing IMAP ingress), not Gmail senders.

**Tasks (Codex GPT 5.6 Sol low unless noted).**
1. Config boundary: add `ELEVATEO_OUTBOUND_MODE` in `{held, mailpit, resend}` (default `held`), `RESEND_API_KEY` (read once, never logged, rejected unless mode is `resend`), `ELEVATEO_RESEND_FROM_DOMAIN`, `RESEND_WEBHOOK_SECRET`. Keep today's fail-closed default; `config.rb:108` becomes "hold unless mode is resend and all four values validate".
2. `send_worker/resend_transport.rb` implementing the `SmtpTransport` interface (`submit(bytes, send_id:, attempt_id:, deadline:)` and `observation`): `POST https://api.resend.com/emails` with `Idempotency-Key: <attempt_id>` (Resend keeps keys 24 h), bounded connect/read deadline from `call_deadline.rb`; 2xx accepted with provider id; 4xx other than 429 permanent rejection; 429, 5xx, timeout and malformed body stay `unknown` with no automatic replay (existing `submission_result.rb` semantics); `observation` uses `GET /emails/{id}` only when an id was recorded.
3. Shared renderer: extract a `RenderedMessage` (sender, recipients, subject, text, attachments) from `smtp_snapshot.rb` so `build_mime` and the Resend JSON serialiser consume one validated object. This is the seam blocker 2 reuses.
4. `bin/send-worker`: add the `resend` driver branch; `Drain`/`Executor` unchanged. Daily budgets already exist (`aggregate-send-budgets`); wire the 30-per-mailbox-per-day pilot limit as configuration, not code.
5. Webhook: `POST /v2/provider-events/resend` verifies Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`, HMAC-SHA256 over `id.timestamp.body`, 5-minute tolerance, constant-time compare). Events are accepted only for provider ids owned by recorded attempts; unknown ids receive the same HTTP 200 acknowledgement and are ignored. `email.sent|delivered|delivery_delayed|bounced|complained` project onto send status and bounce/complaint creates a suppression. `email.received` remains stored-only and is explicitly post-pilot; routing it into inbound ingest is not part of the pilot release.
6. Tests: transport status mapping, idempotency replay, signature verify/tamper/stale, event replay no-op, unit and HTTP; a Docker stub of `api.resend.com` under `ops/tests/be03/` for the integrated run; provider acceptance against `delivered+pilot@resend.dev`, `bounced+pilot@resend.dev`, `complained+pilot@resend.dev`, `suppressed@resend.dev` (these count against quota).
7. Web (Claude): `SendStatusPage.tsx` renders provider states and suppression reason; no new simulated labels on live sends.

**Dependencies.** Verified sending domain with SPF, DKIM and DMARC on an Elevateo-controlled domain; Resend account and webhook secret in the secret file only; blocker 6 decision before any non-test recipient.

**Acceptance.** In fleet-02 Docker with the stub: approving a send yields exactly one POST carrying `Idempotency-Key`; a simulated 503 then retry yields no second provider id; a signed `email.bounced` event flips state and creates a suppression; a tampered signature returns 401 and changes nothing; a replayed event is a no-op. Live smoke (owner-approved): sends to the four `resend.dev` addresses show delivered, bounced plus suppressed, complained plus suppressed, suppressed in the UI within five minutes; a 31st send for one mailbox in one day is held.

**Effort.** 3-4 days Codex, 0.5 day Claude.

## 2. Attachment sending

**Root cause.** `smtp_snapshot.rb:68-80` renders `text/plain` only with `MAX_MIME_BYTES` 524,288; `render` (line 41) rejects a non-empty attachment array; `canonical.rb:14` and `review.rb:47` freeze V1 to zero attachments; reserved migration `20261015000021` (V2 approved snapshot and fenced worker authority) does not exist; no worker path fetches private bytes. The agreed design is `docs/completion/cassian-outbound-attachment-decision.md` (root decision: one file, 1,048,576 raw bytes, 2,097,152-byte complete MIME) and `ada-adv161-outbound-design.md`.

**Tasks (Codex unless noted).**
1. `elevateo.send.snapshot.v2` in `send_api/canonical.rb` with the ordered tuple `{attachment_id, sha256, byte_size, content_type, filename}` plus draft version; `GET /v2/drafts/{id}/send-review` and `POST /v2/drafts/{id}/send-approvals` return `attachments_supported: true` and a closed `message_too_large` issue before approval. V1 stays byte-identical.
2. Migration `20261015000021`: approved attachment reference, immutable snapshot v2, fenced worker authority (`worker_authority.sql` pattern).
3. Worker: fetch via `attachment_gateway_client.rb`, verify SHA-256 and length, render `multipart/mixed` (text part plus base64 part, 76-column lines) through the shared renderer from 1.3 with the 2 MiB cap; Resend path sends `attachments[0].content` as base64 (provider cap is 40 MB, irrelevant here). Order is fetch, hash, render, then the final authority/cancel fence, then first I/O.
4. Web (Claude): `SendReviewPage.tsx` shows the bound attachment tuple, scan state and `message_too_large`; regenerate `apps/web/src/data/generated/api-v2.d.ts` inside Docker only.
5. Tests: happy path with one clean 1 MiB file; 1.9 MiB body plus file rejected before approval; malware verdict holds with 423; bytes replaced after approval fails the hash fence before I/O; cancel during fetch never submits; Mailpit decoded-byte identity.

**Dependencies.** 1.3 shared renderer; staging and scanner already merged. Do not widen V1.

**Acceptance.** Docker: approved draft with one clean 1 MiB PDF reaches Mailpit as `multipart/mixed` whose decoded part has the same SHA-256; the same draft through the Resend stub carries one `attachments` entry whose decoded bytes match; oversize, malware and hash-mismatch cases each stop with the named closed error and zero transport I/O. Browser scenario shows the attachment on review and status pages.

**Effort.** 4-5 days Codex, 1 day Claude.

## 3. Android acceptance

**Root cause (android1035).** `MainActivity.kt.in` had no inset handling, so system bars overlapped after rotation; the manifest lacked `ACCESS_NETWORK_STATE`, so `navigator.onLine` stayed true offline; the logout selector matched a disabled organisation button. Fix `2f9c7e50` (merged) adds `enableEdgeToEdge()` plus `setOnApplyWindowInsetsListener` (`MainActivity.kt.in:13-30`), the permission (`customize_generated.py:8`) and `button[data-qa-logout=true]` (`ops/tests/android/acceptance.py:120`). `android1037-acceptance.md` passed 9/9 on an emulator APK built before three later merges, and `apps/android/acceptance.md` requires at least one physical device. The blocker is missing evidence on HEAD, not a known defect.

**Tasks (Claude).** Rebuild the isolated QA APK from HEAD with `ops/tests/qa815/run-android-candidate.sh`; rerun the nine-check gate; run the rotation, airplane-mode and logout-then-Back cases on one physical Android 13+ device with gesture navigation; record APK SHA-256, Android and WebView versions and screenshots in `docs/completion/android1038-acceptance.md`. If any check fails, fix in `MainActivity.kt.in` or `apps/web/src/ui/useEditableViewport.ts` and rerun. Clean task-owned emulator containers afterwards.

**Dependencies.** None; starts today. Uses the fixture origin, not a release APK (that is blocker 5).

**Acceptance.** Gate JSON reports `NINE_ANDROID_CHECKS_PASSED` for the HEAD-built SHA; device screenshots show no bar overlap after two rotations, an offline banner within five seconds of airplane mode, and login with no protected content after logout plus repeated Back.

**Effort.** 1 day, plus 1 day if a fix is needed.

## 4. Final browser, provider and ops testing

**Root cause.** The last gates (`root1041-web-r3`, `root1041-pilot-browser-r3`, combined backend) ran before the unified merges; the backend integrated acceptance stopped on a missing pinned Node image in the runner; no production deployment, TLS, backup/restore, monitoring or rollback evidence exists; provider testing is impossible until blocker 1 lands.

**Tasks.**
1. Backend (Codex): repair the pinned Node image digest in the runner, then `ops/tests/qa815/run-backend-candidate.sh` on HEAD until suites, Steep and RuboCop exit 0.
2. Web (Claude): `run-web-candidate.sh` and `run-seeded-visual.sh` (Chromium, Firefox, WebKit, 390 px) on the same SHA; manual pass for mobile layout, empty/loading/error states and deep links.
3. Provider: the stub integration and `resend.dev` smoke from blocker 1.
4. Ops (Claude with owner): deploy the Compose stack to fleet-02 Coolify with dispatch held (no new spend, which is the only way to meet the A$15/month line; `docs/mail-delivery-and-hosting.md:115` sizes a dedicated host well above it), TLS, Postgres plus private Storage backup and a restore drill, worker-stopped alert, documented rollback; then release the hold for the smoke test only.

**Dependencies.** Blockers 1 and 2 merged; blocker 6 decision for anything beyond `resend.dev` recipients.

**Acceptance.** All gate logs show `checks_exit=0` and `cleanup_failed=0` for one SHA; the restore drill brings back a seeded draft with its attachment; the alert fires within five minutes of stopping the worker; the 20 pilot browser scenarios pass in all three engines.

**Effort.** 2-3 days of runs; mostly serial after 1 and 2.

## 5. Signed Windows, macOS and Android installers

**Root cause.** `apps/native/src-tauri/tauri.conf.json` bundles `nsis` only with no `windows.signCommand` or certificate; `apps/native/ci/windows-unsigned.ps1` deliberately does not sign; `apps/native/macos-release.sh` exits unless `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` exist, and no Apple account does; Android builds are debug-signed `com.elevateo.mail.qa` with no release keystore; fleet-02 is Linux, so no Windows or macOS lane exists.

**Tasks.**
1. Owner, today: enrol in the Apple Developer Program; create an Azure Artifact Signing account and organisation identity validation (Australian organisations are eligible, individuals are not, so this needs the registered entity); optionally register Google Play. Identity validation lead times are the long pole.
2. Windows (Claude): `bundle.windows.signCommand` calling the Azure signing tool; GitHub Actions `windows-latest` job running `ci/windows-unsigned.ps1` then signing; clean-VM install, upgrade, downgrade-rejected and uninstall with WebView2 present and absent.
3. macOS (Claude): GitHub Actions `macos-latest` job invoking `macos-release.sh` with repository secrets; notarise and staple; universal binary; clean-machine launch.
4. Android (Claude): release keystore generated offline and stored only as a CI secret; release build with the real origin and `com.elevateo.mail`; add `verify_release.py` beside `verify_unsigned.py` to require a v2/v3 signature and reject the QA marker and host.
5. Docs: installer download, upgrade and rollback notes in `apps/native/README.md` and `apps/android/README.md`.

**Dependencies.** Public HTTPS origin fixed (4.4) because the shell embeds the exact origin; GitHub push from the laptop (fleet-02 has no credentials); accounts from 5.1.

**Acceptance.** Windows: `signtool verify /pa /v` passes and a clean VM shows the publisher name, not "Unknown publisher"; macOS: `spctl --assess --type install` accepts and `xcrun stapler validate` passes, app launches on a clean Mac; Android: `apksigner verify --print-certs` shows the release certificate, installs fresh, and upgrading from the previous release keeps the session.

**Effort.** 3-4 days engineering; wall-clock gated by identity validation (Apple typically days, Azure 1-20 business days).

## 6. Resend Acceptable Use Policy and lead opt-in

**Facts (live check of https://resend.com/legal/acceptable-use on 2026-10-18, page updated 2026-10-13).** "All mail must be sent to recipients who have explicitly opted in"; prohibited: "unsolicited messages of any kind, including cold outreach", "purchased lists, or scraped contact data"; complaint rate must stay under 0.08% and bounce rate under 4%, and the account "may be shut down without warning". A cold first-touch pilot on Resend is therefore a policy breach with an account-termination risk mid-pilot, and Resend cannot send from Gmail addresses regardless.

**Decision the owner must make (one line).** Will the pilot send only to recipients with documented opt-in (inbound enquiries, existing customers, people who replied), yes or no?

**Recommendation.** Yes. Launch the Resend pilot restricted to opted-in recipients, replies and transactional mail, enforce it in code, and schedule a per-mailbox Gmail API send transport (OAuth, 30/day, which is what the "10 Gmail mailboxes, 30/day" pilot shape describes) as the next milestone for cold first-touch. Do not relabel unknown provenance as consent.

**Tasks.** Claude: domain rule in `apps/web/src/domain` that blocks send review when transport is Resend and the lead has no consent evidence, with a visible reason; import requires a consent-source field. Codex: the same gate server-side in `send_api/review.rb` so the UI cannot be bypassed. Docs: one paragraph in `docs/completion/resend-first-launch.md` recording the decision.

**Acceptance.** Send review for a lead without consent evidence is blocked with the reason under transport `resend` and allowed under `mailpit`; both paths tested in Vitest and Ruby.

**Effort.** 1 day after the decision.

## Critical path and parallel lanes

```
Day 0   Owner: decision 6; confirm sending domain and public origin; start Apple and Azure enrolment (long lead)
Lane A  Codex:  1.1-1.6 (3-4 d) -> 2.1-2.3, 2.5 (4-5 d) -> 4.1 backend gate (1 d)
Lane B  Claude: 3 Android rerun (1-2 d) | 6 domain rule (0.5 d) | 1.7, 2.4 web (1.5 d) | 4.2 web gates and manual pass (1 d)
Lane C  Owner/ops: domain DNS, Resend account and webhook secret, Coolify deploy with hold, backup/restore drill (4.4)
Lane D  Claude: 5.2-5.5 installer lanes once 5.1 accounts clear; not on the web-pilot path
Gate    4.3 provider smoke -> 4 all gates green on one SHA -> owner-approved live send -> pilot
```

Critical path is 1 → 2 → 4 → live smoke: about 11-13 working days of engineering. Blockers 3 and 6 fit inside lane B without extending it. Blocker 5 runs in parallel and finishes when identity validation does; the web pilot does not wait for installers.

## Costs (checked 2026-10-18; USD unless noted)

| Item | Price | Note |
| --- | --- | --- |
| Resend Free | $0, 3,000/mo, 100/day | Insufficient: pilot peak is 3,000/day |
| Resend Pro | $20/mo for 50,000 or $35/mo for 100,000 | Received mail counts; ~90,000/mo worst case means the $35 tier. Not covered by the A$15 hosting line; budget separately |
| Apple Developer Program | $99/yr | Required for Developer ID signing and notarisation |
| Azure Artifact Signing Basic | about $9.99/mo (5,000 signatures) | Organisations in Australia eligible; individuals only in US/Canada |
| Alternative OV code-signing cert | about $129-300/yr plus hardware token | Only if the Azure route is unavailable |
| Google Play registration | $25 one-time | Optional; sideload APK needs none |
| GitHub Actions | 2,000 free min/mo on Free private repos; Windows counts 2x, macOS 10x; overage $0.010/min Windows, $0.062/min macOS | A few signed builds per month stay inside the free quota |
| Hosting | A$15/mo ceiling | Met only by running on existing fleet-02/Coolify with no new spend |

Sources: resend.com/pricing, resend.com/legal/acceptable-use, resend.com/docs (send-email, test emails), developer.apple.com/programs/enroll, learn.microsoft.com/azure/artifact-signing/quickstart, support.google.com/googleplay/android-developer/answer/6112435, github.blog changelog 2025-12-16 and docs.github.com runner pricing, sslinsights.com and codenote.net for OV certificate ranges.
