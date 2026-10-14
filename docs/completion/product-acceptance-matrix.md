# Product journey acceptance matrix — 2026-10-15

Latest verified Chromium source: `d697096a3945`; corrected Puppeteer source: `07ec9d073d9b`, on `fix/inline949-completion`. INT967 mobile search layout candidate awaits its full web and browser gates. This replaces the obsolete 2026-10-14 failure snapshot. PASS is restricted to the source and scope below. Diagnostic completion is not full acceptance. Credentials, live mail, DNS and production activation remain deferred.

## Verified automated foundations

| Gate | Evidence and source | Result |
| --- | --- | --- |
| Web contracts, lint, typecheck, Vitest, coverage, build, fixture exclusion | [Web log](qa815-evidence/web-d57c78db6970.log), `d57c78db6970` | 63 files / 860 tests PASS; statements 88.94%, branches 82.43%, functions 87.42%, lines 94.18%. Initial JS 489.50 kB / 151.13 kB gzip. INT967 changes app layout; its fresh full web gate is pending. |
| Standard backend, strict Ruby typing and lint | [Backend receipt](qa815-evidence/backend-b0f883e45170.txt), `b0f883e45170` | 137 suites / 812 tests / 8701 assertions PASS; Steep and 320-file RuboCop PASS; real Auth/API HTTP and worker revocation PASS. |
| Current dedicated database/protocol profiles | [Six profiles](qa815-evidence/dedicated-six-r2-382d6c606abd.txt), `382d6c606abd` | 21 tests / 115 assertions PASS: gateway ACL/authority, assignment migration, attachments DB, campaigns DB and internal Mailpit protocol. |
| Historical migration/authority/tenancy/worker profiles | [R1 profiles](qa815-evidence/historical-r1-290de037b227.txt), `290de037b227` | 26 tests / 875 assertions PASS. |
| Runner and evidence validation | [Runner units](qa815-evidence/runner-units-67e7323eb19e.txt), `67e7323eb19e` | 53 Python and 14 Node tests PASS; separate policy units 12 PASS. |
| Real Chromium smoke | [Smoke receipt](qa815-evidence/browser-discovery-r6-67e7323eb19e.txt), `67e7323eb19e` | Four scenarios PASS, attempt 0; DIAGNOSTIC_COMPLETED. Invitation prerequisites 13 tests / 94 assertions, Steep, lint, browser typing/build and units PASS. |
| Puppeteer real browser, backend and HTTP | [Corrected run](qa815-evidence/browser-puppeteer-r2-07ec9d073d9b.txt), `07ec9d073d9b` | Four GUI journeys, strict browser typing/build, boundary/field probes, standard backend/Steep/lint and real Auth/API/worker PASS. |
| Selenium real browser | [Framework run](qa815-evidence/browser-frameworks-r1-67e7323eb19e.txt), `67e7323eb19e` | All four Selenium journeys PASS; overall mixed run failed in the separately repaired Puppeteer draft parser. |
| Draft response-loss recovery | [Fresh case receipt](qa815-evidence/browser-recovery-r1-67e7323eb19e.txt), `67e7323eb19e` | SCN-DRAFT-003-P PASS on a fresh DB, attempt 0; DIAGNOSTIC_COMPLETED. |

All listed runs used fleet-02 Docker and passed scoped cleanup. Earlier failed attempts remain in the evidence ledger; they are not silently relabelled PASS. Shared pinned base images were retained. Cross-browser/runtime evidence below is still needed.

## User journeys

| Journey | Established evidence | Remaining release gate |
| --- | --- | --- |
| Sign-in, sessions and permissions | Actual Auth HTTP/worker revocation plus Chromium password login; missing/wrong CSRF and foreign-origin logout rejected while the valid session remains usable. | Current invitation/recovery, logout/stale-session and organization-switch browser cases; full authority/denial matrix. |
| Personal inbox and reader | Real authorized list/read, literal plaintext, direct thread URL, reload, back/forward and keyboard focus pass. Desktop/mobile light/dark screenshots were inspected. | Multi-page/multi-mailbox, empty/error/revoked states; message permalink beyond first page; full current visual suite. |
| Search | Genuine API 200, expected thread result, keyboard submit and URL query/scope history pass. | All settled screenshots inspected; one mobile label/dropdown wrapping defect found and repaired in INT967. Fresh visual/regression proof pending. |
| Draft composition and persistence | Real PUT receipt/version, list, exact subject/recipient/body and reload persistence pass. Four draft screenshots inspected. | Conflict, boundary rejection, privacy/revocation, reload recovery and complete frozen cases. |
| Uncertain save recovery | Real committed PUT with a lost browser response; original operation GET reconciles version while newer raw fields remain unsaved, with one PUT and one original-ID lookup. | Unapplied operation, conflict, unrelated lookup and navigation/reload paths remain distinct cases. |
| Assignment, notes and read state | Source and standard backend/web suites pass; reader displays seeded assignment/note. | Two-user persistence/conflict/revocation browser proof. INT963 rerun passes both settled collaboration assertions; all screenshots inspected. |
| Private attachments | Canonical private gateway/storage/scanner source and actual-role DB profile exist; six DB tests / 40 assertions pass. | Actual Storage bytes, scanner/quarantine, authorized download and revocation; outbound attachment MIME/snapshot workflow is not implemented. |
| Review, approval, cancel and send status | Source plus broad backend/web and held-worker checks pass; internal Mailpit protocol is tested. | Full actual browser review-to-durable-intent-to-held-worker/status chain, races and restore. No real SMTP or live delivery claim. |
| Outreach campaigns, leads, consent, sequences | Canonical V2 source and web/backend units; dedicated campaign DB seven tests / 17 assertions pass. Sequence drafts are inert; manual consent is labelled unverified. | Current real browser CRUD/roles/denials, consent/revision/sequence proofs; provider dispatch remains disabled. |
| People, permissions, audit and preferences | Integrated source and broad contract/web/backend suites pass. Twelve proposed team identities remain unbound; titles grant no authority. | Current manager/reader/owner/auditor browser journeys, safe grant changes and persistence. Real enrollment and credentials remain last. |
| Inbound mail and mail servers | Fake inbound/IMAP fixture source and tests, local internal Mailpit protocol. | Real self-hosted TLS mail-server/provider integration, restore and operational readiness. No functioning live mail server is claimed. |
| Android, Windows and macOS | Responsive web is exercised at 375 and 1440 pixels; Android unsigned ARM64 compile-only APK exists. Orca is ready with no devices. | No local SDK/AVD, under 0.5 GB free disk; no emulator/runtime acceptance. Compile-only APK intentionally has a rejected origin. Windows installer and Mac DMG/install/runtime proof are absent; Mac build host required. |
| Operations and recovery | Bounded resource-limited test stacks, exact cleanup and deployment/backup source exist. | Actual private-stack restore drill, monitor/alert validation, target load budgets and production topology. |

## Current priorities and limits

1. Selenium and Puppeteer each pass four real journeys. Complete INT967 full web/cross-browser visual checks and the fresh-database product and denial scenarios.
2. Prove remaining product journeys against real Auth/API/DB; resolve failures without weakening authority or fixture isolation.
3. Complete private attachment bytes, outbound attachments, restore and platform packaging/runtime gates.
4. Configure live credentials, providers, DNS and hosting only after the non-live gates are ready.

The frozen 26-case Playwright acceptance inventory still has six unavailable cases; supplemental product cases do not replace those gates. This matrix is an honest inventory, not an application-complete verdict. Detailed failures, changes, review coverage and source-bound receipts are in [the inline ledger](inline949.md) and [code reviews](../../code-reviews.md).
