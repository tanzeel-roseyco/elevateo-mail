# Frontend C/D Docker run, 2026-10-13

Current status: second frozen run FAILED (four unit failures and four browser failures). Live deployment and frontend visual acceptance remain closed. The first-run record below is historical; the second-run evidence follows it.

## Frozen source and execution

- Archive SHA256: `57b2aef6ce02efbc026aa499b43682dddc00b6e6bfdf9c0ab0923c6c3aa42186`.
- Manifest SHA256: `d4f0bd0a21905d273e801646f5b8ab7b67d9b9559f6bf4b120eb8900047c6837`.
- 95 files frozen; 41 changed and 25 added versus A/B. Zero source drift at freeze.
- Remote evidence: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/fe02-cd-run-12fd06565a2d4cbc9ad1b67a22da6068`.
- Results directory: `results-fe02-cd-561fa71d`; task label `elevateo.task=fe01r1-20261012-235646-0ff72fa6`.
- Docker execution began 2026-10-12 23:56:46 UTC; cleanup completed 23:58:06 UTC. Runner exit 1, cleanup_failed 0.
- A preceding invocation stopped before Docker because the file whitelist used CRLF. Only whitelist line endings were normalized; original whitelist/packet retained and subsequent exact file-list/hash gates passed. Source archive and runner stayed unchanged.

## Failures and scope

`npm ci` completed with zero reported vulnerabilities, and `check:api` passed with openapi-typescript 7.13.0. This is dependency-tool output, not a security audit.

The unit image's lint stage produced 27 errors: 23 unused type-assignment variables at `src/data/contract-collaboration.test.ts:64-86`; unused destructuring bindings at lines 223, 244 and 253; and a control-character regular expression at `src/data/contract.ts:402`. The chained unit/type/build stages did not run after lint failed.

The browser image built, but its test container's application build failed at `src/domain/draftOperation.test.ts:158`: a spread conflict-operation union could omit required `recorded_at` and `detail_expires_at`. Browser command exit 2 occurred before Playwright scenarios. No new GUI screenshots, browser pass count or visual acceptance exists for C/D. Fable owns the source repair; a new frozen run is required.

The earlier A/B 344 unit and 237 browser passes (72 skips) used a mock backend. They do not establish current C/D correctness or real Rails/Auth/Storage integration. User requested expanded scenario/regression/GUI checks, Playwright, Puppeteer/Chromium and Selenium; each lane must report its actual source and backend mode.

## Cleanup evidence

Runner cleanup and a separate root read-only reconciliation both passed. Exact unit/browser containers, BuildKit container, two task images by tag/config ID, named builder and its cache volume were absent. No task-labeled container, image, network or volume remained; builder registry contained default only. Shared pinned Node and Playwright images were retained, as were unrelated workloads, persistent data and `fe01r8-probes-stage`.

- Unit container: `elevateo-unit-fe01r1-20261012-235646-0ff72fa6`.
- Browser container: `elevateo-browser-fe01r1-20261012-235646-0ff72fa6`.
- Builder: `elevateo-bx-fe01r1-20261012-235646-0ff72fa6`.
- Cache volume: `buildx_buildkit_elevateo-bx-fe01r1-20261012-235646-0ff72fa60_state`.
- Unit image config: `sha256:3db4f4e438fb96cc4f7cd9b92b6af983bc87a6dd06b87751ef2531c46e563ed0`.
- Browser image config: `sha256:963427dd9617a214da3ac67c543e893b19ff14309e35a0a47878b671ff5b6d7f`.

Host free bytes were 269978406912 before and 269900140544 at independent reconciliation: delta -78266368 on a shared host, not attributable reclamation. Docker's aggregate storage inventory was unchanged. This Linux VPS run makes no Windows-native or Windows disk-compaction claim.

Local evidence copies are retained in coordinator `ops/local/fe02-cd-stage-561fa71d811e467dad2c81c54ffe4c62`: unit-test.log, browser-test.log, runner.log and independent-cleanup.json. Evidence must remain available while the defects are repaired and retested.

## Second frozen run: lint/type repair, 00:17-00:20 UTC

- Source archive: `16de18ba1cf2d6f50bcd143d9bb2db5ef5aa145fcb67368e267d82d087598fc5`; manifest: `7b129dbf14d3b8dccef9c7f28739b43d54b3ed643680249ec8e4d40a96885db8`.
- Packet manifest: `7dc6e8cf286244b43b5a05137fb85a8306ed570ed537b5e52fa30046f89fbe9d`; 95 source files, no drift at freeze. Later draft-recovery changes are excluded.
- Remote evidence: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/fe02-cd-lintfix-run-61df9aa3e3e748f2a34d002b73632d55/results-fe02-cd-lintfix-61df9aa3`.
- Task label: `elevateo.task=fe01r1-20261013-001708-b2c38fdf`; execution 00:17:08 through cleanup completion 00:20:32 UTC. Runner exit 1; cleanup_failed 0.
- Local evidence: `ops/local/fe02-cd-lintfix-stage-61df9aa3e3e748f2a34d002b73632d55/evidence/`. Downloaded evidence archive SHA256 `fc7b30f04101617df3a0b30ad288494b6efe792dd74d76bc806e598598fbf3ca`; members validated as regular files/directories under the expected log and e2e-results paths before extraction.

API generation, lint, typecheck and production build passed. Vitest reported **581 passed / 4 failed / 585 tests** (25 passing and three failing files). Playwright reported **260 passed / 4 failed / 72 skipped / 336 cases**. The browser suite uses fixture or intercepted API responses; no real Rails/Auth browser integration is established. Reduced-motion representative selection and desktop exclusion of mobile-only drawer cases are explicit conditional skips, not additional passes.

The four unit failures are: ambiguous `Fixture inbox` text in the Shell identity-change test; draft rebase operation-ID allocation in `draftOperation.test.ts`; and two self-membership scenarios returning `membership_conflict` in `collaborationState.test.ts`. These need implementation-versus-fixture diagnosis without weakening their intended assertions. The four browser failures share the empty-mailboxes assertion in light/dark desktop/narrow cases: the navigation now includes a global Search link, but the assertion counts every link as a mailbox. Fable owns the repairs and relevant regressions. Four failures in that shared assertion are not counted as four distinct production defects.

There are 509 extracted PNG artifacts, including test attachments and explicit captures; that is an artifact count, not a distinct-scenario or visual-acceptance count. Root inspected draft conflict, draft uncertainty, membership conflict and the nominal narrow-members capture. No full GUI acceptance is claimed. The nominal narrow-members image actually shows Search because capture occurs after a five-route loop. Draft conflict/uncertainty images leave recovery controls below the captured viewport. Fable received a request for route-specific ready assertions and distinct captures of each C/D route and recovery controls. These are evidence gaps, not inferred layout defects.

### Second-run cleanup

The runner removed both task containers and images, the exact BuildKit builder/container and its cache volume. Independent read-only reconciliation exited 0 and recorded `all_absent: true` for exact names/config IDs and task-label inventories. Builder registry contained default only. Exact unit image config: `sha256:87f8a1cb3659affea9549296c3b45dfbb43d7d675724723b913394dfd829a0f1`; browser config: `sha256:ce87e0aa8f5be863b1cbd19fcba352bfd91aedcd0662480c589796f427f07bb1`; BuildKit container ID: `dbd9f976086a`. The cache volume was `buildx_buildkit_elevateo-bx-fe01r1-20261013-001708-b2c38fdf0_state`.

Shared pinned Node 24.21.0 and Playwright 1.64.0 images, unrelated workloads and persistent data were retained. Host free bytes changed from 269950062592 to 269896994816: **-53067776 bytes**, shared-host movement rather than attributable reclamation. Docker inventory after cleanup: 104 images (57 active), 303 containers (264 active), 247 volumes (57 active), one active 4.62 MB build-cache record. No native-Windows or Windows disk-compaction claim. The independent JSON is retained alongside the local evidence archive.
