# Final client verification — 2026-11-01

Branch: `feature/final-readiness`. All test execution used Docker Desktop with `DOCKER_CONTEXT=desktop-linux`. No deployment, push, merge, live mail, fleet or infrastructure changes.

| Client | Executed final result | Exact commands and evidence |
| --- | --- | --- |
| Windows | Release build/analyzers: 0 warnings/errors; 93 tests + 7 installer regressions pass, 0 fail. Unsigned self-contained NSIS installer built (31,456,436 bytes). Actual Avalonia renders inspected at 960/1280 px. | [Windows receipt](windows-receipt.md), [gate](windows-gate.sh) |
| Web | Lint/types, 1,195 tests in 99 files, build and bundle budget pass. Final visual repair: lint/types, 42 focused tests/build pass; browser 262 pass, 0 fail, 2 intentional skips. Actual 1440/390 px screenshots inspected. | [Web receipt](web-receipt.md), [browser receipt](browser-receipt.md), [gate](browser-gate.sh), [visual receipt](visual-receipt.md) |
| macOS shell on Linux | Cargo.lock regenerated; fmt/check/Clippy rules pass; 40 Rust + 14 macOS helper tests pass, 0 fail. One harness regression passes four failed-directory subcases. Eight compiler dead-code warnings remain; `-D warnings` failed. | [Native receipt](native-receipt.md), [gate](native-gate.sh) |
| iOS Core | Swift build and 36 tests pass, 0 fail; 3 signing-helper tests pass. No separate lint tool configured. | [iOS receipt](ios-receipt.md), [recipe](ios-core.Dockerfile) |
| Android | 69 Python helpers, 40 host Rust tests and 7 release-configuration tests pass; APK packaging and lint pass (0 lint errors, 36 warnings). | [Android receipt](android-receipt.md), [APK gate](android-gate.sh) |

The full web unit suite preceded the final contrast-only UI repair; the final repair was checked with 42 focused unit tests and the complete browser matrix. Production-artifact browser coverage uses synthetic intercepted API responses, not a local backend integration. Negative-control contrast tests failed all four dark cases on old product source and passed all eight light/dark cases after repair.

## Reviews and fixes

P24–P34 and the dedicated design-tradeoff review are recorded in [reviews.md](reviews.md) and root `code-reviews.md`, including bounded coverage and packet defect density. [The deduplicated inventory](defect-inventory.md) records **41 repaired defects: 15 application, 4 packaging/build, 22 verification**. Overlapping review LOC is not unique repository coverage. No Obsidian connection was available; design tradeoffs were recorded analytically without claiming a simulation.

## Commits

- `869450c7`: preserved and completed Windows client/installer work and historical evidence.
- `d2b850ce`: web state/validation repairs and full unit/build gate.
- `53cb16ba`: Android resource limits and regression checks.
- `2b003864`: iOS Linux networking test compilation and Core verification.
- `66eb49fa`: native lockfile, lint repairs and Linux verification.
- `e8476d93`: browser fixtures/oracles, dark contrast repair and visual evidence.

## Not run and follow-ups

- macOS `.dmg`, signing/notarization, Keychain/WebView/update runtime and the iOS application build require macOS.
- Android emulator/visual runtime requires the requested 8 GB RAM; Docker has 4,103,761,920 bytes (3.82 GiB). `/dev/kvm` availability was not established because RAM already fails the gate.
- Real-backend browser coverage was not run: the existing acceptance harness removes volumes, conflicting with the explicit no-volume-touch instruction; disk/RAM also prevent new backend builds. See [backend receipt](backend-receipt.md).
- Windows native sign-in window launched, but usable native screenshot capture was obstructed. Skia view rendering was inspected; authenticated native interaction and installer install/uninstall are not claimed.
- Eight native compiler dead-code warnings and npm's 18 reported dependency advisories (16 moderate, 2 high) require separate scoped follow-up.
- Raw browser artifacts and temporary native formatted-source copies remain local and untracked; curated evidence is committed. Automatic approval review rejected removal of the temporary native copy as blocked by policy; no workaround was attempted.

Cleanup: final image prune reclaimed 7.702 GB; builder prune 0 B. No volumes touched. Shared preview/active caches retained; host C: free 4.40 GB. See [cleanup receipt](cleanup-receipt.md).
