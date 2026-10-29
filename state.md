# Project state

Updated 2026-10-30. Earlier entries are preserved verbatim in [docs/history/logs/state-log.md](docs/history/logs/state-log.md).

## Summary

All Elevateo Mail work is consolidated in this repository. `main` contains the integrated product: backend,
self-hosted mail server, email finder, and web, macOS, Windows, Android and iOS clients. Nothing is deployed.
The backend and the email finder have passed their Docker gates. The client work and the merged `main` have not
been built or tested yet.

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
| Email finder (on `feature/email-finder`) | 53 backend tests, 12 browser cases, 1,131 web unit tests, build, `deploy.sh config` | [finder receipt](docs/completion/email-finder-20261029.md) |

## Open

1. **Final Docker pass on merged `main`:** regenerate `apps/native/src-tauri/Cargo.lock`, then web lint, typecheck,
   unit tests, build, Playwright, and screenshot visual QA at 1440 and 390 px in light and dark. Then the Windows and Mac
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
