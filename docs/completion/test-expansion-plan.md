# Test expansion plan — root-owned fleet-02 execution

This extends existing acceptance work through the [72-group scenario matrix](../verification/scenario-matrix.json); it does not create another app or orchestration system. **216 positive/failure partitions are proposed, zero were run by this planner.** Root owns integration, immutable staging, Docker/SSH execution, resource reservations and cleanup. Existing backend deadline/Auth-concurrency and frontend repair workers retain their files.

The first useful work is a small real-browser seam: built frontend, a same-origin internal proxy, real local Auth/Rails/Postgres, and one seeded login/read/save/logout journey. Broader scenarios then reuse that topology. Puppeteer and Selenium add distinct evidence after the seam is proven; they do not repeat every mock/Playwright test.

## Concrete scope findings

- The full 32-line FE Vite configuration has no API proxy. `createHttpGateway(fetchImpl?)` uses root-relative API paths; transport metadata requires same-origin credentials. There is no inspected `VITE_API_URL` interface.
- The full 26-line Playwright configuration launches `dev:fixtures` and waits for `dev-fixtures.html`. Its existing 237 A/B browser passes are **historical mock** results, with 72 skips and 16 sampled PNGs.
- Latest C/D archive `16de18ba1cf2d6f50bcd143d9bb2db5ef5aa145fcb67368e267d82d087598fc5`, manifest `7b129dbf14d3b8dccef9c7f28739b43d54b3ed643680249ec8e4d40a96885db8`: API generation/lint/typecheck/build PASS; unit 581 PASS/4 FAIL (585), browser 260 PASS/4 FAIL/72 SKIP (336), all mocks/fixtures. The first archive `57b2aef6ce02efbc026aa499b43682dddc00b6e6bfdf9c0ab0923c6c3aa42186` failed preflight and is historical. Fable is repairing current failures, seven reported recovery defects and GUI capture gaps; affected paths need fresh frozen evidence.
- The latest run produced 509 PNG artifacts, not 509 scenario passes or completed visual review: a nominal narrow members capture showed Search and recovery controls were outside captured viewport. Task cleanup independently passed; shared Node24.21.0/Playwright1.64.0 images remain. Host free-space delta -53,067,776 bytes is shared-host activity, not attributed reclamation.
- Latest BE run4 archive `a3810624c847a856985d7951abb3ac9a09e6499f328f3c243506bdef16b62dd8` failed SQL CASE fixture syntax before Rails tests. New Auth/D05 assertions are authored/unrun; the checkin-publication race repair is pending. D05 amendment SHA `0874d5ae89f66bd4fc1972276fe1205678a8b0e1ac6adb8d866e2f72ff293953` is adopted, not runtime acceptance; it covers writes and leaves read timing as a gap.
- Missing legacy `docs/product-master-plan.md` and `docs/backend-blueprint.md` references are reconciled: root confirmed documentation R01–R17, contracts/v1, accepted BE02/BE03 briefs and the current local-completion plan as replacement authority in `msg_80a474558d6a`. Freeze the intended run subset without reopening blanket standards approval.
- The 305/300 reservation rejection belongs to the historical bootstrap task, not a global fleet cap. Every new task still requires its own measured capacity check and bounded allocation; the current FE runner is an independently reserved task.
- Obsidian was unavailable. Design comparisons below are analytical simulations, not measured runs or Obsidian-backed results.

## Disjoint authoring tasks

Proposed paths are in the coordinator's eventual integrated checkout; they are **not instructions to modify either sibling source workspace**. Root assigns each bounded task through the required named-model consultation/Devin execution process and records actual identities. Every task reads the frozen shared contract first; do not let independent workers change shared manifests, seeds or runner topology concurrently.

| Task | Sole write ownership | Deliverable / acceptance | Dependency |
| --- | --- | --- | --- |
| T0 — root shared harness boundary | `tests/acceptance/package.json`, `package-lock.json`, `tsconfig.json`; `shared/config.ts`, `shared/report.ts`, `shared/seed-contract.json`; `contracts/run-manifest.schema.json`, `contracts/case-result.schema.json`; one existing root fleet launcher/topology file selected by root | Exact pins/lock, strict typed config and report boundary, deterministic seed vocabulary, private same-origin topology, one report schema, labelled resource ownership; root names existing service/image/seed integration paths before edits. No new scheduler/SSH abstraction. | Source repairs/freeze; supplied root environment summary below. |
| T1 — real Playwright journeys | `tests/acceptance/playwright/config.ts`, `auth.spec.ts`, `read.spec.ts`, `draft-recovery.spec.ts`, `collaboration.spec.ts`, `accessibility.spec.ts` | Broad real-app suite consuming T0 baseURL/seed/report contract. Current AUTH/READ/DRAFT/COLLAB/GUI/NET paths; exact path IDs in titles/annotations. Keep fixture tests intact and explicitly separate. | T0 contract; G01/G02 passing. |
| T2 — Puppeteer CDP diagnostics | `tests/acceptance/cdp/navigation.ts`, `memory.ts`, `metrics.ts` | Distinct callback/referrer/cache/network assertions, measured latency/heap/DOM/listeners and retained-node investigation; bounded synthetic artifacts. No copied Playwright suite. | T0 contract; exact Chromium/CDP capabilities and sandbox proof. |
| T3 — Selenium W3C critical journeys | `tests/acceptance/selenium/critical-journeys.ts`, `waits.ts` | Real login, mailbox/thread read, draft save+reload, logout/revocation using WebDriver. Explicit element/app-state waits; one session. No CDP-only assertions in this lane. | T0 contract; complete image/browser/driver/binding tuple. |
| T4 — root result consolidation and checks | Extend the existing root evidence collector only; use `tests/acceptance/contracts/report-validation.spec.ts` for report-schema regressions if none exists | Reject path/lane mismatches, invalid status, duplicate attempt IDs, missing artifacts, source drift and unsafe paths; seal final hashes after all lane outputs. Preserve raw lane reports alongside normalized records. | T0 schemas; T1–T3 samples. |

Within T1, draft-recovery and collaboration are independent bounded assignments after shared config freezes. Keep each nontrivial module small; if a proposed spec exceeds 200 lines, split by scenario family before review. Do not use this planner's 397-line inspection budget as a new author's review allowance: every review assignment has its own <=200-lines/pass and <=400-total cap, full user rubric and explicit coverage record. Formatting goes to lint/CI; root arranges a separate design-tradeoff reviewer.

Existing backend owners should supply narrow evidence mappings for SCN-AUTH-002/003/008 and SCN-DB-001..005 rather than a new worker reauthoring their concurrency tests. Root asks them for exact test names, lock barriers, native SQLSTATE controls, one-slot pool accounting and D05 outcome expectations. Numerical boundaries require regression assertions for controlled conversion errors and INTMAX behavior. Include the pending checkin-publication interleaving regression: cleanup cannot dispose an adapter already transferred to a waiter. Reads need their own timing assertions. Those workers own backend edits; T1–T3 only consume their seed/API seam.

### Shared T0 API consumed by T1–T3

T0 alone exports `loadAcceptanceConfig(): AcceptanceConfig`, `loadSeedContract(): SeedContract`, and `recordCase(result: CaseResult): Promise<void>` from its shared files. `AcceptanceConfig` validates the private base URL, lane, run/dispatch IDs, seed path, output directory, resource/artifact limits and transport profile; proposed harness-only environment names are `ACCEPTANCE_BASE_URL`, `ACCEPTANCE_LANE`, `ACCEPTANCE_RUN_ID`, `ACCEPTANCE_SEED_PATH`, and `ACCEPTANCE_OUTPUT_DIR`. These names are new harness interfaces, not existing application settings. Secret material stays in ignored task-owned files/secrets and never enters the config/report object.

`SeedContract` provides logical actor aliases, fixed org/mailbox/thread IDs and expected versions/capabilities; it contains no passwords or sessions. Root chooses the existing secret resolver/Auth seed mechanism before implementation. Lane authors own browser interactions and emit immutable `CaseResult` records using stable SCN path IDs; they cannot change the seed, proxy, dependency lock or result schema. Shared API changes return to T0 and are versioned before dependent workers resume. T4 alone seals final aggregate artifacts; lane writers never amend another lane's report.

## Dependency research and freeze

These are researched candidates or observed pins, **not installation/execution evidence**. T0 must resolve exact registry artifacts, lock integrity and immutable image digests before a build. Do not use `latest`, silently change application dependencies or guess a Docker tag.

| Component | Observed/researched exact version | Remaining freeze work |
| --- | --- | --- |
| Playwright | Existing FE `@playwright/test 1.64.0`; official docs show matching 1.64.0 Docker family. | Freeze exact OS tag, image digest/architecture and package lock. Installed package must match image browsers. Image alone does not install the test package. |
| Puppeteer | Primary supported-browser table: `puppeteer / puppeteer-core 25.13.0` targets Chrome for Testing `155.0.8059.39`. | Resolve npm integrity and browser archive/image digest; pin protocol schema to this browser and probe required methods. Do not assume Playwright's Chromium revision matches. |
| Selenium | Root deliberately selects binding/Grid `4.49.0`, Docker release `4.49.0-20260909`, Chrome/ChromeDriver `153.0.8010.47`. The release separately lists Chromium `152.0.7977.82`; it is not the Chrome tuple. | Verify the selected image tag, immutable digest, architecture and negotiated runtime capabilities before claiming compatibility. The newer 4.51.0 binding is not selected. [Pinned release](https://github.com/SeleniumHQ/docker-selenium/releases/tag/4.49.0-20260909). |
| Node / TypeScript | Latest fleet evidence records retained Node `24.21.0` image family; FE manifest has TypeScript `5.9.3`, `@types/node 24.19.2`. | Freeze exact Node image digest/architecture and verify actual runtime/package engine constraints inside build. Types package is not runtime evidence. |
| React / Vite / unit tooling | Existing FE React `19.3.0`, Vite `7.3.6`, Vitest `4.1.11`, ESLint `10.12.0`; FE package/lock hashes in matrix. | Preserve app lock; fixes must pass fresh lint/typecheck/generated-contract/unit checks. Acceptance harness needs only its actual dependencies. |
| Backend | Decision metadata pins Ruby `3.4.11`, Rails `8.1.4`, Supabase PostgreSQL `17.6.1.136`, Auth schema/profile `v2.196.0`. DB digest recorded as `sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`. | Root verifies actual images/server versions/extensions against current backend lock and D05 native timeout support; freeze Auth/Rails/storage image digests too. |

Primary sources: [Playwright Docker](https://playwright.dev/docs/docker), [Puppeteer supported browsers](https://pptr.dev/supported-browsers), [Selenium downloads](https://www.selenium.dev/downloads/), [docker-selenium releases](https://github.com/SeleniumHQ/docker-selenium/releases). Versions are observations on 2026-10-13 and require compatibility proof in the sealed run.

Dependency justifications: Playwright runs broad cross-browser E2E; puppeteer-core drives distinct pinned CDP diagnostics; selenium-webdriver provides independent W3C behavior. Prefer existing strict TypeScript and report-validation libraries; add no general orchestration framework or duplicate domain SDK. The application source and domain behavior remain shared.

## Private topology and readiness

Root extends its existing fleet launcher with one task namespace/network, not another orchestrator:

```text
Docker browser/runner -> http://app.test (private same-origin proxy)
                          |-- / and SPA paths -> built production frontend
                          |-- /v1/*, /auth/accept -> Rails api:3000
                          '-- /auth/complete -> intended SPA completion route
Rails -> private Auth + PostgreSQL + private storage
Auth -> internal Mailpit SMTP only
Later BE04 worker -> task fake-provider ledger in separate restore domain
```

Use an internal Docker network with private DNS aliases and **no published host ports**. Browser WebDriver/CDP endpoints are reachable only by the task runner. Build-time dependency downloads are separate from runtime; deny runtime public egress and omit live provider/AI/DNS/signing credentials. Auth Mailpit routing uses its internal SMTP port with external relay/hooks disabled.

Root supplied the current disposable compose contract; the integrated frontend/proxy topology remains **NOT_IMPLEMENTED/NOT_RUN**:

| Configuration | Supplied value / behavior |
| --- | --- |
| `ELEVATEO_BROWSER_ORIGIN` / `GOTRUE_SITE_URL` | Integrated profile `http://app.test`; existing backend-only profile remains `http://api:3000`. |
| `ELEVATEO_COOKIE_SECURE` | `false` for this explicit local HTTP profile |
| `ELEVATEO_AUTH_URL` | `http://auth:9999` |
| Fixture invite `redirect_to` | Integrated profile `http://app.test/auth/complete`; backend-only profile remains unchanged. |
| Browser routing | `/auth/complete` with optional trailing slash selects `AuthCompletePage`; otherwise `App` uses `HashRouter`. |
| Gateway / transport | Root-relative `/v1`, same-origin credentials, no-store/manual redirect, ten-second client abort; no API-origin env or Vite proxy. |
| Protected request headers | `X-Session-Context`, `X-Authorization-Version`, `X-CSRF-Token`; browser supplies Origin. |
| Auth entry | Server-staged, fixed query-free callback and explicit POST acceptance; no Auth token in browser. |
| Host exposure | No published ports; browser uses Docker service DNS. |

Root owns proxy/upstream integration in the existing launcher; T0 owns the shared TypeScript harness boundary. Preserve the single browser origin and callback semantics. Record **fixture**, **internal HTTP real integration**, **TLS real integration**, and **NOT_RUN** distinctly. The supplied HTTP profile can prove real local behavior but cannot close the production TLS/Secure-cookie gate; a later TLS lane needs trusted task-local certificates and correct secure-cookie configuration. Do not disable certificate checks or Origin enforcement.

Readiness has three layers: service health/version/schema; proxy route/content-type correctness; actual synthetic login plus authenticated session/read response and durable DB assertion. An HTTP200 page or Playwright webserver ready state alone cannot prove integration. The real Playwright config must use the external root-managed baseURL with no fixture `webServer` launcher. [Playwright webserver behavior](https://playwright.dev/docs/test-webserver)

## Deterministic seed and test controls

T0 publishes a versioned seed description with synthetic org A/B, two managers, reader-only, compose-only, compose+approve_send author, disabled/revoked user and zero-membership user. Include two mailboxes, a removed/readded membership generation, actor-private drafts, unread state, eligible/ineligible assignees and known notes. Use fixed opaque IDs, stable ordering timestamps and marker text that cannot be mistaken for production data.

Add datasets only when their scenario needs them: 0/1/50/51 list items; equal/null last-message timestamps; exact Unicode/HTML-like strings; max/overmax field and byte partitions; known-conflict and uncertain draft identities. Seed nine synthetic addresses across one or two `.test` domains, recording aliases separately from inboxes. No seed can contain actual provider/production mail credentials.

Real Auth accounts are created through the local supported admin/seed path and users log in through the real UI/API. Keep generated development credentials in ignored task-owned secret files or Docker secrets; expose only logical actor aliases in artifacts. Do not commit a shared password, dump session cookies/JWTs, or record browser storage state.

Fault controls belong to root/backend fixtures outside the public product API. Use barriers for lock/commit/response ordering, controlled clock only where a pure unit test permits it, and actual expiry/native timeout fixtures for real Auth/DB cases. Browser interception may create network cuts but cannot stand in for authoritative backend/DB/Auth outcomes. Record every enabled test control in the private manifest, prevent production activation and identify exactly whether a response was mocked.

## Execution order and resource envelope

1. Reserve the task and verify current fleet capacity with explicit limits. The historical 305/300 bootstrap rejection does not define a global cap. Freeze repaired sources/contracts/harness and immutable manifests.
2. Build pinned task images; run lint, typecheck, generated-contract checks and unit/DB suites in containers. If preflight fails, downstream cases are `not_run`; clean disposable build/test resources after evidence export.
3. Start the private real-service topology and prove seed/readiness/Auth path. Run backend real Auth/D05 barriers before dependent GUI claims.
4. Run Playwright real broad suite with one worker initially; Chromium broad coverage, Firefox/WebKit focused critical/layout compatibility. Keep existing mock suite results in separate lane directories.
5. Run Puppeteer diagnostics, then Selenium critical journeys sequentially. No competing browser workload during memory/latency measurement. Run later load tests separately with declared resource allocation.
6. Collect actual screenshots and manual UI verdicts, validate/seal reports, then root performs scoped cleanup. Run native/restore/future-feature lanes only when their own prerequisites exist.

Initial **proposed** memory caps for root reservation, not observed fleet capacity: PostgreSQL 1 GiB, Auth 512 MiB, Rails 1536 MiB, proxy 128 MiB, Mailpit 128 MiB; active browser+runner combined 3 GiB for Playwright/Selenium or 4 GiB for CDP heap diagnostics. Private storage and future fake provider each need a separately measured allowance (initial proposal 512 MiB each), plus daemon/host headroom. One browser worker/session, <=2 CPUs/browser initially, private `/dev/shm` 512 MiB inside its memory cap. Root must reduce workload or reserve sufficient capacity before launch; these figures do not authorize oversubscription. Report OOM as failure; no automatic cap inflation.

Use an init process to reap children. Puppeteer's official image documents a SYS_ADMIN requirement, so it is **not approved unchanged** for this shared-fleet task; prefer a reviewed nonroot image using pinned puppeteer-core/Chrome with bounded shared memory and an explicit sandbox capability probe. Playwright's documented host-IPC shortcut likewise needs review; prefer private bounded IPC here. Never silently disable sandboxing or add broad capability merely to satisfy launch. [Puppeteer Docker](https://pptr.dev/guides/docker), [Playwright Docker](https://playwright.dev/docs/docker)

Initial artifact caps to ratify: 250 MiB ordinary artifacts per lane, one bounded diagnostic heap snapshot up to 512 MiB, total task allocation 1 GiB plus fixed source/build allowance. Stop collection explicitly if the cap is reached; missing required diagnostic evidence remains incomplete. Heap snapshot capture can itself raise peak memory and pause execution; exclude capture time from normal latency results.

## Lane-specific authoring instructions

**Playwright:** test the production entry and real services; authenticate per isolated actor context; never reuse another test's cookie jar. Cover real save loss/reconciliation, known conflict/rebase, self-loss and delayed old response first. Tag fixture intercepts/mocked endpoints in result metadata. Screenshot actual error/empty/loading/uncertain/context-loss views, not only normal pages; verify role/name/keyboard/focus as well as appearance.

**Puppeteer:** use fixed warmup, three measured batches of 50 route/dialog/composer lifecycle cycles, and a declared GC policy only if supported by the pinned browser. Report `JSHeapUsedSize`, Nodes, Documents and JSEventListeners plus cgroup/RSS; counters alone do not prove detached nodes. Use version-compatible heap graph/retaining paths for detached-node evidence; unsupported CDP methods are a blocked diagnostic, not “zero leaks.” Take synthetic-only snapshots after controlled fixture authentication and restrict raw artifacts because memory can contain tokens. Prefer sanitized aggregates/retaining-path summaries in coordinator-facing reports. [Puppeteer page metrics](https://pptr.dev/api/puppeteer.page.metrics)

Add distinct navigation assertions: callback query removed, no secret referrer/cache entry, no tracker request from plaintext, no production fixture entry exposure, cancelled old route cannot replace new view. Record CDP protocol/browser version in the manifest; master protocol documentation is a research guide, not proof that the pinned browser implements an experimental command. [Primary CDP Memory schema](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Memory.pdl)

**Selenium:** four critical journeys are enough initially: real login/session, mailbox/thread navigation, create/save/reopen draft, logout plus rejected protected reload. Use meaningful explicit waits on accessible UI/app states and final server-backed assertions. Do not use fixed sleeps or mix implicit and explicit waits; document accepted/stale-element retry bounds. Record negotiated W3C capabilities and exact browser/driver versions. [Selenium waits](https://www.selenium.dev/documentation/webdriver/waits/)

## Sealed artifact/report contract

T0 owns the schema; T1–T3 emit its records and retain framework-native outputs. No private report format per worker.

`manifest.json` fields: schema_version, run_id, dispatch_id, task_label, start/end UTC, git SHA plus dirty/source archive SHA-256, contract/seed/harness hashes, image digests/architecture, dependency lock hash, runtime/browser/driver/protocol versions, lane, resource caps, declared origin/topology identifiers, feature subset and safety guards. Secret values and absolute secret-file paths are excluded. An observed working-tree hash from this plan is not an execution freeze.

`cases.jsonl` fields: transport_profile (fixture/internal_http/tls/native), scenario_path_id (for example SCN-DRAFT-003-F1), named partition/sample, framework test ID/file, lane, implementation_mode (real/mock/simulated), attempt_id/retry_of, start/end/duration, status (passed/failed/not_run/blocked/skipped), sanitized reason, setup/authority variant, assertion summary, durable-outcome evidence where needed and artifact relative paths. Include all expected cases: cases prevented by setup appear as `not_run`, not absent. Record first failed attempt even when a later retry passes.

`artifacts.json` lists relative path, type, byte size, SHA-256, related cases and sensitivity classification. Reject path traversal, absolute/outside-task paths, duplicate IDs and dangling references. Image index includes route/state/viewport/browser/manual reviewer/verdict. Keep raw native framework reports, runtime logs with secrets scrubbed, DB SQLSTATE/pool facts and environment versions; avoid full mail bodies when short synthetic markers suffice.

`summary.json` counts each status separately by lane/path/freeze, reports source drift, flakiness, missing cases, unresolved gates, resource peaks and cleanup status. Completion requires a sealed manifest/hash inventory after streams close; retries use new immutable directories linked to their predecessor. Hashes establish content identity, not a cryptographic publisher identity. Root's evidence collector is the sole final sealer.

Do not retain login POST bodies, Auth callbacks with query tokens, storageState, Authorization/Cookie headers, JWTs or secret-bearing heap snapshots in ordinary artifacts. Disable/redact sensitive trace phases at source; scan synthetic secret canaries before sealing. If a required raw diagnostic may contain secrets, keep it task-private under root's explicit retention policy and export only a sanitized summary; report the restricted evidence reference without publishing credentials. Do not claim a regex scan proves absence of all secrets.

## Analytical design comparisons

| Choice / hypothetical transition | Expected benefit | Cost / failure mode | Recommendation and measurement required |
| --- | --- | --- | --- |
| Reuse same-origin production gateway versus introducing cross-origin API configuration | Exercises existing cookie/Origin/CSRF contract with few app changes. | Proxy callback/SPA routing can be wrong; accidental API fallback hides integration failure. | Root-owned same-origin proxy; prove content-type, real Auth and callback navigation before broad tests. |
| Full suite copied across three frameworks versus broad Playwright plus focused CDP/WebDriver | Focused lanes exercise genuinely different browser interfaces with less maintenance and memory. | Small Selenium lane can miss noncritical interactions. | Playwright breadth; Selenium four critical journeys; CDP metrics/navigation. Expand only from a specific uncovered risk. |
| Heap counters only versus graph diagnostics | Counters are cheap and repeatable; graphs identify retained owners. | GC timing/noise and snapshots distort memory; raw heaps can expose tokens. | Fixed warmup/batches and pinned capabilities; counters plus bounded synthetic graph evidence. Set tolerances after baseline; never label counters alone “no detached nodes.” |
| Seed direct session cookie versus real Auth login | Cookie injection is faster. | It bypasses precisely the Auth/session/callback seam under test. | Seed accounts/data, then real login. Injection allowed only in explicitly labelled unit/mock cases. |
| Treat timeout/expired lookup as no commit versus preserve uncertainty | Optimistic retry appears simpler. | It duplicates or overwrites durable work and loses original evidence. | Keep frozen identity, reconcile recorded result and separate deliberate new intent; prove before/after-COMMIT cases. |
| Run all browser engines concurrently versus sequential bounded lanes | Parallelism may reduce elapsed time. | Shared-fleet pressure corrupts performance comparisons and causes OOM/flaky failures. | Sequential initially, reserve explicit extra capacity for later parallel nonperformance lanes. |
| In-database restore flag versus external held dispatch epoch | A DB flag is easy to back up. | Old backup can restore dispatchable approvals or erase prior acceptance. | Keep control and fake-provider ledger outside restored DB; default held and fence old epochs. |

These are reasoned tradeoffs, **not measured simulations**; Obsidian connection was unavailable. Actual comparison/acceptance numbers must come from root's sealed Docker runs.

## Completion handoff

Root can launch T0 immediately while repaired existing suites are frozen/rerun; T1–T3 can author against T0's agreed interface in disjoint directories but cannot claim integration until G02. Future BE03/BE04/inbound/native tasks must keep their own accepted contract and runtime gates. All source changes then require bounded adversarial reviews and synchronized README/state/relevant docs by their implementation owners.

After each build and required test/preview, root exports sealed evidence and removes exact task-owned disposable containers, unused task images and build caches, including failure paths. Inspect mounts before deletion; disposable volumes require exact verified names/ownership/content. Keep shared base images/workloads, persistent DB/uploads and credentials. Report Docker usage and host free-space deltas with attribution limits; report safe trim/compaction blockers without deleting Docker/WSL disks or interrupting another task. This is routine task-resource cleanup, not the user's separately gated project-directory deletion protocol.
