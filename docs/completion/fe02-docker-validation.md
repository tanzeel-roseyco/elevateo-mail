# FE02 frozen Docker validation — 2026-10-13 Sydney

**Latest completed result: PASS for the frozen A/B unit lane.** The third run reported **344 passed / 0 failed / 344 total** unit tests, with API consistency, lint, typecheck, production build, and fixture-marker exclusion passing. Its only source change from the repaired second snapshot is Fable's exact assertion fix. The second run separately supplies **237 passed / 0 failed / 72 skipped / 309 total** Playwright cases and inspected screenshots for unchanged A/B product source. All three runs completed owned Docker cleanup; the earlier failures remain preserved below. No C/D validation is claimed.

<!-- AIDEV-NOTE: Results attest each named frozen archive independently; later source edits need fresh validation. -->

**First-run result: FAIL.** Unit tests reported **329 passed / 14 failed / 343 total**; Playwright reported **237 passed / 0 failed / 72 skipped / 309 total**. API generation consistency, lint, typecheck, and the independent browser-stage production build passed. Task-owned Docker cleanup succeeded.

This is execution evidence, not application/UI completion or approval to publish. No live product, UI, server, contract, or shared runner source was edited by this worker; no commit, push, deployment, or live email was performed. The coordinator received the unit failures while the independent browser matrix continued and assigned repair to the existing Fable owner. For the third run, the coordinator explicitly authorized the exact Fable test hunk in the disposable frozen payload and a unit-only copy of the runner.

## Run and frozen source

| Item | Evidence |
| --- | --- |
| Run | `fe02-20261012-220020-823c20607e6f` |
| Orca task / dispatch | `task_05f21fdeb232` / `ctx_a5d745ba0a87` |
| Source freeze | `2026-10-12T22:00:21.4002046Z` |
| Source HEAD / branch | `284aa71d20015b2b9b6a2f00beec9fa3087efe91` / `review/ultra/frontend-reader` |
| Remote run | `/home/tanzeel/elevateo-mail-tests-20261012-ultra/fe02-20261012-220020-823c20607e6f` |
| Local evidence | `coverage/fe02-20261012-220020-823c20607e6f/` |
| Wrapper start / finish | `2026-10-12T22:01:49Z` / `2026-10-12T22:07:56Z` |
| Runner start / finish | `2026-10-12T22:02:00Z` / `2026-10-12T22:07:49Z` |
| Runner result | `aborted_or_failed_rc=1 cleanup_failed=0 exit=1` |
| Fleet identity | `tanzeel@188.40.237.70:2222`, `Ubuntu-noble-latest-amd64-base.zst`, Docker `29.6.2`, context `default` |

The archive contains **70 explicitly listed files**, including current untracked `apps/web` session/lifecycle source and tests plus `contracts/v1`. Windows native tar created the archive, and PowerShell calculated each source SHA-256; the live files were rehashed immediately after archive creation to detect a concurrent change during freezing. The exact archive file set, archive digest, source manifest, and transferred runner hashes were verified remotely **before Docker**. Exclusions were `.env*`, `node_modules`, `dist`, `coverage`, `.vite`, and `e2e/.results`. Only transferred shell-script copies were normalized to LF; repository originals and the reviewed Dockerfile were retained.

The Docker build context was the **extracted repository root**, containing both `apps/web` and `contracts/v1`. The unchanged reviewed runner was invoked inside the unique remote run directory:

```sh
bash runner/run-fleet-02.sh context.tar.gz results
```

| SHA-256 object | Digest |
| --- | --- |
| Source archive `context.tar.gz` (166,092 bytes) | `86232dbd0b6d37cdb0eb8dbb28df8ada1591917b82f7c0faa0a9167104a07254` |
| Per-file source `manifest.sha256` | `7365b05b3489d678b8b4f5bcf3fc9a52b444efab1d54e8a77fa64f8f9388e232` |
| `contracts/v1/openapi.json` | `f6524b78e870d9af7e6b8c38bda9a327c3d05c8e2c974ef450db489d31c2a7e4` |
| `apps/web/src/data/generated/api.d.ts` | `19b95855911060455ef31418e4c4cf3339b0f658e38409c24c55581b5667112d` |
| Transferred `run-fleet-02.sh` | `dcaa2bc92d76c26a896f9737ba7c099a65da2c077b2ec018e488b60effbcc597` |
| `validation.Dockerfile` | `73861610a354eb5a9198f3ecb89f9978935ba0d5312ad74879bafeec5b80193b` |
| Downloaded `screenshots.tar.gz` | `a7058406980812ae4de751f81b6642aa0318e98dc0cd0d3693c2fd2cc941a224` |
| Downloaded `validation-evidence.tar.gz` | `d9360514441cd2d9f12d8bd3542138d3e4635ec1dfb1e8b216f61411b27949c1` |

Both downloaded evidence archives were hash-verified locally before extraction. `metadata.json` records the source status at freeze; `file-list.txt`, `manifest.sha256`, and `transfer-verification.log` provide the full inventory and verification.

## Executed checks

All application commands ran **inside remote Docker containers** because host Docker was unavailable. The builder and unit lane were bounded to **2 CPUs / 2 GiB**, and the browser lane to **2 CPUs / 3 GiB**, with swap limits equal to memory. Application containers had no mounts. Builder quota, memory, identity, and its sole owned cache mount were verified; narrow resource observations are preserved in `task-container-evidence.txt`, `task-image-evidence.txt`, and `task-cache-evidence.txt`.

Pinned images:

- `node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`
- `mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f`

| Check | Result | Concrete evidence |
| --- | --- | --- |
| Unit Docker image build / dependency installation | PASS | `results/unit-build.log`; npm audit reported zero vulnerabilities |
| `npm run check:api` | PASS | `results/unit-test.log` |
| `npm run lint` | PASS | ESLint `--max-warnings 0` |
| `npm run typecheck` | PASS | TypeScript completed before unit tests |
| `npm run test -- --coverage` | FAIL | 329 passed, 14 failed; 15 files passed, 4 failed; 25.43 s |
| Unit-lane `npm run build` and subsequent dist marker grep | NOT RUN | The reviewed unit command short-circuited after failing tests |
| Browser Docker image build | PASS | `results/browser-build.log` |
| Browser-lane `npm run build` | PASS | `tsc --noEmit && vite build`; 211 modules; 4.49 s |
| Full `npm run test:e2e -- --workers=2` | PASS with skips | 237 passed, 0 failed, 72 skipped; 2.4 min |
| Exact owned Docker cleanup | PASS | `cleanup_failed=0`, containers/images/builder/cache volume removed |

Coverage was requested, but the failing run emitted no final coverage summary; no coverage threshold pass is claimed. The successful production build emitted 20.21 kB CSS (4.97 kB gzip) and 440.80 kB JS (137.19 kB gzip). Two upstream Zod/Rollup pure-annotation warnings were non-fatal.

**Runner log interpretation:** `runner.log` contains `FAILED: browser tests (status=exited exit=0)`. The unchanged runner checks an already-set global failure flag as well as browser status. The browser command itself exited **0**, and `browser-test.log` reports 237 passed; the overall exit **1** is retained for the earlier unit failures.

### Actionable unit failures

Line numbers refer to the frozen source, not later Fable repairs. These are **14 failing assertions across four files**, not a claim of 14 independent product defects.

| Frozen location under `apps/web/src/` | Failed cases | Observed failure |
| --- | ---: | --- |
| `app/session-lifecycle.test.tsx:100` | 1 | Successful refresh test expected session call count 1, received 0 |
| `app/session-lifecycle.test.tsx:132` | 1 | Subsequent 401 test expected refresh call count 1, received 0 |
| `app/session-lifecycle.test.tsx:152` | 1 | Renewed refresh allowance test expected refresh call count 1, received 0 |
| `app/session-lifecycle.test.tsx:308` | 1 | Logout fence test expected logout call count 1, received 0 |
| `app/session-lifecycle.test.tsx:383` | 1 | Failed organization switch expected `failed`, received `ok` |
| `app/session-lifecycle.test.tsx:414` | 1 | Organization switch 401 test expected refresh call count 1, received 0 |
| `app/Shell.test.tsx:152` | 1 | Failed switch alert absent; captured DOM remained on `Switching…` with disabled controls |
| `data/lifecycle-conformance.test.ts:122` | 6 | Malformed email, empty password, oversized recovery email, short completion password, unknown logout scope, and non-UUID organization produced a synchronous `GatewayError` from `httpGateway.ts:36` before the promise-rejection assertion |
| `data/signal-propagation.test.ts:56` | 1 | Non-aborted fixture `refreshSession` was expected to resolve but rejected with synthetic 401 unauthenticated |

The six boundary tests do show local validation rejecting the inputs; their failure concerns the asserted asynchronous rejection contract. This run alone does not establish the root cause of the session timing or organization-switch failures. The first failure notification and full file/line breakdown were sent through Orca while the browser lane continued. Raw diagnostics: [unit log](../../coverage/fe02-20261012-220020-823c20607e6f/results/unit-test.log) and [ANSI-free unit log](../../coverage/fe02-20261012-220020-823c20607e6f/unit-test-plain.log).

### Full Playwright matrix

| Project | Passed | Failed | Skipped | Total |
| --- | ---: | ---: | ---: | ---: |
| Desktop 1280 × 720 | 101 | 0 | 2 | 103 |
| Narrow 390 × 844 | 103 | 0 | 0 | 103 |
| Reduced motion | 33 | 0 | 70 | 103 |
| **Total** | **237** | **0** | **72** | **309** |

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `production.spec.ts` | 12 | 0 | 0 |
| `read.spec.ts` | 36 | 0 | 0 |
| `session.spec.ts` | 30 | 0 | 0 |
| `visual-states.spec.ts` | 159 | 0 | 72 |

All 30 session tests passed: ten cases in each project. The 72 skips belong to the existing visual matrix: desktop excludes mobile-only drawer states, and reduced motion intentionally runs representative rows. The visual suite's 159 passes include three non-screenshot contrast-oracle tests, leaving **156 named visual PNGs** (74 desktop, 76 narrow, 6 reduced motion). The complete extracted output contains **478 PNGs**, including automatic completion captures and captures associated with skipped cases.

The fixture server and production preview ran on container-internal `127.0.0.1:4173` and `:4174`; no host testing server or published port was used. Production browser cases use mocked API routes. These results do not attest integration against the real Rails backend, provider connections, or native clients.

## Manual inspection of generated screenshots

All screenshots were copied locally under [the screenshot directory](../../coverage/fe02-20261012-220020-823c20607e6f/results/e2e-results/). **36 files were opened for visual inspection: 35 rendered application captures and one blank automatic capture belonging to a skipped reduced-motion visual test.** That blank skipped capture was excluded as application evidence. This is a representative session review, not a claim that every PNG or every accessibility criterion was manually checked.

No clipping, overlapping controls, or unreadable session text was observed in the rendered sample. Desktop forms remained centered; narrow forms fit with side margins. Error messages wrapped inside their panels, password masking was visible where entries were retained, the account sheet fit at 390 px, and the sign-out failure kept protected mail hidden. The narrow refreshed shell deliberately truncated the long organization/user label while leaving menu and account controls visible. Loading skeletons, no-organization recovery actions, retry states, and successful recovery/completion screens were visible. Reduced-motion session interaction captures showed the shell; still screenshots alone do not establish motion behavior.

Representative local links for the coordinator:

- [Desktop dark sign-in](../../coverage/fe02-20261012-220020-823c20607e6f/results/e2e-results/visual/desktop-dark-session-unauthenticated.png)
- [390 px dark sign-in rejection](../../coverage/fe02-20261012-220020-823c20607e6f/results/e2e-results/visual/narrow-390-dark-sign-in-rejected.png)
- [390 px light account sheet](../../coverage/fe02-20261012-220020-823c20607e6f/results/e2e-results/visual/narrow-390-light-account-sheet-open.png)
- [390 px dark sign-out failure](../../coverage/fe02-20261012-220020-823c20607e6f/results/e2e-results/visual/narrow-390-dark-sign-out-unconfirmed.png)
- [390 px light signed-out notice](../../coverage/fe02-20261012-220020-823c20607e6f/results/e2e-results/visual/narrow-390-light-signed-out-notice.png)
- [390 px recovery success](../../coverage/fe02-20261012-220020-823c20607e6f/results/e2e-results/session-recovery-reads-the-same-for-any-address-narrow-390/test-finished-1.png)

The exact opened-file inventory and per-group observations are in [visual-inspection.json](../../coverage/fe02-20261012-220020-823c20607e6f/visual-inspection.json). Paths are relative to `results/e2e-results/`. The shared top-level `auth-complete.png` does not uniquely identify a project; project-specific session captures were inspected separately.

## Cleanup and disk accounting

The unchanged runner used exact names, ownership labels, and mount verification. It removed the following task-owned resources, then confirmed its builder container and cache volume were absent:

| Resource | Exact name | Removal confirmation UTC |
| --- | --- | --- |
| Unit container | `elevateo-unit-fe01r1-20261012-220200-8a87edea` | 22:07:27 |
| Browser container | `elevateo-browser-fe01r1-20261012-220200-8a87edea` | 22:07:30 |
| Unit image | `elevateo-web-unit:fe01r1-20261012-220200-8a87edea` | 22:07:35 |
| Browser image | `elevateo-web-browser:fe01r1-20261012-220200-8a87edea` | 22:07:41 |
| Builder | `elevateo-bx-fe01r1-20261012-220200-8a87edea` | 22:07:49 |
| Builder container | `buildx_buildkit_elevateo-bx-fe01r1-20261012-220200-8a87edea0` | 22:07:49, confirmed gone |
| Cache volume | `buildx_buildkit_elevateo-bx-fe01r1-20261012-220200-8a87edea0_state` | 22:07:49, confirmed gone |

The runner's internal `fe01r1-` prefix is its existing naming convention; the UUID-qualified resources above belong only to this FE02 run. **No broad prune, unrelated resource removal, environment inspection, persistent volume deletion, or BE02 interference occurred.** Shared image pins, source, previous evidence, and this run's frozen archive/logs/screenshots were retained. Deleted disposable images and cache may need rebuilding for a future validation.

| Fleet root filesystem measurement | Before | After | Difference |
| --- | ---: | ---: | ---: |
| Available bytes | 258,536,271,872 | 258,609,946,624 | **+73,674,752 bytes (~70.26 MiB)** |
| Used bytes | 186,282,201,088 | 186,208,526,336 | -73,674,752 bytes |
| Total bytes | 468,702,478,336 | 468,702,478,336 | 0 |

The task builder reported **4.517 GB** of logical cache before removal. Task image logical sizes were 161,038,075 bytes (unit) and 1,025,796,300 bytes (browser). Shared layers and concurrent work prevent adding these numbers or attributing the fleet's net free-space change exclusively to this task.

Global Docker inventory before/after remained 106 images (58 active), 306 containers (265 active), 247 volumes (57 active), and 108 build-cache records (1 active). Reported image, volume, and cache usage remained 101 GB, 16.65 GB, and 15.1 GB respectively; container usage changed from 1.1 GB to 1.089 GB. These are aggregate measurements only; cleanup targeted the exact resources above.

At wrapper completion, retained results occupied **11,488,217 bytes**, plus the **166,092-byte** source archive; subsequent download archives and local inspection metadata are also retained evidence. Raw measurements are in `disk-before.txt`, `disk-after.txt`, `docker-before.txt`, `docker-after.txt`, and `evidence-size.txt`. Docker ran on remote Linux, so Windows Docker virtual-disk compaction does not apply.

## Second run: repaired A/B source

The coordinator requested this run after Fable supplied repairs in `docs/completion/fe02-session-repairs.md`. Manifest comparison confirms exactly five changed files from the first snapshot: `app/session.tsx`, `app/session-lifecycle.test.tsx`, `data/http/httpGateway.ts`, `data/lifecycle-conformance.test.ts`, and `data/signal-propagation.test.ts`, all under `apps/web/src/`. Every other file, including all `contracts/v1` files, is unchanged. Future C/D work is excluded.

| Item | Evidence |
| --- | --- |
| Run | `fe02-repair-20261012-221700-dc65434b0fbb` |
| Freeze | `2026-10-12T22:17:00.8905815Z`; same HEAD/branch as first run; 70 files |
| Remote path | `/home/tanzeel/elevateo-mail-tests-20261012-ultra/fe02-repair-20261012-221700-dc65434b0fbb` |
| Local evidence | `coverage/fe02-repair-20261012-221700-dc65434b0fbb/` |
| Archive SHA-256 / size | `0355762c85dceaa9af052b29ca18cfc7d20483467f33d7773d2f9240bbe265fa` / 166,616 bytes |
| Manifest SHA-256 | `39333643c15a846b266382ea48ae2191e43a6f1c6e8aca39ed42f0399b457ac9` |
| Wrapper start / finish | `2026-10-12T22:20:19Z` / `2026-10-12T22:23:24Z` |
| Runner start / finish | `2026-10-12T22:20:21Z` / `2026-10-12T22:23:23Z` |
| Result | `aborted_or_failed_rc=1 cleanup_failed=0 exit=1` |
| Downloaded screenshot archive SHA-256 | `7d604541e7ad31da95404e20e851ad1c55252916482dba8144219bccb19ff7e6` |
| Downloaded log archive SHA-256 | `76e487418fb0bbbf92d53582f4069a6e2a0ee71f3267bbbb1fdbce046c58bd7c` |

The same reviewed runner, Dockerfile, pinned images, caps, repo-root context, manifest verification, and exact cleanup were used. Transferred and downloaded hashes were verified. An early launcher attempt occurred before transfer completed and found no `launch.sh`; it created no Docker resources. The successful invocation above began only after transfer completed and verification passed.

| Check | Result |
| --- | --- |
| Unit/browser image builds and dependency install | PASS |
| `check:api`, lint, typecheck | PASS / PASS / PASS |
| Unit tests with coverage requested | **343 passed / 1 failed / 344 total**, 18 files passed / 1 failed / 19 total; 11.50 s |
| Unit-lane build and marker scan | NOT RUN — short-circuited after the failed unit assertion |
| Independent browser production build | PASS — 211 modules, 1.40 s; CSS 20.21 kB (4.97 gzip), JS 440.84 kB (137.21 gzip) |
| Full Playwright matrix | **237 passed / 0 failed / 72 skipped / 309 total**, 1.4 min |
| Exact Docker cleanup | PASS, `cleanup_failed=0` |

The sole unit failure is `apps/web/src/app/Shell.test.tsx:153`, **“a failed switch reports in the sheet and keeps the current organization.”** The preceding dialog alert assertion succeeds; `screen.getByText('Synthetic organization A')` then finds three matching elements in the restored shell and account sheet. All 25 session-lifecycle tests passed. This is an ambiguous assertion, not evidence that the organization disappeared. The coordinator received the diagnostic promptly and assigned the exact test repair to Fable. See [raw unit log](../../coverage/fe02-repair-20261012-221700-dc65434b0fbb/results/unit-test.log) and [ANSI-free unit log](../../coverage/fe02-repair-20261012-221700-dc65434b0fbb/unit-test-plain.log). No final coverage summary was emitted for the failing run.

| Playwright project | Passed | Failed | Skipped | Total |
| --- | ---: | ---: | ---: | ---: |
| Desktop | 101 | 0 | 2 | 103 |
| Narrow 390 px | 103 | 0 | 0 | 103 |
| Reduced motion | 33 | 0 | 70 | 103 |
| **Total** | **237** | **0** | **72** | **309** |

Suite counts are independently parsed from this run's log: production 12 passed, read 36 passed, session 30 passed, visual states 159 passed / 72 skipped. The 156 named visual PNGs and 478 total PNGs match the first run's output shape. The unchanged runner again prints a browser failure because its global unit-failure flag is set, while reporting the browser container as `exited exit=0`; the browser log confirms its passing result.

### Second-run visual inspection

**16 actual rendered captures were manually inspected**, with no clipping, overlapping controls, or unreadable session text observed in this sample. It covers desktop/narrow light and dark sign-in, rejection and unavailable states, account sheets, refresh skeleton, no-organization recovery, unconfirmed sign-out, signed-out notice, repeated-access-change retry, forced session error, narrow recovery/completion success, and reduced-motion sign-in/refresh results. The exact inventory and findings are in [the second visual inspection record](../../coverage/fe02-repair-20261012-221700-dc65434b0fbb/visual-inspection.json).

- [Desktop dark account sheet](../../coverage/fe02-repair-20261012-221700-dc65434b0fbb/results/e2e-results/visual/desktop-dark-account-sheet-open.png)
- [390 px light account sheet](../../coverage/fe02-repair-20261012-221700-dc65434b0fbb/results/e2e-results/visual/narrow-390-light-account-sheet-open.png)
- [390 px dark unavailable sign-in with retained entries](../../coverage/fe02-repair-20261012-221700-dc65434b0fbb/results/e2e-results/visual/narrow-390-dark-sign-in-unavailable-keeps-entries.png)
- [390 px dark unconfirmed sign-out](../../coverage/fe02-repair-20261012-221700-dc65434b0fbb/results/e2e-results/visual/narrow-390-dark-sign-out-unconfirmed.png)
- [390 px completion success](../../coverage/fe02-repair-20261012-221700-dc65434b0fbb/results/e2e-results/session-the-completion-for-31fea-nce-and-never-reads-the-URL-narrow-390/test-finished-1.png)

These are sampled visual observations; still captures alone do not establish motion behavior or complete accessibility, and mocked browser routes do not attest Rails integration.

### Second-run cleanup and space

The owned namespace was `fe01r1-20261012-222021-6cff15f0`. The runner removed and verified `elevateo-unit-<namespace>` at 22:23:17Z, `elevateo-browser-<namespace>` at 22:23:18Z, `elevateo-web-unit:<namespace>` at 22:23:19Z, and `elevateo-web-browser:<namespace>` at 22:23:20Z. At 22:23:23Z it removed `elevateo-bx-<namespace>` and confirmed both `buildx_buildkit_elevateo-bx-<namespace>0` and its exact `_state` cache volume were gone. Complete exact names are preserved in [runner.log](../../coverage/fe02-repair-20261012-221700-dc65434b0fbb/results/runner.log).

| Measurement | Before | After |
| --- | ---: | ---: |
| Root filesystem available bytes | 269,911,162,880 | 269,930,377,216 |
| Root filesystem used bytes | 174,907,310,080 | 174,888,095,744 |
| Total bytes | 468,702,478,336 | 468,702,478,336 |
| Docker images / containers / volumes / build-cache records | 104 / 303 / 247 / 1 | 104 / 303 / 247 / 1 |
| Docker logical image / container / volume / build-cache sizes | 96.71 GB / 917.8 MB / 16.65 GB / 4.62 MB | unchanged |

Available space increased by **19,214,336 bytes (~18.32 MiB)** during this run. The owned builder reported **4.517 GB** logical cache before removal; unit/browser image logical sizes were 161,034,618 / 1,025,792,720 bytes. Shared layers and concurrent activity preclude attributing net fleet space changes solely to this task. Results retained at completion were 11,458,642 bytes, plus the 166,616-byte source archive and subsequent evidence archives. No unrelated resources were mutated; remote Linux requires no Windows VHD compaction.

## Third run: exact test-only overlay and passing unit lane

The coordinator authorized this bounded rerun in response to the second-run failure. The payload was extracted from the second frozen archive, never copied from the newer working tree. Fable supplied the exact hunk and expected post-edit SHA-256 in message `msg_f914375e4c9b`; the coordinator confirmed it through question `msg_952b51a0303c`. Only `apps/web/src/app/Shell.test.tsx` changed, with all **69 other files byte-identical**, including product source, browser tests, and all A/B contracts.

The replacement scopes the organization assertion to the hidden shell banner while the modal is open, checks that the routed outlet remains mounted, and checks that neither the no-organization nor sign-in screen replaced the protected subtree. Its [exact diff](../../coverage/fe02-unit-20261012-222622-8f7ac20b9c19/shell-test-only.diff) preserves Fable's comments and assertions. The original test hash was `2f750b1db010c3d63b11a17589d8605c160337d56b3bef3a944a6b93cdaecdc1`; the verified replacement is `ab65ea198e231f87aecc0e8d1601191a7cefa19a9b83d06f4f87f4213867d0bf`.

| Item | Evidence |
| --- | --- |
| Run | `fe02-unit-20261012-222622-8f7ac20b9c19` |
| Freeze | `2026-10-12T22:36:17.1546374Z`; 70 files |
| Remote path | `/home/tanzeel/elevateo-mail-tests-20261012-ultra/fe02-unit-20261012-222622-8f7ac20b9c19` |
| Local evidence | `coverage/fe02-unit-20261012-222622-8f7ac20b9c19/` |
| Parent archive SHA-256 | `0355762c85dceaa9af052b29ca18cfc7d20483467f33d7773d2f9240bbe265fa` |
| Archive SHA-256 / size | `d89c126d7184e3a53ba0dca4af3dd50abd32a0dc4080aa1461531b1273b32284` / 166,786 bytes |
| Manifest SHA-256 | `211b63bcfd78489e42998ed8fec6936ec12fd76c459af71a7caee7c5204d0b5e` |
| Unit-only runner SHA-256 | `0be9f99905419dc160e7c10f74d29a0db9390dd234783e193137d8c1f8775b51` |
| Wrapper start / finish | `2026-10-12T22:37:36Z` / `2026-10-12T22:38:26Z` |
| Runner start / finish | `2026-10-12T22:37:38Z` / `2026-10-12T22:38:24Z` |
| Result | `aborted_or_failed_rc=0 cleanup_failed=0 exit=0` |
| Downloaded log archive SHA-256 / size | `5a8851fcf346361a3e019041820905c8846fe48fa19d29d4250345d7e8483a73` / 13,478 bytes |

The ignored runner copy omits only browser execution, with an `AIDEV-NOTE` explaining the coordinator's instruction to reuse the preceding browser evidence. Its [derivation diff](../../coverage/fe02-unit-20261012-222622-8f7ac20b9c19/runner-unit-only.diff) shows that the complete preceding runner content, including manifest checks, resource preflight, unit commands, resource caps, and cleanup trap, is unchanged. The shared runner and Dockerfile were not edited. Archive/file-set/manifest checks passed before Docker; transfer hashes and the downloaded evidence archive were verified.

| Check | Result |
| --- | --- |
| Unit image build and dependency install | PASS |
| `check:api` | PASS |
| Lint | PASS, zero warnings allowed |
| Typecheck | PASS |
| Unit tests | **344 passed / 0 failed / 344 total**, 19 files passed / 0 failed / 19 total; 11.60 s |
| Coverage | Statements 90.23%; branches 80.62%; functions 94.52%; lines 95.13% |
| Production build | PASS, 211 modules, 1.37 s |
| Production fixture-marker scan | PASS; no `dev-fixtures`, `Development fixtures`, or `fixture_token_a` found in `dist` |
| Playwright | NOT RERUN as instructed; second-run matrix remains separate evidence |
| Exact Docker cleanup | PASS, `cleanup_failed=0` |

All 15 Shell tests and all 25 session-lifecycle tests passed. The console coverage table is retained in the [raw unit log](../../coverage/fe02-unit-20261012-222622-8f7ac20b9c19/results/unit-test.log) and [ANSI-free log](../../coverage/fe02-unit-20261012-222622-8f7ac20b9c19/unit-test-plain.log). The unchanged Docker command chains all checks with `&&`; the unit container and runner exited zero, attesting the otherwise silent marker scan. The generated HTML coverage directory was disposable container data and was removed with that container; the complete console table is the retained coverage evidence.

This unit-lane build emitted CSS 20.28 kB (4.98 gzip) and JS 440.84 kB (137.21 gzip). The preceding browser build emitted CSS 20.21 kB (4.97 gzip) and the same reported JS size. These are separate build artifacts; byte-identical generated bundles are not claimed. The same two third-party Zod annotation warnings appeared, without failing the build. No fresh browser or visual execution is attributed to this third run.

### Third-run cleanup and space

The namespace was `fe01r1-20261012-223738-7d213880`. Runtime inspection confirmed the unit container had 2 CPUs, 2,147,483,648 bytes memory and memory-swap, and zero mounts. The builder's 2 CPU / 2 GiB limits and exact state-volume mount were independently verified by the runner. No browser container or image was created.

| Resource | Exact name | Removal confirmation UTC |
| --- | --- | --- |
| Unit container | `elevateo-unit-fe01r1-20261012-223738-7d213880` | 22:38:20 |
| Unit image | `elevateo-web-unit:fe01r1-20261012-223738-7d213880` | 22:38:22 |
| Builder | `elevateo-bx-fe01r1-20261012-223738-7d213880` | 22:38:24 |
| Builder container | `buildx_buildkit_elevateo-bx-fe01r1-20261012-223738-7d2138800` | 22:38:24, confirmed gone |
| Cache volume | `buildx_buildkit_elevateo-bx-fe01r1-20261012-223738-7d2138800_state` | 22:38:24, confirmed gone |

| Measurement | Before | After |
| --- | ---: | ---: |
| Root filesystem available bytes | 269,918,154,752 | 269,984,079,872 |
| Root filesystem used bytes | 174,900,318,208 | 174,834,393,088 |
| Total bytes | 468,702,478,336 | 468,702,478,336 |
| Docker images / containers / volumes / build-cache records | 104 / 303 / 247 / 1 | 104 / 303 / 247 / 1 |
| Docker logical image / volume / build-cache sizes | 96.71 GB / 16.65 GB / 4.62 MB | unchanged |
| Docker logical container size | 917.8 MB | 917.7 MB |

Measured available space increased by **65,925,120 bytes (~62.87 MiB)**. The owned builder reported **674 MB** logical cache before removal; the owned unit image's logical size was **161,033,568 bytes**. Shared layers and concurrent activity prevent attributing the entire free-space change to this task. Results retained at completion occupied **842,556 bytes**, plus the **166,786-byte** source archive and subsequent evidence copies. The frozen payloads, logs, screenshots, shared pins, and unrelated task resources remain preserved. No broad pruning, unrelated environment inspection, or remote service shutdown occurred; Windows VHD compaction is inapplicable to this Linux fleet host.

## Validation scope and handoff

The requested frozen A/B validation is complete: two full runs preserved the initial failures and the repaired browser evidence, followed by the exact test-only overlay's passing unit lane. The preceding screenshots are downloaded locally and representative files are linked above. All task-owned Docker resources were cleaned after each run. These results do not attest later C/D edits, Rails integration behind mocked browser routes, native clients, application/UI completion, or readiness to publish.
