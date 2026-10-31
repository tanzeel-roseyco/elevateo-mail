# Project state

Updated 2026-11-01. Earlier entries are preserved verbatim in [docs/history/logs/state-log.md](docs/history/logs/state-log.md).

## Schema integrity branch

Completed schema integrity audit and migrations 20261101000111?117: relationship indexes/constraints,
canonical delivery suppressions, normalized finder items, value checks, attachment concurrency and redundant-index removal.
Docker up/down/up and the full backend gate passed: 1,399 standard tests / 15,907 assertions, zero failures/errors,
plus dedicated database, mail, API and contract checks; Steep and RuboCop (542 files) passed. Four standard protocol
skips are tracked separately in the receipt. No deployment, push, merge or live mail occurred.
Evidence and exact scope: [schema integrity](docs/completion/schema-integrity-20261101/).
Documentation-only handoff: [Jeison guide](docs/handoff/README.md), [mail-server development](docs/handoff/mail-server-development.md)
and [per-document audit](docs/completion/handoff-20261101/audit.md). No application suites or infrastructure actions ran.
Tanzeel did the bulk of development; Jeison implements company setup; both maintain it. Callum decides updates,
reviews and approves. The guide records fresh-host enrollment, Mox activation/update wiring, isolated full-production
restore configuration, finder routing, native exchange and client release blockers. Other worktrees retain uncommitted
Windows work (`feature/final-readiness`); schema-integrity and modular-boundary branches remain in progress.

## Summary

The white/gold branch implements the [single light design system](docs/design-system.md) across all client themes. Current branch verification and remaining platform limits are recorded in the [design receipt](docs/completion/design-system-20261101/README.md). The historical integration status below describes `main`, not this branch.

All Elevateo Mail work is consolidated in this repository. `main` contains the integrated product: backend,
self-hosted mail server, email finder, and web, macOS, Windows, Android and iOS clients. Nothing is deployed.
The backend and email finder passed their recorded historical Docker gates. On `feature/final-readiness`,
Windows packaging, web unit/build, native Linux and iOS Core gates have now run; results and limitations
are recorded below. Browser and Android packaging verification are complete; platform/resource limitations are recorded. No deployment.

## Modular-boundaries branch

Explicit ownership covers backend runtime sources, public constants, SQL tables and routine callers.
Connector mailbox reads now use a mailbox-owned snapshot API on the existing guarded connection.
The standard Docker gate includes architecture tests with deliberate boundary violations.
Legacy send/auth/ingest transactions and database integrity remain intact through documented exceptions.
Full gate verification, the existing finder-policy rollback failure and isolated mailflow failures are recorded in
[the receipt](docs/completion/modular-monolith-20261101/receipt.md); this is not a green full-gate claim.
No database files or campaign/finder suppression SQL were changed. No push or deployment occurred.
See [the module map and schema follow-up](docs/modular-architecture.md).
## Web PWA branch

Implemented install metadata/icons/screenshots, accessible white/gold install guidance, byte-verified static-only
offline shell, deferred updates and session cleanup across windows. No mail/API/attachment caching or queued writes.
The broader single-theme conversion remains on `feature-white-gold`. This branch does not change server code.
Docker gate and production Chromium results, Lighthouse reports, visual QA and remaining device/hosting checks
are recorded in [the PWA receipt](docs/completion/pwa-20261101/receipt.md).

## How main was assembled

1. `Tanzeel/elevateo-emailguard-fable` was the authoritative line (Authentik SSO, threads, IMAP, send review,
   self-hosted Mox and production initialization, up to 2026-10-24).
2. Merged `feature/email-finder` (`edecc6cf`), `feature/frontend-completion` (`eedd0025`) and `feature/backend-completion` (`487987eb`).
   Conflicts were in documentation, `featureGateways.tsx`, `ops/production/compose.yaml`, `.env.production.example`
   and `docs/credentials-last.md`. Compose takes the backend's complete stack and adds the `email-finder-worker` service.
3. Every other line of work (97 branch tips, bundles and uncommitted-change snapshots) is preserved under `archive/`
   and recorded as merged by commit `1872ba29`. See [docs/history/README.md](docs/history/README.md).

## Verified

| Gate | Result | Evidence |
| --- | --- | --- |
| Backend (on `feature/backend-completion`) | 1,285 tests / 14,595 assertions, Steep, RuboCop, 46 migrations, 28 database-suite tests | [backend receipt](docs/completion/backend-20261030-receipt.md) |
| Self-hosted Mox | 4 protocol tests / 412 assertions; real SMTP→IMAP application chain, 88 assertions | same |
| Contracts | 50 Node + 19 Ruby tests | same |
| MCP / operations / native bridge | 11 / 62 tests; 8 Rust + 15 Python tests | same |
| Restore and deployment | Encrypted six-volume restore drill; deploy dry run accepts valid and rejects missing configuration | same |
| Email finder (on `feature/email-finder`) | 53 backend tests, 12 browser cases, 1,131 web unit tests and build; recorded deploy-config result is historical, since current deploy accepts only `--dry-run` or no arguments | [finder receipt](docs/completion/email-finder-20261029.md) |

| Web gate (merged `main`, `feature/final-readiness`) | Contract checks, lint, typecheck, 1,190 unit tests, build, bundle budget and fixture-marker check pass; Vitest capped at two workers after one default-worker timeout | `apps/web/docker/test.Dockerfile`, scratchpad `unit-two-workers.log`, 2026-10-31 |
| Fixture Playwright (`feature/final-readiness`) | Each of desktop, desktop-1440, narrow-390 and reduced-motion: 44 passed, 0 failed, 86 skipped; total 176 passed / 344 skipped. Production URL absent; production and visual QA remain unverified | Docker, network disabled, two workers; scratchpad `full-e2e.log` and `e2e-results/full-report.json`, 2026-10-31 |

## Original October 30 checklist (superseded by November 1 results below)

1. **Final Docker pass on merged `main`** (web gate done; the rest below is outstanding): regenerate `apps/native/src-tauri/Cargo.lock`, then web lint, typecheck,
   unit tests, build, Playwright, and screenshot visual QA at 1440 and 390 px in the single light theme, including an OS dark preference. Then the Windows and Mac
   packaging dry runs, the Android APK build and emulator acceptance, and the full backend gate.
2. **Review packets P24–P34** (rest of Connections, Suppressions, all of Windows) never ran. Run them and fix the findings.
3. **Repository-wide failures noted by the email-finder run:** 33 browser failures elsewhere in the app and 2 contract
   checks. The finder agent classified these as existing, not caused by its module, without a separate baseline run.
   The backend gate later passed its contract suites. Recheck them in the final pass.
4. **Deployment:** supply credentials in the order of [docs/credentials-last.md](docs/credentials-last.md),
   then `sh ops/production/deploy.sh --dry-run`. Give the email finder a public IP separate from Mox.
5. **Open contract requests** from the client lanes, listed in [docs/contract-requests.md](docs/contract-requests.md).
   They include the native token exchange `POST /v1/native/sessions` and the bounce/suppression read endpoints.
   Reconcile them against what the backend completion implemented, then implement the remainder server-side.
6. **Needs a macOS host:** `.dmg` signing/notarization and the iOS app build.
7. **fleet-02** (`/home/tanzeel/orca/workspaces/integration`, `/home/tanzeel/elevateo-mail-completion-20261015`) could not be reached on
   2026-10-30. The `fleet-02` SSH alias resolves to 195.154.91.159 with the key rejected, and 188.40.237.70:2222 timed out. Its content is
   included as of the last local fetch from it (`src18`, `src21`). Fetch it again once it is reachable.

## Constraints in force

Outbound mail stays `held`; provisioning stays dry-run. No live sends, DNS, MX, Cloudflare or Google Cloud changes.
Docker runs locally on Docker Desktop.

## Client verification checkpoint — 2026-11-01

Windows: Docker Release build passes with 0 warnings/errors; 93 tests pass (0 failed/skipped),
7 installer regressions pass, and the unsigned win-x64 self-contained NSIS installer builds.
The installer is retained locally in apps/windows/artifacts (not committed). Actual Avalonia views
were rendered and inspected at 960/1280 px. Native Windows launch exposes the sign-in UI, but the
computer-use provider captured an overlapping window; those captures were discarded and native
screenshot verification remains limited. No live authentication was performed.
P24–P34 and dedicated design reviews ran in bounded packets; repairs and exact coverage are in
[review evidence](docs/completion/final-readiness-20261101/reviews.md). Web repairs await their Docker gate.
Cargo.lock regeneration, remaining client gates and web visual/backend browser coverage remain in progress.
Evidence: [Windows receipt](docs/completion/final-readiness-20261101/windows-receipt.md).

## Client web verification checkpoint — 2026-11-01

Docker Desktop final web gate passed: lint, typecheck, 1,195 tests / 99 files, production build and bundle budget. Five product defects repaired with regressions; browser visual verification remains pending. See docs/completion/final-readiness-20261101/web-receipt.md. Native/Android/iOS verification remains in progress; no deployment.


Android resource-limit repair — 2026-11-01: the APK entrypoint now preserves caller Cargo/Gradle limits with conservative defaults. Docker tests: 42 package + 26 build/helper tests pass, including three executable configuration regressions. APK/emulator results remain pending/not run respectively. See November 1 evidence.


iOS Core verification — 2026-11-01: Linux Swift build and 36 tests pass; three signing-helper tests pass separately in the Python-capable Docker image. Fixed the Linux FoundationNetworking import. The first combined wrapper exited 127 after Swift passed because Python was absent; the recorded recipe now runs Swift only. iOS app packaging remains macOS-only. See docs/completion/final-readiness-20261101/ios-receipt.md.


Native verification — 2026-11-01: Cargo.lock regenerated. Docker formatting, compile check, Clippy rules, 40 Rust tests, 14 macOS helper tests and one wrapper regression pass. Eight compiler dead-code warnings remain; strict -D warnings failed and is not claimed passing. macOS packaging/signing remains unavailable. See docs/completion/final-readiness-20261101/native-receipt.md.


## Browser verification completed — 2026-11-01

Final Docker matrix: 262 passed, 0 failed, 2 intentional desktop skips of mobile-only drawer cases; both mobile cases pass. Lint/typecheck, 42 focused ThreadPage tests and production build pass after the dark reader/note contrast repair. Negative control: 4 light cases pass, 4 dark cases fail before the repair; all eight pass afterward. Actual screenshots inspected at 1440/390 px in light/dark. Production-artifact tests use intercepted synthetic APIs, not a real backend. The backend harness removes volumes and cannot run under the current no-volume-touch instruction; low disk/RAM also precludes new backend builds. Android APK remains in progress. See [browser receipt](docs/completion/final-readiness-20261101/browser-receipt.md), [visual receipt](docs/completion/final-readiness-20261101/visual-receipt.md) and [backend limitation](docs/completion/final-readiness-20261101/backend-receipt.md). These results supersede earlier pending checkpoints.

## Final client verification receipt — 2026-11-01

All feasible client gates are recorded in [the final receipt](docs/completion/final-readiness-20261101/final-receipt.md), which supersedes earlier pending checkpoints. Android final rebuild passed: 69 Python helpers, 40 Rust tests, 7 release-configuration tests, Kotlin/Rust compile, package identity/trust/signature and manifest verification. Android lint passed with 0 errors, 36 warnings and 1 hint after removing unsupported generated TV advertising; its regression failed on old source and passed after repair. The x86_64 debug-signed isolated-QA APK is retained locally, not a production release. Unique repaired defects: 41 (15 application, 4 packaging/build, 22 verification); P24–P34, design review and bounded follow-ups are recorded in code-reviews.md.

Mac packaging/signing/notarization and iOS application build require macOS. Android emulator/installed visual QA is blocked by Docker's 3.82 GiB RAM; real-backend browser coverage is blocked by the no-volume-touch instruction and disk/RAM constraints. Native strict `-D warnings` failed on 8 existing warnings; the final Clippy rules gate passed. Windows install/uninstall and authenticated native interaction remain unverified. No deployment or infrastructure mutation occurred. See receipts for exact commands, final counts, earlier failures, artifact hashes, screenshots and cleanup.
Final cleanup: owned disposable containers removed; final image prune reclaimed 7.702 GB, builder prune 0 B. No volumes touched. Shared preview and active caches preserved; C: has 4.40 GB free. VHD compaction requires stopping Docker and was not attempted. [Cleanup receipt](docs/completion/final-readiness-20261101/cleanup-receipt.md).
